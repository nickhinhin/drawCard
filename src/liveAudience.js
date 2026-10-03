// Live audience figures from Realtime Database presence data.
//   sessions: { [key]: { [sessionId]: { in: ms, out?: ms } } }  key = uid, or "g_<id>" for a guest
//   rounds:   { [roundId]: { [uid]: true } }                       one entry per member per round
// A visit without `out` is still open (the server fills it in when the browser disconnects).
export const AUDIENCE_STEP_MS = 30 * 1000;
const MAX_TIMELINE_POINTS = 720; // 6 hours of 30-second points

export const isGuestKey = (key) => String(key).startsWith("g_");

// Merges one key's visits into non-overlapping [from, to] spans inside [startMs, endMs].
function mergedSpans(visits, startMs, endMs) {
  const spans = Object.values(visits || {})
    .map((visit) => [Math.max(Number(visit?.in) || 0, startMs), Math.min(Number(visit?.out) || endMs, endMs)])
    .filter(([from, to]) => Number(from) > 0 && to >= from)
    .sort((left, right) => left[0] - right[0]);
  const merged = [];
  for (const [from, to] of spans) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

export function summarizeLiveSessions(sessions, rounds, startMs, endMs) {
  const spansByKey = Object.entries(sessions || {})
    .map(([key, visits]) => [key, mergedSpans(visits, startMs, endMs)])
    .filter(([, spans]) => spans.length);
  const members = spansByKey.filter(([key]) => !isGuestKey(key)).length;

  // Peak: sweep enter (+1) and leave (-1) events; a leave at the same moment comes first.
  const events = spansByKey.flatMap(([, spans]) => spans.flatMap(([from, to]) => [[from, 1], [to, -1]]));
  events.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  let current = 0;
  let peak = 0;
  let peakAt = null;
  for (const [at, change] of events) {
    current += change;
    if (current > peak) { peak = current; peakAt = at; }
  }

  // People in the room at each 30-second mark.
  const timeline = [];
  const firstPoint = Math.ceil(startMs / AUDIENCE_STEP_MS) * AUDIENCE_STEP_MS;
  const lastPoint = Math.min(endMs, firstPoint + (MAX_TIMELINE_POINTS - 1) * AUDIENCE_STEP_MS);
  for (let at = firstPoint; at <= lastPoint; at += AUDIENCE_STEP_MS) {
    const count = spansByKey.filter(([, spans]) => spans.some(([from, to]) => from <= at && at <= to)).length;
    timeline.push({ at: new Date(at).toISOString(), count });
  }

  const byRound = Object.entries(rounds || {})
    .map(([round, uids]) => ({ round, unique: Object.keys(uids || {}).length }))
    .filter((item) => item.unique > 0)
    .sort((left, right) => left.round.localeCompare(right.round));

  return {
    unique: spansByKey.length,
    members,
    guests: spansByKey.length - members,
    peak,
    peakAt: peakAt === null ? null : new Date(peakAt).toISOString(),
    byRound,
    timeline,
    stepSeconds: AUDIENCE_STEP_MS / 1000,
  };
}
