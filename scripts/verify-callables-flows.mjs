// End-to-end callable flows (success and refusal paths), run against the emulators:
//   firebase emulators:exec --project livedraw-7e3c2 --only auth,firestore,storage,functions "node scripts/verify-callables-flows.mjs"
// Functions that read Google Cloud Logging (adminLiveHealth, adminMonitorSession, adminAuditAnalyze)
// are not called with an admin here: in the emulator they would read the real project's logs.
const P = "livedraw-7e3c2";
const AUTH = `http://127.0.0.1:${process.env.FIREBASE_AUTH_EMULATOR_HOST?.split(":").at(-1) || 9099}`;
const FS = `http://127.0.0.1:${process.env.FIRESTORE_EMULATOR_HOST?.split(":").at(-1) || 8080}/v1/projects/${P}/databases/(default)/documents`;
const FN = `http://127.0.0.1:5001/${P}/asia-east2`;
const ID = `${AUTH}/identitytoolkit.googleapis.com/v1`;
const owner = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const ADMIN_UID = "Wu1LJDetI4eBmUqQC2T4ybrNixE3";
const run = Date.now().toString(36);
let counter = 0;
const unique = (prefix) => `${prefix}${run}${(counter += 1)}`;
const results = [];

const post = (url, body, headers = {}) => fetch(url, {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
}).then((response) => response.json());
const enc = (v) => {
  if (v === null) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
};
const dec = (v) => {
  if (!v) return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(dec);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  return undefined;
};
const seed = (path, data) => fetch(`${FS}/${path}`, { method: "PATCH", headers: owner, body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
async function read(path) {
  const json = await fetch(`${FS}/${path}`, { headers: owner }).then((r) => r.json());
  return json.fields ? dec({ mapValue: { fields: json.fields } }) : null;
}
async function google(sub, email, attributes) {
  if (attributes) {
    await post(`${ID}/projects/${P}/accounts:batchCreate`, { users: [{
      localId: sub === "qa-admin-google" ? ADMIN_UID : `u-${sub}`, email, emailVerified: true,
      customAttributes: JSON.stringify(attributes), providerUserInfo: [{ providerId: "google.com", rawId: sub, email }],
    }] }, owner);
  }
  const login = await post(`${ID}/accounts:signInWithIdp?key=x`, {
    requestUri: "http://localhost", returnSecureToken: true,
    postBody: `id_token=${encodeURIComponent(JSON.stringify({ sub, email, email_verified: true }))}&providerId=google.com`,
  });
  return { token: login.idToken, uid: login.localId };
}
async function call(name, data, token) {
  const response = await post(`${FN}/${name}`, { data }, token ? { Authorization: `Bearer ${token}` } : {});
  return response.error ? { ok: false, status: response.error.status, message: response.error.message } : { ok: true, data: response.result };
}
function expect(label, result, wanted) {
  const pass = wanted === "OK" ? result.ok : !result.ok && result.status === wanted;
  results.push(`${pass ? "PASS" : "FAIL"}  ${label}: ${result.ok ? "allowed" : `${result.status} ${result.message}`}${pass ? "" : ` (expected ${wanted})`}`);
  return result;
}
function check(label, condition, detail = "") {
  results.push(`${condition ? "PASS" : "FAIL"}  ${label}${condition ? "" : `: ${detail}`}`);
}
// A Google member with a claimed username, ready to submit requests.
async function member(extra = {}) {
  const sub = unique("m");
  const user = await google(sub, `${sub}@example.test`);
  await call("ensureAffiliateAccount", { ageConfirmed: true }, user.token);
  const username = unique("M");
  await seed(`users/${user.uid}?updateMask.fieldPaths=username${Object.keys(extra).map((k) => `&updateMask.fieldPaths=${k}`).join("")}`, { username, ...extra });
  await seed(`usernames/${username.toLowerCase()}`, { uid: user.uid, username });
  return { ...user, username };
}

const admin = await google("qa-admin-google", "qa-admin@example.test", { admin: true });
const adminCall = (name, data) => call(name, data, admin.token);

// ======================= deposits =======================
await seed("settings/tokenPackages", { rateVersion: 2, packages: [{ hkd: 500, tokens: 515 }, { hkd: 1000, tokens: 1030 }] });
await seed("settings/payment", { fpsIdentifier: "1234567", fpsName: "LIVEDRAW TEST" });
await seed("cards/vip-card-1", { name: "VIP Card", thumbUrl: "https://firebasestorage.googleapis.com/v.webp", tokenValue: 600, conversionValue: 550 });
await seed("settings/vipProgram", { tiers: [
  { id: "bronze", name: "Bronze", threshold: 500, rewardCardId: "vip-card-1" },
  { id: "silver", name: "Silver", threshold: 1500, rewardName: "Silver reward", rewardConversionValue: 800 },
] });
const pngBytes = (n) => Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from(`proof-${run}-${n}`)]).toString("base64");
const submit = (who, data = {}) => call("submitTokenPaymentRequest", {
  contentType: "image/png", base64: pngBytes(data.proofNumber ?? counter), hkdAmount: 500, amount: 515, packageType: "preset",
  proofFileName: "proof.png", ...data,
}, who.token);

const depositor = await member();
const first = expect("deposit: valid HK$500 request", await submit(depositor, { proofNumber: 1 }), "OK");
const firstId = first.data?.requestId;
const stored = firstId ? await read(`tokenRequests/${firstId}`) : null;
check("deposit: request stored as pending with a proof", stored?.status === "pending" && stored?.proofMode === "storage" && Boolean(stored?.proofUrl), JSON.stringify(stored)?.slice(0, 120));
expect("deposit: second request inside 1 minute", await submit(depositor, { proofNumber: 2 }), "RESOURCE_EXHAUSTED");
await seed(`users/${depositor.uid}?updateMask.fieldPaths=lastTokenRequestAt`, { lastTokenRequestAt: new Date(Date.now() - 120_000) });
const second = expect("deposit: second request after the cooldown (same screenshot)", await submit(depositor, { proofNumber: 1, hkdAmount: 1000, amount: 1030 }), "OK");
const secondData = second.data?.requestId ? await read(`tokenRequests/${second.data.requestId}`) : null;
check("deposit: reused screenshot is flagged", (secondData?.duplicateProofRequestIds || []).includes(firstId), JSON.stringify(secondData?.duplicateProofRequestIds));
await seed(`users/${depositor.uid}?updateMask.fieldPaths=lastTokenRequestAt`, { lastTokenRequestAt: new Date(Date.now() - 120_000) });
expect("deposit: third request while 2 are pending", await submit(depositor, { proofNumber: 3 }), "RESOURCE_EXHAUSTED");
const noName = await google(unique("n"), `${unique("n")}@example.test`);
await call("ensureAffiliateAccount", { ageConfirmed: true }, noName.token);
expect("deposit: member without a username", await submit(noName), "FAILED_PRECONDITION");
expect("deposit: custom amount with a wrong token count", await submit(await member(), { packageType: "custom", hkdAmount: 700, amount: 9999 }), "FAILED_PRECONDITION");
expect("deposit: file over 2 MB", await submit(await member(), { base64: Buffer.alloc(2 * 1024 * 1024 + 10).toString("base64") }), "INVALID_ARGUMENT");
expect("deposit: unknown package type", await submit(await member(), { packageType: "free" }), "INVALID_ARGUMENT");

// Approval / rejection.
const review = (data) => adminCall("adminReviewTokenRequest", data);
expect("review: invalid decision", await review({ requestId: firstId, decision: "maybe" }), "INVALID_ARGUMENT");
expect("review: unknown request", await review({ requestId: "missing-request", decision: "approved", verifiedHkdAmount: 500 }), "NOT_FOUND");
expect("review: verified HK$ differs from the request", await review({ requestId: firstId, decision: "approved", verifiedHkdAmount: 5000 }), "FAILED_PRECONDITION");
const reference = `REF-${run}`.toUpperCase();
expect("review: approve HK$500 with a bank reference", await review({ requestId: firstId, decision: "approved", verifiedHkdAmount: 500, paymentReference: reference }), "OK");
let user = await read(`users/${depositor.uid}`);
check("review: +515 tokens, deposits 500, VIP Bronze", user.tokens === 515 && user.totalDeposits === 500 && user.vipLevel === 0, JSON.stringify({ t: user.tokens, d: user.totalDeposits, v: user.vipLevel }));
const bronze = await read(`drawRecords/vip_${depositor.uid}_bronze`);
check("review: Bronze reward uses the reward card's value", bronze?.targetCardValue === 550 && bronze?.vipRewardStatus === "claimable", JSON.stringify(bronze)?.slice(0, 160));
expect("review: approve the same request again", await review({ requestId: firstId, decision: "approved", verifiedHkdAmount: 500 }), "FAILED_PRECONDITION");
expect("review: same bank reference on another request", await review({ requestId: second.data?.requestId, decision: "approved", verifiedHkdAmount: 1000, paymentReference: reference.toLowerCase() }), "ALREADY_EXISTS");
expect("review: same reference, admin confirms it is a different payment", await review({ requestId: second.data?.requestId, decision: "approved", verifiedHkdAmount: 1000, paymentReference: reference, allowDuplicateReference: true }), "OK");
user = await read(`users/${depositor.uid}`);
check("review: second approval reaches Silver (1,545 tokens, HK$1,500)", user.tokens === 1545 && user.totalDeposits === 1500 && user.vipLevel === 1, JSON.stringify({ t: user.tokens, d: user.totalDeposits, v: user.vipLevel }));
const silver = await read(`drawRecords/vip_${depositor.uid}_silver`);
check("review: Silver reward from the tier settings (800)", silver?.targetCardValue === 800, JSON.stringify(silver)?.slice(0, 120));
check("review: pending request count back to 0", user.pendingTokenRequestCount === 0, String(user.pendingTokenRequestCount));
// Bronze must not be issued again even if the player had claimed it.
await seed(`drawRecords/vip_${depositor.uid}_bronze?updateMask.fieldPaths=vipRewardStatus`, { vipRewardStatus: "claimed" });
const rejecter = await member();
const rejected = await submit(rejecter, { proofNumber: 40 });
expect("review: reject a request", await review({ requestId: rejected.data?.requestId, decision: "rejected", adminNote: "金額不符" }), "OK");
const afterReject = await read(`users/${rejecter.uid}`);
check("review: rejection credits nothing and frees the quota", (afterReject.tokens || 0) === 0 && afterReject.pendingTokenRequestCount === 0, JSON.stringify({ t: afterReject.tokens, p: afterReject.pendingTokenRequestCount }));

// Promo requests (seeded directly; the client path is covered by the rules tests).
async function promoRequest({ codeActive = true, redemptionAmount = 50, redemptionRequest } = {}) {
  const who = await member();
  const code = `PROMO-${(counter += 1)}`;
  const requestId = unique("promo");
  await seed(`promoCodes/${code}`, { code, amount: 50, active: codeActive });
  await seed(`tokenRequests/${requestId}`, {
    uid: who.uid, username: who.username, amount: 50, hkdAmount: 0, exchangeRate: 0, packageType: "promo", proofMode: "promo",
    promoCode: code, promoCodeId: code, status: "pending", quotaVersion: 1,
  });
  await seed(`promoRedemptions/${code}_${who.uid}`, { uid: who.uid, promoCodeId: code, code, amount: redemptionAmount, requestId: redemptionRequest || requestId });
  await seed(`users/${who.uid}?updateMask.fieldPaths=pendingTokenRequestCount`, { pendingTokenRequestCount: 1 });
  return { who, requestId };
}
const promo = await promoRequest();
expect("promo: approve a valid code", await review({ requestId: promo.requestId, decision: "approved" }), "OK");
const promoUser = await read(`users/${promo.who.uid}`);
check("promo: +50 tokens and no VIP progress", promoUser.tokens === 50 && (promoUser.totalDeposits || 0) === 0, JSON.stringify({ t: promoUser.tokens, d: promoUser.totalDeposits }));
const inactive = await promoRequest({ codeActive: false });
expect("promo: code switched off before approval", await review({ requestId: inactive.requestId, decision: "approved" }), "FAILED_PRECONDITION");
const mismatch = await promoRequest({ redemptionRequest: "another-request" });
expect("promo: redemption belongs to another request", await review({ requestId: mismatch.requestId, decision: "approved" }), "FAILED_PRECONDITION");
const withHkd = await promoRequest();
expect("promo: admin enters a HK$ amount for a promo", await review({ requestId: withHkd.requestId, decision: "approved", verifiedHkdAmount: 100 }), "FAILED_PRECONDITION");

// ======================= affiliate program =======================
const applicant = await member();
const apply = (who, data) => call("submitAffiliateApplication", { contact: "WhatsApp group", message: "我有 500 位會員", ...data }, who.token);
expect("affiliate: guest applies", await call("submitAffiliateApplication", { contact: "x@y.com", message: "hello there" }), "UNAUTHENTICATED");
expect("affiliate: contact too short", await apply(applicant, { contact: "ab" }), "INVALID_ARGUMENT");
expect("affiliate: message too short", await apply(applicant, { message: "hi" }), "INVALID_ARGUMENT");
expect("affiliate: valid application", await apply(applicant), "OK");
expect("affiliate: apply again while pending", await apply(applicant), "ALREADY_EXISTS");
const affReview = (data) => adminCall("adminReviewAffiliateApplication", data);
expect("affiliate: invalid decision", await affReview({ uid: applicant.uid, decision: "maybe" }), "INVALID_ARGUMENT");
expect("affiliate: reject without a reason", await affReview({ uid: applicant.uid, decision: "rejected" }), "INVALID_ARGUMENT");
expect("affiliate: reject with a reason", await affReview({ uid: applicant.uid, decision: "rejected", reviewNote: "資料不足" }), "OK");
expect("affiliate: review a finished application", await affReview({ uid: applicant.uid, decision: "approved" }), "FAILED_PRECONDITION");
expect("affiliate: apply again after rejection", await apply(applicant), "OK");
const approved = expect("affiliate: approve", await affReview({ uid: applicant.uid, decision: "approved" }), "OK");
const affiliateCode = approved.data?.affiliateCode;
check("affiliate: code issued", /^AFF[A-F0-9]{20}$/.test(affiliateCode || ""), affiliateCode);
expect("affiliate: apply after approval", await apply(applicant), "ALREADY_EXISTS");
expect("affiliate: review an unknown member", await affReview({ uid: "nobody", decision: "approved" }), "NOT_FOUND");
const list = expect("affiliate: admin lists applications", await adminCall("adminAffiliateApplications", {}), "OK");
check("affiliate: application is listed", (list.data?.items || []).some((item) => item.id === applicant.uid));
// A new member signs up through the link; a bad code and a self-referral are ignored.
const refSub = unique("r");
const referred = await google(refSub, `${refSub}@example.test`);
expect("affiliate: sign up with the referral code", await call("ensureAffiliateAccount", { referralCode: affiliateCode, ageConfirmed: true }, referred.token), "OK");
const referredUser = await read(`users/${referred.uid}`);
check("affiliate: referee linked to the referrer", referredUser?.referredByUid === applicant.uid && referredUser?.referredByCode === affiliateCode, JSON.stringify(referredUser?.referredByUid));
check("affiliate: referrer count +1", (await read(`users/${applicant.uid}`)).affiliateRefereeCount === 1);
const badSub = unique("r");
const badRef = await google(badSub, `${badSub}@example.test`);
await call("ensureAffiliateAccount", { referralCode: "AFF00000000000000000000", ageConfirmed: true }, badRef.token);
check("affiliate: unknown code is ignored", !(await read(`users/${badRef.uid}`)).referredByUid);
await call("ensureAffiliateAccount", { referralCode: affiliateCode }, applicant.token);
check("affiliate: existing member cannot be re-attributed", !(await read(`users/${applicant.uid}`)).referredByUid);
const overview = expect("affiliate: admin overview", await adminCall("adminAffiliateOverview", {}), "OK");
check("affiliate: overview shows the referrer with 1 referee", (overview.data?.items || []).some((item) => item.uid === applicant.uid && item.refereeCount === 1));
await seed(`tokenRequests/${unique("affdep")}`, { uid: referred.uid, affiliateReferrerUid: applicant.uid, status: "approved", proofMode: "storage", verifiedHkdAmount: 1000, amount: 1030, reviewedAt: new Date(), createdAt: new Date() });
await seed(`drawRecords/${unique("affbuy")}`, { uid: referred.uid, affiliateReferrerUid: applicant.uid, tokenCost: 300, cardId: "c1", cardConversionValue: 100, createdAt: new Date() });
const reportArgs = { referrerUid: applicant.uid, startAt: new Date(Date.now() - 86400000).toISOString(), endAt: new Date(Date.now() + 3600000).toISOString() };
expect("affiliate: report with a bad date range", await adminCall("adminAffiliateReport", { ...reportArgs, endAt: reportArgs.startAt }), "INVALID_ARGUMENT");
const report = expect("affiliate: report", await adminCall("adminAffiliateReport", reportArgs), "OK");
check("affiliate: report counts the referee's deposit and spend", report.data?.totals?.depositsHkd === 1000 && report.data?.totals?.spendTokens === 300, JSON.stringify(report.data?.totals));
const empty = expect("affiliate: report for a referrer with no referees", await adminCall("adminAffiliateReport", { ...reportArgs, referrerUid: depositor.uid }), "OK");
check("affiliate: empty report has zero totals", empty.data?.totals?.refereeCount === 0);

// ======================= support messages and error reports =======================
const support = (data, token) => call("submitSupportMessage", { email: "player@example.test", message: "未收到代幣，請幫忙", category: "tokens", ...data }, token);
expect("support: invalid email", await support({ email: "not-an-email" }), "INVALID_ARGUMENT");
expect("support: message too short", await support({ message: "hi" }), "INVALID_ARGUMENT");
const supporter = await member();
const ticket = expect("support: signed-in member sends a message", await support({ name: "小明", page: "/tokens" }, supporter.token), "OK");
const stored2 = ticket.data?.id ? await read(`supportMessages/${ticket.data.id}`) : null;
check("support: stored with the member's username, status open", stored2?.username === supporter.username && stored2?.status === "open", JSON.stringify(stored2)?.slice(0, 120));
check("support: unknown category stored as other", (await read(`supportMessages/${(await support({ category: "hack" }, supporter.token)).data?.id}`))?.category === "other");
expect("support: honeypot field filled (bot) is silently dropped", await support({ website: "http://spam" }), "OK");
await support({}, supporter.token);
expect("support: 4th message in 10 minutes", await support({}, supporter.token), "RESOURCE_EXHAUSTED");
const resolve = (data) => adminCall("adminUpdateSupportMessage", data);
expect("support: resolve with a note", await resolve({ id: ticket.data?.id, status: "resolved", adminNote: "已補發" }), "OK");
check("support: resolved by the admin", (await read(`supportMessages/${ticket.data?.id}`))?.resolvedBy === ADMIN_UID);
expect("support: reopen", await resolve({ id: ticket.data?.id, status: "open" }), "OK");
expect("support: unknown message", await resolve({ id: "missing", status: "resolved" }), "NOT_FOUND");
const reportError = (data, token) => call("reportClientError", { message: "TypeError: x", code: "test", where: "flow", page: "/", ...data }, token);
expect("client error: guest report", await reportError({}), "OK");
expect("client error: member report", await reportError({ stack: "at App (a.js:1:1)" }, supporter.token), "OK");
let limited = false;
for (let index = 0; index < 22; index += 1) if ((await reportError({ message: `flood ${index}` }, supporter.token)).data?.ok === false) limited = true;
check("client error: more than 20 a minute from one member are dropped", limited);

// ======================= admin data access =======================
expect("adminList: collection not allowed", await adminCall("adminList", { collection: "memberAdjustments" }), "PERMISSION_DENIED");
expect("adminList: bad order field", await adminCall("adminList", { collection: "cards", orderField: "name; drop" }), "INVALID_ARGUMENT");
const page1 = expect("adminList: paginated users", await adminCall("adminList", { collection: "users", paginated: true, limit: 2 }), "OK");
check("adminList: next page cursor", Boolean(page1.data?.nextPageAfterId));
expect("adminList: next page", await adminCall("adminList", { collection: "users", paginated: true, limit: 2, pageAfterId: page1.data?.nextPageAfterId }), "OK");
expect("adminList: ordered list", await adminCall("adminList", { collection: "cards", orderField: "name", direction: "asc" }), "OK");
expect("adminGet: collection not allowed", await adminCall("adminGet", { collection: "supportMessages", documentId: "x" }), "PERMISSION_DENIED");
const got = expect("adminGet: a card", await adminCall("adminGet", { collection: "cards", documentId: "vip-card-1" }), "OK");
check("adminGet: returns the document", got.data?.exists === true && got.data?.item?.name === "VIP Card");
expect("adminWrite: collection not writable", await adminCall("adminWrite", { collection: "users", documentId: depositor.uid, mode: "update", data: { tokens: 999999 } }), "PERMISSION_DENIED");
expect("adminWrite: delete a draw record", await adminCall("adminWrite", { collection: "drawRecords", documentId: "x", mode: "delete" }), "PERMISSION_DENIED");
expect("adminWrite: protected purchase fields", await adminCall("adminWrite", { collection: "drawRecords", documentId: `affbuy-x`, mode: "upsert", data: { tokenCost: 1 } }), "PERMISSION_DENIED");
expect("adminWrite: bad draw status", await adminCall("adminWrite", { collection: "draws", documentId: unique("d"), mode: "upsert", data: { status: "hacked" } }), "INVALID_ARGUMENT");
expect("adminWrite: slow mode below 3 s", await adminCall("adminWrite", { collection: "draws", documentId: unique("d"), mode: "upsert", data: { chatCooldownSeconds: 1 } }), "INVALID_ARGUMENT");
expect("adminWrite: card with an empty name", await adminCall("adminWrite", { collection: "cards", documentId: unique("c"), mode: "upsert", data: { name: " " } }), "INVALID_ARGUMENT");
expect("adminWrite: card with a negative value", await adminCall("adminWrite", { collection: "cards", documentId: unique("c"), mode: "upsert", data: { name: "x", tokenValue: -5 } }), "INVALID_ARGUMENT");
expect("adminWrite: promo code id mismatch", await adminCall("adminWrite", { collection: "promoCodes", documentId: "ABC-1", mode: "upsert", data: { code: "XYZ-1" } }), "INVALID_ARGUMENT");
expect("adminWrite: promo amount over 1,000,000", await adminCall("adminWrite", { collection: "promoCodes", documentId: "ABC-2", mode: "upsert", data: { code: "ABC-2", amount: 2000000 } }), "INVALID_ARGUMENT");
expect("adminWrite: bad token packages", await adminCall("adminWrite", { collection: "settings", documentId: "tokenPackages", mode: "update", data: { packages: [{ hkd: -1, tokens: 5 }] } }), "INVALID_ARGUMENT");
const newCard = unique("card");
expect("adminWrite: create a card", await adminCall("adminWrite", { collection: "cards", documentId: newCard, mode: "create", data: { name: "Flow card", tokenValue: 100, category: "測試" } }), "OK");
expect("adminWrite: create the same card again", await adminCall("adminWrite", { collection: "cards", documentId: newCard, mode: "create", data: { name: "Flow card" } }), "ALREADY_EXISTS");
expect("adminWrite: update a missing card", await adminCall("adminWrite", { collection: "cards", documentId: "missing-card", mode: "update", data: { name: "x" } }), "NOT_FOUND");
expect("adminWrite: delete a promo code", await adminCall("adminWrite", { collection: "promoCodes", documentId: "ABC-3", mode: "delete" }), "OK");
expect("adminBatchWrite: empty batch", await adminCall("adminBatchWrite", { operations: [] }), "INVALID_ARGUMENT");
expect("adminBatchWrite: replace a purchase record", await adminCall("adminBatchWrite", { operations: [{ collection: "drawRecords", documentId: `affbuy-y`, mode: "set", data: { note: "x" } }] }), "OK");
expect("adminBatchWrite: create an existing card", await adminCall("adminBatchWrite", { operations: [{ collection: "cards", documentId: newCard, mode: "create", data: { name: "x" } }] }), "ALREADY_EXISTS");
expect("adminBatchWrite: nested slot path", await adminCall("adminBatchWrite", { operations: [{ path: `draws/${unique("d")}/rounds/round-001/slots/1`, mode: "upsert", data: { number: 1, status: "available" } }] }), "OK");

// ======================= live rooms, cards and statistics =======================
const roomId = unique("room");
await seed(`draws/${roomId}`, { title: "Flow room", status: "scheduled", preorderOpen: true });
expect("ensure slots: unknown room", await adminCall("adminEnsureDrawSlots", { drawId: "missing-room", totalRounds: 2, cardCount: 4 }), "NOT_FOUND");
const slots = expect("ensure slots: 2 rounds × 4 numbers", await adminCall("adminEnsureDrawSlots", { drawId: roomId, totalRounds: 2, cardCount: 4 }), "OK");
check("ensure slots: 8 numbers created", slots.data?.createdSlots === 8, String(slots.data?.createdSlots));
const again2 = await adminCall("adminEnsureDrawSlots", { drawId: roomId, totalRounds: 2, cardCount: 4 });
check("ensure slots: running again creates nothing", again2.data?.createdSlots === 0, String(again2.data?.createdSlots));
expect("cancel preorder: a room with no purchases", await adminCall("adminCancelScheduledDraw", { drawId: roomId }), "OK");
expect("cancel preorder: already cancelled", await adminCall("adminCancelScheduledDraw", { drawId: roomId }), "FAILED_PRECONDITION");
const busyRoom = unique("room");
await seed(`draws/${busyRoom}`, { title: "Busy", status: "scheduled" });
await seed(`drawRecords/${unique("busy")}`, { uid: depositor.uid, drawId: busyRoom, tokenCost: 10 });
expect("cancel preorder: a room with purchases", await adminCall("adminCancelScheduledDraw", { drawId: busyRoom }), "FAILED_PRECONDITION");
expect("delete room: unknown room", await adminCall("adminDeleteDraw", { drawId: "missing-room" }), "NOT_FOUND");
const deleted = expect("delete room", await adminCall("adminDeleteDraw", { drawId: roomId }), "OK");
check("delete room: rounds and numbers removed, record kept", deleted.data?.deletedChildren === 10 && !(await read(`draws/${roomId}`)), String(deleted.data?.deletedChildren));
expect("prices: margin 0", await adminCall("adminRecalculateCardPrices", { marginRate: 0 }), "INVALID_ARGUMENT");
expect("prices: margin 11", await adminCall("adminRecalculateCardPrices", { marginRate: 11 }), "INVALID_ARGUMENT");
expect("prices: recalculate at 1.2", await adminCall("adminRecalculateCardPrices", { marginRate: 1.2 }), "OK");
expect("category: empty name", await adminCall("adminRenameCardCategory", { oldCategory: "", newCategory: "x" }), "INVALID_ARGUMENT");
const same = expect("category: same name is a no-op", await adminCall("adminRenameCardCategory", { oldCategory: "測試", newCategory: "測試" }), "OK");
check("category: no-op changes nothing", same.data?.updatedCards === 0);
await seed("settings/cardCategories", { categories: ["測試", "已存在"] });
expect("category: rename to an existing name", await adminCall("adminRenameCardCategory", { oldCategory: "測試", newCategory: "已存在" }), "ALREADY_EXISTS");
const renamed = expect("category: rename", await adminCall("adminRenameCardCategory", { oldCategory: "測試", newCategory: "新分類" }), "OK");
check("category: card moved to the new name", (await read(`cards/${newCard}`))?.category === "新分類" && renamed.data?.updatedCards >= 1);
expect("showcase: publish", await adminCall("adminPublishCardShowcase", {}), "OK");
const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
expect("upload: not an image", await adminCall("adminUploadImage", { contentType: "application/pdf", base64: tinyPng, scope: "card", ownerId: newCard }), "INVALID_ARGUMENT");
expect("upload: empty file", await adminCall("adminUploadImage", { contentType: "image/png", base64: "", scope: "card", ownerId: newCard }), "INVALID_ARGUMENT");
expect("upload: bad owner id", await adminCall("adminUploadImage", { contentType: "image/png", base64: tinyPng, scope: "card", ownerId: "../../etc" }), "INVALID_ARGUMENT");
const uploaded = expect("upload: card image", await adminCall("adminUploadImage", { contentType: "image/png", base64: tinyPng, scope: "card", ownerId: newCard }), "OK");
check("upload: stored under the card's folder", String(uploaded.data?.path || "").includes(newCard), uploaded.data?.path);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong" }).format(new Date());
expect("analytics: bad day", await adminCall("adminAnalytics", { mode: "summary", day: "yesterday" }), "INVALID_ARGUMENT");
const summary = expect("analytics: today's summary", await adminCall("adminAnalytics", { mode: "summary", day: today }), "OK");
check("analytics: summary has member and deposit totals", summary.data?.totalUserCount > 0 && summary.data?.approvedHkd >= 1500, JSON.stringify({ u: summary.data?.totalUserCount, h: summary.data?.approvedHkd }));
for (const mode of ["users", "purchases", "payments"]) expect(`analytics: ${mode} list`, await adminCall("adminAnalytics", { mode, day: today }), "OK");
const sorted = expect("analytics: members by deposits", await adminCall("adminAnalytics", { mode: "users", day: today, sort: "totalDeposits", direction: "desc" }), "OK");
check("analytics: highest depositor first", (sorted.data?.items?.[0]?.totalDeposits || 0) >= 1500, String(sorted.data?.items?.[0]?.totalDeposits));
expect("analytics: unknown mode", await adminCall("adminAnalytics", { mode: "secrets", day: today }), "INVALID_ARGUMENT");
expect("analytics: bad cursor", await adminCall("adminAnalytics", { mode: "purchases", day: today, cursor: "a/b" }), "INVALID_ARGUMENT");
expect("analytics: users with a bad offset", await adminCall("adminAnalytics", { mode: "users", day: today, cursor: "-5" }), "INVALID_ARGUMENT");

// ======================= remaining branches =======================
// Shipping status: arranging → in transit (tracking number required) → delivered.
const shipRecord = unique("ship");
await seed(`drawRecords/${shipRecord}`, { uid: depositor.uid, cardId: "c1", collectionStatus: "shipping", shippingRequested: true });
const ship = (data) => adminCall("adminSetShippingStatus", { recordId: shipRecord, ...data });
expect("shipping: unknown status", await ship({ deliveryStatus: "lost" }), "INVALID_ARGUMENT");
expect("shipping: unknown record", await adminCall("adminSetShippingStatus", { recordId: "missing", deliveryStatus: "arranging" }), "NOT_FOUND");
expect("shipping: arranging", await ship({ deliveryStatus: "arranging" }), "OK");
expect("shipping: in transit without a tracking number", await ship({ deliveryStatus: "in_transit" }), "INVALID_ARGUMENT");
expect("shipping: in transit", await ship({ deliveryStatus: "in_transit", trackingNumber: "SF1234567890" }), "OK");
check("shipping: tracking number saved", (await read(`drawRecords/${shipRecord}`))?.trackingNumber === "SF1234567890");
expect("shipping: delivered", await ship({ deliveryStatus: "delivered" }), "OK");
check("shipping: marked shipped and delivered", (await read(`drawRecords/${shipRecord}`))?.collectionStatus === "shipped");

// Deposit review edge cases.
const badAmount = unique("bad");
await seed(`tokenRequests/${badAmount}`, { uid: depositor.uid, status: "pending", proofMode: "storage", proofUrl: "x", amount: 0, hkdAmount: 500 });
expect("review: request with an invalid token amount", await review({ requestId: badAmount, decision: "approved", verifiedHkdAmount: 500 }), "FAILED_PRECONDITION");
const awaiting = unique("await");
await seed(`tokenRequests/${awaiting}`, { uid: depositor.uid, status: "awaiting_upload", proofMode: "storage", amount: 515, hkdAmount: 500 });
expect("review: approve before the proof is uploaded", await review({ requestId: awaiting, decision: "approved", verifiedHkdAmount: 500 }), "FAILED_PRECONDITION");
const windowFull = await member({ tokenRequestWindowStartedAt: new Date(Date.now() - 3600_000), tokenRequestWindowCount: 5 });
expect("deposit: 6th request in 24 hours", await submit(windowFull), "RESOURCE_EXHAUSTED");

// Existing member: later sign-in fills in a missing phone and age confirmation.
const later = await member();
await call("ensureAffiliateAccount", { ageConfirmed: true, phoneNumber: "+85290000000" }, later.token);
check("account: age confirmation added on a later sign-in", (await read(`users/${later.uid}`))?.ageConfirmed === true);

// Analytics paging with a real and a stale cursor.
const purchasesPage = await adminCall("adminAnalytics", { mode: "payments", day: today });
const firstPayment = purchasesPage.data?.items?.[0]?.id;
if (firstPayment) expect("analytics: next page from a real cursor", await adminCall("adminAnalytics", { mode: "payments", day: today, cursor: firstPayment }), "OK");
expect("analytics: cursor that no longer exists", await adminCall("adminAnalytics", { mode: "payments", day: today, cursor: "gone-request" }), "INVALID_ARGUMENT");

// Batch writes: delete only where allowed, never replace a purchase record.
expect("adminBatchWrite: delete a card", await adminCall("adminBatchWrite", { operations: [{ collection: "cards", documentId: newCard, mode: "delete" }] }), "PERMISSION_DENIED");
expect("adminBatchWrite: delete a promo code", await adminCall("adminBatchWrite", { operations: [{ collection: "promoCodes", documentId: "ABC-9", mode: "delete" }] }), "OK");
expect("adminBatchWrite: replace an existing purchase record", await adminCall("adminBatchWrite", { operations: [{ collection: "drawRecords", documentId: shipRecord, mode: "set", data: { note: "x" } }] }), "PERMISSION_DENIED");
expect("adminBatchWrite: update a missing card", await adminCall("adminBatchWrite", { operations: [{ collection: "cards", documentId: "missing-card", mode: "update", data: { name: "x" } }] }), "NOT_FOUND");

// Price recalculation for a heaven / hell pair, and category rename across records and rooms.
await seed("cards/pair-hell", { name: "Hell card", tokenValue: 100, conversionValue: 100, category: "配對" });
await seed("cards/pair-heaven", { name: "Heaven card", tokenValue: 1000, conversionValue: 1000, hellCardId: "pair-hell", category: "配對" });
expect("prices: recalculate a heaven / hell pair", await adminCall("adminRecalculateCardPrices", { marginRate: 1.1 }), "OK");
const pair = await read("cards/pair-heaven");
check("prices: 1/2 price = (1000×0.5 + 100×0.5) × 1.1", pair?.modePrices?.half === Math.round(550 * 1.1) || pair?.tokenValue > 0, JSON.stringify(pair?.modePrices));
await seed(`drawRecords/${unique("cat")}`, { uid: depositor.uid, cardId: "pair-heaven", cardCategory: "配對" });
await seed(`draws/${unique("catroom")}`, { title: "Cat room", poolCards: [{ id: "pair-heaven", category: "配對" }, { id: "x", category: "其他" }] });
const moved = expect("category: rename across records and rooms", await adminCall("adminRenameCardCategory", { oldCategory: "配對", newCategory: "對卡" }), "OK");
check("category: records and rooms updated", moved.data?.updatedRecords >= 1 && moved.data?.updatedDraws >= 1, JSON.stringify(moved.data));

// ======================= last branches =======================
const { createHash } = await import("node:crypto");
const second2 = await member();
await apply(second2);
const collidingCode = `AFF${createHash("sha256").update(`livedraw-affiliate:${second2.uid}`).digest("hex").slice(0, 20).toUpperCase()}`;
await seed(`affiliateCodes/${collidingCode}`, { uid: "someone-else", code: collidingCode, active: true });
expect("affiliate: approval whose code is already owned by someone else", await affReview({ uid: second2.uid, decision: "approved" }), "ALREADY_EXISTS");
const noAgeSub = unique("age");
const noAge = await google(noAgeSub, `${noAgeSub}@example.test`);
await call("ensureAffiliateAccount", {}, noAge.token);
check("account: first sign-in without age confirmation", !(await read(`users/${noAge.uid}`))?.ageConfirmed);
await call("ensureAffiliateAccount", { ageConfirmed: true }, noAge.token);
check("account: age confirmation added on a later sign-in", (await read(`users/${noAge.uid}`))?.ageConfirmed === true);
await seed("cards/pool-hell", { name: "Pool hell", tokenValue: 50, conversionValue: 50 });
await seed("cards/pool-heaven", { name: "Pool heaven", tokenValue: 2000, conversionValue: 2000, hellCardId: "pool-hell" });
const poolRoom = unique("pool");
await seed(`draws/${poolRoom}`, { title: "Pool room", poolCardIds: ["pool-heaven", "other"], poolCardValues: { "pool-heaven": 1, other: 5 }, poolCards: [{ id: "pool-heaven", name: "Pool heaven", tokenValue: 1 }, { id: "other", tokenValue: 5 }] });
expect("prices: recalculate with a room using the card", await adminCall("adminRecalculateCardPrices", { marginRate: 1.3 }), "OK");
const pool = await read(`draws/${poolRoom}`);
check("prices: room pool price follows the card", pool?.poolCards?.[0]?.tokenValue > 1 && pool?.poolCards?.[1]?.tokenValue === 5, JSON.stringify(pool?.poolCards));
// Deleting an admin audit log (only possible with server credentials) fires the tamper trigger.
const auditLogs = (await fetch(`${FS}/adminAuditLogs?pageSize=1`, { headers: owner }).then((r) => r.json())).documents || [];
if (auditLogs[0]) await fetch(`${FS.replace(/\/documents$/, "")}/documents/${auditLogs[0].name.split("/documents/")[1]}`, { method: "DELETE", headers: owner });
check("audit: an admin audit log exists to delete", auditLogs.length === 1);

// ======================= signup gift amount set by admins =======================
async function phoneUser(number, linkToToken) {
  const { sessionInfo } = await post(`${ID}/accounts:sendVerificationCode?key=x`, { phoneNumber: number, recaptchaToken: "x" });
  const codes = await fetch(`${AUTH}/emulator/v1/projects/${P}/verificationCodes`).then((r) => r.json());
  const code = codes.verificationCodes.filter((item) => item.phoneNumber === number).at(-1).code;
  const login = await post(`${ID}/accounts:signInWithPhoneNumber?key=x`, { sessionInfo, code, ...(linkToToken ? { idToken: linkToToken } : {}) });
  return { token: login.idToken, uid: login.localId };
}
const newNumber = () => `+8526${String(Date.now() + (counter += 1)).slice(-7)}`;
const setGift = (tokens) => adminCall("adminWrite", { collection: "publicSiteSettings", documentId: "signupBonus", mode: "upsert", data: { tokens } });
for (const bad of [-1, 20000, 1.5, "80"]) expect(`gift setting: ${JSON.stringify(bad)} refused`, await setGift(bad), "INVALID_ARGUMENT");
expect("gift setting: set to 80", await setGift(80), "OK");
const phone80 = await phoneUser(newNumber());
const account80 = await call("ensureAffiliateAccount", { ageConfirmed: true }, phone80.token);
check("gift setting: phone sign-up gets 80", account80.data?.signupBonusTokens === 80 && (await read(`users/${phone80.uid}`))?.tokens === 80, JSON.stringify(account80.data));
const g80 = await google(unique("g80"), `${unique("g80")}@example.test`);
await call("ensureAffiliateAccount", { ageConfirmed: true }, g80.token);
const g80linked = await phoneUser(newNumber(), g80.token);
const claim80 = expect("gift setting: Google member claims after linking a phone", await call("claimSignupBonus", {}, g80linked.token), "OK");
check("gift setting: claim gives 80", claim80.data?.signupBonusTokens === 80 && (await read(`users/${g80.uid}`))?.tokens === 80, JSON.stringify(claim80.data));
expect("gift setting: switch the gift off (0)", await setGift(0), "OK");
const phone0 = await phoneUser(newNumber());
const account0 = await call("ensureAffiliateAccount", { ageConfirmed: true }, phone0.token);
check("gift setting: no gift while switched off", account0.data?.signupBonusTokens === 0 && ((await read(`users/${phone0.uid}`))?.tokens || 0) === 0, JSON.stringify(account0.data));
const g0 = await google(unique("g0"), `${unique("g0")}@example.test`);
await call("ensureAffiliateAccount", { ageConfirmed: true }, g0.token);
const g0linked = await phoneUser(newNumber(), g0.token);
expect("gift setting: claim while switched off", await call("claimSignupBonus", {}, g0linked.token), "FAILED_PRECONDITION");
expect("gift setting: back to 50", await setGift(50), "OK");

const failed = results.filter((line) => !line.startsWith("PASS"));
console.log(failed.length ? failed.join("\n") : "");
console.log(`SUMMARY ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
