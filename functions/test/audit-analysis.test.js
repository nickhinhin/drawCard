import test from "node:test";
import assert from "node:assert/strict";
import { analyzeAuditEntries, FUNCTIONS_SERVICE_ACCOUNT } from "../src/audit-analysis.js";

const server = { authType: "service_account", authId: FUNCTIONS_SERVICE_ACCOUNT };
const player = (uid) => ({ authType: "app_user", authId: uid });
let seq = 0;
function entry(fields) {
  seq += 1;
  return { time: `2026-09-24T04:00:${String(seq % 60).padStart(2, "0")}Z`, operation: "update", changes: {}, context: {}, ...server, ...fields };
}
const rulesOf = (entries) => analyzeAuditEntries(entries).findings.map((item) => item.rule);

test("normal activity produces no findings", () => {
  const entries = [
    entry({ collection: "users", path: "users/u1", ...player("u1"), changes: { tokens: { before: 1545, after: 405 }, lastPurchaseRecordId: { before: "a", after: "b" } } }),
    entry({ collection: "users", path: "users/u1", changes: { tokens: { before: 405, after: 1435 }, lastTokenGrantRequestId: { before: "", after: "t1" } } }),
    entry({ collection: "tokenRequests", path: "tokenRequests/t1", time: "2026-09-24T04:30:00Z", changes: { status: { before: "pending", after: "approved" }, reviewedBy: { before: null, after: "admin1" } }, context: { uid: "u1", proofMode: "storage", createdAt: "2026-09-24T04:00:00Z", hkdAmount: 1000, verifiedHkdAmount: 1000, amount: 1030 } }),
    entry({ collection: "drawRecords", path: "drawRecords/r1", changes: { cardId: { before: null, after: "c1" }, resultSide: { before: null, after: "heaven" } }, context: { uid: "u1" } }),
    entry({ collection: "drawRecords", path: "drawRecords/r1", ...player("u1"), changes: { shippingAddress: { before: null, after: "【順豐站】852BF 旺角" }, shippingPhone: { before: null, after: "91234567" } }, context: { uid: "u1" } }),
    entry({ collection: "drawRecords", path: "drawRecords/r2", ...player("u2"), changes: { shippingAddress: { before: null, after: "【順豐站】852BF 旺角" }, shippingPhone: { before: null, after: "98765432" } }, context: { uid: "u2" } }),
  ];
  assert.deepEqual(analyzeAuditEntries(entries).findings, []);
});

test("high-risk rules fire", () => {
  const rules = rulesOf([
    entry({ collection: "users", path: "users/u1", authType: "app_user", authId: "owner@gmail.com", changes: { tokens: { before: 0, after: 99999 } } }),
    entry({ collection: "tokenRequests", path: "tokenRequests/t2", changes: { status: { before: "pending", after: "approved" }, reviewedBy: { before: null, after: "u9" } }, context: { uid: "u9", proofMode: "promo" } }),
    entry({ collection: "settings", path: "settings/payment", changes: { fpsIdentifier: { before: "122833403", after: "99999999" } } }),
    entry({ collection: "drawRecords", path: "drawRecords/r1", changes: { resultSide: { before: "hell", after: "heaven" } } }),
    entry({ collection: "draws", path: "draws/d1", changes: { roundResultSides: { before: { "round-001": { 24: "hell" } }, after: { "round-001": { 24: "heaven" } } } } }),
    entry({ collection: "tokenRequests", path: "tokenRequests/t3", operation: "delete" }),
    entry({ collection: "adminAuditLogs", path: "adminAuditLogs/a1", operation: "delete" }),
  ]);
  for (const rule of ["direct-edit", "unexplained-tokens", "self-approval", "payment-settings", "result-tampering", "deletion", "audit-tampering"]) {
    assert.ok(rules.includes(rule), `${rule} should be reported`);
  }
  assert.equal(rules[0], "audit-tampering"); // critical first
});

test("medium and low rules fire", () => {
  const promo = Array.from({ length: 10 }, (_, index) => entry({ collection: "promoRedemptions", path: `promoRedemptions/P_${index}`, operation: "create", ...player(`n${index}`), context: { uid: `n${index}`, promoCodeId: "EVENT-500" } }));
  const referrals = Array.from({ length: 10 }, (_, index) => entry({ collection: "affiliateReferrals", path: `affiliateReferrals/r${index}`, operation: "create", context: { referrerUid: "aff1" } }));
  const burst = Array.from({ length: 20 }, (_, index) => entry({ collection: "draws/rounds/slots", path: `draws/d/rounds/round-001/slots/${index}`, time: `2026-09-24T05:00:${String(index).padStart(2, "0")}Z`, ...player("bot"), changes: { status: { before: "available", after: "locked" } } }));
  const rejections = Array.from({ length: 3 }, (_, index) => entry({ collection: "tokenRequests", path: `tokenRequests/x${index}`, changes: { status: { before: "pending", after: "rejected" } }, context: { uid: "faker" } }));
  const rules = rulesOf([
    entry({ collection: "tokenRequests", path: "tokenRequests/t4", time: "2026-09-24T04:00:30Z", changes: { status: { before: "pending", after: "approved" } }, context: { uid: "u1", proofMode: "storage", createdAt: "2026-09-24T04:00:00Z", verifiedHkdAmount: 30000, amount: 32400 } }),
    entry({ collection: "settings", path: "settings/vipProgram", changes: { tiers: { before: [], after: [1] } } }),
    entry({ collection: "cards", path: "cards/c1", changes: { conversionValue: { before: 1000, after: 1500 } } }),
    entry({ collection: "promoCodes", path: "promoCodes/EVENT-500", changes: { amount: { before: 500, after: 5000 } } }),
    entry({ collection: "drawRecords", path: "drawRecords/r1", changes: { cardConversionValue: { before: 800, after: 1700 } } }),
    entry({ collection: "drawRecords", path: "drawRecords/s1", ...player("a"), changes: { shippingPhone: { before: null, after: "9123 4567" }, shippingAddress: { before: null, after: "Flat A, 1 Road" } }, context: { uid: "a" } }),
    entry({ collection: "drawRecords", path: "drawRecords/s2", ...player("b"), changes: { shippingPhone: { before: null, after: "91234567" }, shippingAddress: { before: null, after: "Flat A, 1 Road" } }, context: { uid: "b" } }),
    entry({ collection: "settings", path: "settings/tokenPackages", time: "2026-09-23T19:30:00Z", changes: { packages: { before: [], after: [1] } } }),
    ...promo, ...referrals, ...burst, ...rejections,
  ]);
  for (const rule of ["fast-approval", "large-deposit", "rules-change", "card-price-change", "promo-change", "awarded-value-change", "shared-contact", "promo-abuse", "referral-farming", "night-admin", "purchase-burst", "many-rejections"]) {
    assert.ok(rules.includes(rule), `${rule} should be reported`);
  }
});

test("functions writes are trusted whatever authType they report, and duplicates are counted once", () => {
  const write = { collection: "settings", path: "settings/cardCategories", time: "2026-09-24T04:35:54Z", operation: "update", authType: "unknown", authId: FUNCTIONS_SERVICE_ACCOUNT, changes: { categories: { before: [], after: ["a"] } }, context: {}, eventId: "e1" };
  const result = analyzeAuditEntries([write, { ...write }]);
  assert.equal(result.entryCount, 1);
  assert.deepEqual(result.findings, []);
});

test("players with authType unknown are not flagged, and a cleared result side is", () => {
  const playerWrite = { collection: "users", path: "users/u1", time: "2026-09-24T05:00:00Z", operation: "update", authType: "unknown", authId: "u1", changes: { tokens: { before: 100, after: 60 }, lastPurchaseRecordId: { before: "a", after: "b" } }, context: {} };
  assert.deepEqual(analyzeAuditEntries([playerWrite]).findings, []);
  const cleared = { collection: "draws", path: "draws/d1", time: "2026-09-24T05:00:00Z", operation: "update", authType: "unknown", authId: FUNCTIONS_SERVICE_ACCOUNT, changes: { roundResultSides: { before: { "round-001": { 24: "hell" } }, after: { "round-001": {} } } }, context: {} };
  assert.ok(analyzeAuditEntries([cleared]).findings.some((item) => item.rule === "result-tampering"));
});
