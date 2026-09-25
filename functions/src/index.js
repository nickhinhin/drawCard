import { createHash, randomUUID } from "node:crypto";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { FieldPath, FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { analyzeAuditEntries } from "./audit-analysis.js";
import { buildMonitorReport, createRateLimiter, groupClientErrors, groupServerErrors, sanitizeClientError } from "./monitor.js";

// Least-privilege runtime identity: Firestore, this project's bucket, App Check and logging only.
// Builds run as the default compute account, which holds only roles/cloudbuild.builds.builder.
setGlobalOptions({ serviceAccount: "livedraw-functions@livedraw-7e3c2.iam.gserviceaccount.com" });

if (!getApps().length) initializeApp();

const db = getFirestore();
// App Check is switched off (25/9/2026): browsers with a low reCAPTCHA score were locked
// out for 24 h. Callables rely on Firebase Auth, assertAdmin, server-side validation and
// rate limits. Set this back to `process.env.FUNCTIONS_EMULATOR !== "true"` to re-enable.
const ENFORCE_APP_CHECK = false;
const userCallableOptions = {
  region: "asia-east2",
  enforceAppCheck: ENFORCE_APP_CHECK,
  consumeAppCheckToken: ENFORCE_APP_CHECK,
  timeoutSeconds: 30,
  memory: "256MiB",
};
// Only the web admin site calls these endpoints. App Check proves the request
// comes from that site; `assertAdmin` then verifies Firebase Authentication,
// the server-issued `admin` custom claim and the allowlist before any access.
const adminCallableOptions = {
  region: "asia-east2",
  enforceAppCheck: ENFORCE_APP_CHECK,
  timeoutSeconds: 60,
  memory: "256MiB",
};
const affiliateApplicationsCallableOptions = {
  ...adminCallableOptions,
  // Cloud Run must accept this HTTPS request before the callable can verify
  // Firebase Auth and the server-issued admin claim in `assertAdmin`.
  invoker: "public",
};
const tokenProofCallableOptions = {
  region: "asia-east2",
  // Payment proofs come only from the web client, which always attaches App Check tokens.
  enforceAppCheck: ENFORCE_APP_CHECK,
  timeoutSeconds: 30,
  memory: "256MiB",
};
const AFFILIATE_CODE_PATTERN = /^AFF[A-F0-9]{20}$/;

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

function affiliateCodeForUid(uid) {
  return `AFF${createHash("sha256").update(`livedraw-affiliate:${uid}`).digest("hex").slice(0, 20).toUpperCase()}`;
}

function normalizeAffiliateCode(value) {
  const code = String(value || "").trim().toUpperCase();
  return AFFILIATE_CODE_PATTERN.test(code) ? code : "";
}

function assertAdmin(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "請先登入管理員帳戶。");
  if (request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "帳戶未獲管理員權限。");
  }

  const allowedUids = csvSet(process.env.ADMIN_UID_ALLOWLIST);
  const allowedEmails = csvSet(process.env.ADMIN_EMAIL_ALLOWLIST);
  const email = String(request.auth.token.email || "").toLowerCase();
  const uidAllowed = allowedUids.has(request.auth.uid);
  const emailAllowed = request.auth.token.email_verified && allowedEmails.has(email);
  if (!uidAllowed && !emailAllowed) {
    throw new HttpsError("permission-denied", "帳戶不在管理員白名單。");
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
  if (!Number.isSafeInteger(hkdAmount) || hkdAmount < 100) return 0;
  const rate = hkdAmount >= 30000 ? 0.17
    : hkdAmount >= 10000 ? 0.1
      : hkdAmount >= 3000 ? 0.08
        : hkdAmount >= 500 ? 0.05 : 0;
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
      || Number(tokenRequest.hkdAmount) !== verifiedHkdAmount || verifiedHkdAmount < 100) {
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

export const ensureAffiliateAccount = onCall(userCallableOptions, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "請先登入會員帳戶。");
  // Passwords exist only as a second factor-free login for verified phone accounts;
  // an email/password account without a verified phone may not become a member.
  if (request.auth.token.firebase?.sign_in_provider === "password" && !request.auth.token.phone_number) {
    throw new HttpsError("permission-denied", "請使用手機號碼驗證碼或 Google 登入註冊。");
  }
  const uid = request.auth.uid;
  const requestedReferralCode = normalizeAffiliateCode(request.data?.referralCode);
  const displayName = String(request.data?.displayName || request.auth.token.name || "").trim().slice(0, 80);
  const phoneNumber = String(request.data?.phoneNumber || request.auth.token.phone_number || "").trim().slice(0, 24);
  const ageConfirmed = request.data?.ageConfirmed === true;
  const userRef = db.collection("users").doc(uid);

  const result = await db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userRef);

    if (userSnapshot.exists) {
      const existing = userSnapshot.data();
      transaction.set(userRef, {
        ...(!existing.displayName && displayName ? { displayName } : {}),
        ...(!existing.phoneNumber && phoneNumber ? { phoneNumber } : {}),
        ...(!existing.ageConfirmed && ageConfirmed ? {
          ageConfirmed: true, ageConfirmedAt: FieldValue.serverTimestamp(),
        } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return {
        affiliateCode: existing.affiliateCode || "",
        affiliateStatus: existing.affiliateStatus || "none",
        referredByUid: existing.referredByUid || "",
      };
    }

    let referrerUid = "";
    if (requestedReferralCode) {
      const referralCodeRef = db.collection("affiliateCodes").doc(requestedReferralCode);
      const referralSnapshot = await transaction.get(referralCodeRef);
      if (referralSnapshot.exists && referralSnapshot.data()?.active === true) {
        referrerUid = String(referralSnapshot.data()?.uid || "");
      }
    }

    let referrerSnapshot = null;
    if (referrerUid && referrerUid !== uid) {
      referrerSnapshot = await transaction.get(db.collection("users").doc(referrerUid));
      if (!referrerSnapshot.exists) referrerUid = "";
    } else {
      referrerUid = "";
    }

    const email = String(request.auth.token.email || "").slice(0, 320);
    const photoURL = String(request.auth.token.picture || "").slice(0, 500);
    transaction.create(userRef, {
      uid, email, displayName, photoURL, phoneNumber, username: "", tokens: 0, role: "user",
      affiliateStatus: "none",
      referredByUid: referrerUid,
      referredByCode: referrerUid ? requestedReferralCode : "",
      ...(referrerUid ? { referredAt: FieldValue.serverTimestamp() } : {}),
      ...(ageConfirmed ? { ageConfirmed: true, ageConfirmedAt: FieldValue.serverTimestamp() } : {}),
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    if (referrerUid) {
      const referrerRef = db.collection("users").doc(referrerUid);
      transaction.update(referrerRef, {
        affiliateRefereeCount: Number(referrerSnapshot.data()?.affiliateRefereeCount || 0) + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(db.collection("affiliateReferrals").doc(uid), {
        referrerUid, referrerCode: requestedReferralCode, refereeUid: uid,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    return { affiliateCode: "", affiliateStatus: "none", referredByUid: referrerUid };
  });
  return { ok: true, ...result };
});

export const submitAffiliateApplication = onCall(userCallableOptions, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "請先登入會員帳戶。");
  const uid = request.auth.uid;
  const contact = String(request.data?.contact || "").trim();
  const message = String(request.data?.message || "").trim();
  if (contact.length < 3 || contact.length > 200) {
    throw new HttpsError("invalid-argument", "請填寫有效聯絡資料（最多 200 字）。");
  }
  if (message.length < 5 || message.length > 2000) {
    throw new HttpsError("invalid-argument", "留言最少 5 字、最多 2,000 字。");
  }
  const userRef = db.collection("users").doc(uid);
  const applicationRef = db.collection("affiliateApplications").doc(uid);
  await db.runTransaction(async (transaction) => {
    const [userSnapshot, applicationSnapshot] = await Promise.all([
      transaction.get(userRef), transaction.get(applicationRef),
    ]);
    if (!userSnapshot.exists) throw new HttpsError("failed-precondition", "會員資料尚未建立完成。");
    const user = userSnapshot.data();
    const existing = applicationSnapshot.exists ? applicationSnapshot.data() : null;
    if (user.affiliateCode || user.affiliateStatus === "approved" || existing?.status === "approved") {
      throw new HttpsError("already-exists", "你的 Affiliate 申請已獲批准。");
    }
    if (existing?.status === "pending") {
      throw new HttpsError("already-exists", "你的申請正在審批中。");
    }
    const application = {
      uid,
      username: user.username || user.displayName || "",
      email: user.email || String(request.auth.token.email || ""),
      contact,
      message,
      status: "pending",
      reviewNote: "",
      submittedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing?.createdAt ? { createdAt: existing.createdAt } : { createdAt: FieldValue.serverTimestamp() }),
    };
    transaction.set(applicationRef, application);
    transaction.set(userRef, {
      affiliateStatus: "pending",
      affiliateAppliedAt: FieldValue.serverTimestamp(),
      affiliateReviewNote: "",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return { ok: true, status: "pending" };
});

export const adminSession = onCall(adminCallableOptions, async (request) => {
  const actor = assertAdmin(request);
  return { ok: true, uid: actor.uid, email: actor.email };
});

export const adminAffiliateOverview = onCall(adminCallableOptions, async (request) => {
  assertAdmin(request);
  const snapshot = await db.collection("users").where("affiliateCode", "!=", null)
    .select("affiliateCode", "username", "displayName", "email", "affiliateRefereeCount", "createdAt")
    .limit(5000).get();
  return {
    items: snapshot.docs.map((document) => {
      const user = document.data();
      return {
        uid: document.id,
        affiliateCode: user.affiliateCode || "",
        username: user.username || user.displayName || "",
        email: user.email || "",
        refereeCount: Number(user.affiliateRefereeCount || 0),
        createdAt: serialize(user.createdAt || null),
      };
    }).sort((left, right) => right.refereeCount - left.refereeCount),
  };
});

export const adminAffiliateApplications = onCall(affiliateApplicationsCallableOptions, async (request) => {
  assertAdmin(request);
  const snapshot = await db.collection("affiliateApplications")
    .orderBy("submittedAt", "desc").limit(500).get();
  return {
    items: snapshot.docs.map((document) => ({ id: document.id, ...serialize(document.data()) })),
  };
});

export const adminReviewAffiliateApplication = onCall(adminCallableOptions, async (request) => {
  const actor = assertAdmin(request);
  const uid = assertIdentifier(request.data?.uid, "會員 UID");
  const decision = request.data?.decision === "approved" ? "approved"
    : request.data?.decision === "rejected" ? "rejected" : "";
  const reviewNote = String(request.data?.reviewNote || "").trim().slice(0, 1000);
  if (!decision) throw new HttpsError("invalid-argument", "審批結果不正確。");
  if (decision === "rejected" && !reviewNote) {
    throw new HttpsError("invalid-argument", "拒絕申請時請填寫原因。");
  }
  const applicationRef = db.collection("affiliateApplications").doc(uid);
  const userRef = db.collection("users").doc(uid);
  const code = affiliateCodeForUid(uid);
  const codeRef = db.collection("affiliateCodes").doc(code);
  await db.runTransaction(async (transaction) => {
    const [applicationSnapshot, userSnapshot, codeSnapshot] = await Promise.all([
      transaction.get(applicationRef), transaction.get(userRef), transaction.get(codeRef),
    ]);
    if (!applicationSnapshot.exists || !userSnapshot.exists) {
      throw new HttpsError("not-found", "找不到 Affiliate 申請或會員資料。");
    }
    const before = applicationSnapshot.data();
    if (before.status !== "pending") {
      throw new HttpsError("failed-precondition", "此申請已經完成審批。");
    }
    if (decision === "approved" && codeSnapshot.exists && codeSnapshot.data()?.uid !== uid) {
      throw new HttpsError("already-exists", "Affiliate code 發生碰撞，請聯絡技術支援。");
    }
    const reviewedAt = FieldValue.serverTimestamp();
    transaction.update(applicationRef, {
      status: decision, reviewNote, reviewedAt, reviewedBy: actor.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(userRef, {
      affiliateStatus: decision,
      affiliateReviewNote: reviewNote,
      ...(decision === "approved" ? { affiliateCode: code, affiliateApprovedAt: reviewedAt } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (decision === "approved") {
      transaction.set(codeRef, {
        uid, code, active: true,
        createdAt: codeSnapshot.data()?.createdAt || FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    transaction.set(db.collection("adminAuditLogs").doc(), auditRecord(
      actor, `affiliate:${decision}`, "affiliateApplications", uid, before,
      { status: decision, reviewNote, affiliateCode: decision === "approved" ? code : "" }, request,
    ));
  });
  return { ok: true, status: decision, affiliateCode: decision === "approved" ? code : "" };
});

export const adminAffiliateReport = onCall(adminCallableOptions, async (request) => {
  assertAdmin(request);
  const referrerUid = assertIdentifier(request.data?.referrerUid, "推薦人 UID");
  const startDate = new Date(String(request.data?.startAt || ""));
  const endDate = new Date(String(request.data?.endAt || ""));
  const rangeMs = endDate.getTime() - startDate.getTime();
  if (!Number.isFinite(rangeMs) || rangeMs <= 0 || rangeMs > 370 * 24 * 60 * 60 * 1000) {
    throw new HttpsError("invalid-argument", "報表日期範圍必須為 1 至 370 日。");
  }
  const startAt = Timestamp.fromDate(startDate);
  const endAt = Timestamp.fromDate(endDate);
  const referralsSnapshot = await db.collection("affiliateReferrals")
    .where("referrerUid", "==", referrerUid).limit(2000).get();
  const refereeUids = referralsSnapshot.docs.map((document) => document.id);
  if (!refereeUids.length) {
    return { referrerUid, startAt: startDate.toISOString(), endAt: endDate.toISOString(), referees: [], totals: emptyAffiliateTotals() };
  }

  const userSnapshots = await db.getAll(...refereeUids.map((uid) => db.collection("users").doc(uid)));
  const [depositSnapshot, recordSnapshot] = await Promise.all([
    db.collection("tokenRequests")
      .where("affiliateReferrerUid", "==", referrerUid)
      .where("reviewedAt", ">=", startAt).where("reviewedAt", "<", endAt)
      .select("uid", "status", "verifiedHkdAmount").get(),
    db.collection("drawRecords")
      .where("affiliateReferrerUid", "==", referrerUid)
      .where("createdAt", ">=", startAt).where("createdAt", "<", endAt)
      .select("uid", "source", "tokenCost", "cardId", "cardConversionValue", "cardValue").get(),
  ]);
  const users = userSnapshots.filter((snapshot) => snapshot.exists).map((snapshot) => {
    const user = snapshot.data();
    return {
      uid: snapshot.id, username: user.username || user.displayName || "", email: user.email || "",
      joinedAt: serialize(user.referredAt || user.createdAt || null),
    };
  });
  const { referees, totals } = summarizeAffiliateReport(
    users,
    depositSnapshot.docs.map((document) => document.data()),
    recordSnapshot.docs.map((document) => document.data()),
  );
  return { referrerUid, startAt: startDate.toISOString(), endAt: endDate.toISOString(), referees, totals };
});

// Pure aggregation for the affiliate report so the arithmetic can be unit tested.
// Deposits count admin-verified HK$ on approved requests; spend counts non-VIP draws;
// payout is the value of cards already awarded; gain/loss = settled spend - payout.
function summarizeAffiliateReport(users, deposits, records) {
  const rows = new Map(users.map((user) => [user.uid, {
    ...user,
    depositsHkd: 0, spendTokens: 0, settledSpendTokens: 0, payoutTokens: 0,
    gainLossTokens: 0, drawCount: 0, pendingDrawCount: 0,
  }]));
  deposits.forEach((item) => {
    if (item.status !== "approved" || !rows.has(item.uid)) return;
    rows.get(item.uid).depositsHkd += Number(item.verifiedHkdAmount || 0);
  });
  records.forEach((item) => {
    if (!rows.has(item.uid) || item.source === "vip") return;
    const row = rows.get(item.uid);
    const tokenCost = Number(item.tokenCost || 0);
    row.spendTokens += tokenCost;
    row.drawCount += 1;
    if (item.cardId) {
      row.settledSpendTokens += tokenCost;
      row.payoutTokens += Number(item.cardConversionValue ?? item.cardValue ?? 0);
    } else {
      row.pendingDrawCount += 1;
    }
  });
  const referees = [...rows.values()].map((row) => ({
    ...row, gainLossTokens: row.settledSpendTokens - row.payoutTokens,
  })).sort((left, right) => right.depositsHkd - left.depositsHkd || right.spendTokens - left.spendTokens);
  const totals = referees.reduce((total, row) => ({
    refereeCount: total.refereeCount + 1,
    depositsHkd: total.depositsHkd + row.depositsHkd,
    spendTokens: total.spendTokens + row.spendTokens,
    settledSpendTokens: total.settledSpendTokens + row.settledSpendTokens,
    payoutTokens: total.payoutTokens + row.payoutTokens,
    gainLossTokens: total.gainLossTokens + row.gainLossTokens,
    drawCount: total.drawCount + row.drawCount,
    pendingDrawCount: total.pendingDrawCount + row.pendingDrawCount,
  }), emptyAffiliateTotals());
  return { referees, totals };
}

function emptyAffiliateTotals() {
  return {
    refereeCount: 0, depositsHkd: 0, spendTokens: 0, settledSpendTokens: 0,
    payoutTokens: 0, gainLossTokens: 0, drawCount: 0, pendingDrawCount: 0,
  };
}

export const adminList = onCall(adminCallableOptions, async (request) => {
  assertAdmin(request);
  const collectionName = assertIdentifier(request.data?.collection, "資料類型");
  if (!READ_COLLECTIONS.has(collectionName)) throw new HttpsError("permission-denied", "不可讀取此資料類型。");

  const limit = Math.min(Math.max(Number(request.data?.limit) || 100, 1), 250);
  const pageAfterId = String(request.data?.pageAfterId || "").trim();
  const paginated = request.data?.paginated === true;
  const orderField = String(request.data?.orderField || "").trim();
  const direction = request.data?.direction === "asc" ? "asc" : "desc";
  let query = db.collection(collectionName);
  if (paginated) {
    query = query.orderBy(FieldPath.documentId(), "asc");
    if (pageAfterId) query = query.startAfter(pageAfterId);
  } else if (orderField) {
    if (!/^[A-Za-z0-9_]+$/.test(orderField)) throw new HttpsError("invalid-argument", "排序欄位不正確。");
    query = query.orderBy(orderField, direction);
  }
  query = query.limit(limit);
  const snapshot = await query.get();
  return {
    items: snapshot.docs.map((doc) => ({ id: doc.id, ...serialize(doc.data()) })),
    nextPageAfterId: paginated && snapshot.size === limit ? snapshot.docs.at(-1)?.id || "" : "",
  };
});

export const adminGet = onCall(adminCallableOptions, async (request) => {
  assertAdmin(request);
  const collectionName = assertIdentifier(request.data?.collection, "資料類型");
  if (!READ_COLLECTIONS.has(collectionName)) throw new HttpsError("permission-denied", "不可讀取此資料類型。");
  const documentId = assertIdentifier(request.data?.documentId, "文件 ID");
  const snapshot = await db.collection(collectionName).doc(documentId).get();
  return { exists: snapshot.exists, item: snapshot.exists ? { id: snapshot.id, ...serialize(snapshot.data()) } : null };
});

export const adminWrite = onCall(adminCallableOptions, async (request) => {
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

// Nested admin paths are limited to room round and slot documents.
const ADMIN_NESTED_PATHS = [
  /^draws\/[A-Za-z0-9_-]+\/rounds\/[A-Za-z0-9_-]+$/,
  /^draws\/[A-Za-z0-9_-]+\/rounds\/[A-Za-z0-9_-]+\/slots\/[A-Za-z0-9_-]+$/,
];
const ADMIN_BATCH_MODES = new Set(["upsert", "set", "create", "update", "delete"]);
const ADMIN_FIELD_PATH = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/;
// Dotted field paths bypass per-field validation, so only these map fields may use them.
const ADMIN_DOTTED_FIELDS = { draws: new Set(["roundResultSides", "roundResultImages"]) };
// Replacing these documents would erase buyer and price history.
const ADMIN_NO_REPLACE_COLLECTIONS = new Set(["drawRecords", "slots"]);

// Web admin encodes Firestore sentinels as plain markers; restore them for the write.
function decodeAdminValue(value) {
  if (Array.isArray(value)) return value.map(decodeAdminValue);
  if (!value || typeof value !== "object") return value;
  if (value.__adminServerTimestamp === true) return FieldValue.serverTimestamp();
  if (Number.isFinite(value.__adminTimestampMillis)) return Timestamp.fromMillis(value.__adminTimestampMillis);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeAdminValue(item)]));
}

function adminBatchOperation(operation) {
  const mode = operation.mode === undefined ? "upsert" : operation.mode;
  if (!ADMIN_BATCH_MODES.has(mode)) throw new HttpsError("invalid-argument", "操作類型不正確。");
  let collectionName;
  let documentId;
  let ref;
  if (operation.path !== undefined) {
    const path = String(operation.path);
    const segments = path.split("/");
    if (segments.length === 2) {
      collectionName = assertIdentifier(segments[0], "資料類型");
      documentId = assertIdentifier(segments[1], "文件 ID");
      ref = adminDocument(collectionName, documentId);
    } else if (ADMIN_NESTED_PATHS.some((pattern) => pattern.test(path))) {
      collectionName = segments.at(-2);
      documentId = segments.at(-1);
      ref = db.doc(path);
    } else {
      throw new HttpsError("permission-denied", "此資料路徑不可由管理後台修改。");
    }
  } else {
    collectionName = assertIdentifier(operation.collection, "資料類型");
    documentId = assertIdentifier(operation.documentId, "文件 ID");
    ref = adminDocument(collectionName, documentId);
  }
  if (mode === "delete") {
    if (!DELETE_COLLECTIONS.has(collectionName)) throw new HttpsError("permission-denied", "此資料只可停用，不可永久刪除。");
    return { mode, collectionName, documentId, ref, data: null };
  }
  const raw = operation.data || {};
  // Dotted keys are field paths and are only meaningful for updates of allow-listed map fields.
  const topLevelKeys = Object.keys(raw);
  const dottedAllowed = ADMIN_DOTTED_FIELDS[collectionName] || new Set();
  if (topLevelKeys.some((key) => !ADMIN_FIELD_PATH.test(key) || (key.includes(".") && (
    mode !== "update" || key.split(".").length !== 2 || !dottedAllowed.has(key.split(".")[0])
  )))) {
    throw new HttpsError("invalid-argument", "欄位名稱不正確。");
  }
  const data = validateAdminWrite(collectionName, documentId, validatedDocumentData(
    Object.fromEntries(topLevelKeys.map((key) => [key.replaceAll(".", "__"), raw[key]])),
  ));
  const restored = Object.fromEntries(topLevelKeys.map((key) => [key, data[key.replaceAll(".", "__")]]));
  return { mode, collectionName, documentId, ref, data: restored };
}

export const adminBatchWrite = onCall(adminCallableOptions, async (request) => {
  const actor = assertAdmin(request);
  const operations = Array.isArray(request.data?.operations) ? request.data.operations : [];
  if (!operations.length || operations.length > 100) throw new HttpsError("invalid-argument", "每批必須有 1 至 100 個操作。");

  const refs = operations.map(adminBatchOperation);
  // Always store the server's time for assignedAt, whatever the client sent.
  const stampFields = (operation) => (
    operation.collectionName === "drawRecords" && operation.data && Object.hasOwn(operation.data, "assignedAt")
      ? { assignedAt: FieldValue.serverTimestamp() } : {}
  );

  await db.runTransaction(async (transaction) => {
    const snapshots = await Promise.all(refs.map(({ ref }) => transaction.get(ref)));
    refs.forEach((operation, index) => {
      const snapshot = snapshots[index];
      const before = snapshot.exists ? snapshot.data() : null;
      if (operation.mode === "create" && snapshot.exists) throw new HttpsError("already-exists", "文件已存在。");
      if (operation.mode === "update" && !snapshot.exists) throw new HttpsError("not-found", "文件不存在。");
      if (operation.mode === "set" && snapshot.exists && ADMIN_NO_REPLACE_COLLECTIONS.has(operation.collectionName)) {
        throw new HttpsError("permission-denied", "不可整份覆寫購買紀錄或號碼，請改用更新。");
      }
      if (operation.mode === "delete") {
        transaction.delete(operation.ref);
      } else {
        const fields = {
          ...decodeAdminValue(operation.data),
          ...stampFields(operation),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actor.uid,
        };
        if (operation.mode === "update") transaction.update(operation.ref, fields);
        else {
          transaction.set(operation.ref, {
            ...fields,
            ...(!snapshot.exists ? { createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid } : {}),
          }, { merge: operation.mode === "upsert" });
        }
      }
      transaction.set(db.collection("adminAuditLogs").doc(), auditRecord(
        actor, `batch-${operation.mode}:${operation.collectionName}`, operation.collectionName,
        operation.documentId, before, operation.data, request,
      ));
    });
  });
  return { ok: true, count: refs.length };
});

export const adminReviewTokenRequest = onCall(adminCallableOptions, async (request) => {
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
    // A tier reward is issued once: never reset a reward that was already claimed, converted or shipped.
    const rewardRefs = attainedTiers.map((tier) => db.collection("drawRecords").doc(`vip_${tokenRequest.uid}_${tier.id}`));
    const existingRewards = await Promise.all(rewardRefs.map((ref) => transaction.get(ref)));
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
      if (existingRewards[index].exists) return;
      const card = rewardCardSnapshots[index]?.exists ? rewardCardSnapshots[index].data() : null;
      const rewardName = card?.name || tier.rewardName;
      const rewardImageUrl = card?.thumbUrl || card?.imageUrl || tier.rewardImageUrl;
      const rewardValue = Number(card?.conversionValue ?? card?.tokenValue ?? tier.rewardConversionValue ?? 0);
      transaction.create(rewardRefs[index], {
        source: "vip", vipTierId: tier.id, vipTierIndex: vipTiers.findIndex((item) => item.id === tier.id),
        uid: tokenRequest.uid, username: tokenRequest.username || user.username || "VIP member",
        drawId: "vip-program", drawTitle: `${tier.name} 升級獎勵`, roomSlug: "vip-program", roomLink: "",
        round: "vip-reward", roundSort: 0, number: vipTiers.findIndex((item) => item.id === tier.id) + 1,
        tokenCost: 0, targetCardId: tier.rewardCardId || `vip-reward-${tier.id}`,
        targetCardName: rewardName, targetCardImageUrl: rewardImageUrl, targetCardValue: rewardValue,
        vipRewardStatus: "claimable", unlockedAt: FieldValue.serverTimestamp(), assignedBy: actor.uid,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
    });
    transaction.set(db.collection("adminAuditLogs").doc(), auditRecord(
      actor, `token-request:${decision}`, "tokenRequests", requestId, tokenRequest,
      { ...requestUpdate, creditedTokens: decision === "approved" ? amount : 0 }, request,
    ));
  });
  return { ok: true };
});

export const adminSetShippingStatus = onCall(adminCallableOptions, async (request) => {
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

// Creates any missing round/number documents after the admin creates or
// expands a live session. Existing purchased slots are never overwritten.
export const adminEnsureDrawSlots = onCall(adminCallableOptions, async (request) => {
  const actor = assertAdmin(request);
  const drawId = assertIdentifier(request.data?.drawId, "直播 ID");
  const totalRounds = Math.max(1, Math.min(100, Math.round(Number(request.data?.totalRounds) || 1)));
  const cardCount = Math.max(4, Math.min(100, Math.round(Number(request.data?.cardCount) || 20)));
  const drawRef = db.collection("draws").doc(drawId);
  const drawSnapshot = await drawRef.get();
  if (!drawSnapshot.exists) throw new HttpsError("not-found", "找不到直播場次。");

  let batch = db.batch();
  let writeCount = 0;
  let createdSlots = 0;
  const flush = async () => {
    if (!writeCount) return;
    await batch.commit();
    batch = db.batch();
    writeCount = 0;
  };

  for (let roundNumber = 1; roundNumber <= totalRounds; roundNumber += 1) {
    const roundId = `round-${String(roundNumber).padStart(3, "0")}`;
    const roundRef = drawRef.collection("rounds").doc(roundId);
    const slotsRef = roundRef.collection("slots");
    const existing = await slotsRef.select().get();
    const existingIds = new Set(existing.docs.map((item) => item.id));
    batch.set(roundRef, { round: roundId, roundNumber, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    writeCount += 1;
    for (let number = 1; number <= cardCount; number += 1) {
      const slotId = String(number);
      if (existingIds.has(slotId)) continue;
      batch.set(slotsRef.doc(slotId), {
        number, round: roundId, status: "available", createdAt: FieldValue.serverTimestamp(),
      });
      createdSlots += 1;
      writeCount += 1;
      if (writeCount >= 450) await flush();
    }
  }
  await flush();
  await db.collection("adminAuditLogs").add(auditRecord(
    actor, "draw:ensure-slots", "draws", drawId, null,
    { totalRounds, cardCount, createdSlots }, request,
  ));
  return { ok: true, createdSlots };
});

// Reprices every formula card and every denormalized room/showcase copy in one
// server-side operation. Promotion cards using manual prices are left intact.
export const adminRecalculateCardPrices = onCall(adminCallableOptions, async (request) => {
  const actor = assertAdmin(request);
  const marginRate = Number(request.data?.marginRate);
  if (!Number.isFinite(marginRate) || marginRate <= 0 || marginRate > 10) {
    throw new HttpsError("invalid-argument", "毛利率必須大過 0 並且不多於 10。");
  }
  const [cardsSnapshot, drawsSnapshot] = await Promise.all([
    db.collection("cards").get(), db.collection("draws").get(),
  ]);
  const cards = new Map(cardsSnapshot.docs.map((item) => [item.id, item.data()]));
  const prices = new Map();
  const roundPrice = (value) => Math.max(1, Math.round(value));
  cardsSnapshot.docs.forEach((item) => {
    const card = item.data();
    if (card.archived || card.pricingMode === "manual") return;
    const hell = cards.get(String(card.hellCardId || ""));
    if (!hell) return;
    const heavenValue = Number(card.conversionValue ?? card.tokenValue ?? 0);
    const hellValue = Number(hell.conversionValue ?? hell.tokenValue ?? 0);
    if (![heavenValue, hellValue].every(Number.isFinite)) return;
    const next = {
      half: roundPrice((heavenValue * 0.5 + hellValue * 0.5) * marginRate),
      fifth: roundPrice((heavenValue * 0.2 + hellValue * 0.8) * marginRate),
      tenth: roundPrice((heavenValue * 0.1 + hellValue * 0.9) * marginRate),
    };
    // Unchanged cards are skipped so a recalculation only writes (and audits) real price changes.
    const unchanged = Number(card.tokenValue) === next.half
      && ["half", "fifth", "tenth"].every((key) => Number(card.modePrices?.[key]) === next[key]);
    if (!unchanged) prices.set(item.id, next);
  });

  const writes = [];
  writes.push((batch) => batch.set(db.collection("settings").doc("cardPricing"), {
    marginRate, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid,
  }, { merge: true }));
  prices.forEach((modePrices, cardId) => {
    writes.push((batch) => batch.set(db.collection("cards").doc(cardId), {
      tokenValue: modePrices.half, modePrices, pricingMarginRate: marginRate,
      updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid,
    }, { merge: true }));
    writes.push((batch) => batch.set(db.collection("publicCardShowcase").doc(cardId), {
      tokenValue: modePrices.half, modePrices, updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    }, { merge: true }));
  });
  drawsSnapshot.docs.forEach((item) => {
    const draw = item.data();
    const poolIds = Array.isArray(draw.poolCardIds) ? draw.poolCardIds.map(String) : [];
    if (!poolIds.some((id) => prices.has(id))) return;
    const poolCardValues = { ...(draw.poolCardValues || {}) };
    prices.forEach((modePrices, cardId) => { if (poolIds.includes(cardId)) poolCardValues[cardId] = modePrices.half; });
    const update = { poolCardValues, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid };
    if (Array.isArray(draw.poolCards)) {
      update.poolCards = draw.poolCards.map((card) => {
        const modePrices = prices.get(String(card?.id || ""));
        return modePrices ? { ...card, tokenValue: modePrices.half, modePrices } : card;
      });
    }
    writes.push((batch) => batch.set(item.ref, update, { merge: true }));
  });
  for (let start = 0; start < writes.length; start += 400) {
    const batch = db.batch();
    writes.slice(start, start + 400).forEach((write) => write(batch));
    await batch.commit();
  }
  await db.collection("adminAuditLogs").add(auditRecord(
    actor, "cards:recalculate-prices", "settings", "cardPricing", null,
    { marginRate, updatedCards: prices.size }, request,
  ));
  return { ok: true, updatedCards: prices.size };
});

// Renames a card category everywhere it is denormalized. Historical draw
// records keep their original result/card names but receive the new category.
export const adminRenameCardCategory = onCall(adminCallableOptions, async (request) => {
  const actor = assertAdmin(request);
  const oldCategory = String(request.data?.oldCategory || "").trim().slice(0, 80);
  const newCategory = String(request.data?.newCategory || "").trim().slice(0, 80);
  if (!oldCategory || !newCategory) throw new HttpsError("invalid-argument", "分類名稱不能留空。");
  if (oldCategory === newCategory) return { ok: true, updatedCards: 0, updatedRecords: 0, updatedDraws: 0 };

  const settingsRef = db.collection("settings").doc("cardCategories");
  const [settingsSnapshot, cardsSnapshot, recordsSnapshot, drawsSnapshot] = await Promise.all([
    settingsRef.get(),
    db.collection("cards").where("category", "==", oldCategory).get(),
    db.collection("drawRecords").where("cardCategory", "==", oldCategory).get(),
    db.collection("draws").get(),
  ]);
  const configured = Array.isArray(settingsSnapshot.data()?.categories) ? settingsSnapshot.data().categories.map(String) : [];
  if (configured.includes(newCategory)) throw new HttpsError("already-exists", "新分類名稱已存在。");
  const categories = [...new Set(configured.map((item) => item === oldCategory ? newCategory : item).concat(newCategory))];
  const writes = [];
  writes.push((batch) => batch.set(settingsRef, {
    categories, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid,
  }, { merge: true }));
  cardsSnapshot.docs.forEach((item) => {
    writes.push((batch) => batch.update(item.ref, {
      category: newCategory, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid,
    }));
    writes.push((batch) => batch.set(db.collection("publicCardShowcase").doc(item.id), {
      category: newCategory, cardCategory: newCategory,
      updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid,
    }, { merge: true }));
  });
  recordsSnapshot.docs.forEach((item) => writes.push((batch) => batch.update(item.ref, {
    cardCategory: newCategory, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid,
  })));
  let updatedDraws = 0;
  drawsSnapshot.docs.forEach((item) => {
    const poolCards = Array.isArray(item.data().poolCards) ? item.data().poolCards : [];
    if (!poolCards.some((card) => String(card?.category || "") === oldCategory)) return;
    updatedDraws += 1;
    writes.push((batch) => batch.set(item.ref, {
      poolCards: poolCards.map((card) => String(card?.category || "") === oldCategory ? { ...card, category: newCategory } : card),
      updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid,
    }, { merge: true }));
  });
  for (let start = 0; start < writes.length; start += 400) {
    const batch = db.batch();
    writes.slice(start, start + 400).forEach((write) => write(batch));
    await batch.commit();
  }
  await db.collection("adminAuditLogs").add(auditRecord(
    actor, "cards:rename-category", "settings", "cardCategories", { category: oldCategory },
    { category: newCategory, cards: cardsSnapshot.size, records: recordsSnapshot.size, draws: updatedDraws }, request,
  ));
  return { ok: true, updatedCards: cardsSnapshot.size, updatedRecords: recordsSnapshot.size, updatedDraws };
});

// Rebuilds the public homepage carousel from the authoritative active cards.
export const adminPublishCardShowcase = onCall(adminCallableOptions, async (request) => {
  const actor = assertAdmin(request);
  const [cardsSnapshot, existingSnapshot] = await Promise.all([
    db.collection("cards").get(), db.collection("publicCardShowcase").get(),
  ]);
  const activeCards = cardsSnapshot.docs.filter((item) => item.data().archived !== true)
    .sort((a, b) => Number(b.data().tokenValue || 0) - Number(a.data().tokenValue || 0));
  const writes = [];
  existingSnapshot.docs.forEach((item) => writes.push((batch) => batch.set(item.ref, {
    active: false, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid,
  }, { merge: true })));
  activeCards.forEach((item, rank) => writes.push((batch) => batch.set(db.collection("publicCardShowcase").doc(item.id), {
    ...plainData(item.data()), cardId: item.id, active: true, rank,
    updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid,
  }, { merge: true })));
  for (let start = 0; start < writes.length; start += 400) {
    const batch = db.batch();
    writes.slice(start, start + 400).forEach((write) => write(batch));
    await batch.commit();
  }
  await db.collection("adminAuditLogs").add(auditRecord(
    actor, "cards:publish-showcase", "publicCardShowcase", "all", null,
    { publishedCards: activeCards.length }, request,
  ));
  return { ok: true, publishedCards: activeCards.length };
});

// Removes a live room and its slot/chat subcollections while intentionally
// preserving drawRecords, which remain the source of customer history.
export const adminDeleteDraw = onCall(adminCallableOptions, async (request) => {
  const actor = assertAdmin(request);
  const drawId = assertIdentifier(request.data?.drawId, "直播 ID");
  const drawRef = db.collection("draws").doc(drawId);
  const drawSnapshot = await drawRef.get();
  if (!drawSnapshot.exists) throw new HttpsError("not-found", "找不到直播場次。");

  const refs = [];
  const [rootSlots, messages, rounds] = await Promise.all([
    drawRef.collection("slots").listDocuments(),
    drawRef.collection("messages").listDocuments(),
    drawRef.collection("rounds").get(),
  ]);
  refs.push(...rootSlots, ...messages);
  for (const round of rounds.docs) {
    refs.push(...await round.ref.collection("slots").listDocuments());
    refs.push(round.ref);
  }
  for (let start = 0; start < refs.length; start += 400) {
    const batch = db.batch();
    refs.slice(start, start + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  await db.collection("adminAuditLogs").add(auditRecord(
    actor, "draw:delete", "draws", drawId, drawSnapshot.data(),
    { preservedDrawRecords: true, deletedChildren: refs.length }, request,
  ));
  await drawRef.delete();
  return { ok: true, deletedChildren: refs.length };
});

export const adminUploadImage = onCall({ ...adminCallableOptions, memory: "512MiB" }, async (request) => {
  const actor = assertAdmin(request);
  const contentType = String(request.data?.contentType || "");
  if (!IMAGE_TYPES.has(contentType)) throw new HttpsError("invalid-argument", "只接受 JPEG、PNG 或 WebP 圖片。");
  const base64 = String(request.data?.base64 || "");
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > 6 * 1024 * 1024) throw new HttpsError("invalid-argument", "圖片必須細過 6MB。");
  // Card and site images are stored as files so Firestore documents only carry short URLs.
  const scope = {
    "draw-result": "draw-results",
    card: "card-images",
    site: "site-images",
  }[request.data?.scope] || "admin-assets";
  const ownerId = assertIdentifier(request.data?.ownerId, "關聯 ID");
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const digest = createHash("sha256").update(buffer).digest("hex").slice(0, 20);
  const path = `${scope}/${ownerId}/${Date.now()}-${digest}.${extension}`;
  const file = getStorage().bucket().file(path);
  const downloadToken = randomUUID();
  await file.save(buffer, { resumable: false, metadata: {
    contentType, cacheControl: "public,max-age=31536000,immutable",
    metadata: { firebaseStorageDownloadTokens: downloadToken },
  } });
  const url = `https://firebasestorage.googleapis.com/v0/b/${getStorage().bucket().name}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`;
  await db.collection("adminAuditLogs").add(auditRecord(
    actor, "image:upload", "storage", path, null,
    { path, contentType, bytes: buffer.length, sha256: digest }, request,
  ));
  return { ok: true, path, url };
});

const TOKEN_REQUEST_PENDING_LIMIT = 2;
const TOKEN_REQUEST_COOLDOWN_MS = 60 * 1000;
const TOKEN_REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000;
const TOKEN_REQUEST_WINDOW_LIMIT = 5;

function millis(value) {
  return typeof value?.toMillis === "function" ? value.toMillis() : 0;
}

function boundedText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

// A payment request only exists once its proof is stored: the file is saved
// first, then the request is created directly as "pending" with the quota update.
export const submitTokenPaymentRequest = onCall(tokenProofCallableOptions, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "請先登入後再申請代幣。");
  const uid = request.auth.uid;
  const contentType = String(request.data?.contentType || "");
  if (!IMAGE_TYPES.has(contentType)) throw new HttpsError("invalid-argument", "付款證明必須是 JPEG、PNG 或 WebP 圖片。");
  const buffer = Buffer.from(String(request.data?.base64 || ""), "base64");
  if (!buffer.length || buffer.length > 2 * 1024 * 1024) {
    throw new HttpsError("invalid-argument", "付款證明圖片必須細過 2MB。");
  }
  const hkdAmount = Number(request.data?.hkdAmount);
  const amount = Number(request.data?.amount);
  const packageType = request.data?.packageType;
  if (!Number.isSafeInteger(hkdAmount) || hkdAmount < 100 || hkdAmount > 1_000_000
      || !Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000
      || !["preset", "custom"].includes(packageType)) {
    throw new HttpsError("invalid-argument", "代幣套餐或金額不正確。");
  }

  const [packageSnapshot, paymentSnapshot] = await Promise.all([
    db.collection("settings").doc("tokenPackages").get(),
    db.collection("settings").doc("payment").get(),
  ]);
  const expectedTokens = packageType === "custom"
    ? calculateTokenAmount(hkdAmount)
    : normalizePackages(packageSnapshot.exists ? packageSnapshot.data() : null)
      .find((item) => item.hkd === hkdAmount && item.tokens === amount)?.tokens;
  if (expectedTokens !== amount) {
    throw new HttpsError("failed-precondition", "代幣數量不符合目前套餐價格，請重新整理後再試。");
  }
  const payment = paymentSnapshot.exists ? paymentSnapshot.data() : {};
  const fpsIdentifier = boundedText(payment.fpsIdentifier || request.data?.fpsIdentifier, 100);
  const fpsName = boundedText(payment.fpsName || request.data?.fpsName, 100);
  if (!fpsIdentifier || !fpsName) throw new HttpsError("failed-precondition", "平台尚未設定 FPS 收款資料，請聯絡管理員。");

  const userRef = db.collection("users").doc(uid);
  // Check the quota before storing anything so rejected submissions leave no file behind.
  const assertQuota = (user) => {
    const now = Date.now();
    if (Number(user.pendingTokenRequestCount || 0) >= TOKEN_REQUEST_PENDING_LIMIT) {
      throw new HttpsError("resource-exhausted", `最多只可以同時有 ${TOKEN_REQUEST_PENDING_LIMIT} 個待處理代幣申請。`);
    }
    if (now - millis(user.lastTokenRequestAt) < TOKEN_REQUEST_COOLDOWN_MS) {
      throw new HttpsError("resource-exhausted", "每次代幣申請需要相隔最少 1 分鐘。");
    }
    const activeWindow = now - millis(user.tokenRequestWindowStartedAt) < TOKEN_REQUEST_WINDOW_MS;
    if (activeWindow && Number(user.tokenRequestWindowCount || 0) >= TOKEN_REQUEST_WINDOW_LIMIT) {
      throw new HttpsError("resource-exhausted", "24 小時內最多只可以提交 5 次代幣申請。");
    }
    return activeWindow;
  };
  const initialUser = await userRef.get();
  if (!initialUser.exists) throw new HttpsError("failed-precondition", "找不到會員帳戶，請重新登入。");
  assertQuota(initialUser.data());

  const requestRef = db.collection("tokenRequests").doc();
  const path = `token-proofs/${uid}/${requestRef.id}`;
  const file = getStorage().bucket().file(path);
  const downloadToken = randomUUID();
  await file.save(buffer, {
    resumable: false,
    preconditionOpts: { ifGenerationMatch: 0 },
    metadata: {
      contentType,
      cacheControl: "private,max-age=0,no-transform",
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
  });
  const proofUrl = `https://firebasestorage.googleapis.com/v0/b/${getStorage().bucket().name}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`;

  try {
    await db.runTransaction(async (transaction) => {
      const userSnapshot = await transaction.get(userRef);
      const user = userSnapshot.data() || {};
      const username = String(user.username || "");
      const usernameSnapshot = username
        ? await transaction.get(db.collection("usernames").doc(username.toLowerCase()))
        : null;
      if (!usernameSnapshot?.exists || usernameSnapshot.data().uid !== uid) {
        throw new HttpsError("failed-precondition", "請先設定用戶名稱後再申請代幣。");
      }
      const activeWindow = assertQuota(user);
      transaction.create(requestRef, {
        uid,
        affiliateReferrerUid: String(user.referredByUid || ""),
        username,
        email: String(user.email || ""),
        amount,
        hkdAmount,
        exchangeRate: amount / hkdAmount,
        packageType,
        fpsIdentifier,
        fpsName,
        proofMode: "storage",
        proofPath: path,
        proofFileName: boundedText(request.data?.proofFileName, 80) || "proof",
        proofUrl,
        status: "pending",
        adminNote: "",
        promoCode: "",
        promoCodeId: "",
        quotaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
        uploadedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(userRef, {
        lastTokenRequestId: requestRef.id,
        lastTokenRequestAt: FieldValue.serverTimestamp(),
        pendingTokenRequestCount: Number(user.pendingTokenRequestCount || 0) + 1,
        tokenRequestWindowStartedAt: activeWindow ? user.tokenRequestWindowStartedAt : FieldValue.serverTimestamp(),
        tokenRequestWindowCount: activeWindow ? Number(user.tokenRequestWindowCount || 0) + 1 : 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    await file.delete({ ignoreNotFound: true }).catch(() => {});
    throw error;
  }
  return { ok: true, requestId: requestRef.id };
});


export const __test = {
  csvSet, plainData, validatedDocumentData, serialize,
  calculateTokenAmount, normalizePackages, verifiedTokenGrant,
  affiliateCodeForUid, normalizeAffiliateCode,
  adminBatchOperation, decodeAdminValue, summarizeAffiliateReport,
};

// Data-change audit triggers (see audit.js).
export * from "./audit.js";

// The retention-locked log bucket that holds the data-change audit trail.
// Until it exists, entries are read from the project's default log bucket (30 days).
const AUDIT_LOG_VIEW = "projects/livedraw-7e3c2/locations/global/buckets/livedraw-audit/views/_AllLogs";
const AUDIT_EXPORT_MAX_DAYS = 370;

function auditRange(request) {
  const startDate = new Date(String(request.data?.startAt || ""));
  const endDate = new Date(String(request.data?.endAt || ""));
  const rangeMs = endDate.getTime() - startDate.getTime();
  if (!Number.isFinite(rangeMs) || rangeMs <= 0 || rangeMs > AUDIT_EXPORT_MAX_DAYS * 86400000) {
    throw new HttpsError("invalid-argument", `日期範圍必須為 1 至 ${AUDIT_EXPORT_MAX_DAYS} 日。`);
  }
  return { startDate, endDate };
}

// Reads one page of data-change entries from the locked audit bucket, falling
// back to the default 30-day bucket until the locked bucket exists.
async function fetchAuditPage(startDate, endDate, pageToken = "") {
  const filter = [
    'jsonPayload.auditType="livedraw-data-change"',
    `timestamp>="${startDate.toISOString()}"`,
    `timestamp<"${endDate.toISOString()}"`,
  ].join(" AND ");
  const { access_token: accessToken } = await applicationDefault().getAccessToken();
  const listEntries = async (resourceNames) => {
    const response = await loggingList(accessToken, {
      resourceNames, filter, orderBy: "timestamp asc", pageSize: 1000,
      ...(pageToken ? { pageToken } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
  // Read the locked bucket and the default bucket together: entries written
  // before the sink existed are only in the default bucket (30 days).
  let source = "locked-bucket";
  let result = await listEntries([AUDIT_LOG_VIEW, "projects/livedraw-7e3c2"]);
  if (result.status === 404 || result.body?.error?.status === "NOT_FOUND") {
    source = "default-30-days";
    result = await listEntries(["projects/livedraw-7e3c2"]);
  }
  if (result.status !== 200) {
    console.error("Audit log read failed.", result.status, result.body?.error?.message);
    throw new HttpsError("internal", "未能讀取審計紀錄，請確認服務帳戶有 Logs Viewer 權限。");
  }
  const entries = (result.body.entries || []).map((entry) => {
    const payload = entry.jsonPayload || {};
    return {
      eventId: payload.eventId || entry.insertId || "",
      time: entry.timestamp,
      operation: payload.operation || "",
      collection: payload.collection || "",
      path: payload.path || "",
      authType: payload.authType || "",
      authId: payload.authId || "",
      changes: payload.changes || {},
      context: payload.context || {},
    };
  });
  return { entries, nextPageToken: result.body.nextPageToken || "", source };
}

// One-click review: scans the selected range and returns suspicious-activity findings.
const AUDIT_ANALYSIS_MAX_ENTRIES = 50000;
export const adminAuditAnalyze = onCall({ ...adminCallableOptions, timeoutSeconds: 300, memory: "512MiB" }, async (request) => {
  const actor = assertAdmin(request);
  const { startDate, endDate } = auditRange(request);
  const entries = [];
  let pageToken = "";
  let source = "";
  do {
    const page = await fetchAuditPage(startDate, endDate, pageToken);
    entries.push(...page.entries);
    source = page.source;
    pageToken = page.nextPageToken;
  } while (pageToken && entries.length < AUDIT_ANALYSIS_MAX_ENTRIES);
  const result = analyzeAuditEntries(entries);
  await db.collection("adminAuditLogs").add(auditRecord(
    actor, "audit-log:analyze", "auditLog", source, null,
    { startAt: startDate.toISOString(), endAt: endDate.toISOString(), entries: entries.length, summary: result.summary },
    request,
  ));
  return {
    ...result,
    findings: result.findings.slice(0, 1000),
    truncated: Boolean(pageToken),
    source,
  };
});

// Browser error reports from players and admins, shown on the admin live monitor.
// App Check keeps scripts out; the limiter caps reports per user or IP.
const allowClientError = createRateLimiter(20, 60 * 1000);
const allowAnyClientError = createRateLimiter(300, 60 * 1000);
export const reportClientError = onCall({
  region: "asia-east2", enforceAppCheck: ENFORCE_APP_CHECK, timeoutSeconds: 10, memory: "256MiB", maxInstances: 2,
}, (request) => {
  const uid = request.auth?.uid || "";
  // The last X-Forwarded-For hop is added by Google's front end and cannot be spoofed.
  const forwarded = String(request.rawRequest?.headers?.["x-forwarded-for"] || "").split(",").map((part) => part.trim()).filter(Boolean);
  const key = uid || forwarded.at(-1) || "anonymous";
  if (!allowAnyClientError("all") || !allowClientError(key)) return { ok: false };
  const report = sanitizeClientError(request.data, uid);
  // logger.error would replace the message with a server stack trace; write it explicitly.
  logger.write({ severity: "ERROR", ...report, message: `client error: ${report.message}` });
  return { ok: true };
});

// Reads project logs between two instants (newest first).
// Cloud Logging allows about 60 list calls a minute; back off briefly when throttled.
async function loggingList(accessToken, body) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch("https://logging.googleapis.com/v2/entries:list", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.status !== 429 || attempt >= 3) return response;
    await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
  }
}

async function readProjectLogs(filter, sinceIso, untilIso, pageSize = 1000) {
  const { access_token: accessToken } = await applicationDefault().getAccessToken();
  const response = await loggingList(accessToken, {
    resourceNames: ["projects/livedraw-7e3c2"],
    filter: `${filter} AND timestamp>="${sinceIso}"${untilIso ? ` AND timestamp<"${untilIso}"` : ""}`,
    orderBy: "timestamp desc",
    pageSize,
  });
  const body = await response.json();
  if (!response.ok) {
    console.error("Log read failed.", response.status, body?.error?.message);
    throw new HttpsError("internal", "未能讀取系統日誌，請確認服務帳戶有 Logs Viewer 權限。");
  }
  return body.entries || [];
}

const CLIENT_ERROR_FILTER = 'jsonPayload.clientErrorType="livedraw-client-error"';
const SERVER_ERROR_FILTER = 'resource.type="cloud_run_revision" AND severity>=WARNING AND NOT jsonPayload.clientErrorType="livedraw-client-error"';
const isErrorSeverity = (entry) => ["ERROR", "CRITICAL", "ALERT", "EMERGENCY"].includes(entry.severity);

async function errorSummary(sinceIso, untilIso) {
  const [clientEntries, serverEntries] = await Promise.all([
    readProjectLogs(CLIENT_ERROR_FILTER, sinceIso, untilIso),
    readProjectLogs(SERVER_ERROR_FILTER, sinceIso, untilIso, 500),
  ]);
  return {
    clientErrors: groupClientErrors(clientEntries).slice(0, 50),
    serverErrors: groupServerErrors(serverEntries).slice(0, 50),
    clientErrorCount: clientEntries.length,
    serverErrorCount: serverEntries.filter(isErrorSeverity).length,
    serverWarningCount: serverEntries.filter((entry) => entry.severity === "WARNING").length,
  };
}

// Live event health: grouped browser errors and server errors since the session started.
export const adminLiveHealth = onCall({ ...adminCallableOptions, timeoutSeconds: 60 }, async (request) => {
  assertAdmin(request);
  const since = new Date(String(request.data?.sinceAt || ""));
  const sinceIso = Number.isNaN(since.getTime())
    ? new Date(Date.now() - 60 * 60 * 1000).toISOString()
    : new Date(Math.max(since.getTime(), Date.now() - 24 * 60 * 60 * 1000)).toISOString();
  return { checkedAt: new Date().toISOString(), sinceAt: sinceIso, ...(await errorSummary(sinceIso)) };
});

// Start / stop a monitored live session. Stopping builds and stores the session report.
export const adminMonitorSession = onCall({ ...adminCallableOptions, timeoutSeconds: 300, memory: "512MiB" }, async (request) => {
  const actor = assertAdmin(request);
  const action = request.data?.action;
  const sessions = db.collection("monitorSessions");
  if (action === "start") {
    const drawTitle = String(request.data?.drawTitle || "").slice(0, 120);
    const ref = sessions.doc();
    // One active session at a time, even if two admins press start together.
    await db.runTransaction(async (transaction) => {
      const active = await transaction.get(sessions.where("status", "in", ["active", "stopping"]).limit(1));
      if (!active.empty) throw new HttpsError("already-exists", "已經有一個監察進行中。");
      transaction.create(ref, {
        status: "active", drawTitle, startedAt: FieldValue.serverTimestamp(),
        startedBy: actor.uid, startedByEmail: actor.email || "",
      });
    });
    await db.collection("adminAuditLogs").add(auditRecord(actor, "monitor:start", "monitorSessions", ref.id, null, { drawTitle }, request));
    return { ok: true, sessionId: ref.id };
  }
  if (action !== "stop") throw new HttpsError("invalid-argument", "操作不正確。");

  const sessionRef = sessions.doc(assertIdentifier(request.data?.sessionId, "監察 ID"));
  // Claim the stop first so a double press cannot build two reports.
  const snapshot = await db.runTransaction(async (transaction) => {
    const current = await transaction.get(sessionRef);
    if (!current.exists || current.data().status !== "active") throw new HttpsError("failed-precondition", "呢個監察已經停止。");
    transaction.update(sessionRef, { status: "stopping" });
    return current;
  });
  try {
    const start = snapshot.data().startedAt.toDate();
    const end = new Date();
    const startTs = Timestamp.fromDate(start);
    const endTs = Timestamp.fromDate(end);
    const [records, created, reviewed, pending, shipping] = await Promise.all([
      db.collection("drawRecords").where("createdAt", ">=", startTs).where("createdAt", "<", endTs).get(),
      db.collection("tokenRequests").where("createdAt", ">=", startTs).where("createdAt", "<", endTs).get(),
      db.collection("tokenRequests").where("reviewedAt", ">=", startTs).where("reviewedAt", "<", endTs).get(),
      db.collection("tokenRequests").where("status", "in", ["pending", "awaiting_upload"]).get(),
      db.collection("drawRecords").where("shippingRequestedAt", ">=", startTs).where("shippingRequestedAt", "<", endTs).count().get(),
    ]);
    const requests = new Map();
    [created, reviewed, pending].forEach((result) => result.docs.forEach((doc) => requests.set(doc.id, doc.data())));
    const report = buildMonitorReport({
      startMs: start.getTime(),
      endMs: end.getTime(),
      records: records.docs.map((doc) => doc.data()),
      requests: [...requests.values()],
      shipping: shipping.data().count,
    });
    const [errors, auditEntries] = await Promise.all([
      errorSummary(start.toISOString(), end.toISOString()).catch((error) => ({ unavailable: String(error.message || error) })),
      (async () => {
        const entries = [];
        let pageToken = "";
        do {
          const page = await fetchAuditPage(start, end, pageToken);
          entries.push(...page.entries);
          pageToken = page.nextPageToken;
        } while (pageToken && entries.length < 20000);
        return entries;
      })().catch(() => null),
    ]);
    const audit = auditEntries ? analyzeAuditEntries(auditEntries) : null;
    const stored = {
      ...report,
      errors,
      audit: audit ? { summary: audit.summary, entryCount: audit.entryCount, findings: audit.findings.slice(0, 50) } : { unavailable: true },
    };
    await sessionRef.update({
      status: "completed", endedAt: FieldValue.serverTimestamp(), endedBy: actor.uid,
      endedByEmail: actor.email || "", report: stored,
    });
  } catch (error) {
    // Let the admin try again instead of leaving the session stuck in "stopping".
    await sessionRef.update({ status: "active" });
    throw error;
  }
  await db.collection("adminAuditLogs").add(auditRecord(actor, "monitor:stop", "monitorSessions", sessionRef.id, null, { durationMinutes: Math.round((Date.now() - snapshot.data().startedAt.toMillis()) / 60000) }, request));
  return { ok: true, sessionId: sessionRef.id };
});
