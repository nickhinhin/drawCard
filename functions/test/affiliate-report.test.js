import test from "node:test";
import assert from "node:assert/strict";
import { __test } from "../src/index.js";

test("affiliate report totals match a hand-computed scenario", () => {
  const users = [
    { uid: "amy", username: "Amy" },
    { uid: "ben", username: "Ben" },
    { uid: "cat", username: "Cat" },
  ];
  const deposits = [
    { uid: "amy", status: "approved", verifiedHkdAmount: 1000 },
    { uid: "amy", status: "approved", verifiedHkdAmount: 500 },
    { uid: "amy", status: "rejected", verifiedHkdAmount: 3000 }, // not counted
    { uid: "ben", status: "approved", verifiedHkdAmount: 0 }, // promo code: no cash
    { uid: "zed", status: "approved", verifiedHkdAmount: 9999 }, // not a referee
  ];
  const records = [
    // Amy: two settled draws and one still open.
    { uid: "amy", tokenCost: 1140, cardId: "heaven", cardConversionValue: 1700 },
    { uid: "amy", tokenCost: 1140, cardId: "hell", cardConversionValue: 300 },
    { uid: "amy", tokenCost: 500 },
    // Ben: a VIP reward must not count as spend or payout.
    { uid: "ben", source: "vip", tokenCost: 0, cardId: "vip", cardConversionValue: 5000 },
    { uid: "ben", tokenCost: 200, cardId: "legacy", cardValue: 100 }, // falls back to cardValue
    { uid: "zed", tokenCost: 999, cardId: "x", cardConversionValue: 1 }, // not a referee
  ];
  const { referees, totals } = __test.summarizeAffiliateReport(users, deposits, records);
  const byUid = Object.fromEntries(referees.map((row) => [row.uid, row]));

  assert.equal(byUid.amy.depositsHkd, 1500);
  assert.equal(byUid.amy.spendTokens, 2780);
  assert.equal(byUid.amy.settledSpendTokens, 2280);
  assert.equal(byUid.amy.payoutTokens, 2000);
  assert.equal(byUid.amy.gainLossTokens, 280);
  assert.equal(byUid.amy.drawCount, 3);
  assert.equal(byUid.amy.pendingDrawCount, 1);

  assert.equal(byUid.ben.depositsHkd, 0);
  assert.equal(byUid.ben.spendTokens, 200);
  assert.equal(byUid.ben.payoutTokens, 100);
  assert.equal(byUid.ben.gainLossTokens, 100);
  assert.equal(byUid.ben.drawCount, 1);

  assert.equal(byUid.cat.drawCount, 0);
  assert.deepEqual(referees.map((row) => row.uid), ["amy", "ben", "cat"]);

  assert.deepEqual(totals, {
    refereeCount: 3, depositsHkd: 1500, spendTokens: 2980, settledSpendTokens: 2480,
    payoutTokens: 2100, gainLossTokens: 380, drawCount: 4, pendingDrawCount: 1,
  });
});
