// Uses a public-card price fixture from the incident, with a synthetic local player.
// Never runs against production; both emulator host variables are mandatory.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, collection, runTransaction, serverTimestamp } from "firebase/firestore";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Run only through firebase emulators:exec with Auth and Firestore.");
}
const fixture = JSON.parse(await readFile(new URL("./fixtures/live-price-2026-10-20.json", import.meta.url), "utf8"));
const projectId = "livedraw-7e3c2";
const app = initializeApp({ projectId, apiKey: "local-price-regression" });
const auth = getAuth(app);
const db = getFirestore(app);
connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
connectFirestoreEmulator(db, host, Number(port));
const { user } = await createUserWithEmailAndPassword(auth, `incident-${Date.now()}@example.test`, "local-test-password");
const uid = user.uid;
const drawId = "incident-price-regression";
const round = "round-005";
const slotPath = `draws/${drawId}/rounds/${round}/slots/1`;
const username = "IncidentBuyer";

// Encodes ordinary fixture values for owner-only local emulator seeding.
function encode(value) {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") return { integerValue: String(value) };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
}

// Seeds only the emulator, bypassing rules to establish the historical conditions.
async function seed(documents) {
  const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents:commit`, {
    method: "POST", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ writes: documents.map(([path, data]) => ({ update: {
      name: `projects/${projectId}/databases/(default)/documents/${path}`, fields: encode(data).mapValue.fields,
    } })) }),
  });
  assert.ok(response.ok, await response.text());
}
await seed([
  [`users/${uid}`, { uid, username, tokens: 10000000, referredByUid: "" }],
  [`usernames/${username.toLowerCase()}`, { uid, username }],
  [`draws/${drawId}`, { title: "Incident regression", status: "live", currentRound: 5, shareMode: "1/2", poolCardIds: fixture.cards.map((c) => c.id), poolCardValues: fixture.poolCardValues }],
  [`draws/${drawId}/rounds/${round}`, { round, roundNumber: 5 }],
  ...fixture.cards.map(({ id, ...card }) => [`cards/${id}`, card]),
]);

// Mirrors the original browser transaction; price is the only changed input.
async function purchase(card, price) {
  const recordRef = doc(collection(db, "drawRecords"));
  await runTransaction(db, async (tx) => {
    const userRef = doc(db, "users", uid);
    const slotRef = doc(db, slotPath);
    const snapshot = await tx.get(userRef);
    const common = { uid, username, tokenCost: price, targetCardId: card.id,
      targetCardName: card.name, targetCardImageUrl: "", targetCardValue: price, shareMode: "1/2", round };
    tx.update(userRef, { tokens: snapshot.data().tokens - price, lastPurchaseRecordId: recordRef.id, updatedAt: serverTimestamp() });
    tx.update(slotRef, { ...common, status: "locked", purchaseRecordId: recordRef.id, updatedAt: serverTimestamp() });
    tx.set(recordRef, { ...common, affiliateReferrerUid: "", slotId: "1", number: 1,
      drawId, drawTitle: "Incident regression", roomSlug: drawId,
      roomLink: `https://livedrawcard.com/?room=${drawId}`, roundSort: 5, createdAt: serverTimestamp() });
  });
}
let mismatches = 0, matches = 0, corrected = 0;
for (const card of fixture.cards) {
  await seed([[slotPath, { number: 1, round, status: "available" }]]);
  const browserPrice = card.modePrices?.half ?? card.tokenValue;
  const roomPrice = fixture.poolCardValues[card.id];
  // After the fix, old browser prices work even while the room copy is stale.
  await purchase(card, browserPrice);
  if (browserPrice !== roomPrice) {
    mismatches++;
    await seed([[slotPath, { number: 1, round, status: "available" }]]);
    await assert.rejects(purchase(card, roomPrice), (error) => error.code === "permission-denied");
    corrected++;
  } else {
    matches++;
  }
}
assert.equal(mismatches, 59);
assert.equal(matches, 34);
assert.equal(corrected, 59);
console.log(`PASS historical prices after fix: all ${mismatches + matches} library-price purchases succeed despite stale room copies; all ${corrected} stale room-price purchases are safely rejected.`);
await deleteApp(app);
