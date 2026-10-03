import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken, signOut } from "firebase/auth";
import { connectDatabaseEmulator, get, getDatabase, ref, serverTimestamp, set, update } from "firebase/database";

// Realtime Database presence rules (database.rules.json). Run inside
// `firebase emulators:exec --only auth,database`. Every attack must be refused.
const projectId = "livedraw-7e3c2";
const namespace = "livedraw-7e3c2-default-rtdb";
const authPort = Number(process.env.FIREBASE_AUTH_EMULATOR_HOST?.split(":").at(-1) || 9099);
const dbPort = Number(process.env.FIREBASE_DATABASE_EMULATOR_HOST?.split(":").at(-1) || 9000);
const app = initializeApp({ projectId, apiKey: "presence-audit", databaseURL: `http://127.0.0.1:${dbPort}?ns=${namespace}` }, `presence-${Date.now()}`);
const auth = getAuth(app);
connectAuthEmulator(auth, `http://127.0.0.1:${authPort}`, { disableWarnings: true });
const db = getDatabase(app);
connectDatabaseEmulator(db, "127.0.0.1", dbPort);

// The auth emulator accepts unsigned custom tokens, which lets the test set the admin claim.
const unsigned = (uid, claims = {}) => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now, exp: now + 3600, iss: "x@example.test", sub: "x@example.test", uid, claims,
  })}.`;
};
const results = [];
async function check(label, action, expectAllowed) {
  try {
    await action();
    results.push(`${expectAllowed ? "PASS" : "FAIL"}  ${label}: ${expectAllowed ? "allowed" : "ACCEPTED"}`);
  } catch (error) {
    results.push(expectAllowed ? `FAIL  ${label}: ${error.code || error.message}` : `PASS  ${label}: rejected`);
  }
}
const room = "room-1";
const guest = "g_0123456789abcdef01234567";

// Guest (not signed in).
await check("guest marks itself online", () => set(ref(db, `online/${room}/${guest}`), { m: false, at: serverTimestamp() }), true);
await check("guest claims to be a member", () => set(ref(db, `online/${room}/${guest}`), { m: true, at: serverTimestamp() }), false);
await check("guest with a made-up key format", () => set(ref(db, `online/${room}/g_short`), { m: false, at: serverTimestamp() }), false);
await check("guest writes a member's uid", () => set(ref(db, `online/${room}/member-a`), { m: false, at: serverTimestamp() }), false);
await check("guest with a fake time", () => set(ref(db, `online/${room}/${guest}`), { m: false, at: 1 }), false);
await check("guest adds extra fields", () => set(ref(db, `online/${room}/${guest}`), { m: false, at: serverTimestamp(), note: "x" }), false);
await check("guest opens a visit", () => set(ref(db, `sessions/${room}/${guest}/s1`), { in: serverTimestamp() }), true);
await check("guest closes the visit", () => update(ref(db, `sessions/${room}/${guest}/s1`), { out: serverTimestamp() }), true);
await check("guest re-closes it later (fake longer visit)", () => update(ref(db, `sessions/${room}/${guest}/s1`), { out: Date.now() + 3_600_000 }), false);
await check("guest opens a visit in the past", () => set(ref(db, `sessions/${room}/${guest}/s2`), { in: 1 }), false);
await check("guest opens a visit that is already closed", () => set(ref(db, `sessions/${room}/${guest}/s3`), { in: serverTimestamp(), out: serverTimestamp() }), false);
await check("guest marks a round", () => set(ref(db, `rounds/${room}/round-001/${guest}`), true), false);
await check("guest reads who is online", () => get(ref(db, `online/${room}`)), false);
await check("guest writes outside the presence paths", () => set(ref(db, "anything/x"), true), false);

// Signed-in member.
await signInWithCustomToken(auth, unsigned("member-a"));
await check("member marks itself online", () => set(ref(db, `online/${room}/member-a`), { m: true, at: serverTimestamp() }), true);
await check("member marks itself as a guest", () => set(ref(db, `online/${room}/member-a`), { m: false, at: serverTimestamp() }), false);
await check("member marks another member online", () => set(ref(db, `online/${room}/member-b`), { m: true, at: serverTimestamp() }), false);
await check("member opens a visit", () => set(ref(db, `sessions/${room}/member-a/s1`), { in: serverTimestamp() }), true);
await check("member moves the enter time", () => update(ref(db, `sessions/${room}/member-a/s1`), { in: 1 }), false);
await check("member writes another member's visit", () => set(ref(db, `sessions/${room}/member-b/s1`), { in: serverTimestamp() }), false);
await check("member marks the round once", () => set(ref(db, `rounds/${room}/round-001/member-a`), true), true);
await check("member marks another member's round", () => set(ref(db, `rounds/${room}/round-001/member-b`), true), false);
await check("member uses a bad round id", () => set(ref(db, `rounds/${room}/round-x/member-a`), true), false);
await check("member reads who is online", () => get(ref(db, `online/${room}`)), false);
await check("member reads the visits", () => get(ref(db, `sessions/${room}`)), false);
await signOut(auth);

// Admin.
await signInWithCustomToken(auth, unsigned("admin-1", { admin: true }));
await check("admin reads who is online", () => get(ref(db, `online/${room}`)), true);
await check("admin reads the visits", () => get(ref(db, `sessions/${room}`)), true);
await check("admin reads members per round", () => get(ref(db, `rounds/${room}`)), true);
await signOut(auth);

await deleteApp(app);
console.log(results.join("\n"));
const failed = results.filter((line) => !line.startsWith("PASS"));
console.log(`\nSUMMARY ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
