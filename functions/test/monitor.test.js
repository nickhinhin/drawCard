import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, groupClientErrors, groupServerErrors, sanitizeClientError } from "../src/monitor.js";

test("client error reports are bounded and cleaned", () => {
  const report = sanitizeClientError({ message: `x${"y".repeat(500)}`, code: "permission-denied", site: "evil", extra: "dropped" }, "u1");
  assert.equal(report.message.length, 300);
  assert.equal(report.site, "public");
  assert.equal(report.uid, "u1");
  assert.equal(report.extra, undefined);
});

test("rate limiter allows a burst then blocks until the window passes", () => {
  let now = 0;
  const allow = createRateLimiter(2, 1000, () => now);
  assert.equal(allow("a"), true);
  assert.equal(allow("a"), true);
  assert.equal(allow("a"), false);
  assert.equal(allow("b"), true);
  now = 1500;
  assert.equal(allow("a"), true);
});

test("client and server errors are grouped with counts", () => {
  const client = groupClientErrors([
    { timestamp: "2026-09-24T01:00:00Z", jsonPayload: { message: "權限不足", code: "permission-denied", uid: "u1" } },
    { timestamp: "2026-09-24T01:05:00Z", jsonPayload: { message: "權限不足", code: "permission-denied", uid: "u2" } },
    { timestamp: "2026-09-24T01:02:00Z", jsonPayload: { message: "上載失敗", code: "", uid: "u1" } },
  ]);
  assert.equal(client[0].count, 2);
  assert.equal(client[0].users, 2);
  assert.equal(client[0].lastSeen, "2026-09-24T01:05:00Z");
  const server = groupServerErrors([
    { timestamp: "t1", severity: "ERROR", resource: { labels: { service_name: "adminbatchwrite" } }, textPayload: "boom" },
    { timestamp: "t2", severity: "ERROR", resource: { labels: { service_name: "adminbatchwrite" } }, textPayload: "boom" },
  ]);
  assert.deepEqual([server[0].service, server[0].count], ["adminbatchwrite", 2]);
});

test("monitor report summarises sales, token requests and wait times", async () => {
  const { buildMonitorReport } = await import("../src/monitor.js");
  const start = Date.parse("2026-09-24T12:00:00Z");
  const end = Date.parse("2026-09-24T13:00:00Z");
  const at = (minute) => new Date(start + minute * 60000).toISOString();
  const report = buildMonitorReport({
    startMs: start,
    endMs: end,
    shipping: 2,
    records: [
      { uid: "a", username: "Amy", tokenCost: 1140, drawTitle: "Live", round: "round-001", createdAt: at(1) },
      { uid: "a", username: "Amy", tokenCost: 1140, drawTitle: "Live", round: "round-001", createdAt: at(1) },
      { uid: "b", username: "Ben", tokenCost: 500, drawTitle: "Live", round: "round-002", createdAt: at(30) },
      { uid: "b", source: "vip", tokenCost: 0, createdAt: at(31) },
    ],
    requests: [
      { status: "approved", amount: 515, verifiedHkdAmount: 500, createdAt: at(5), reviewedAt: at(9) },
      { status: "rejected", createdAt: at(10), reviewedAt: at(12) },
      { status: "pending", createdAt: at(50) },
      { status: "approved", amount: 99, verifiedHkdAmount: 99, createdAt: "2026-09-24T10:00:00Z", reviewedAt: "2026-09-24T10:05:00Z" },
    ],
  });
  assert.equal(report.durationMinutes, 60);
  assert.deepEqual([report.sales.purchases, report.sales.tokens, report.sales.buyers], [3, 2780, 2]);
  assert.equal(report.sales.topBuyers[0].name, "Amy");
  assert.equal(report.sales.busiestMinute.purchases, 2);
  assert.equal(report.sales.byRound.length, 2);
  assert.deepEqual(report.tokenRequests, {
    submitted: 3, approved: 1, rejected: 1, approvedHkd: 500, approvedTokens: 515,
    pendingAtEnd: 1, averageWaitMinutes: 3, longestWaitMinutes: 4,
  });
  assert.equal(report.shippingRequests, 2);
});
