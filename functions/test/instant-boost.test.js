import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { advanceRun, bonusSlots, publicRun, validBonusPicks } from "../src/boost-run.js";
import {
  BOOST_FEE_NUMBERS, BOOST_STAGES, BOOST_TIERS, BOOST_THROW_WINDOW_MS, boostThrowHits, boostTier, nextBoostTier,
} from "../src/instant-boost.js";
import { boostEligible } from "../src/instant-draw.js";
import { summarizeAdminDay } from "../src/admin-analytics.js";

test("the page uses the very same game code", () => {
  const server = readFileSync(new URL("../src/instant-boost.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../../src/instantBoost.js", import.meta.url), "utf8");
  assert.equal(page, server);
});

test("the table never gives away more than a sale earns, in any mode", () => {
  for (const chance of [0.1, 0.2, 0.5]) {
    for (const hellShare of [0, 0.05, 0.1, 0.3]) {
      const heaven = 100;
      const fair = chance * heaven + (1 - chance) * heaven * hellShare;
      const price = fair * 1.2;
      const freeCost = chance * heaven;
      for (const tier of BOOST_TIERS) {
        const earned = tier.min * (price - fair);
        assert.ok(earned + 1e-9 >= tier.free.at(-1) * freeCost, `free ${chance} ${tier.min}`);
        assert.ok(earned + BOOST_FEE_NUMBERS * price + 1e-9 >= tier.paid.at(-1) * freeCost, `paid ${chance} ${tier.min}`);
      }
    }
  }
});

test("every Boost has three stages, each harder and worth more", () => {
  for (const tier of BOOST_TIERS) {
    for (const ladder of [tier.free, tier.paid]) {
      assert.equal(ladder.length, 3);
      assert.ok(ladder[0] < ladder[1] && ladder[1] < ladder[2]);
    }
  }
  for (let stage = 1; stage < 3; stage += 1) {
    assert.ok(BOOST_STAGES[stage].radius < BOOST_STAGES[stage - 1].radius);
    assert.ok(BOOST_STAGES[stage].ballMs < BOOST_STAGES[stage - 1].ballMs);
    assert.ok(BOOST_STAGES[stage].targetMs < BOOST_STAGES[stage - 1].targetMs);
  }
});

test("tiers unlock by numbers bought", () => {
  assert.equal(boostTier(9), null);
  assert.deepEqual(boostTier(10).free, [0, 1, 2]);
  assert.deepEqual(boostTier(14).paid, [1, 2, 4]);
  assert.deepEqual(boostTier(15).free, [1, 2, 3]);
  assert.deepEqual(boostTier(20).paid, [2, 4, 8]);
  assert.equal(nextBoostTier(4).min, 10);
  assert.equal(nextBoostTier(12).min, 15);
  assert.equal(nextBoostTier(20), null);
});

test("cards priced below the margin in any mode offer no Boost", () => {
  const hell = { conversionValue: 10 };
  const card = { conversionValue: 100, modePrices: { half: 66, fifth: 34, tenth: 23 } };
  assert.equal(boostEligible(card, hell), true);
  assert.equal(boostEligible({ ...card, modePrices: { ...card.modePrices, half: 60 } }, hell), false);
  assert.equal(boostEligible({ ...card, allowedShareModes: ["1/10"], modePrices: { ...card.modePrices, half: 60 } }, hell), true);
});

test("free numbers fill the board, then spill onto a new one", () => {
  assert.deepEqual(bonusSlots([1, 2], 2), { first: 2, second: 0 });
  const nineteen = Array.from({ length: 19 }, (_, index) => index + 1);
  assert.deepEqual(bonusSlots(nineteen, 2), { first: 1, second: 1 });
  const all = [...nineteen, 20];
  assert.deepEqual(bonusSlots(all, 8), { first: 0, second: 8 });
  assert.deepEqual(validBonusPicks(nineteen, 2, [20], [20]), { first: [20], second: [20] });
  assert.equal(validBonusPicks(nineteen, 2, [19], [1]), null);
  assert.equal(validBonusPicks(nineteen, 2, [20], []), null);
  assert.equal(validBonusPicks([1], 2, [2, 2], []), null);
  assert.deepEqual(validBonusPicks(all, 2, [], [3, 4]), { first: [], second: [3, 4] });
});

function findTap(seed, stage, hit) {
  for (let ms = 0; ms < BOOST_THROW_WINDOW_MS; ms += 10) if (boostThrowHits(seed, stage, ms) === hit) return ms;
  throw new Error("no tap");
}

test("a round steps through stages and a miss loses the prize", () => {
  const base = { status: "playing", stage: 0, ladder: [2, 4, 8], seed: 123, stageStartedAtMs: 0, prize: 0 };
  const hitTap = findTap(123, 0, true);
  const hit = advanceRun(base, "throw", { tapMs: hitTap }, BOOST_THROW_WINDOW_MS);
  assert.deepEqual([hit.status, hit.prize], ["decide", 2]);
  assert.equal(advanceRun({ ...base, ...hit }, "take", {}, 0).status, "pick");
  const next = advanceRun({ ...base, ...hit }, "challenge", {}, 0);
  assert.deepEqual([next.status, next.stage, next.prize], ["ready", 1, 0]);
  const gate = advanceRun({ ...base, ladder: [0, 1, 2] }, "throw", { tapMs: hitTap }, BOOST_THROW_WINDOW_MS);
  assert.deepEqual([gate.status, gate.prize], ["decide", 0]);
  const miss = advanceRun({ ...base, prize: 0 }, "throw", { tapMs: findTap(123, 0, false) }, BOOST_THROW_WINDOW_MS);
  assert.deepEqual([miss.status, miss.prize], ["pick", 0]);
  const last = advanceRun({ ...base, ladder: [2] }, "throw", { tapMs: hitTap }, BOOST_THROW_WINDOW_MS);
  assert.deepEqual([last.status, last.prize], ["pick", 2]);
});

test("taps that could not have happened count as misses", () => {
  const base = { status: "playing", stage: 0, ladder: [2], seed: 123, stageStartedAtMs: 10_000, prize: 0 };
  const tapMs = findTap(123, 0, true);
  assert.equal(advanceRun(base, "throw", { tapMs }, 10_000 + tapMs - 1000).prize, 0);
  assert.equal(advanceRun(base, "throw", { tapMs: null }, 20_000).prize, 0);
  assert.equal(advanceRun(base, "throw", { tapMs: -1 }, 20_000).prize, 0);
  assert.equal(advanceRun(base, "throw", { tapMs: BOOST_THROW_WINDOW_MS + 1 }, 90_000).prize, 0);
  assert.throws(() => advanceRun({ ...base, status: "pick" }, "throw", { tapMs }, 20_000));
});

test("the page never sees the board, and the seed only while throwing", () => {
  const run = { status: "ready", stage: 0, ladder: [2], prize: 0, numbers: [1], board: ["heaven"], seed: 9, heaven: {}, hell: {} };
  const shown = publicRun("r", run);
  assert.equal(JSON.stringify(shown).includes("heaven"), false);
  assert.equal(shown.seed, null);
  assert.equal(publicRun("r", { ...run, status: "playing" }).seed, 9);
});

test("analytics counts Boost fees and free cards", () => {
  const summary = summarizeAdminDay([
    { uid: "b", tokenCost: 30, boostFee: 120, cardId: "h", cardConversionValue: 5, source: "instant", resultSide: "hell" },
    { uid: "b", tokenCost: 0, bonus: true, cardId: "c", cardConversionValue: 80, source: "instant", resultSide: "heaven" },
  ], [], 0, 0);
  assert.equal(summary.instantCount, 1);
  assert.equal(summary.instantSalesTokens, 150);
  assert.equal(summary.instantPayoutTokens, 85);
  assert.equal(summary.instantHeavenCount, 1);
});
