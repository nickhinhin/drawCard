import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, collectionGroup, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, query, serverTimestamp, setDoc, terminate, updateDoc, where, writeBatch } from "firebase/firestore";

// This harness deliberately refuses live projects and non-local endpoints.
const projectId = "demo-drawcard-security";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (firestoreHost !== "127.0.0.1:18080" || authHost !== "127.0.0.1:19099") {
  throw new Error("Run only through firebase.security-audit.json with local emulators.");
}
const app = initializeApp({ projectId, apiKey: "local-security-audit" });
const auth = getAuth(app);
const db = getFirestore(app);
connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", 18080);
const { user } = await createUserWithEmailAndPassword(auth, "attacker@example.test", "local-only-password");
const uid = user.uid;
const username = "AuditPlayer";
const userRef = doc(db, "users", uid);

function encode(value) {
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
}

async function seed(documents) {
  const response = await fetch(`http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents:commit`, {
    method: "POST",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ writes: Object.entries(documents).map(([path, data]) => ({ update: {
      name: `projects/${projectId}/databases/(default)/documents/${path}`,
      fields: encode(data).mapValue.fields,
    } })) }),
  });
  if (!response.ok) throw new Error(await response.text());
}

const baseUser = { uid, username, email: user.email, role: "user", tokens: 100 };
const baseSlot = { number: 1, round: "round-001", status: "available" };
const baseDraw = {
  status: "live",
  round: "round-001",
  currentRound: 1,
  shareMode: "1/2",
  roundShareModes: { "round-001": "1/2" },
  poolCardIds: ["card"],
  poolCardValues: { card: 10 },
};
const purchasedSlot = { ...baseSlot, status: "locked", uid, username, tokenCost: 10, targetCardId: "card", targetCardName: "Card", targetCardImageUrl: "", targetCardValue: 10, shareMode: "1/2" };
const baseRecord = { uid, username, drawId: "room", round: "round-001", number: 1, tokenCost: 10, targetCardId: "card", targetCardValue: 10, shareMode: "1/2" };
const assignedRecord = { ...baseRecord, cardId: "card", cardValue: 100, cardConversionValue: 80, collectionStatus: "pending" };
const claimableVipReward = {
  source: "vip", vipTierId: "vip0", uid, username, targetCardId: "card",
  targetCardName: "VIP Card", targetCardImageUrl: "", targetCardValue: 100,
  vipRewardStatus: "claimable",
};
const results = [];
let purchaseSequence = 0;

// Construct the same reciprocal purchase writes used by the app.
function purchaseBatch({ secondSlot = false, cost = 10, extraRecord = {} } = {}) {
  const batch = writeBatch(db);
  const recordId = `purchase-${++purchaseSequence}`;
  const slot = { ...purchasedSlot, tokenCost: cost, targetCardValue: cost, purchaseRecordId: recordId, updatedAt: serverTimestamp() };
  batch.update(userRef, { tokens: 100 - cost, lastPurchaseRecordId: recordId, updatedAt: serverTimestamp() });
  batch.update(doc(db, "draws/room/rounds/round-001/slots/1"), slot);
  batch.set(doc(db, "drawRecords", recordId), { ...baseRecord, slotId: "1", tokenCost: cost, targetCardValue: cost, targetCardName: "Card", targetCardImageUrl: "", createdAt: serverTimestamp(), ...extraRecord });
  if (secondSlot) batch.update(doc(db, "draws/room/rounds/round-001/slots/2"), { ...slot, number: 2 });
  return batch;
}

// Convert an award and its owner's balance atomically.
function conversionBatch(recordId = "assigned", refund = 80) {
  const batch = writeBatch(db);
  batch.update(doc(db, "drawRecords", recordId), { collectionStatus: "converted", convertedToTokens: true, tokenRefund: refund, convertedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.update(userRef, { tokens: 100 + refund, lastConversionRecordId: recordId, lastConversionAmount: refund, updatedAt: serverTimestamp() });
  return batch;
}

const validRequest = {
  uid, username, email: user.email, amount: 525, hkdAmount: 500, exchangeRate: 1.05, packageType: "preset",
  proofMode: "storage", proofPath: `token-proofs/${uid}/receipt.jpg`, proofFileName: "receipt.jpg",
  proofUrl: `https://firebasestorage.googleapis.com/v0/b/demo/o/token-proofs%2F${uid}%2Freceipt.jpg`,
  promoCode: "", promoCodeId: "", status: "pending", adminNote: "",
};

function tokenRequestBatch(requestId, overrides = {}, quotaOverrides = {}) {
  const data = { ...validRequest, ...overrides };
  const isPromo = data.proofMode === "promo";
  const batch = writeBatch(db);
  batch.set(doc(db, "tokenRequests", requestId), {
    ...data,
    proofPath: isPromo ? "" : `token-proofs/${uid}/${requestId}`,
    proofFileName: isPromo ? "" : data.proofFileName,
    proofUrl: "",
    status: isPromo ? "pending" : "awaiting_upload",
    quotaVersion: 1,
    createdAt: serverTimestamp(),
  });
  if (isPromo) {
    batch.set(doc(db, "promoRedemptions", `${data.promoCodeId}_${uid}`), {
      uid,
      promoCodeId: data.promoCodeId,
      code: data.promoCode,
      amount: data.amount,
      requestId,
      createdAt: serverTimestamp(),
    });
  }
  batch.update(userRef, {
    lastTokenRequestId: requestId,
    lastTokenRequestAt: serverTimestamp(),
    pendingTokenRequestCount: 1,
    tokenRequestWindowStartedAt: serverTimestamp(),
    tokenRequestWindowCount: 1,
    updatedAt: serverTimestamp(),
    ...quotaOverrides,
  });
  return batch;
}


async function check(name, shouldAllow, action) {
  await seed({
    [`users/${uid}`]: baseUser,
    "usernames/auditplayer": { uid, username },
    "users/victim": { uid: "victim", role: "user", tokens: 500, email: "victim@example.test" },
    "draws/room": baseDraw,
    "cards/card": { name: "Card", tokenValue: 10 },
    "draws/room/rounds/round-001": { round: "round-001", roundNumber: 1 },
    "draws/room/rounds/round-001/slots/1": baseSlot,
    "draws/room/rounds/round-001/slots/2": { ...baseSlot, number: 2 },
    "drawRecords/assigned": assignedRecord,
    "drawRecords/vip-reward": claimableVipReward,
    "promoCodes/BONUS-525": { code: "BONUS-525", prefix: "BONUS", amount: 525, active: true },
    "promoCodes/STOPPED-250": { code: "STOPPED-250", prefix: "STOPPED", amount: 250, active: false },
  });
  let allowed = false;
  try { await action(); allowed = true; } catch (error) {
    if (error.code !== "permission-denied") throw error;
  }
  const result = { name, expected: shouldAllow ? "ALLOW" : "DENY", actual: allowed ? "ALLOW" : "DENY", safe: allowed === shouldAllow };
  results.push(result);
  console.log(JSON.stringify(result));
}

try {
  await check("Normal single-slot purchase", true, async () => {
    await purchaseBatch().commit();
  });
  await check("Self-promote to administrator", false, () => updateDoc(userRef, { role: "admin" }));
  await check("Direct balance increase", false, () => updateDoc(userRef, { tokens: 1000000 }));
  await check("Read another user's profile", false, () => getDoc(doc(db, "users/victim")));
  await check("Read own slots through consolidated history query", true, async () => {
    await seed({ "draws/room/rounds/round-001/slots/1": purchasedSlot });
    await getDocs(query(collectionGroup(db, "slots"), where("uid", "==", uid)));
  });
  await check("Scan another user's slots through consolidated history query", false, async () => {
    await seed({
      "draws/room/rounds/round-001/slots/2": { ...purchasedSlot, uid: "victim", username: "Victim", number: 2 },
    });
    await getDocs(query(collectionGroup(db, "slots"), where("uid", "==", "victim")));
  });
  await check("Modify platform payment settings", false, () => setDoc(doc(db, "settings/payment"), { fpsIdentifier: "attacker" }));
  await check("Refund replay without changing the already-converted record", false, async () => {
    await seed({ "drawRecords/assigned": { ...assignedRecord, convertedToTokens: true, tokenRefund: 80, collectionStatus: "converted" } });
    for (const tokens of [180, 260]) {
      await updateDoc(userRef, { tokens, lastConversionRecordId: "assigned", lastConversionAmount: 80, updatedAt: serverTimestamp() });
    }
  });
  await check("Convert an already-shipped card", false, async () => {
    await seed({ "drawRecords/assigned": { ...assignedRecord, collectionStatus: "shipped" } });
    const batch = writeBatch(db);
    batch.update(doc(db, "drawRecords/assigned"), { collectionStatus: "converted", convertedToTokens: true, tokenRefund: 80, convertedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    batch.update(userRef, { tokens: 180, lastConversionRecordId: "assigned", lastConversionAmount: 80, updatedAt: serverTimestamp() });
    await batch.commit();
  });
  await check("Buy two slots but debit only one slot price", false, async () => {
    await purchaseBatch({ secondSlot: true }).commit();
  });
  await check("Forge awarded card and refund value on a new purchase record", false, async () => {
    await seed({ "draws/room/rounds/round-001/slots/1": purchasedSlot });
    const batch = writeBatch(db);
    batch.set(doc(db, "drawRecords/forged"), { ...baseRecord, cardId: "fake-award", cardValue: 999999, cardConversionValue: 999999, convertedToTokens: true, tokenRefund: 999999 });
    batch.update(userRef, { tokens: 1000099, lastConversionRecordId: "forged", lastConversionAmount: 999999 });
    await batch.commit();
  });
  await check("Use cheaper global card price instead of room price", false, async () => {
    await seed({ "draws/room": { ...baseDraw, poolCardValues: { card: 100 } } });
    await purchaseBatch().commit();
  });
  await check("Submit inflated tokens with an unvalidated promotion code", false, () => tokenRequestBatch("inflated", {
    uid, username, email: user.email, amount: 1000000, hkdAmount: 500, exchangeRate: 2000, packageType: "preset",
    proofMode: "promo", proofPath: "", proofFileName: "", proofUrl: "", promoCode: "NOT-A-REAL-CODE",
    status: "pending", adminNote: "",
  }).commit());
  await check("Valid pending award conversion", true, () => conversionBatch().commit());
  await check("Historical pending award conversion", true, async () => {
    const legacy = { ...assignedRecord };
    delete legacy.collectionStatus;
    delete legacy.cardConversionValue;
    await seed({ "drawRecords/assigned": legacy });
    await conversionBatch().commit();
  });
  await check("Conversion without crediting owner", false, () => updateDoc(doc(db, "drawRecords/assigned"), {
    collectionStatus: "converted", convertedToTokens: true, tokenRefund: 80, convertedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  await check("Refund exceeds authoritative award", false, () => conversionBatch("assigned", 81).commit());
  await check("Shipping requested prevents refund", false, async () => {
    await seed({ "drawRecords/assigned": { ...assignedRecord, shippingRequested: true } });
    await conversionBatch().commit();
  });
  await check("Shipping status prevents refund", false, async () => {
    await seed({ "drawRecords/assigned": { ...assignedRecord, collectionStatus: "shipping" } });
    await conversionBatch().commit();
  });
  await check("Two awards cannot share one credit", false, async () => {
    await seed({ "drawRecords/second": assignedRecord });
    const batch = conversionBatch();
    batch.update(doc(db, "drawRecords/second"), { collectionStatus: "converted", convertedToTokens: true, tokenRefund: 80, convertedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await batch.commit();
  });
  await check("Pending card shipping", true, () => updateDoc(doc(db, "drawRecords/assigned"), {
    collectionStatus: "shipping", shippingRequested: true, shippingRecipient: "Test", shippingPhone: "12345678",
    shippingRegion: "hong-kong", shippingMethod: "sf-door", shippingAddress: "Test address", shippingNote: "", shippingRequestedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  await check("Hong Kong pickup shipping", true, () => updateDoc(doc(db, "drawRecords/assigned"), {
    collectionStatus: "shipping", shippingRequested: true, shippingRecipient: "Test", shippingPhone: "+886900000000",
    shippingRegion: "hong-kong", shippingMethod: "sf-pickup", shippingAddress: "Hong Kong pickup point", shippingNote: "", shippingRequestedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  await check("Unsupported shipping region rejected", false, () => updateDoc(doc(db, "drawRecords/assigned"), {
    collectionStatus: "shipping", shippingRequested: true, shippingRecipient: "Test", shippingPhone: "12345678",
    shippingRegion: "unsupported", shippingMethod: "sf-door", shippingAddress: "Test address", shippingNote: "", shippingRequestedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  await check("Taiwan address shipping", true, () => updateDoc(doc(db, "drawRecords/assigned"), {
    collectionStatus: "shipping", shippingRequested: true, shippingRecipient: "Test", shippingPhone: "+886900000000",
    shippingRegion: "taiwan", shippingMethod: "address-delivery", shippingAddress: "Taiwan address", shippingNote: "", shippingRequestedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  await check("Non-Hong-Kong pickup rejected", false, () => updateDoc(doc(db, "drawRecords/assigned"), {
    collectionStatus: "shipping", shippingRequested: true, shippingRecipient: "Test", shippingPhone: "12345678",
    shippingRegion: "macau", shippingMethod: "sf-pickup", shippingAddress: "Test pickup", shippingNote: "", shippingRequestedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  await check("Taiwan pickup rejected", false, () => updateDoc(doc(db, "drawRecords/assigned"), {
    collectionStatus: "shipping", shippingRequested: true, shippingRecipient: "Test", shippingPhone: "+886900000000",
    shippingRegion: "taiwan", shippingMethod: "sf-pickup", shippingAddress: "Taiwan pickup point", shippingNote: "", shippingRequestedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  await check("Non-Hong-Kong SF door rejected", false, () => updateDoc(doc(db, "drawRecords/assigned"), {
    collectionStatus: "shipping", shippingRequested: true, shippingRecipient: "Test", shippingPhone: "12345678",
    shippingRegion: "mainland-china", shippingMethod: "sf-door", shippingAddress: "Mainland address", shippingNote: "", shippingRequestedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  await check("Owner claims unlocked VIP reward", true, () => updateDoc(doc(db, "drawRecords/vip-reward"), {
    vipRewardStatus: "claimed", cardId: "card", cardName: "VIP Card", cardCategory: "VIP 獎勵",
    cardImageUrl: "", cardValue: 100, cardConversionValue: 100, collectionStatus: "pending",
    claimedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  await check("VIP reward cannot be claimed twice", false, async () => {
    await updateDoc(doc(db, "drawRecords/vip-reward"), {
      vipRewardStatus: "claimed", cardId: "card", cardName: "VIP Card", cardCategory: "VIP 獎勵",
      cardImageUrl: "", cardValue: 100, cardConversionValue: 100, collectionStatus: "pending",
      claimedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "drawRecords/vip-reward"), {
      claimedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  });
  await check("VIP reward value cannot be forged", false, () => updateDoc(doc(db, "drawRecords/vip-reward"), {
    vipRewardStatus: "claimed", cardId: "card", cardName: "VIP Card", cardCategory: "VIP 獎勵",
    cardImageUrl: "", cardValue: 999999, cardConversionValue: 999999, collectionStatus: "pending",
    claimedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  await check("Converted card cannot ship", false, async () => {
    await conversionBatch().commit();
    await updateDoc(doc(db, "drawRecords/assigned"), { collectionStatus: "shipping", shippingRequested: true, shippingRecipient: "Test", shippingPhone: "12345678", shippingRegion: "hong-kong", shippingMethod: "sf-door", shippingAddress: "Test address", shippingNote: "", shippingRequestedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
  await check("Award fields rejected even on a real purchase", false, () => purchaseBatch({ extraRecord: { cardId: "fake", cardConversionValue: 999999 } }).commit());
  await check("Full authoritative room price", true, async () => {
    await seed({ "draws/room": { ...baseDraw, poolCardValues: { card: 100 } } });
    await purchaseBatch({ cost: 100 }).commit();
  });
  await check("Global price fallback when room price absent", true, async () => {
    await seed({ "draws/room": { ...baseDraw, poolCardValues: {} } });
    await purchaseBatch().commit();
  });
  await check("Standalone debit rejected", false, () => updateDoc(userRef, { tokens: 90, updatedAt: serverTimestamp() }));
  await check("Duplicate record for purchased slot rejected", false, async () => {
    await purchaseBatch().commit();
    await setDoc(doc(db, "drawRecords/duplicate"), { ...baseRecord, slotId: "1", targetCardName: "Card", targetCardImageUrl: "", createdAt: serverTimestamp() });
  });
  await check("Valid paid package application", true, () => tokenRequestBatch("valid").commit());
  await check("Valid proof finalization", true, async () => {
    await tokenRequestBatch("proof-finalize").commit();
    await updateDoc(doc(db, "tokenRequests/proof-finalize"), {
      status: "pending",
      proofUrl: `https://firebasestorage.googleapis.com/v0/b/drawcard-26e01.firebasestorage.app/o/token-proofs%2F${uid}%2Fproof-finalize?alt=media&token=test`,
      uploadedAt: serverTimestamp(),
    });
  });
  await check("External proof bucket rejected", false, async () => {
    await tokenRequestBatch("external-proof").commit();
    await updateDoc(doc(db, "tokenRequests/external-proof"), {
      status: "pending",
      proofUrl: `https://firebasestorage.googleapis.com/v0/b/attacker.firebasestorage.app/o/token-proofs%2F${uid}%2Fexternal-proof?alt=media&token=test`,
      uploadedAt: serverTimestamp(),
    });
  });
  await check("Third pending token request rejected", false, async () => {
    await seed({ [`users/${uid}`]: { ...baseUser, pendingTokenRequestCount: 2 } });
    await tokenRequestBatch("pending-limit", {}, { pendingTokenRequestCount: 3 }).commit();
  });
  await check("Token request cooldown enforced", false, async () => {
    const recent = new Date(Date.now() - 60 * 1000);
    await seed({ [`users/${uid}`]: { ...baseUser, lastTokenRequestAt: recent } });
    await tokenRequestBatch("cooldown").commit();
  });
  await check("Daily token request limit enforced", false, async () => {
    const windowStart = new Date(Date.now() - 60 * 60 * 1000);
    await seed({ [`users/${uid}`]: { ...baseUser, tokenRequestWindowStartedAt: windowStart, tokenRequestWindowCount: 5 } });
    await tokenRequestBatch("daily-limit", {}, {
      tokenRequestWindowStartedAt: windowStart,
      tokenRequestWindowCount: 6,
    }).commit();
  });
  await check("Valid custom payment application", true, () => tokenRequestBatch("custom", { packageType: "custom", hkdAmount: 2000, amount: 2100, exchangeRate: 1.05 }).commit());
  await check("Inflated application with receipt rejected", false, () => tokenRequestBatch("receipt-inflated", { amount: 1000000, exchangeRate: 2000 }).commit());
  await check("Code-only application awaits manual review", true, () => tokenRequestBatch("promo-only", {
    proofMode: "promo", promoCode: "BONUS-525", promoCodeId: "BONUS-525",
    packageType: "promo", hkdAmount: 0, amount: 525, exchangeRate: 0,
  }).commit());
  await check("The same user cannot reuse a promotion code", false, () => tokenRequestBatch("promo-reuse", {
    proofMode: "promo", promoCode: "BONUS-525", promoCodeId: "BONUS-525",
    packageType: "promo", hkdAmount: 0, amount: 525, exchangeRate: 0,
  }).commit());
  await check("Disabled promotion code is rejected", false, () => tokenRequestBatch("promo-disabled", {
    proofMode: "promo", promoCode: "STOPPED-250", promoCodeId: "STOPPED-250",
    packageType: "promo", hkdAmount: 0, amount: 250, exchangeRate: 0,
  }).commit());
  await check("Legacy web admin assignment is blocked", false, async () => {
    await seed({ [`users/${uid}`]: { ...baseUser, role: "admin" } });
    await setDoc(doc(db, "drawRecords/admin-award"), assignedRecord);
  });
  // Even a legacy user document with role=admin must use the protected Function path.
  for (const [label, amount, verified] of [
    ["Legacy admin approval is blocked", 525, 500],
    ["Legacy inflated request approval is blocked", 1000000, 500],
    ["Mismatched verified deposit is blocked", 525, 1000],
  ]) {
    await check(label, false, async () => {
      await seed({ [`users/${uid}`]: { ...baseUser, role: "admin" }, "tokenRequests/review": { ...validRequest, amount, exchangeRate: amount / 500 } });
      const batch = writeBatch(db);
      batch.update(doc(db, "tokenRequests/review"), { status: "approved", verifiedHkdAmount: verified, reviewedAt: serverTimestamp(), reviewedBy: uid });
      batch.update(userRef, { tokens: 100 + amount, lastTokenGrantRequestId: "review", totalDeposits: 500, vipLevel: 0, updatedAt: serverTimestamp() });
      await batch.commit();
    });
  }
  await check("Direct quota-tracked approval is blocked", false, async () => {
    await seed({
      [`users/${uid}`]: { ...baseUser, role: "admin", pendingTokenRequestCount: 1 },
      "tokenRequests/quota-approval": { ...validRequest, quotaVersion: 1 },
    });
    const batch = writeBatch(db);
    batch.update(doc(db, "tokenRequests/quota-approval"), {
      status: "approved", verifiedHkdAmount: 500, reviewedAt: serverTimestamp(), reviewedBy: uid,
    });
    batch.update(userRef, {
      tokens: 625, lastTokenGrantRequestId: "quota-approval", totalDeposits: 500, vipLevel: 0,
      pendingTokenRequestCount: 0, lastTokenRequestClosedId: "quota-approval", updatedAt: serverTimestamp(),
    });
    await batch.commit();
  });
  await check("Direct incomplete-proof rejection is blocked", false, async () => {
    await seed({
      [`users/${uid}`]: { ...baseUser, role: "admin", pendingTokenRequestCount: 1 },
      "tokenRequests/quota-rejection": {
        ...validRequest,
        quotaVersion: 1,
        proofPath: `token-proofs/${uid}/quota-rejection`,
        proofUrl: "",
        status: "awaiting_upload",
      },
    });
    const batch = writeBatch(db);
    batch.update(doc(db, "tokenRequests/quota-rejection"), {
      status: "rejected", adminNote: "上載失敗", reviewedAt: serverTimestamp(), reviewedBy: uid,
    });
    batch.update(userRef, {
      pendingTokenRequestCount: 0, lastTokenRequestClosedId: "quota-rejection", updatedAt: serverTimestamp(),
    });
    await batch.commit();
  });
  await check("Quota-tracked review without releasing quota is rejected", false, async () => {
    await seed({
      [`users/${uid}`]: { ...baseUser, role: "admin", pendingTokenRequestCount: 1 },
      "tokenRequests/quota-bypass": { ...validRequest, quotaVersion: 1 },
    });
    await updateDoc(doc(db, "tokenRequests/quota-bypass"), {
      status: "rejected", adminNote: "bypass", reviewedAt: serverTimestamp(), reviewedBy: uid,
    });
  });
  for (const [label, admin, reviewed, deposit] of [
    ["Legacy admin promotion approval is blocked", true, true, 0],
    ["User cannot approve own promotion", false, true, 0],
    ["Promotion requires protected Function review", true, false, 0],
    ["Promotion cannot inflate VIP deposits", true, true, 500],
  ]) {
    await check(label, false, async () => {
      await seed({
        [`users/${uid}`]: { ...baseUser, role: admin ? "admin" : "user" },
        "tokenRequests/promo-review": {
          ...validRequest, proofMode: "promo", promoCode: "BONUS-525", promoCodeId: "BONUS-525",
          packageType: "promo", hkdAmount: 0, amount: 525, exchangeRate: 0,
          proofUrl: "", proofPath: "", proofFileName: "",
        },
        [`promoRedemptions/BONUS-525_${uid}`]: {
          uid, promoCodeId: "BONUS-525", code: "BONUS-525", amount: 525, requestId: "promo-review",
        },
      });
      const batch = writeBatch(db);
      batch.update(doc(db, "tokenRequests/promo-review"), { status: "approved", promoReviewed: reviewed, verifiedHkdAmount: deposit, reviewedAt: serverTimestamp(), reviewedBy: uid });
      batch.update(userRef, { tokens: 625, lastTokenGrantRequestId: "promo-review", totalDeposits: deposit, vipLevel: -1, updatedAt: serverTimestamp() });
      await batch.commit();
    });
  }
  await check("Configured package price accepted", true, async () => {
    await seed({ "settings/tokenPackages": { rateVersion: 2, packages: [{ hkd: 500, tokens: 600 }] } });
    await tokenRequestBatch("configured", { amount: 600, exchangeRate: 1.2 }).commit();
  });
  await check("Old default cannot override configured price", false, () => tokenRequestBatch("stale").commit());
  await check("Legacy package rates remain compatible", true, async () => {
    await seed({ "settings/tokenPackages": { packages: [{ hkd: 500, tokens: 1050 }] } });
    await tokenRequestBatch("legacy-rate").commit();
  });
  await check("Profile edits remain allowed", true, () => updateDoc(userRef, { displayName: "Audit Player", updatedAt: serverTimestamp() }));
  await check("Authenticated username directory enumeration", false, () => getDocs(collection(db, "usernames")));
  await signOut(auth);
  await check("Anonymous draw overview remains readable", true, () => getDoc(doc(db, "draws/room")));
  await check("Anonymous slot ownership metadata", false, () => getDoc(doc(db, "draws/room/rounds/round-001/slots/1")));
  if (results.some((item) => !item.safe)) process.exitCode = 1;
  console.log(`SUMMARY ${results.filter((item) => item.safe).length}/${results.length} passed; ${results.filter((item) => !item.safe).length} unsafe actions accepted.`);
} finally {
  await terminate(db);
  await deleteApp(app);
}
