import { deleteApp, initializeApp } from "firebase/app";
import {
  collection, connectFirestoreEmulator, doc, getFirestore, runTransaction, serverTimestamp, setDoc, updateDoc, writeBatch,
} from "firebase/firestore";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";

// Simulates a player who edits the web client to buy a slot they cannot afford.
// Every variant must be rejected by Firestore rules.
const projectId = "livedraw-7e3c2";
const firestorePort = Number(process.env.FIRESTORE_EMULATOR_HOST?.split(":").at(-1) || 8080);
const authPort = Number(process.env.FIREBASE_AUTH_EMULATOR_HOST?.split(":").at(-1) || 9099);
const s = (v) => ({ stringValue: v });
const i = (v) => ({ integerValue: String(v) });
const ts = () => ({ timestampValue: new Date().toISOString() });
const m = (fields) => ({ mapValue: { fields } });

async function seed(writes) {
  const res = await fetch(`http://127.0.0.1:${firestorePort}/v1/projects/${projectId}/databases/(default)/documents:commit`, {
    method: "POST", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ writes: writes.map(([path, fields]) => ({ update: { name: `projects/${projectId}/databases/(default)/documents/${path}`, fields } })) }),
  });
  if (!res.ok) throw new Error(await res.text());
}

const stamp = Date.now();
const app = initializeApp({ projectId, apiKey: "attack-audit" }, `attack-${stamp}`);
const auth = getAuth(app);
const db = getFirestore(app);
connectAuthEmulator(auth, `http://127.0.0.1:${authPort}`, { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", firestorePort);

const { user } = await createUserWithEmailAndPassword(auth, `attack-${stamp}@example.test`, "not-a-real-password");
const uid = user.uid;
const username = `attacker${stamp % 100000}`;
const drawId = `attack-${stamp}`;
const PRICE = 25;
await seed([
  [`users/${uid}`, { uid: s(uid), email: s(user.email), username: s(username), tokens: i(5), role: s("user"), createdAt: ts(), updatedAt: ts() }],
  [`usernames/${username.toLowerCase()}`, { uid: s(uid), username: s(username) }],
  [`draws/${drawId}`, { status: s("live"), title: s("Audit"), round: s("round-001"), currentRound: i(1), shareMode: s("1/5"), roundShareModes: m({ "round-001": s("1/5") }), poolCardIds: { arrayValue: { values: [s("card-1")] } }, poolCardValues: m({ "card-1": i(10) }) }],
  ["cards/card-1", { name: s("Audit card"), thumbUrl: s("https://firebasestorage.googleapis.com/v0/b/livedraw-7e3c2.firebasestorage.app/o/card-images%2Fcard-1%2Fthumb.webp?alt=media"), tokenValue: i(10), modePrices: m({ half: i(10), fifth: i(PRICE), tenth: i(50) }) }],
  [`draws/${drawId}/rounds/round-001`, { round: s("round-001"), roundNumber: i(1) }],
  [`draws/${drawId}/rounds/round-001/slots/1`, { number: i(1), round: s("round-001"), status: s("available") }],
]);

async function attempt(label, { cost, newTokens, skipUserUpdate = false, recordCost = cost }) {
  const recordRef = doc(collection(db, "drawRecords"));
  try {
    await runTransaction(db, async (t) => {
      if (!skipUserUpdate) {
        t.update(doc(db, "users", uid), { tokens: newTokens, lastPurchaseRecordId: recordRef.id, updatedAt: serverTimestamp() });
      }
      t.update(doc(db, `draws/${drawId}/rounds/round-001/slots/1`), {
        purchaseRecordId: recordRef.id, status: "locked", uid, username, tokenCost: cost,
        targetCardId: "card-1", targetCardName: "Audit card", targetCardImageUrl: "", targetCardValue: cost,
        shareMode: "1/5", round: "round-001", updatedAt: serverTimestamp(),
      });
      t.set(recordRef, {
        slotId: "1", uid, username, drawId, drawTitle: "Audit", roomSlug: drawId, roomLink: `https://livedraw-7e3c2.web.app/?room=${drawId}`, round: "round-001",
        roundSort: 1, number: 1, tokenCost: recordCost, targetCardId: "card-1", targetCardName: "Audit card",
        targetCardImageUrl: "", targetCardValue: recordCost, shareMode: "1/5", createdAt: serverTimestamp(),
      });
    });
    return `FAIL  ${label}: purchase was ACCEPTED`;
  } catch (error) {
    return /permission|insufficient/i.test(String(error?.code || error?.message)) ? `PASS  ${label}: rejected` : `??    ${label}: ${error.message}`;
  }
}

const results = [
  await attempt("balance goes negative (5 - 25 = -20)", { cost: PRICE, newTokens: -20 }),
  await attempt("claims cheaper price (cost 5, balance 0)", { cost: 5, newTokens: 0 }),
  await attempt("keeps balance unchanged (tokens stay 5)", { cost: PRICE, newTokens: 5 }),
  await attempt("sets own balance high (tokens 1000)", { cost: PRICE, newTokens: 1000 }),
  await attempt("skips token deduction entirely", { cost: PRICE, skipUserUpdate: true }),
  await attempt("slot price 25 but record price 5 (balance 0)", { cost: PRICE, recordCost: 5, newTokens: 0 }),
];
let direct;
try {
  await setDoc(doc(db, "users", uid), { tokens: 999999 }, { merge: true });
  direct = "FAIL  directly edits own token balance: ACCEPTED";
} catch {
  direct = "PASS  directly edits own token balance: rejected";
}
results.push(direct);

// VIP rewards: a player may not create their own reward, only claim one the server issued.
await seed([
  ["settings/vipProgram", { tiers: { arrayValue: { values: [m({ id: s("vip1"), name: s("VIP1"), threshold: i(100), rewardName: s("Reward"), rewardConversionValue: i(500) })] } } }],
  [`users/${uid}`, { uid: s(uid), email: s(user.email), username: s(username), tokens: i(5), totalDeposits: i(1000), vipLevel: i(-1), role: s("user"), createdAt: ts(), updatedAt: ts() }],
]);
const selfRewardRef = doc(db, "drawRecords", `vip_${uid}_vip1`);
try {
  await setDoc(selfRewardRef, {
    source: "vip", vipTierId: "vip1", vipTierIndex: 0, uid, username, drawId: "vip-program",
    drawTitle: "VIP1 升級獎勵", roomSlug: "vip-program", roomLink: "", round: "vip-reward", roundSort: 0,
    number: 1, tokenCost: 0, targetCardId: "vip-reward-vip1", targetCardName: "Reward", targetCardImageUrl: "",
    targetCardValue: 500, vipRewardStatus: "claimed", cardId: "vip-reward-vip1", cardName: "Reward",
    cardCategory: "VIP 獎勵", cardImageUrl: "", cardValue: 500, cardConversionValue: 500,
    collectionStatus: "pending", unlockedAt: serverTimestamp(), claimedAt: serverTimestamp(),
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  results.push("FAIL  player creates own VIP reward without approval: ACCEPTED");
} catch {
  results.push("PASS  player creates own VIP reward without approval: rejected");
}

// Simulate the reward adminReviewTokenRequest issues after an approved deposit.
await seed([[`drawRecords/vip_${uid}_vip1`, {
  source: s("vip"), vipTierId: s("vip1"), vipTierIndex: i(0), uid: s(uid), username: s(username),
  drawId: s("vip-program"), drawTitle: s("VIP1 升級獎勵"), roomSlug: s("vip-program"), roomLink: s(""),
  round: s("vip-reward"), roundSort: i(0), number: i(1), tokenCost: i(0), targetCardId: s("vip-reward-vip1"),
  targetCardName: s("Reward"), targetCardImageUrl: s(""), targetCardValue: i(500), vipRewardStatus: s("claimable"),
  unlockedAt: ts(), createdAt: ts(), updatedAt: ts(),
}]]);
const claimUpdate = {
  vipRewardStatus: "claimed", cardId: "vip-reward-vip1", cardName: "Reward", cardCategory: "VIP 獎勵",
  cardImageUrl: "", cardValue: 500, cardConversionValue: 500, collectionStatus: "pending",
  claimedAt: serverTimestamp(), updatedAt: serverTimestamp(),
};
try {
  await updateDoc(selfRewardRef, claimUpdate);
  results.push("PASS  player claims an admin-issued VIP reward: allowed");
} catch (error) {
  results.push(`FAIL  player claims an admin-issued VIP reward: ${error.code || error.message}`);
}
try {
  await updateDoc(selfRewardRef, { ...claimUpdate, cardValue: 999 });
  results.push("FAIL  player claims the same VIP reward twice: ACCEPTED");
} catch {
  results.push("PASS  player claims the same VIP reward twice: rejected");
}
// Chat: one cooldown update may carry only one message.
await seed([
  [`users/${uid}`, { uid: s(uid), email: s(user.email), username: s(username), tokens: i(100), role: s("user"), createdAt: ts(), updatedAt: ts() }],
  [`draws/${drawId}/rounds/round-001/slots/2`, { number: i(2), round: s("round-001"), status: s("available") }],
]);
function chatMessage() {
  return { drawId, source: "draw", uid, username, text: "hello", createdAt: serverTimestamp() };
}
const spamBatch = writeBatch(db);
const firstMessage = doc(collection(db, "draws", drawId, "messages"));
spamBatch.update(doc(db, "users", uid), { lastChatAt: serverTimestamp(), lastChatMessageId: firstMessage.id, updatedAt: serverTimestamp() });
spamBatch.set(firstMessage, chatMessage());
for (let index = 0; index < 20; index += 1) spamBatch.set(doc(collection(db, "draws", drawId, "messages")), chatMessage());
try {
  await spamBatch.commit();
  results.push("FAIL  21 chat messages in one batch: ACCEPTED");
} catch {
  results.push("PASS  21 chat messages in one batch: rejected");
}
const singleBatch = writeBatch(db);
const singleMessage = doc(collection(db, "draws", drawId, "messages"));
singleBatch.update(doc(db, "users", uid), { lastChatAt: serverTimestamp(), lastChatMessageId: singleMessage.id, updatedAt: serverTimestamp() });
singleBatch.set(singleMessage, chatMessage());
try {
  await singleBatch.commit();
  results.push("PASS  one normal chat message: allowed");
} catch (error) {
  results.push(`FAIL  one normal chat message: ${error.code || error.message}`);
}

// Purchases: display fields must match the card library and the room.
async function purchaseSlot2(overrides) {
  const recordRef = doc(collection(db, "drawRecords"));
  const slot = {
    purchaseRecordId: recordRef.id, status: "locked", uid, username, tokenCost: PRICE,
    targetCardId: "card-1", targetCardName: "Audit card", targetCardImageUrl: "", targetCardValue: PRICE,
    shareMode: "1/5", round: "round-001", updatedAt: serverTimestamp(), ...overrides.slot,
  };
  const record = {
    slotId: "2", uid, username, drawId, drawTitle: "Audit", roomSlug: drawId,
    roomLink: `https://livedraw-7e3c2.web.app/?room=${drawId}`, round: "round-001", roundSort: 1, number: 2,
    tokenCost: PRICE, targetCardId: "card-1", targetCardName: slot.targetCardName,
    targetCardImageUrl: slot.targetCardImageUrl, targetCardValue: PRICE, shareMode: "1/5",
    createdAt: serverTimestamp(), ...overrides.record,
  };
  await runTransaction(db, async (t) => {
    const current = await t.get(doc(db, "users", uid));
    t.update(doc(db, "users", uid), { tokens: current.data().tokens - PRICE, lastPurchaseRecordId: recordRef.id, updatedAt: serverTimestamp() });
    t.update(doc(db, `draws/${drawId}/rounds/round-001/slots/2`), slot);
    t.set(recordRef, record);
  });
}
for (const [label, overrides] of [
  ["fake card name on purchase", { slot: { targetCardName: "Charizard PSA 10" } }],
  ["tracking-pixel card image on purchase", { slot: { targetCardImageUrl: "https://evil.example/pixel.png" } }],
  ["fake room title on purchase record", { record: { drawTitle: "VIP4 升級獎勵" } }],
  ["javascript: room link on purchase record", { record: { roomLink: "javascript:alert(1)" } }],
  ["non-integer sort on purchase record", { record: { roundSort: "first" } }],
]) {
  try {
    await purchaseSlot2(overrides);
    results.push(`FAIL  ${label}: ACCEPTED`);
  } catch {
    results.push(`PASS  ${label}: rejected`);
  }
}
try {
  await purchaseSlot2({ slot: { targetCardImageUrl: "https://firebasestorage.googleapis.com/v0/b/livedraw-7e3c2.firebasestorage.app/o/card-images%2Fcard-1%2Fthumb.webp?alt=media" } });
  results.push("PASS  normal purchase with library card thumbnail: allowed");
} catch (error) {
  results.push(`FAIL  normal purchase with library card thumbnail: ${error.code || error.message}`);
}

console.log(results.join("\n"));
await deleteApp(app);
if (results.some((line) => !line.startsWith("PASS"))) process.exit(1);
