// Exercises synchronization against a local Firestore emulator, with no live writes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { syncRoomPrices, syncCardPrices, syncAllPrices } from "../functions/src/price-sync.js";
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Firestore emulator required");
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore(initializeApp({ projectId: "livedraw-7e3c2" }));
const cardRef = db.doc("cards/sync-card");
const price = { half: 798, fifth: 320, tenth: 160 };
await cardRef.set({ tokenValue: 798, modePrices: price, pricingMode: "manual" });
const roomData = { poolCardIds: ["sync-card", "keep"], poolCardValues: { "sync-card": 880, keep: 77 }, poolCards: [{ id: "sync-card", name: "Original", tokenValue: 880 }, { id: "keep", tokenValue: 77 }], title: "Keep title" };
for (const status of ["live", "scheduled", "draft", "completed", "cancelled"]) await db.doc(`draws/sync-${status}`).set({ ...roomData, status });
await db.doc("publicCardShowcase/sync-card").set({ tokenValue: 880, active: true });
await db.doc("publicSiteSettings/instantDraw").set({ cards: [{ id: "sync-card", tokenValue: 880 }, { id: "keep", tokenValue: 77 }], pausedForLive: true });
const dry = await syncAllPrices(db, true);
assert.equal(dry.rooms, 3);
assert.equal(dry.copies, 2);
assert.equal((await db.doc("draws/sync-live").get()).data().poolCardValues["sync-card"], 880);
const applied = await syncAllPrices(db);
assert.deepEqual(applied, dry);
for (const status of ["live", "scheduled", "draft"]) {
  const room = (await db.doc(`draws/sync-${status}`).get()).data();
  assert.equal(room.poolCardValues["sync-card"], 798);
  assert.equal(room.poolCardValues.keep, 77);
  assert.equal(room.title, "Keep title");
  assert.equal(room.poolCards[1].id, "keep");
}
for (const status of ["completed", "cancelled"]) assert.equal((await db.doc(`draws/sync-${status}`).get()).data().poolCardValues["sync-card"], 880);
assert.equal((await db.doc("publicSiteSettings/instantDraw").get()).data().pausedForLive, true);
assert.deepEqual(await syncAllPrices(db), { rooms: 0, copies: 0 });
// Simulate an old event arriving after a newer card update: sync always reads 900.
await cardRef.update({ tokenValue: 900, modePrices: { half: 900, fifth: 360, tenth: 180 } });
await syncCardPrices(db, "sync-card");
assert.equal((await db.doc("draws/sync-live").get()).data().poolCardValues["sync-card"], 900);
// A stale admin room snapshot is repaired without changing library prices or room order.
await db.doc("draws/sync-live").update({ poolCardValues: { "sync-card": 1, keep: 77 } });
await syncRoomPrices(db, db.doc("draws/sync-live"));
assert.equal((await db.doc("draws/sync-live").get()).data().poolCardValues["sync-card"], 900);
console.log("PASS price sync: stale copies, unchanged library, dry run, retries, newer edits, all open statuses, order and historical data");
await db.terminate();
