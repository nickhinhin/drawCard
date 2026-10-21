import test from "node:test";
import assert from "node:assert/strict";
import { canonicalPrices, copyPricePatch, roomPricePatch } from "../src/price-sync.js";
const card = { tokenValue: 798, modePrices: { half: 798, fifth: 320, tenth: 160 } };
const cards = new Map([["a", card]]);

test("stale room prices are repaired even when the library already has its final price", () => {
  const room = { status: "live", poolCardIds: ["a", "b"], poolCardValues: { a: 880, b: 99 }, poolCards: [{ id: "a", name: "Keep", tokenValue: 880 }, { id: "b", tokenValue: 99 }] };
  const patch = roomPricePatch(room, cards);
  assert.deepEqual(patch.poolCardValues, { a: 798, b: 99 });
  assert.equal(patch.poolCards[0].name, "Keep");
  assert.deepEqual(patch.poolCards[0].modePrices, card.modePrices);
  assert.equal(patch.poolCards[1], room.poolCards[1]);
  assert.equal(roomPricePatch({ ...room, ...patch }, cards), null);
});

test("all open room types sync; finished/cancelled history is left intact", () => {
  for (const status of ["live", "scheduled", "draft"]) assert.ok(roomPricePatch({ status, poolCardIds: ["a"], poolCardValues: { a: 880 } }, cards));
  for (const status of ["completed", "cancelled"]) assert.equal(roomPricePatch({ status, poolCardIds: ["a"], poolCardValues: { a: 880 } }, cards), null);
});

test("display copy repairs compare every mode and preserve legacy single-price cards", () => {
  assert.deepEqual(canonicalPrices({ tokenValue: 20 }), { half: 20, fifth: 20, tenth: 20 });
  assert.ok(copyPricePatch({ tokenValue: 798, modePrices: { ...card.modePrices, fifth: 1 } }, card));
  assert.equal(copyPricePatch(card, card), null);
});
