// Field-tampering tests for the Firestore rules on every player write that moves money
// or changes ownership. For each flow a correct write must succeed; then every single
// field (or starting state) is tampered with in turn and each variant must be refused.
//   firebase emulators:exec --project livedraw-7e3c2 --only auth,firestore "node scripts/verify-rules-tamper.mjs"
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken } from "firebase/auth";
import {
  Timestamp, collection, connectFirestoreEmulator, doc, getFirestore, serverTimestamp, writeBatch,
} from "firebase/firestore";

const P = "livedraw-7e3c2";
const fsPort = Number(process.env.FIRESTORE_EMULATOR_HOST?.split(":").at(-1) || 8080);
const authPort = Number(process.env.FIREBASE_AUTH_EMULATOR_HOST?.split(":").at(-1) || 9099);
const FS = `http://127.0.0.1:${fsPort}/v1/projects/${P}/databases/(default)/documents`;
const owner = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const app = initializeApp({ projectId: P, apiKey: "tamper" }, `tamper-${Date.now()}`);
const auth = getAuth(app);
connectAuthEmulator(auth, `http://127.0.0.1:${authPort}`, { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", fsPort);

// ---- Firestore REST values for seeding (the Admin path, rules bypassed) ----
const enc = (v) => {
  if (v === null) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
};
const seed = (path, data) => fetch(`${FS}/${path}`, { method: "PATCH", headers: owner, body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
function unsignedToken(uid) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now, exp: now + 3600, iss: "x@example.test", sub: "x@example.test", uid,
  })}.`;
}

let counter = 0;
const run = Date.now().toString(36);
const unique = (prefix) => `${prefix}${run}${(counter += 1)}`;
async function newPlayer(extra = {}) {
  const uid = unique("u");
  const username = unique("P");
  await seed(`users/${uid}`, { uid, username, email: "", tokens: 1000, role: "user", ...extra });
  await seed(`usernames/${username.toLowerCase()}`, { uid, username });
  await signInWithCustomToken(auth, unsignedToken(uid));
  return { uid, username, tokens: 1000, ...extra };
}

const results = [];
// REVERSE=1 replays every batch with its writes in reverse order. Firestore stops at the
// first refused document, so the reverse pass makes the other documents' rules run first.
const REVERSE = process.env.REVERSE === "1";
async function attempt(label, build, expectAllowed) {
  let outcome;
  try {
    const writes = [];
    const recorder = { set: (...args) => writes.push(["set", args]), update: (...args) => writes.push(["update", args]) };
    build(recorder);
    const batch = writeBatch(db);
    for (const [method, args] of REVERSE ? writes.reverse() : writes) batch[method](...args);
    await batch.commit();
    outcome = "allowed";
  } catch (error) {
    outcome = /permission|insufficient/i.test(String(error?.code || error?.message)) ? "denied" : `error ${error?.code || error?.message}`;
  }
  const pass = expectAllowed ? outcome === "allowed" : outcome === "denied";
  results.push(`${pass ? "PASS" : "FAIL"}  ${REVERSE ? "[reverse] " : ""}${label}: ${outcome}${pass ? "" : ` (expected ${expectAllowed ? "allowed" : "denied"})`}`);
}
const now = serverTimestamp;
const past = () => Timestamp.fromDate(new Date(Date.now() - 60_000));

// ======================= 1. card conversion =======================
async function conversionCase(label, { record = {}, legacy = false, recordPatch = {}, userPatch = {}, skip, otherOwner, expect = false }) {
  const player = await newPlayer();
  const recordOwner = otherOwner ? (await newPlayerSilent()).uid : player.uid;
  const id = unique("conv");
  const base = legacy ? { cardValue: 500 } : { cardConversionValue: 400, cardValue: 500 };
  await seed(`drawRecords/${id}`, { uid: recordOwner, cardId: "card-x", collectionStatus: "pending", tokenCost: 100, ...base, ...record });
  await signInWithCustomToken(auth, unsignedToken(player.uid));
  const refund = 400;
  await attempt(`conversion: ${label}`, (batch) => {
    if (skip !== "record") batch.update(doc(db, "drawRecords", id), { collectionStatus: "converted", convertedToTokens: true, convertedAt: now(), tokenRefund: refund, updatedAt: now(), ...recordPatch });
    if (skip !== "user") batch.update(doc(db, "users", player.uid), { tokens: player.tokens + refund, lastConversionRecordId: id, lastConversionAmount: refund, updatedAt: now(), ...userPatch });
  }, expect);
}
async function newPlayerSilent() {
  const uid = unique("o");
  await seed(`users/${uid}`, { uid, username: unique("O"), tokens: 1000, role: "user" });
  return { uid };
}
await conversionCase("valid conversion", { expect: true });
await conversionCase("valid conversion of an old record (cardValue × 0.8)", { legacy: true, expect: true });
await conversionCase("refund 1 higher than the card value", { recordPatch: { tokenRefund: 401 }, userPatch: { tokens: 1401, lastConversionAmount: 401 } });
await conversionCase("balance raised by more than the refund", { userPatch: { tokens: 1401 } });
await conversionCase("amount on the user differs from the record", { userPatch: { lastConversionAmount: 399, tokens: 1399 } });
await conversionCase("refund of 0", { recordPatch: { tokenRefund: 0 }, userPatch: { tokens: 1000, lastConversionAmount: 0 } });
await conversionCase("status left as pending", { recordPatch: { collectionStatus: "pending" } });
await conversionCase("convertedToTokens false", { recordPatch: { convertedToTokens: false } });
await conversionCase("record also raises its own card value", { recordPatch: { cardConversionValue: 99999 } });
await conversionCase("user also raises their VIP level", { userPatch: { vipLevel: 4 } });
await conversionCase("convertedAt set by the client", { recordPatch: { convertedAt: past() } });
await conversionCase("user updatedAt set by the client", { userPatch: { updatedAt: past() } });
await conversionCase("points at another record id", { userPatch: { lastConversionRecordId: "someone-else" } });
await conversionCase("record converted without crediting the user", { skip: "user" });
await conversionCase("user credited without converting the record", { skip: "record" });
await conversionCase("record already converted", { record: { collectionStatus: "converted", convertedToTokens: true } });
await conversionCase("record already requested for shipping", { record: { shippingRequested: true } });
await conversionCase("record in shipping", { record: { collectionStatus: "shipping" } });
await conversionCase("record voided in 會員調整", { record: { collectionStatus: "void" } });
await conversionCase("record already shipped (shippedAt)", { record: { shippedAt: new Date() } });
await conversionCase("record without a card", { record: { cardId: null } });
await conversionCase("another player's record", { otherOwner: true });

// ======================= 2. shipping request =======================
const shipping = () => ({
  collectionStatus: "shipping", shippingRequested: true, shippingRecipient: "陳大文", shippingPhone: "91234567",
  shippingRegion: "hong-kong", shippingMethod: "sf-pickup", shippingAddress: "旺角順豐站", shippingNote: "",
  shippingRequestedAt: now(), updatedAt: now(),
});
async function shippingCase(label, { record = {}, patch = {}, otherOwner, expect = false }) {
  const player = await newPlayer();
  const recordOwner = otherOwner ? (await newPlayerSilent()).uid : player.uid;
  const id = unique("ship");
  await seed(`drawRecords/${id}`, { uid: recordOwner, cardId: "card-x", collectionStatus: "pending", cardConversionValue: 400, ...record });
  await signInWithCustomToken(auth, unsignedToken(player.uid));
  await attempt(`shipping: ${label}`, (batch) => batch.update(doc(db, "drawRecords", id), { ...shipping(), ...patch }), expect);
}
await shippingCase("valid Hong Kong SF pickup", { expect: true });
await shippingCase("valid Macau address delivery", { patch: { shippingRegion: "macau", shippingMethod: "address-delivery" }, expect: true });
for (const [label, patch] of [
  ["empty recipient", { shippingRecipient: "" }], ["recipient over 80", { shippingRecipient: "a".repeat(81) }],
  ["recipient not text", { shippingRecipient: 123 }], ["empty phone", { shippingPhone: "" }], ["phone over 30", { shippingPhone: "1".repeat(31) }],
  ["unknown region", { shippingRegion: "japan" }], ["unknown method", { shippingMethod: "drone" }],
  ["Hong Kong with address delivery", { shippingMethod: "address-delivery" }],
  ["Macau with SF door", { shippingRegion: "macau", shippingMethod: "sf-door" }],
  ["empty address", { shippingAddress: "" }], ["address over 500", { shippingAddress: "a".repeat(501) }],
  ["note over 500", { shippingNote: "a".repeat(501) }], ["requested time set by the client", { shippingRequestedAt: past() }],
  ["updatedAt set by the client", { updatedAt: past() }], ["status shipped (skipping admin)", { collectionStatus: "shipped" }],
  ["shippingRequested false", { shippingRequested: false }], ["also raises the card value", { cardConversionValue: 99999 }],
  ["also marks delivered", { deliveryStatus: "delivered" }],
]) await shippingCase(label, { patch });
await shippingCase("converted card", { record: { collectionStatus: "converted", convertedToTokens: true } });
await shippingCase("voided card", { record: { collectionStatus: "void" } });
await shippingCase("card already in shipping", { record: { collectionStatus: "shipping" } });
await shippingCase("record without a card", { record: { cardId: null } });
await shippingCase("another player's card", { otherOwner: true });

// ======================= 3. VIP reward claim =======================
const vipRecord = (uid) => ({
  uid, source: "vip", vipRewardStatus: "claimable", targetCardId: "vip-card", targetCardName: "VIP Card",
  targetCardImageUrl: "https://firebasestorage.googleapis.com/x.webp", targetCardValue: 600,
});
const vipClaim = () => ({
  vipRewardStatus: "claimed", cardId: "vip-card", cardName: "VIP Card", cardCategory: "VIP 獎勵",
  cardImageUrl: "https://firebasestorage.googleapis.com/x.webp", cardValue: 600, cardConversionValue: 600,
  collectionStatus: "pending", claimedAt: now(), updatedAt: now(),
});
async function vipCase(label, { record = {}, patch = {}, otherOwner, expect = false }) {
  const player = await newPlayer();
  const recordOwner = otherOwner ? (await newPlayerSilent()).uid : player.uid;
  const id = unique("vip");
  await seed(`drawRecords/${id}`, { ...vipRecord(recordOwner), ...record });
  await signInWithCustomToken(auth, unsignedToken(player.uid));
  await attempt(`VIP claim: ${label}`, (batch) => batch.update(doc(db, "drawRecords", id), { ...vipClaim(), ...patch }), expect);
}
await vipCase("valid claim", { expect: true });
for (const [label, patch] of [
  ["different card", { cardId: "charizard" }], ["different name", { cardName: "Charizard" }],
  ["different category", { cardCategory: "其他" }], ["different image", { cardImageUrl: "https://evil.example/x.png" }],
  ["higher card value", { cardValue: 60000 }], ["higher conversion value", { cardConversionValue: 60000 }],
  ["straight to shipping", { collectionStatus: "shipping" }], ["status left claimable", { vipRewardStatus: "claimable" }],
  ["claimedAt set by the client", { claimedAt: past() }], ["extra field", { tokenRefund: 600 }],
]) await vipCase(label, { patch });
await vipCase("already claimed", { record: { vipRewardStatus: "claimed", cardId: "vip-card" } });
await vipCase("not claimable yet", { record: { vipRewardStatus: "locked" } });
await vipCase("not a VIP record", { record: { source: "admin" } });
await vipCase("another player's reward", { otherOwner: true });

// ======================= 4. chat message =======================
async function chatCase(label, { draw = {}, user = {}, message = {}, userPatch = {}, skip, expect = false }) {
  const drawId = unique("room");
  await seed(`draws/${drawId}`, { status: "live", title: "Chat room", ...draw });
  const player = await newPlayer(user);
  const messageRef = doc(collection(db, "draws", drawId, "messages"));
  await attempt(`chat: ${label}`, (batch) => {
    if (skip !== "user") batch.update(doc(db, "users", player.uid), { lastChatAt: now(), lastChatMessageId: messageRef.id, updatedAt: now(), ...userPatch });
    batch.set(messageRef, { drawId, source: "draw", uid: player.uid, username: player.username, text: "hello", createdAt: now(), ...message });
  }, expect);
}
await chatCase("valid message", { expect: true });
for (const [label, message] of [
  ["empty text", { text: "" }], ["text over 500", { text: "a".repeat(501) }], ["text not a string", { text: 5 }],
  ["another player's name", { username: "Admin" }], ["another uid", { uid: "someone-else" }],
  ["source admin", { source: "admin" }], ["other room id", { drawId: "other-room" }], ["extra field", { pinned: true }],
  ["createdAt set by the client", { createdAt: past() }], ["phone number", { text: "加我 9123 4567" }],
]) await chatCase(label, { message });
await chatCase("cooldown update names another message", { userPatch: { lastChatMessageId: "other" } });
await chatCase("message without the cooldown update", { skip: "user" });
await chatCase("room not live", { draw: { status: "completed" } });
await chatCase("second message inside 3 seconds", { user: { lastChatAt: new Date() } });
await chatCase("slow mode: message after 5 s when 10 s is set", { draw: { chatCooldownSeconds: 10 }, user: { lastChatAt: new Date(Date.now() - 5000) } });
await chatCase("slow mode: message after 11 s", { draw: { chatCooldownSeconds: 10 }, user: { lastChatAt: new Date(Date.now() - 11000) }, expect: true });
await chatCase("bad cooldown value falls back to 3 s", { draw: { chatCooldownSeconds: "zero" }, user: { lastChatAt: new Date(Date.now() - 4000) }, expect: true });

// ======================= 5. profile edits =======================
async function profileCase(label, patch, expect = false) {
  const player = await newPlayer();
  await attempt(`profile: ${label}`, (batch) => batch.update(doc(db, "users", player.uid), patch), expect);
}
await profileCase("valid display name", { displayName: "小明", updatedAt: now() }, true);
await profileCase("valid age confirmation", { ageConfirmed: true, ageConfirmedAt: now() }, true);
for (const [label, patch] of [
  ["own tokens", { tokens: 999999 }], ["role admin", { role: "admin" }], ["VIP level", { vipLevel: 4 }],
  ["total deposits", { totalDeposits: 300000 }], ["signup gift", { signupBonusTokens: 50, signupBonusAt: now() }],
  ["admin adjustment marker", { lastAdminAdjustmentId: "x" }], ["affiliate status", { affiliateStatus: "approved" }],
  ["referrer", { referredByUid: "someone" }], ["display name over 80", { displayName: "a".repeat(81) }],
  ["photo URL over 500", { photoURL: "a".repeat(501) }], ["phone over 24", { phoneNumber: "1".repeat(25) }],
  ["age confirmation false", { ageConfirmed: false }], ["chat cooldown reset", { lastChatAt: past() }],
  ["pending request count reset", { pendingTokenRequestCount: 0 }],
]) await profileCase(label, patch);

// ======================= 6. promo code redemption =======================
async function promoCase(label, { code = {}, user = {}, request = {}, redemption = {}, userPatch = {}, redemptionUid, skip, preRedeemed, expect = false }) {
  const promoId = `PROMO-${50 + counter}`;
  await seed(`promoCodes/${promoId}`, { code: promoId, amount: 50, active: true, ...code });
  const player = await newPlayer(user);
  if (preRedeemed) await seed(`promoRedemptions/${promoId}_${player.uid}`, { uid: player.uid });
  const requestRef = doc(collection(db, "tokenRequests"));
  const redemptionRef = doc(db, "promoRedemptions", `${promoId}_${redemptionUid || player.uid}`);
  await attempt(`promo: ${label}`, (batch) => {
    batch.set(requestRef, {
      uid: player.uid, affiliateReferrerUid: "", username: player.username, email: "", amount: 50, hkdAmount: 0,
      exchangeRate: 0, packageType: "promo", fpsIdentifier: "", fpsName: "", proofMode: "promo", proofPath: "",
      proofFileName: "", proofUrl: "", status: "pending", adminNote: "", promoCode: promoId, promoCodeId: promoId,
      quotaVersion: 1, createdAt: now(), ...request,
    });
    if (skip !== "redemption") batch.set(redemptionRef, { uid: player.uid, promoCodeId: promoId, code: promoId, amount: 50, requestId: requestRef.id, createdAt: now(), ...redemption });
    if (skip !== "user") {
      batch.update(doc(db, "users", player.uid), {
        lastTokenRequestId: requestRef.id, lastTokenRequestAt: now(), pendingTokenRequestCount: (user.pendingTokenRequestCount || 0) + 1,
        tokenRequestWindowStartedAt: now(), tokenRequestWindowCount: 1, updatedAt: now(), ...userPatch,
      });
    }
  }, expect);
}
await promoCase("valid redemption", { expect: true });
for (const [label, options] of [
  ["more tokens than the code", { request: { amount: 500 }, redemption: { amount: 500 } }],
  ["request amount differs from the code", { request: { amount: 51 } }],
  ["redemption amount differs", { redemption: { amount: 51 } }],
  ["HK$ amount set", { request: { hkdAmount: 10 } }], ["package custom", { request: { packageType: "custom" } }],
  ["proof mode storage", { request: { proofMode: "storage" } }], ["created as approved", { request: { status: "approved" } }],
  ["old quota version", { request: { quotaVersion: 2 } }], ["admin note filled in", { request: { adminNote: "ok" } }],
  ["another player's request", { request: { uid: "someone-else" } }], ["another player's name", { request: { username: "Admin" } }],
  ["referrer that is not on the profile", { request: { affiliateReferrerUid: "someone" } }],
  ["extra request field", { request: { verifiedHkdAmount: 999 } }],
  ["redemption for another player", { redemptionUid: "someone-else" }],
  ["redemption naming another request", { redemption: { requestId: "other" } }],
  ["without the redemption record", { skip: "redemption" }], ["without the quota update", { skip: "user" }],
  ["pending count jumps by 2", { userPatch: { pendingTokenRequestCount: 2 } }],
  ["inactive code", { code: { active: false } }], ["code already used", { preRedeemed: true }],
  ["second request inside 1 minute", { user: { lastTokenRequestAt: new Date() } }],
  ["already 2 pending requests", { user: { pendingTokenRequestCount: 2 } }],
  ["5 requests already in 24 h", { user: { tokenRequestWindowStartedAt: new Date(Date.now() - 3600_000), tokenRequestWindowCount: 5 }, userPatch: { tokenRequestWindowStartedAt: Timestamp.fromDate(new Date(Date.now() - 3600_000)), tokenRequestWindowCount: 6 } }],
]) await promoCase(label, options);

// ======================= 7. buying a number =======================
const THUMB = "https://firebasestorage.googleapis.com/v0/b/livedraw-7e3c2.firebasestorage.app/o/card-images%2Fcard-1%2Fthumb.webp?alt=media";
await seed("cards/tamper-card", { name: "Tamper card", thumbUrl: THUMB, tokenValue: 10, modePrices: { half: 10, fifth: 25, tenth: 50 } });
await seed("cards/tamper-other", { name: "Other card", thumbUrl: THUMB, tokenValue: 10, modePrices: { half: 10, fifth: 25, tenth: 50 } });
await seed("cards/tamper-half-only", { name: "Half only", thumbUrl: THUMB, tokenValue: 10, allowedShareModes: ["1/2"], modePrices: { half: 10, fifth: 25, tenth: 50 } });
async function purchaseCase(label, { draw = {}, slot = {}, user = {}, recordPatch = {}, slotPatch = {}, userPatch = {}, card = "tamper-card", skip, expect = false }) {
  const drawId = unique("buy");
  await seed(`draws/${drawId}`, {
    status: "live", title: "Tamper", slug: drawId, round: "round-001", currentRound: 1, shareMode: "1/5",
    roundShareModes: { "round-001": "1/5" }, poolCardIds: ["tamper-card", "tamper-other", "tamper-half-only"], ...draw,
  });
  await seed(`draws/${drawId}/rounds/round-001`, { round: "round-001", roundNumber: 1 });
  await seed(`draws/${drawId}/rounds/round-001/slots/1`, { number: 1, round: "round-001", status: "available", ...slot });
  const player = await newPlayer(user);
  const recordRef = doc(collection(db, "drawRecords"));
  const price = 25;
  const cardName = card === "tamper-other" ? "Other card" : card === "tamper-half-only" ? "Half only" : "Tamper card";
  await attempt(`purchase: ${label}`, (batch) => {
    if (skip !== "user") batch.update(doc(db, "users", player.uid), { tokens: player.tokens - price, lastPurchaseRecordId: recordRef.id, updatedAt: now(), ...userPatch });
    if (skip !== "slot") {
      batch.update(doc(db, "draws", drawId, "rounds", "round-001", "slots", "1"), {
        purchaseRecordId: recordRef.id, status: "locked", uid: player.uid, username: player.username, tokenCost: price,
        targetCardId: card, targetCardName: cardName, targetCardImageUrl: THUMB, targetCardValue: price,
        shareMode: "1/5", round: "round-001", updatedAt: now(), ...slotPatch,
      });
    }
    if (skip !== "record") {
      batch.set(recordRef, {
        slotId: "1", uid: player.uid, username: player.username, drawId, drawTitle: "Tamper", roomSlug: drawId,
        roomLink: `https://livedrawcard.com/?room=${drawId}`, round: "round-001", roundSort: 1, number: 1, tokenCost: price,
        targetCardId: card, targetCardName: cardName, targetCardImageUrl: THUMB, targetCardValue: price, shareMode: "1/5",
        createdAt: now(), ...recordPatch,
      });
    }
  }, expect);
}
await purchaseCase("valid purchase", { expect: true });
for (const [label, recordPatch] of [
  ["record price 1", { tokenCost: 1 }], ["record card value 1", { targetCardValue: 1 }], ["record odds 1/2", { shareMode: "1/2" }],
  ["record next round", { round: "round-002" }], ["record sort 2", { roundSort: 2 }], ["record number 2", { number: 2 }],
  ["record slot 2", { slotId: "2" }], ["record for another uid", { uid: "someone-else" }], ["record with another name", { username: "Admin" }],
  ["record for another room", { drawId: "other-room" }], ["record title VIP reward", { drawTitle: "VIP4 升級獎勵" }],
  ["record javascript: link", { roomLink: "javascript:alert(1)" }], ["record link to another site", { roomLink: "https://evil.example/?room=x" }],
  ["record another card", { targetCardId: "tamper-other" }], ["record fake card name", { targetCardName: "Charizard PSA 10" }],
  ["record tracking image", { targetCardImageUrl: "https://evil.example/p.png" }],
  ["record arrives with a card already won", { cardId: "tamper-card", cardConversionValue: 99999 }],
  ["record arrives as heaven", { resultSide: "heaven" }], ["record createdAt set by the client", { createdAt: past() }],
  ["record extra field", { source: "admin" }],
]) await purchaseCase(label, { recordPatch });
for (const [label, slotPatch] of [
  ["slot left available", { status: "available" }], ["slot for another uid", { uid: "someone-else" }], ["slot price 1", { tokenCost: 1 }],
  ["slot another card", { targetCardId: "tamper-other" }], ["slot names another record", { purchaseRecordId: "other" }],
  ["slot odds 1/10", { shareMode: "1/10" }], ["slot other round", { round: "round-002" }],
  ["slot tracking image", { targetCardImageUrl: "https://evil.example/p.png" }], ["slot extra field", { resultSide: "heaven" }],
]) await purchaseCase(label, { slotPatch });
for (const [label, userPatch] of [
  ["tokens not deducted", { tokens: 1000 }], ["only 24 deducted", { tokens: 976 }], ["user names another record", { lastPurchaseRecordId: "other" }],
  ["user also raises VIP level", { vipLevel: 4 }],
]) await purchaseCase(label, { userPatch });
await purchaseCase("slot without a record", { skip: "record" });
await purchaseCase("record without a slot", { skip: "slot" });
await purchaseCase("purchase without paying", { skip: "user" });
await purchaseCase("not enough tokens", { user: { tokens: 10 }, userPatch: { tokens: -15 } });
await purchaseCase("number already sold", { slot: { status: "locked", uid: "someone-else" } });
await purchaseCase("buying stopped for this round", { draw: { buyingBlockedRounds: ["round-001"] } });
await purchaseCase("buying stopped (single round field)", { draw: { buyingBlockedRound: "round-001" } });
await purchaseCase("room completed", { draw: { status: "completed" } });
await purchaseCase("scheduled room without preorder", { draw: { status: "scheduled" } });
await purchaseCase("valid preorder in a scheduled room", { draw: { status: "scheduled", preorderOpen: true }, expect: true });
await purchaseCase("round already finished", { draw: { round: "round-002", currentRound: 2 } });
await purchaseCase("card not allowed at these odds", { card: "tamper-half-only" });

const failed = results.filter((line) => !line.startsWith("PASS"));
console.log(failed.length ? failed.join("\n") : "");
console.log(`SUMMARY ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
