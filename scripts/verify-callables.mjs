// Security tests for the Cloud Functions callables, run against the emulators:
//   firebase emulators:exec --project livedraw-7e3c2 --only auth,firestore,functions "node scripts/verify-callables.mjs"
// Every unsafe call must be refused with the expected error; safe calls must succeed.
// Uses the QA admin (uid Wu1LJDetI4eBmUqQC2T4ybrNixE3, must be in ADMIN_UID_ALLOWLIST).
const P = "livedraw-7e3c2";
const AUTH = `http://127.0.0.1:${process.env.FIREBASE_AUTH_EMULATOR_HOST?.split(":").at(-1) || 9099}`;
const FS = `http://127.0.0.1:${process.env.FIRESTORE_EMULATOR_HOST?.split(":").at(-1) || 8080}/v1/projects/${P}/databases/(default)/documents`;
const FN = `http://127.0.0.1:5001/${P}/asia-east2`;
const ID = `${AUTH}/identitytoolkit.googleapis.com/v1`;
const owner = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const ADMIN_UID = "Wu1LJDetI4eBmUqQC2T4ybrNixE3";
const stamp = Date.now().toString(36);
const results = [];

const post = (url, body, headers = {}) => fetch(url, {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
}).then((response) => response.json());
const s = (v) => ({ stringValue: v });
const i = (v) => ({ integerValue: String(v) });
const b = (v) => ({ booleanValue: v });
const ts = (iso) => ({ timestampValue: iso });
const seed = (path, fields) => fetch(`${FS}/${path}`, { method: "PATCH", headers: owner, body: JSON.stringify({ fields }) });
const read = async (path) => (await fetch(`${FS}/${path}`, { headers: owner }).then((r) => r.json())).fields || null;
const count = async (collection) => ((await fetch(`${FS}/${collection}?pageSize=300`, { headers: owner }).then((r) => r.json())).documents || []).length;

async function google(sub, email, attributes) {
  if (attributes) {
    await post(`${ID}/projects/${P}/accounts:batchCreate`, { users: [{
      localId: sub === "qa-admin-google" ? ADMIN_UID : `u-${sub}`, email, emailVerified: true, customAttributes: JSON.stringify(attributes),
      providerUserInfo: [{ providerId: "google.com", rawId: sub, email }],
    }] }, owner);
  }
  const login = await post(`${ID}/accounts:signInWithIdp?key=x`, {
    requestUri: "http://localhost", returnSecureToken: true,
    postBody: `id_token=${encodeURIComponent(JSON.stringify({ sub, email, email_verified: true }))}&providerId=google.com`,
  });
  return { token: login.idToken, uid: login.localId };
}
async function phone(number, linkToToken) {
  const { sessionInfo } = await post(`${ID}/accounts:sendVerificationCode?key=x`, { phoneNumber: number, recaptchaToken: "x" });
  const codes = await fetch(`${AUTH}/emulator/v1/projects/${P}/verificationCodes`).then((r) => r.json());
  const code = codes.verificationCodes.filter((item) => item.phoneNumber === number).at(-1).code;
  const login = await post(`${ID}/accounts:signInWithPhoneNumber?key=x`, { sessionInfo, code, ...(linkToToken ? { idToken: linkToToken } : {}) });
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
  results.push(`${condition ? "PASS" : "FAIL"}  ${label}${detail ? `: ${detail}` : ""}`);
}

// ---- identities ----
const admin = await google("qa-admin-google", "qa-admin@example.test", { admin: true });
const rogue = await google(`rogue-${stamp}`, `rogue-${stamp}@example.test`, { admin: true }); // admin claim, not allow-listed
const player = await phone(`+8529${String(Date.now()).slice(-7)}`);
await call("ensureAffiliateAccount", { ageConfirmed: true }, player.token);

// ---- A. every admin callable refuses guests, players and non-allow-listed admins ----
const ADMIN_CALLABLES = [
  "adminSession", "adminAffiliateOverview", "adminAffiliateApplications", "adminReviewAffiliateApplication",
  "adminAffiliateReport", "adminList", "adminGet", "adminAnalytics", "adminWrite", "adminBatchWrite",
  "adminReviewTokenRequest", "adminAdjustMember", "adminSetShippingStatus", "adminEnsureDrawSlots",
  "adminRecalculateCardPrices", "adminRenameCardCategory", "adminPublishCardShowcase", "adminDeleteDraw",
  "adminCancelScheduledDraw", "adminUploadImage", "adminAuditAnalyze", "adminUpdateSupportMessage",
  "adminLiveHealth", "adminMonitorSession",
];
// Every exported admin* callable must be in the list above, so a new one cannot be missed.
const { readFileSync } = await import("node:fs");
const exported = [...readFileSync(new URL("../functions/src/index.js", import.meta.url), "utf8")
  .matchAll(/^export const (admin[A-Za-z]+) = onCall/gm)].map((match) => match[1]);
const missing = exported.filter((name) => !ADMIN_CALLABLES.includes(name));
check("every admin callable is covered by this test", missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : `${exported.length} callables`);
for (const name of ADMIN_CALLABLES) {
  expect(`${name}: guest`, await call(name, {}), "UNAUTHENTICATED");
  expect(`${name}: player`, await call(name, {}, player.token), "PERMISSION_DENIED");
  expect(`${name}: admin claim but not allow-listed`, await call(name, {}, rogue.token), "PERMISSION_DENIED");
}

// ---- B. 會員調整 ----
const memberUid = `member-${stamp}`;
await seed(`users/${memberUid}`, { uid: s(memberUid), username: s(`M${stamp}`), tokens: i(100), role: s("user") });
await seed(`users/${ADMIN_UID}`, { uid: s(ADMIN_UID), username: s("QAAdmin"), tokens: i(0), role: s("user") });
await seed(`cards/live-${stamp}`, { name: s("Live card"), tokenValue: i(500), conversionValue: i(400) });
await seed(`cards/old-${stamp}`, { name: s("Archived card"), tokenValue: i(500), archived: b(true) });
await seed(`drawRecords/pending-${stamp}`, { uid: s(memberUid), cardId: s(`live-${stamp}`), collectionStatus: s("pending") });
await seed(`drawRecords/converted-${stamp}`, { uid: s(memberUid), cardId: s(`live-${stamp}`), collectionStatus: s("converted"), convertedToTokens: b(true) });
await seed(`drawRecords/shipping-${stamp}`, { uid: s(memberUid), cardId: s(`live-${stamp}`), collectionStatus: s("shipping") });
await seed(`drawRecords/own-${stamp}`, { uid: s(ADMIN_UID), cardId: s(`live-${stamp}`), collectionStatus: s("pending") });
const adjust = (data) => call("adminAdjustMember", data, admin.token);
const before = await count("memberAdjustments");

expect("player calls adminAdjustMember", await call("adminAdjustMember", { action: "tokens", uid: player.uid, delta: 999, reason: "test" }, player.token), "PERMISSION_DENIED");
expect("adjust own tokens", await adjust({ action: "tokens", uid: ADMIN_UID, delta: 500, reason: "own" }), "PERMISSION_DENIED");
expect("adjust without a reason", await adjust({ action: "tokens", uid: memberUid, delta: 5, reason: " " }), "INVALID_ARGUMENT");
expect("adjust by 0", await adjust({ action: "tokens", uid: memberUid, delta: 0, reason: "zero" }), "INVALID_ARGUMENT");
expect("adjust by a fraction", await adjust({ action: "tokens", uid: memberUid, delta: 1.5, reason: "fraction" }), "INVALID_ARGUMENT");
expect("adjust over the 1,000,000 cap", await adjust({ action: "tokens", uid: memberUid, delta: 2000000, reason: "huge" }), "INVALID_ARGUMENT");
expect("deduct below zero", await adjust({ action: "tokens", uid: memberUid, delta: -101, reason: "overdraw" }), "FAILED_PRECONDITION");
check("balance unchanged after refused calls", (await read(`users/${memberUid}`)).tokens.integerValue === "100");
expect("add 50 tokens", await adjust({ action: "tokens", uid: memberUid, delta: 50, reason: "compensation" }), "OK");
check("balance is 150", (await read(`users/${memberUid}`)).tokens.integerValue === "150");
expect("give an archived card", await adjust({ action: "giveCard", uid: memberUid, cardId: `old-${stamp}`, reason: "gift" }), "NOT_FOUND");
expect("give a card to own account", await adjust({ action: "giveCard", uid: ADMIN_UID, cardId: `live-${stamp}`, reason: "gift" }), "PERMISSION_DENIED");
const gift = expect("give a card (client-sent value ignored)", await adjust({ action: "giveCard", uid: memberUid, cardId: `live-${stamp}`, reason: "prize", cardConversionValue: 999999 }), "OK");
if (gift.ok) {
  const record = await read(`drawRecords/${gift.data.recordId}`);
  check("gift uses the library conversion value", record.cardConversionValue.integerValue === "400", record.cardConversionValue.integerValue);
  check("gift is marked source admin, not a purchase", record.source.stringValue === "admin" && record.tokenCost.integerValue === "0");
}
expect("void a converted card", await adjust({ action: "voidCard", recordId: `converted-${stamp}`, reason: "mistake" }), "FAILED_PRECONDITION");
expect("void a card in shipping", await adjust({ action: "voidCard", recordId: `shipping-${stamp}`, reason: "mistake" }), "FAILED_PRECONDITION");
expect("void own card", await adjust({ action: "voidCard", recordId: `own-${stamp}`, reason: "mistake" }), "PERMISSION_DENIED");
expect("void a pending card", await adjust({ action: "voidCard", recordId: `pending-${stamp}`, reason: "wrong card" }), "OK");
expect("void the same card again", await adjust({ action: "voidCard", recordId: `pending-${stamp}`, reason: "again" }), "FAILED_PRECONDITION");
expect("unknown action", await adjust({ action: "deleteUser", uid: memberUid, reason: "x" }), "INVALID_ARGUMENT");
check("3 successful changes logged in memberAdjustments", (await count("memberAdjustments")) - before === 3, `${(await count("memberAdjustments")) - before} new`);

// ---- C. converted / voided cards can never be shipped ----
for (const id of [`converted-${stamp}`, `pending-${stamp}`]) {
  const label = id.startsWith("converted") ? "converted" : "voided";
  expect(`配送狀態 on a ${label} card`, await call("adminSetShippingStatus", { recordId: id, deliveryStatus: "arranging" }, admin.token), "FAILED_PRECONDITION");
  expect(`adminWrite ships a ${label} card`, await call("adminWrite", { collection: "drawRecords", documentId: id, mode: "update", data: { collectionStatus: "shipping" } }, admin.token), "FAILED_PRECONDITION");
  expect(`adminBatchWrite ships a ${label} card`, await call("adminBatchWrite", { operations: [{ collection: "drawRecords", documentId: id, mode: "update", data: { collectionStatus: "shipped" } }] }, admin.token), "FAILED_PRECONDITION");
}

// ---- D. signup gift: SMS-verified phone only, once per number ----
const number = `+8529${String(Date.now() + 7).slice(-7)}`;
const first = await phone(number);
const firstAccount = expect("phone sign-up", await call("ensureAffiliateAccount", { ageConfirmed: true }, first.token), "OK");
check("phone sign-up gets 50 tokens", firstAccount.data?.signupBonusTokens === 50, String(firstAccount.data?.signupBonusTokens));
await post(`${ID}/accounts:delete?key=x`, { idToken: first.token });
const again = await phone(number);
const againAccount = await call("ensureAffiliateAccount", { ageConfirmed: true }, again.token);
check("same number after deleting the account gets 0", againAccount.data?.signupBonusTokens === 0, String(againAccount.data?.signupBonusTokens));
const passwordOnly = await post(`${ID}/accounts:signUp?key=x`, { email: `squat-${stamp}@example.test`, password: "notarealpw1", returnSecureToken: true });
expect("email/password account without a phone becomes a member", await call("ensureAffiliateAccount", {}, passwordOnly.idToken), "PERMISSION_DENIED");
const gUser = await google(`gift-${stamp}`, `gift-${stamp}@example.test`);
const gAccount = await call("ensureAffiliateAccount", { ageConfirmed: true }, gUser.token);
check("Google sign-up gets 0", gAccount.data?.signupBonusTokens === 0, String(gAccount.data?.signupBonusTokens));
expect("Google member claims without a phone", await call("claimSignupBonus", {}, gUser.token), "FAILED_PRECONDITION");
const usedNumber = await phone(number, gUser.token);
expect("Google member links a number that already got the gift", await call("claimSignupBonus", {}, usedNumber.token || gUser.token), usedNumber.token ? "ALREADY_EXISTS" : "FAILED_PRECONDITION");
const g2 = await google(`gift2-${stamp}`, `gift2-${stamp}@example.test`);
await call("ensureAffiliateAccount", { ageConfirmed: true }, g2.token);
const linked = await phone(`+8529${String(Date.now() + 13).slice(-7)}`, g2.token);
expect("Google member claims after linking a new number", await call("claimSignupBonus", {}, linked.token), "OK");
expect("same member claims twice", await call("claimSignupBonus", {}, linked.token), "ALREADY_EXISTS");
const old = await google(`old-${stamp}`, `old-${stamp}@example.test`);
await call("ensureAffiliateAccount", { ageConfirmed: true }, old.token);
await fetch(`${FS}/users/${old.uid}?updateMask.fieldPaths=createdAt`, { method: "PATCH", headers: owner, body: JSON.stringify({ fields: { createdAt: ts("2026-09-20T00:00:00Z") } }) });
const oldLinked = await phone(`+8529${String(Date.now() + 19).slice(-7)}`, old.token);
expect("member who joined before the gift existed", await call("claimSignupBonus", {}, oldLinked.token), "FAILED_PRECONDITION");

// ---- E. deposit requests ----
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
await seed("settings/tokenPackages", { rateVersion: i(2), packages: { arrayValue: { values: [{ mapValue: { fields: { hkd: i(500), tokens: i(515) } } }] } } });
await seed("settings/payment", { fpsIdentifier: s("1234567"), fpsName: s("TEST") });
const deposit = (data, token) => call("submitTokenPaymentRequest", { contentType: "image/png", base64: png, hkdAmount: 500, amount: 515, packageType: "preset", ...data }, token);
expect("deposit request by a guest", await deposit({}), "UNAUTHENTICATED");
expect("deposit request with a non-image file", await deposit({ contentType: "application/pdf" }, player.token), "INVALID_ARGUMENT");
expect("deposit request asking for more tokens than the package", await deposit({ amount: 5150 }, player.token), "FAILED_PRECONDITION");
expect("deposit request below HK$100", await deposit({ hkdAmount: 50, amount: 50, packageType: "custom" }, player.token), "INVALID_ARGUMENT");

const failed = results.filter((line) => !line.startsWith("PASS"));
console.log(results.join("\n"));
console.log(`\nSUMMARY ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
