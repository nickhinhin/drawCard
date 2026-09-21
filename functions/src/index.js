import { createHash, randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!getApps().length) initializeApp();

const db = getFirestore();
const callableOptions = {
  region: "asia-east2",
  enforceAppCheck: true,
  consumeAppCheckToken: true,
  timeoutSeconds: 60,
  memory: "256MiB",
};

const READ_COLLECTIONS = new Set([
  "users", "cards", "draws", "tokenRequests", "drawRecords", "promoCodes",
  "settings", "publicSiteSettings", "publicCardShowcase", "adminAuditLogs",
]);
const WRITE_COLLECTIONS = new Set([
  "cards", "draws", "drawRecords", "promoCodes", "settings",
  "publicSiteSettings", "publicCardShowcase",
]);
const DELETE_COLLECTIONS = new Set(["promoCodes"]);
const SHIPPING_STATES = new Set(["arranging", "in_transit", "delivered"]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_TOKEN_PACKAGES = [
  { hkd: 500, tokens: 525 }, { hkd: 1000, tokens: 1050 },
  { hkd: 3000, tokens: 3240 }, { hkd: 10000, tokens: 11000 },
  { hkd: 30000, tokens: 35100 },
];
const DEFAULT_VIP_TIERS = [
  { id: "vip0", name: "VIP0", threshold: 3000 },
  { id: "vip1", name: "VIP1", threshold: 10000 },
  { id: "vip2", name: "VIP2", threshold: 30000 },
  { id: "vip3", name: "VIP3", threshold: 100000 },
  { id: "vip4", name: "VIP4", threshold: 300000 },
];

function csvSet(value) {
  return new Set(String(value || "").split(",").map((item) => item.trim()).filter(Boolean));
}

function assertAdmin(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "請先登入管理員帳戶。");
  if (request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "帳戶未獲管理員權限。");
  }

  const allowedUids = csvSet(process.env.ADMIN_UID_ALLOWLIST);
  if (!allowedUids.size || !allowedUids.has(request.auth.uid)) {
    throw new HttpsError("permission-denied", "帳戶不在管理員 UID 白名單。");
  }

  const allowedEmails = csvSet(process.env.ADMIN_EMAIL_ALLOWLIST);
  const email = String(request.auth.token.email || "").toLowerCase();
  if (allowedEmails.size && (!request.auth.token.email_verified || !allowedEmails.has(email))) {
    throw new HttpsError("permission-denied", "管理員電郵未通過白名單驗證。");
  }

  return { uid: request.auth.uid, email };
}

function assertIdentifier(value, label = "ID") {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 180 || normalized.includes("/")) {
    throw new HttpsError("invalid-argument", `${label} 格式不正確。`);
  }
  return normalized;
}

function plainData(value, depth = 0) {
  if (depth > 12) throw new HttpsError("invalid-argument", "資料層數過深。");
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.map((item) => plainData(item, depth + 1));
  if (typeof value !== "object") throw new HttpsError("invalid-argument", "資料包含不支援格式。");

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (!/^[A-Za-z0-9_-]+$/.test(key) || ["__proto__", "constructor", "prototype"].includes(key)) {
      throw new HttpsError("invalid-argument", "欄位名稱不正確。");
    }
    result[key] = plainData(item, depth + 1);
  }
  return result;
}

function validatedDocumentData(value) {
  const data = plainData(value);
  const bytes = Buffer.byteLength(JSON.stringify(data));
  if (!data || Array.isArray(data) || bytes > 850_000) {
    throw new HttpsError("invalid-argument", "文件資料無效或太大。");
  }
  return data;
}

function validateAdminWrite(collectionName, documentId, data) {
  if (collectionName === "promoCodes") {
    if (data.code !== undefined && data.code !== documentId) throw new HttpsError("invalid-argument", "推廣碼與文件 ID 必須一致。");
    if (data.amount !== undefined && (!Number.isSafeInteger(data.amount) || data.amount < 1 || data.amount > 1_000_000)) {
      throw new HttpsError("invalid-argument", "推廣碼代幣數量無效。");
    }
  }
  if (collectionName === "draws" && data.status !== undefined
      && !["draft", "scheduled", "live", "completed", "cancelled"].includes(data.status)) {
    throw new HttpsError("invalid-argument", "直播狀態無效。");
  }
  if (collectionName === "cards") {
    if (data.name !== undefined && (typeof data.name !== "string" || !data.name.trim() || data.name.length > 200)) {
      throw new HttpsError("invalid-argument", "卡牌名稱無效。");
    }
    for (const field of ["tokenValue", "conversionValue"]) {
      if (data[field] !== undefined && (!Number.isFinite(data[field]) || data[field] < 0 || data[field] > 100_000_000)) {
        throw new HttpsError("invalid-argument", "卡牌價值無效。");
      }
    }
  }
  if (collectionName === "drawRecords") {
    const protectedFields = [
      "uid", "tokenCost", "tokenRefund", "convertedToTokens", "convertedAt",
      "lastTokenGrantRequestId", "createdAt",
    ];
    if (protectedFields.some((field) => Object.hasOwn(data, field))) {
      throw new HttpsError("permission-denied", "抽卡紀錄的身份或財務欄位不可由通用編輯器修改。");
    }
  }
  if (collectionName === "settings" && documentId === "tokenPackages" && data.packages !== undefined) {
    const packages = normalizePackages({ packages: data.packages, rateVersion: 2 });
    if (!packages.length || packages.length !== data.packages.length) throw new HttpsError("invalid-argument", "代幣套餐格式無效。");
  }
  return data;
}

function calculateTokenAmount(hkdAmount) {
  if (!Number.isSafeInteger(hkdAmount) || hkdAmount < 500) return 0;
  const rate = hkdAmount >= 30000 ? 0.17 : hkdAmount >= 10000 ? 0.1 : hkdAmount >= 3000 ? 0.08 : 0.05;
  return Math.floor(hkdAmount * (1 + rate));
}

function normalizePackages(settings) {
  const configured = Array.isArray(settings?.packages) ? settings.packages : DEFAULT_TOKEN_PACKAGES;
  const packages = configured.map((item) => ({ hkd: Number(item?.hkd), tokens: Number(item?.tokens) }))
    .filter((item) => Number.isSafeInteger(item.hkd) && item.hkd > 0 && Number.isSafeInteger(item.tokens) && item.tokens > 0);
  return settings && Number(settings.rateVersion || 1) < 2
    ? packages.map((item) => ({ ...item, tokens: Math.max(1, Math.round(item.tokens / 2)) }))
    : packages;
}

function verifiedTokenGrant(tokenRequest, verifiedHkdAmount, packageSettings, promo, redemption, requestId) {
  const amount = Number(tokenRequest.amount);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000) {
    throw new HttpsError("failed-precondition", "申請代幣數量無效。");
  }
  if (tokenRequest.proofMode === "promo") {
    const valid = tokenRequest.packageType === "promo" && Number(tokenRequest.hkdAmount) === 0
      && Number(tokenRequest.exchangeRate) === 0 && verifiedHkdAmount === 0
      && promo?.active === true && promo.code === tokenRequest.promoCode
      && Number(promo.amount) === amount && redemption?.uid === tokenRequest.uid
      && redemption?.requestId === requestId;
    if (!valid) throw new HttpsError("failed-precondition", "推廣碼資料不完整或已失效。");
    return amount;
  }
  if (tokenRequest.proofMode !== "storage" || !tokenRequest.proofUrl
      || Number(tokenRequest.hkdAmount) !== verifiedHkdAmount || verifiedHkdAmount < 500) {
    throw new HttpsError("failed-precondition", "入帳金額與付款證明不符。");
  }
  const grant = tokenRequest.packageType === "custom"
    ? calculateTokenAmount(verifiedHkdAmount)
    : tokenRequest.packageType === "preset"
      ? normalizePackages(packageSettings).find((item) => item.hkd === verifiedHkdAmount && item.tokens === amount)?.tokens
      : 0;
  if (!Number.isSafeInteger(grant) || grant !== amount || Number(tokenRequest.exchangeRate) !== grant / verifiedHkdAmount) {
    throw new HttpsError("failed-precondition", "申請數量不符合受保護的套餐價格。");
  }
  return grant;
}

function normalizeVipTiers(settings) {
  const tiers = Array.isArray(settings?.tiers) ? settings.tiers : DEFAULT_VIP_TIERS;
  return tiers.map((tier, index) => ({
    id: String(tier?.id || `vip${index}`).slice(0, 80),
    name: String(tier?.name || `VIP${index}`).slice(0, 100),
    threshold: Number(tier?.threshold || 0),
    rewardCardId: String(tier?.rewardCardId || "").slice(0, 180),
    rewardName: String(tier?.rewardName || "升級實體卡獎勵").slice(0, 200),
    rewardImageUrl: String(tier?.rewardImageUrl || "").slice(0, 1000),
    rewardConversionValue: Number(tier?.rewardConversionValue || 0),
  })).filter((tier) => Number.isFinite(tier.threshold) && tier.threshold > 0)
    .sort((left, right) => left.threshold - right.threshold);
}

function serialize(value) {
  if (value?.toDate instanceof Function) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}

function auditRecord(actor, action, resourceType, resourceId, before, after, request) {
  return {
    actorUid: actor.uid,
    actorEmail: actor.email,
    action,
    resourceType,
    resourceId,
    before: serialize(before ?? null),
    after: serialize(after ?? null),
    appId: String(request.app?.appId || ""),
    requestId: randomUUID(),
    createdAt: FieldValue.serverTimestamp(),
  };
}

function adminDocument(collectionName, documentId) {
  if (!WRITE_COLLECTIONS.has(collectionName)) {
    throw new HttpsError("permission-denied", "此資料類型不可由管理 App 修改。");
  }
  return db.collection(collectionName).doc(assertIdentifier(documentId, "文件 ID"));
}

export const adminSession = onCall(callableOptions, async (request) => {
  const actor = assertAdmin(request);
  return { ok: true, uid: actor.uid, email: actor.email };
});

export const adminList = onCall(callableOptions, async (request) => {
  assertAdmin(request);
  const collectionName = assertIdentifier(request.data?.collection, "資料類型");
  if (!READ_COLLECTIONS.has(collectionName)) throw new HttpsError("permission-denied", "不可讀取此資料類型。");

  const limit = Math.min(Math.max(Number(request.data?.limit) || 100, 1), 250);
  const orderField = String(request.data?.orderField || "").trim();
  const direction = request.data?.direction === "asc" ? "asc" : "desc";
  let query = db.collection(collectionName);
  if (orderField) {
    if (!/^[A-Za-z0-9_]+$/.test(orderField)) throw new HttpsError("invalid-argument", "排序欄位不正確。");
    query = query.orderBy(orderField, direction);
  }
  query = query.limit(limit);
  const snapshot = await query.get();
  return { items: snapshot.docs.map((doc) => ({ id: doc.id, ...serialize(doc.data()) })) };
});

export const adminGet = onCall(callableOptions, async (request) => {
  assertAdmin(request);
  const collectionName = assertIdentifier(request.data?.collection, "資料類型");
  if (!READ_COLLECTIONS.has(collectionName)) throw new HttpsError("permission-denied", "不可讀取此資料類型。");
  const documentId = assertIdentifier(request.data?.documentId, "文件 ID");
  const snapshot = await db.collection(collectionName).doc(documentId).get();
  return { exists: snapshot.exists, item: snapshot.exists ? { id: snapshot.id, ...serialize(snapshot.data()) } : null };
});

export const adminWrite = onCall(callableOptions, async (request) => {
  const actor = assertAdmin(request);
  const collectionName = assertIdentifier(request.data?.collection, "資料類型");
  const documentId = assertIdentifier(request.data?.documentId, "文件 ID");
  const mode = ["create", "update", "upsert", "delete"].includes(request.data?.mode) ? request.data.mode : "upsert";
  if (mode === "delete" && !DELETE_COLLECTIONS.has(collectionName)) {
    throw new HttpsError("permission-denied", "此資料只可停用，不可永久刪除。");
  }
  const ref = adminDocument(collectionName, documentId);
  const data = mode === "delete" ? null : validateAdminWrite(
    collectionName, documentId, validatedDocumentData(request.data?.data || {}),
  );

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const before = snapshot.exists ? snapshot.data() : null;
    if (mode === "create" && snapshot.exists) throw new HttpsError("already-exists", "文件已存在。");
    if (mode === "update" && !snapshot.exists) throw new HttpsError("not-found", "文件不存在。");

    if (mode === "delete") transaction.delete(ref);
    else {
      const nowFields = {
        ...data,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
        ...(!snapshot.exists ? { createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid } : {}),
      };
      transaction.set(ref, nowFields, { merge: mode !== "create" });
    }
    const auditRef = db.collection("adminAuditLogs").doc();
    transaction.set(auditRef, auditRecord(actor, `${mode}:${collectionName}`, collectionName, documentId, before, data, request));
  });
  return { ok: true, documentId };
});

export const adminBatchWrite = onCall(callableOptions, async (request) => {
  const actor = assertAdmin(request);
  const operations = Array.isArray(request.data?.operations) ? request.data.operations : [];
  if (!operations.length || operations.length > 100) throw new HttpsError("invalid-argument", "每批必須有 1 至 100 個操作。");

  const refs = operations.map((operation) => ({
    collectionName: assertIdentifier(operation.collection, "資料類型"),
    documentId: assertIdentifier(operation.documentId, "文件 ID"),
    data: validateAdminWrite(
      assertIdentifier(operation.collection, "資料類型"),
      assertIdentifier(operation.documentId, "文件 ID"),
      validatedDocumentData(operation.data || {}),
    ),
  })).map((operation) => ({ ...operation, ref: adminDocument(operation.collectionName, operation.documentId) }));

  await db.runTransaction(async (transaction) => {
    const snapshots = await Promise.all(refs.map(({ ref }) => transaction.get(ref)));
    refs.forEach((operation, index) => {
      const before = snapshots[index].exists ? snapshots[index].data() : null;
      transaction.set(operation.ref, {
        ...operation.data,
        updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid,
        ...(!snapshots[index].exists ? { createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid } : {}),
      }, { merge: true });
      transaction.set(db.collection("adminAuditLogs").doc(), auditRecord(
        actor, `batch-upsert:${operation.collectionName}`, operation.collectionName,
        operation.documentId, before, operation.data, request,
      ));
    });
  });
  return { ok: true, count: refs.length };
});

export const adminReviewTokenRequest = onCall(callableOptions, async (request) => {
  const actor = assertAdmin(request);
  const requestId = assertIdentifier(request.data?.requestId, "申請 ID");
  const decision = request.data?.decision;
  if (!["approved", "rejected"].includes(decision)) throw new HttpsError("invalid-argument", "審批結果不正確。");
  const adminNote = String(request.data?.adminNote || "").trim().slice(0, 500);
  const verifiedHkdAmount = Math.max(0, Number(request.data?.verifiedHkdAmount) || 0);
  const requestRef = db.collection("tokenRequests").doc(requestId);

  await db.runTransaction(async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists) throw new HttpsError("not-found", "找不到代幣申請。");
    const tokenRequest = requestSnapshot.data();
    if (!["awaiting_upload", "pending"].includes(tokenRequest.status)) throw new HttpsError("failed-precondition", "申請已處理，不能重複審批。");
    if (decision === "approved" && tokenRequest.status !== "pending" && tokenRequest.proofMode !== "promo") {
      throw new HttpsError("failed-precondition", "付款證明尚未提交。");
    }
    const userRef = db.collection("users").doc(assertIdentifier(tokenRequest.uid, "用戶 UID"));
    const userSnapshot = await transaction.get(userRef);
    if (!userSnapshot.exists) throw new HttpsError("not-found", "找不到申請人帳戶。");
    const user = userSnapshot.data();
    const [packageSnapshot, vipSnapshot] = await Promise.all([
      transaction.get(db.collection("settings").doc("tokenPackages")),
      transaction.get(db.collection("settings").doc("vipProgram")),
    ]);
    let promo = null;
    let redemption = null;
    if (decision === "approved" && tokenRequest.proofMode === "promo") {
      const promoId = assertIdentifier(tokenRequest.promoCodeId, "推廣碼");
      const [promoSnapshot, redemptionSnapshot] = await Promise.all([
        transaction.get(db.collection("promoCodes").doc(promoId)),
        transaction.get(db.collection("promoRedemptions").doc(`${promoId}_${tokenRequest.uid}`)),
      ]);
      promo = promoSnapshot.exists ? promoSnapshot.data() : null;
      redemption = redemptionSnapshot.exists ? redemptionSnapshot.data() : null;
    }
    const amount = decision === "approved" ? verifiedTokenGrant(
      tokenRequest, verifiedHkdAmount,
      packageSnapshot.exists ? packageSnapshot.data() : null,
      promo, redemption, requestId,
    ) : 0;
    const previousDeposits = Number(user.totalDeposits || 0);
    const totalDeposits = previousDeposits + (decision === "approved" ? verifiedHkdAmount : 0);
    const previousVipLevel = Number(user.vipLevel ?? -1);
    const vipTiers = normalizeVipTiers(vipSnapshot.exists ? vipSnapshot.data() : null);
    const currentVipLevel = tokenRequest.proofMode === "promo" || decision !== "approved"
      ? previousVipLevel
      : vipTiers.reduce((level, tier, index) => totalDeposits >= tier.threshold ? index : level, -1);
    const attainedTiers = tokenRequest.proofMode === "promo" || decision !== "approved"
      ? [] : vipTiers.filter((_tier, index) => index > previousVipLevel && index <= currentVipLevel);
    const rewardCardRefs = attainedTiers.map((tier) => tier.rewardCardId ? db.collection("cards").doc(tier.rewardCardId) : null);
    const rewardCardSnapshots = await Promise.all(rewardCardRefs.map((ref) => ref ? transaction.get(ref) : null));
    const requestUpdate = {
      status: decision, adminNote, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: actor.uid,
      verifiedHkdAmount: decision === "approved" ? verifiedHkdAmount : 0,
      promoReviewed: decision === "approved" && tokenRequest.proofMode === "promo",
    };
    transaction.update(requestRef, requestUpdate);
    transaction.update(userRef, {
      ...(decision === "approved" ? {
        tokens: Number(user.tokens || 0) + amount,
        totalDeposits,
        lastTokenGrantRequestId: requestId,
        vipLevel: currentVipLevel,
        lastVipRewardTier: attainedTiers.at(-1)?.id || user.lastVipRewardTier || "",
      } : {}),
      pendingTokenRequestCount: Math.max(0, Number(user.pendingTokenRequestCount || 0) - 1),
      lastTokenRequestClosedId: requestId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    attainedTiers.forEach((tier, index) => {
      const card = rewardCardSnapshots[index]?.exists ? rewardCardSnapshots[index].data() : null;
      const rewardName = card?.name || tier.rewardName;
      const rewardImageUrl = card?.imageUrl || tier.rewardImageUrl;
      const rewardValue = Number(card?.conversionValue ?? card?.tokenValue ?? tier.rewardConversionValue ?? 0);
      transaction.set(db.collection("drawRecords").doc(`vip_${tokenRequest.uid}_${tier.id}`), {
        source: "vip", vipTierId: tier.id, vipTierIndex: vipTiers.findIndex((item) => item.id === tier.id),
        uid: tokenRequest.uid, username: tokenRequest.username || user.username || "VIP member",
        drawId: "vip-program", drawTitle: `${tier.name} 升級獎勵`, roomSlug: "vip-program", roomLink: "",
        round: "vip-reward", roundSort: 0, number: vipTiers.findIndex((item) => item.id === tier.id) + 1,
        tokenCost: 0, targetCardId: tier.rewardCardId || `vip-reward-${tier.id}`,
        targetCardName: rewardName, targetCardImageUrl: rewardImageUrl, targetCardValue: rewardValue,
        vipRewardStatus: "claimable", unlockedAt: FieldValue.serverTimestamp(), assignedBy: actor.uid,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }, { merge: false });
    });
    transaction.set(db.collection("adminAuditLogs").doc(), auditRecord(
      actor, `token-request:${decision}`, "tokenRequests", requestId, tokenRequest,
      { ...requestUpdate, creditedTokens: decision === "approved" ? amount : 0 }, request,
    ));
  });
  return { ok: true };
});

export const adminSetShippingStatus = onCall(callableOptions, async (request) => {
  const actor = assertAdmin(request);
  const recordId = assertIdentifier(request.data?.recordId, "卡牌紀錄 ID");
  const deliveryStatus = String(request.data?.deliveryStatus || "");
  if (!SHIPPING_STATES.has(deliveryStatus)) throw new HttpsError("invalid-argument", "配送狀態不正確。");
  const trackingNumber = String(request.data?.trackingNumber || "").trim().slice(0, 100);
  if (deliveryStatus === "in_transit" && !trackingNumber) throw new HttpsError("invalid-argument", "正在配送必須填寫運單號碼。");
  const ref = db.collection("drawRecords").doc(recordId);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError("not-found", "找不到卡牌紀錄。");
    const before = snapshot.data();
    const update = deliveryStatus === "delivered" ? {
      collectionStatus: "shipped", deliveryStatus, deliveredAt: FieldValue.serverTimestamp(),
    } : deliveryStatus === "in_transit" ? {
      collectionStatus: "shipping", deliveryStatus, trackingNumber,
      dispatchedAt: FieldValue.serverTimestamp(), shippedAt: FieldValue.serverTimestamp(),
    } : {
      collectionStatus: "shipping", deliveryStatus, trackingNumber: "",
    };
    transaction.update(ref, { ...update, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
    transaction.set(db.collection("adminAuditLogs").doc(), auditRecord(
      actor, `shipping:${deliveryStatus}`, "drawRecords", recordId, before,
      { ...update, trackingNumber: trackingNumber ? "[recorded]" : "" }, request,
    ));
  });
  return { ok: true };
});

export const adminUploadImage = onCall({ ...callableOptions, memory: "512MiB" }, async (request) => {
  const actor = assertAdmin(request);
  const contentType = String(request.data?.contentType || "");
  if (!IMAGE_TYPES.has(contentType)) throw new HttpsError("invalid-argument", "只接受 JPEG、PNG 或 WebP 圖片。");
  const base64 = String(request.data?.base64 || "");
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > 6 * 1024 * 1024) throw new HttpsError("invalid-argument", "圖片必須細過 6MB。");
  const scope = request.data?.scope === "draw-result" ? "draw-results" : "admin-assets";
  const ownerId = assertIdentifier(request.data?.ownerId, "關聯 ID");
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const digest = createHash("sha256").update(buffer).digest("hex").slice(0, 20);
  const path = `${scope}/${ownerId}/${Date.now()}-${digest}.${extension}`;
  const file = getStorage().bucket().file(path);
  await file.save(buffer, { resumable: false, metadata: { contentType, cacheControl: "public,max-age=31536000,immutable" } });
  await db.collection("adminAuditLogs").add(auditRecord(
    actor, "image:upload", "storage", path, null,
    { path, contentType, bytes: buffer.length, sha256: digest }, request,
  ));
  return { ok: true, path };
});

export const __test = {
  csvSet, plainData, validatedDocumentData, serialize,
  calculateTokenAmount, normalizePackages, verifiedTokenGrant,
};
