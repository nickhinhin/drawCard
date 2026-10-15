import assert from "node:assert/strict";
import test from "node:test";
import {
  cardPrice, cardShareModes, dailyLimit, drawSide, hongKongDay, isDrawableCard, poolCardSnapshot, spentToday, validNumbers,
} from "../src/instant-draw.js";
import { summarizeAdminDay } from "../src/admin-analytics.js";

test("each mode gives heaven with its own chance", () => {
  const trials = 200_000;
  for (const [mode, chance] of [["1/2", 0.5], ["1/5", 0.2], ["1/10", 0.1]]) {
    let heaven = 0;
    for (let i = 0; i < trials; i += 1) if (drawSide(mode) === "heaven") heaven += 1;
    assert.ok(Math.abs(heaven / trials - chance) < 0.005, `${mode}: ${heaven / trials}`);
  }
  // The cut-off is exact: below it is heaven, at it is hell.
  assert.equal(drawSide("1/10", () => 99_999), "heaven");
  assert.equal(drawSide("1/10", () => 100_000), "hell");
  assert.throws(() => drawSide("1/3"));
});

test("numbers must be 1–20, distinct, at least one", () => {
  assert.deepEqual(validNumbers([7, 1, 20]), [1, 7, 20]);
  assert.equal(validNumbers([]), null);
  assert.equal(validNumbers([1, 1]), null);
  assert.equal(validNumbers([0]), null);
  assert.equal(validNumbers([21]), null);
  assert.equal(validNumbers([1.5]), null);
  assert.equal(validNumbers("1,2"), null);
  assert.equal(validNumbers(Array.from({ length: 21 }, (_, i) => i + 1)), null);
  assert.equal(validNumbers(Array.from({ length: 20 }, (_, i) => i + 1)).length, 20);
});

test("prices and modes follow the card library", () => {
  const card = { tokenValue: 100, modePrices: { half: 100, fifth: 40, tenth: 25 }, allowedShareModes: ["1/2", "1/10"] };
  assert.deepEqual(cardShareModes(card), ["1/2", "1/10"]);
  assert.deepEqual(cardShareModes({}), ["1/2", "1/5", "1/10"]);
  assert.equal(cardPrice(card, "1/5"), 40);
  assert.equal(cardPrice({ tokenValue: 90 }, "1/10"), 90);
  assert.equal(cardPrice({ modePrices: { half: 12.5 } }, "1/2"), 0);
  assert.equal(isDrawableCard(card, { name: "hell" }), true);
  assert.equal(isDrawableCard(card, null), false);
  assert.equal(isDrawableCard({ ...card, archived: true }, { name: "hell" }), false);
  assert.deepEqual(poolCardSnapshot("c1", { ...card, name: "A", conversionValue: 999, hellCardId: "h" }), {
    id: "c1", name: "A", category: "", imageUrl: "", thumbUrl: "", tokenValue: 100,
    modePrices: { half: 100, fifth: 40, tenth: 25 }, allowedShareModes: ["1/2", "1/10"],
  });
});

test("the daily limit counts Hong Kong days and defaults to 500", () => {
  // 16:00 UTC is already the next day in Hong Kong.
  assert.equal(hongKongDay(Date.parse("2026-10-15T15:59:59Z")), "2026-10-15");
  assert.equal(hongKongDay(Date.parse("2026-10-15T16:00:00Z")), "2026-10-16");
  assert.equal(spentToday({ instantDrawDay: "2026-10-15", instantDrawSpent: 120 }, "2026-10-15"), 120);
  assert.equal(spentToday({ instantDrawDay: "2026-10-14", instantDrawSpent: 120 }, "2026-10-15"), 0);
  assert.equal(dailyLimit({}), 500);
  assert.equal(dailyLimit({ dailyTokenLimit: 0 }), 0);
  assert.equal(dailyLimit({ dailyTokenLimit: 2000 }), 2000);
  assert.equal(dailyLimit({ dailyTokenLimit: -1 }), 500);
});

test("analytics keeps 自助抽卡 apart from live purchases", () => {
  const summary = summarizeAdminDay([
    { uid: "a", tokenCost: 100, cardId: "c", cardConversionValue: 60 },
    { uid: "b", tokenCost: 30, cardId: "h", cardConversionValue: 5, source: "instant", resultSide: "hell" },
    { uid: "b", tokenCost: 30, cardId: "c", cardConversionValue: 80, source: "instant", resultSide: "heaven" },
  ], [], 0, 0);
  assert.equal(summary.purchaseCount, 1);
  assert.equal(summary.salesTokens, 100);
  assert.equal(summary.payoutTokens, 60);
  assert.equal(summary.instantCount, 2);
  assert.equal(summary.instantBuyerCount, 1);
  assert.equal(summary.instantSalesTokens, 60);
  assert.equal(summary.instantPayoutTokens, 85);
  assert.equal(summary.instantHeavenCount, 1);
});
