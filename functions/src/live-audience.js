// Live audience figures from Realtime Database presence data. Used by the admin page
// (src/liveAudience.js) and by the monitor callables, so both count the same way.
//   sessions: { [key]: { [sessionId]: { in: ms, out?: ms } } }  key = uid, or "g_<id>" for a guest
//   rounds:   { [roundId]: { [uid]: true } }                       one entry per member per round
//   online:   { [key]: { m, at } }                                 who is in the room now
// A visit without `out` is still open (the server fills it in when the browser disconnects).
// Some visits never got their `out`, so when `online` is given, an open visit counts as
// open only if it is the key's latest one and the key is online now; any other open visit
// ends where it began.
export const AUDIENCE_STEP_MS = 30 * 1000;
const MAX_TIMELINE_POINTS = 720; // 6 hours of 30-second points
export const RECENT_VISITOR_MS = 5 * 60 * 1000;

export const isGuestKey = (key) => String(key).startsWith("g_");

// One key's visits as [from, to] (to = Infinity while open), oldest first.
function visitRanges(visits, isOnline) {
  const ranges = Object.values(visits || {})
    .map((visit) => [Number(visit?.in) || 0, Number(visit?.out) || Infinity])
    .filter(([from, to]) => from > 0 && to >= from)
    .sort((left, right) => left[0] - right[0]);
  if (isOnline === undefined) return ranges;
  const lastOpen = isOnline ? ranges.findLastIndex(([, to]) => to === Infinity) : -1;
  return ranges.map(([from, to], index) => [from, to === Infinity && index !== lastOpen ? from : to]);
}

// Merges one key's visits into non-overlapping [from, to] spans inside [startMs, endMs].
function mergedSpans(visits, startMs, endMs, isOnline) {
  const spans = visitRanges(visits, isOnline)
    .map(([from, to]) => [Math.max(from, startMs), Math.min(to, endMs)])
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

export function summarizeLiveSessions(sessions, rounds, startMs, endMs, online) {
  const spansByKey = Object.entries(sessions || {})
    .map(([key, visits]) => [key, mergedSpans(visits, startMs, endMs, online ? Boolean(online[key]) : undefined)])
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

// Everyone seen since startMs: each member with when they were last seen, and guest totals.
//   lastSeen: endMs while online, else the latest leave (or enter, for a visit never closed)
export function summarizeVisitors(sessions, online, startMs, endMs, maxMembers = 500) {
  const people = Object.entries(sessions || {}).map(([key, visits]) => {
    const isOnline = Boolean(online?.[key]);
    const ranges = visitRanges(visits, isOnline).filter(([from, to]) => from <= endMs && to >= startMs);
    const spans = mergedSpans(visits, startMs, endMs, isOnline);
    return {
      key,
      online: isOnline,
      visits: ranges.length,
      totalMs: spans.reduce((sum, [from, to]) => sum + to - from, 0),
      lastSeen: isOnline ? endMs : Math.max(0, ...ranges.map(([from, to]) => Math.min(to === Infinity ? from : to, endMs))),
    };
  }).filter((person) => person.online || person.visits > 0);
  // Online keys whose visit is not in `sessions` (yet) are still shown as online.
  Object.keys(online || {}).forEach((key) => {
    if (!people.some((person) => person.key === key)) people.push({ key, online: true, visits: 0, totalMs: 0, lastSeen: endMs });
  });
  people.sort((left, right) => Number(right.online) - Number(left.online) || right.lastSeen - left.lastSeen);
  const members = people.filter((person) => !isGuestKey(person.key));
  const guests = people.filter((person) => isGuestKey(person.key));
  return {
    memberTotal: members.length,
    memberOnline: members.filter((person) => person.online).length,
    members: members.slice(0, maxMembers).map(({ key, ...person }) => ({ uid: key, ...person })),
    guestTotal: guests.length,
    guestOnline: guests.filter((person) => person.online).length,
    guestRecent: guests.filter((person) => person.online || person.lastSeen >= endMs - RECENT_VISITOR_MS).length,
  };
}
