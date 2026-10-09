import test from "node:test";
import assert from "node:assert/strict";
import { summarizeLiveSessions, summarizeVisitors } from "./liveAudience.js";

const T = Date.parse("2026-10-03T12:00:00Z");
const min = (value) => T + value * 60 * 1000;

test("peak, unique, members and guests come from enter / leave times", () => {
  const sessions = {
    amy: { a: { in: min(0), out: min(10) } },
    ben: { b: { in: min(5), out: min(20) } },
    g_0123456789abcdef01234567: { c: { in: min(6), out: min(7) } },
    cat: { d: { in: min(30), out: min(40) } }, // after the window: not counted
  };
  const audience = summarizeLiveSessions(sessions, {}, min(0), min(25));
  assert.equal(audience.unique, 3);
  assert.equal(audience.members, 2);
  assert.equal(audience.guests, 1);
  assert.equal(audience.peak, 3);
  assert.equal(audience.peakAt, new Date(min(6)).toISOString());
  assert.equal(audience.stepSeconds, 30);
  const at = (minute) => audience.timeline.find((point) => point.at === new Date(min(minute)).toISOString()).count;
  assert.equal(at(1), 1);
  assert.equal(at(6.5), 3);
  assert.equal(at(15), 1);
  assert.equal(at(22), 0);
});

test("two tabs of the same member count once, and an open visit lasts until the end", () => {
  const sessions = {
    amy: { a: { in: min(0), out: min(10) }, b: { in: min(5), out: min(12) } },
    ben: { c: { in: min(8) } },
  };
  const audience = summarizeLiveSessions(sessions, {}, min(0), min(15));
  assert.equal(audience.unique, 2);
  assert.equal(audience.peak, 2);
  assert.equal(audience.timeline.at(-1).count, 1); // ben is still online at the end
});

test("each member counts once per round", () => {
  const rounds = { "round-002": { amy: true, ben: true }, "round-001": { amy: true } };
  assert.deepEqual(summarizeLiveSessions({}, rounds, min(0), min(1)).byRound, [
    { round: "round-001", unique: 1 },
    { round: "round-002", unique: 2 },
  ]);
});

test("the leave-then-enter at the same moment does not inflate the peak", () => {
  const sessions = { amy: { a: { in: min(0), out: min(5) } }, ben: { b: { in: min(5), out: min(9) } } };
  assert.equal(summarizeLiveSessions(sessions, {}, min(0), min(10)).peak, 1);
});

test("with online given, an open visit that never got its leave time ends where it began", () => {
  const sessions = {
    amy: { a: { in: min(1) }, b: { in: min(1), out: min(2) } }, // left; `a` was never closed
    ben: { c: { in: min(3) }, d: { in: min(5) } },               // online; only the latest visit is open
  };
  const audience = summarizeLiveSessions(sessions, {}, min(0), min(10), { ben: { m: true } });
  assert.equal(audience.peak, 1);
  assert.equal(audience.timeline.at(-1).count, 1);
  const at = (minute) => audience.timeline.find((point) => point.at === new Date(min(minute)).toISOString()).count;
  assert.equal(at(4), 0);
});

test("visitors list members by last seen and counts guests", () => {
  const guest = (id) => `g_${String(id).padStart(24, "0")}`;
  const sessions = {
    amy: { a: { in: min(1), out: min(3) }, b: { in: min(4), out: min(6) } },
    ben: { c: { in: min(2) }, d: { in: min(8) } },
    cat: { e: { in: min(-30), out: min(-20) } }, // before the session
    dan: { f: { in: min(7) } },                    // never closed, not online
    [guest(1)]: { g: { in: min(1), out: min(2) } },
    [guest(2)]: { h: { in: min(8), out: min(9) } },
    [guest(3)]: { i: { in: min(9) } },
  };
  const online = { ben: { m: true }, [guest(3)]: { m: false } };
  const visitors = summarizeVisitors(sessions, online, min(0), min(10));
  assert.deepEqual(visitors.members.map((member) => member.uid), ["ben", "dan", "amy"]);
  const [ben, dan, amy] = visitors.members;
  assert.equal(ben.online, true);
  assert.equal(ben.lastSeen, min(10));
  assert.equal(ben.visits, 2);
  assert.equal(ben.totalMs, 2 * 60 * 1000);
  assert.equal(dan.lastSeen, min(7));
  assert.equal(amy.lastSeen, min(6));
  assert.equal(amy.visits, 2);
  assert.equal(amy.totalMs, 4 * 60 * 1000);
  assert.equal(visitors.memberTotal, 3);
  assert.equal(visitors.memberOnline, 1);
  assert.equal(visitors.guestTotal, 3);
  assert.equal(visitors.guestOnline, 1);
  assert.equal(visitors.guestRecent, 2); // guest 1 was last seen 8 minutes ago
});
