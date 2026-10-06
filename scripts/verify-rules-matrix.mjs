// Firestore rules permission matrix: every collection × operation × role is checked
// against the expected allow / deny. Run inside
//   firebase emulators:exec --project livedraw-7e3c2 --only auth,firestore "node scripts/verify-rules-matrix.mjs"
// Valid money flows (purchases, conversion, chat, promo) are covered by the other suites;
// here every write uses a junk payload, so only the documented open paths may succeed.
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken } from "firebase/auth";
import {
  collection, collectionGroup, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, limit,
  query, setDoc, updateDoc, where,
} from "firebase/firestore";

const P = "livedraw-7e3c2";
const fsPort = Number(process.env.FIRESTORE_EMULATOR_HOST?.split(":").at(-1) || 8080);
const authPort = Number(process.env.FIREBASE_AUTH_EMULATOR_HOST?.split(":").at(-1) || 9099);
const FS = `http://127.0.0.1:${fsPort}/v1/projects/${P}/databases/(default)/documents`;
const owner = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const s = (v) => ({ stringValue: v });
const n = (v) => ({ integerValue: String(v) });
const seed = (path, fields) => fetch(`${FS}/${path}`, { method: "PATCH", headers: owner, body: JSON.stringify({ fields }) });

// The auth emulator accepts unsigned custom tokens, which lets the test set custom claims.
function unsignedToken(uid, claims = {}) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now, exp: now + 3600, iss: "x@example.test", sub: "x@example.test", uid, claims,
  })}.`;
}
async function client(name, uid, claims) {
  const app = initializeApp({ projectId: P, apiKey: "matrix" }, `matrix-${name}-${Date.now()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${authPort}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", fsPort);
  if (uid) await signInWithCustomToken(auth, unsignedToken(uid, claims));
  return { app, db };
}

// ---- data ----
const t = Date.now().toString(36);
const A = `pa-${t}`;
const B = `pb-${t}`;
await seed(`users/${A}`, { uid: s(A), username: s(`PlayerA${t}`), tokens: n(100), role: s("user") });
await seed(`users/${B}`, { uid: s(B), username: s(`PlayerB${t}`), tokens: n(100), role: s("user") });
await seed(`usernames/namea${t}`, { uid: s(A), username: s(`NameA${t}`) });
await seed(`usernames/nameb${t}`, { uid: s(B), username: s(`NameB${t}`) });
await seed(`usernames/released${t}`, { uid: s(A), username: s(`Released${t}`) });
await seed(`tokenRequests/ta-${t}`, { uid: s(A), status: s("pending"), amount: n(515) });
await seed(`tokenRequests/tb-${t}`, { uid: s(B), status: s("pending"), amount: n(515) });
await seed(`promoCodes/TEST-${t}`, { code: s(`TEST-${t}`), amount: n(10) });
await seed(`promoRedemptions/TEST-${t}_${A}`, { uid: s(A) });
await seed(`promoRedemptions/TEST-${t}_${B}`, { uid: s(B) });
await seed(`draws/d-${t}`, { status: s("live"), title: s("Matrix"), round: s("round-001"), currentRound: n(1) });
await seed(`draws/d-${t}/slots/1`, { number: n(1), status: s("available") });
await seed(`draws/d-${t}/rounds/round-001`, { round: s("round-001") });
await seed(`draws/d-${t}/rounds/round-001/slots/1`, { number: n(1), status: s("locked"), uid: s(A) });
await seed(`draws/d-${t}/rounds/round-001/slots/2`, { number: n(2), status: s("locked"), uid: s(B) });
await seed(`draws/d-${t}/messages/m1`, { uid: s(A), text: s("hi") });
await seed(`drawRecords/ra-${t}`, { uid: s(A), cardId: s("c1"), collectionStatus: s("pending") });
await seed(`drawRecords/rb-${t}`, { uid: s(B), cardId: s("c1"), collectionStatus: s("pending") });
const simple = ["cards", "publicCardShowcase", "publicSiteSettings", "settings", "monitorSessions", "liveVisitors",
  "memberAdjustments", "supportMessages", "adminAuditLogs", "affiliateCodes", "affiliateReferrals", "affiliateApplications",
  "signupBonusClaims", "unknownCollection"];
for (const name of simple) await seed(`${name}/doc-${t}`, { uid: s(A), value: n(1) });

const roles = {
  guest: await client("guest"),
  playerA: await client("a", A),
  playerB: await client("b", B),
  admin: await client("admin", `admin-${t}`, { admin: true }),
};
const ALL = Object.keys(roles);
const SIGNED_IN = ["playerA", "playerB", "admin"];
const NONE = [];

// [label, operation(db) => Promise, roles expected to be allowed]
const junk = { hacked: true, tokens: 999999 };
const cases = [];
const add = (label, run, allowed) => cases.push([label, run, allowed]);
const path = (...parts) => (db) => doc(db, ...parts);

function docOps(label, ref, { get = NONE, update = NONE, del = NONE }) {
  add(`${label} get`, (db) => getDoc(ref(db)), get);
  add(`${label} update`, (db) => updateDoc(ref(db), junk), update);
  add(`${label} delete`, (db) => deleteDoc(ref(db)), del);
}
function collectionOps(label, segments, { list = NONE, create = NONE }) {
  add(`${label} list`, (db) => getDocs(query(collection(db, ...segments), limit(5))), list);
  add(`${label} create`, (db) => setDoc(doc(db, ...segments, `new-${Math.random().toString(36).slice(2)}`), junk), create);
}

// users
docOps("users/own", path("users", A), { get: ["playerA", "admin"] });
docOps("users/other", path("users", B), { get: ["playerB", "admin"] });
collectionOps("users", ["users"], { list: ["admin"] });
// usernames: exact lookups by signed-in users; the owner may release (delete) their name.
add("usernames get", (db) => getDoc(doc(db, "usernames", `nameb${t}`)), SIGNED_IN);
add("usernames update junk", (db) => updateDoc(doc(db, "usernames", `nameb${t}`), junk), NONE);
add("usernames delete player B's name (only B may)", (db) => deleteDoc(doc(db, "usernames", `nameb${t}`)), ["playerB"]);
add("usernames delete own name", (db) => deleteDoc(doc(db, "usernames", `released${t}`)), ["playerA"]);
collectionOps("usernames", ["usernames"], { list: NONE });
// token requests
docOps("tokenRequests/own", path("tokenRequests", `ta-${t}`), { get: ["playerA", "admin"] });
docOps("tokenRequests/other", path("tokenRequests", `tb-${t}`), { get: ["playerB", "admin"] });
collectionOps("tokenRequests", ["tokenRequests"], { list: ["admin"] });
add("tokenRequests list own (uid filter)", (db) => getDocs(query(collection(db, "tokenRequests"), where("uid", "==", A))), ["playerA", "admin"]);
// promo codes / redemptions
docOps("promoCodes", path("promoCodes", `TEST-${t}`), { get: SIGNED_IN });
collectionOps("promoCodes", ["promoCodes"], { list: ["admin"] });
docOps("promoRedemptions/own", path("promoRedemptions", `TEST-${t}_${A}`), { get: ["playerA", "admin"] });
docOps("promoRedemptions/other", path("promoRedemptions", `TEST-${t}_${B}`), { get: ["playerB", "admin"] });
collectionOps("promoRedemptions", ["promoRedemptions"], { list: ["admin"] });
// draws and nested data
docOps("draws", path("draws", `d-${t}`), { get: ALL });
collectionOps("draws", ["draws"], { list: ALL });
docOps("draws/legacy slot", path("draws", `d-${t}`, "slots", "1"), { get: ALL });
collectionOps("draws/legacy slots", ["draws", `d-${t}`, "slots"], { list: ALL });
docOps("rounds", path("draws", `d-${t}`, "rounds", "round-001"), { get: ALL });
collectionOps("rounds", ["draws", `d-${t}`, "rounds"], { list: ALL });
docOps("round slot", path("draws", `d-${t}`, "rounds", "round-001", "slots", "1"), { get: ALL });
collectionOps("round slots", ["draws", `d-${t}`, "rounds", "round-001", "slots"], { list: ALL });
add("slots collection group: own (uid filter)", (db) => getDocs(query(collectionGroup(db, "slots"), where("uid", "==", A))), ["playerA"]);
add("slots collection group: everyone's", (db) => getDocs(query(collectionGroup(db, "slots"), limit(5))), NONE);
docOps("chat message", path("draws", `d-${t}`, "messages", "m1"), { get: ALL });
collectionOps("chat messages", ["draws", `d-${t}`, "messages"], { list: ALL });
// draw records (owner or admin)
docOps("drawRecords/own", path("drawRecords", `ra-${t}`), { get: ["playerA", "admin"] });
docOps("drawRecords/other", path("drawRecords", `rb-${t}`), { get: ["playerB", "admin"] });
collectionOps("drawRecords", ["drawRecords"], { list: ["admin"] });
add("drawRecords list own (uid filter)", (db) => getDocs(query(collection(db, "drawRecords"), where("uid", "==", A))), ["playerA", "admin"]);
add("drawRecords create with a reserved vip_ id", (db) => setDoc(doc(db, "drawRecords", `vip_${B}_vip1`), junk), NONE);
// server-only and read-only collections
const readable = {
  cards: SIGNED_IN, publicCardShowcase: ALL, publicSiteSettings: ALL, settings: SIGNED_IN,
  monitorSessions: ["admin"], liveVisitors: ["admin"], memberAdjustments: ["admin"], supportMessages: ["admin"],
  adminAuditLogs: ["admin"], affiliateCodes: NONE, affiliateReferrals: NONE, affiliateApplications: NONE,
  signupBonusClaims: NONE, unknownCollection: NONE,
};
for (const name of simple) {
  docOps(name, path(name, `doc-${t}`), { get: readable[name] });
  collectionOps(name, [name], { list: readable[name] });
}

// ---- run ----
const results = [];
for (const [label, run, allowed] of cases) {
  for (const role of ALL) {
    const expectAllowed = allowed.includes(role);
    let outcome;
    try {
      await run(roles[role].db);
      outcome = "allowed";
    } catch (error) {
      outcome = /permission|insufficient/i.test(String(error?.code || error?.message)) ? "denied" : `error ${error?.code || error?.message}`;
    }
    const pass = expectAllowed ? outcome === "allowed" : outcome === "denied";
    if (!pass || process.env.VERBOSE) results.push(`${pass ? "PASS" : "FAIL"}  ${label} as ${role}: ${outcome} (expected ${expectAllowed ? "allowed" : "denied"})`);
    else results.push(`PASS  ${label} as ${role}`);
  }
}
await Promise.all(Object.values(roles).map(({ app }) => deleteApp(app)));
const failed = results.filter((line) => !line.startsWith("PASS"));
console.log(failed.length ? failed.join("\n") : "");
console.log(`SUMMARY ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
