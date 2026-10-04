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

const failed = results.filter((line) => !line.startsWith("PASS"));
console.log(failed.length ? failed.join("\n") : "");
console.log(`SUMMARY ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
