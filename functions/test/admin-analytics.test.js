import assert from "node:assert/strict";
import test from "node:test";
import { analyticsDayRange, summarizeAdminDay } from "../src/admin-analytics.js";

test("analytics day follows Hong Kong midnight and rejects invalid dates", () => {
  const range = analyticsDayRange("2026-09-30");
  assert.equal(range.start.toISOString(), "2026-09-29T16:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-09-30T16:00:00.000Z");
  assert.equal(analyticsDayRange("2026-02-30"), null);
});

test("daily margin excludes pending outcomes and promotional rewards", () => {
  const result = summarizeAdminDay([
    { uid: "a", tokenCost: 100, cardId: "card", cardConversionValue: 40 },
    { uid: "a", tokenCost: 50 },
    { uid: "b", tokenCost: 200, cardId: "card2", cardConversionValue: 300 },
    { uid: "b", tokenCost: 0, cardId: "vip", cardConversionValue: 1000 },
  ], [
    { status: "approved", proofMode: "bank", verifiedHkdAmount: 500 },
    { status: "approved", proofMode: "promo", verifiedHkdAmount: 0 },
    { status: "rejected", proofMode: "bank", verifiedHkdAmount: 800 },
  ], 2, 12);
  assert.deepEqual(result, {
    totalUserCount: 12, newUserCount: 2, purchaseCount: 3, buyerCount: 2,
    salesTokens: 350, settledSalesTokens: 300, payoutTokens: 340,
    unsettledCount: 1, approvedPaymentCount: 1, approvedHkd: 500,
  });
});
