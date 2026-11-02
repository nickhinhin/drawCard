// 自助抽卡 Boost end-to-end on the emulators: paying, the locked board, throws, prizes, the new board, limits and left rounds.
//   firebase emulators:exec --project livedraw-7e3c2 --only auth,firestore,functions "node scripts/verify-instant-boost.mjs"
import { BOOST_THROW_WINDOW_MS, boostThrowHits } from "../functions/src/instant-boost.js";
const P = "livedraw-7e3c2";
const FS = `http://127.0.0.1:8080/v1/projects/${P}/databases/(default)/documents`;
const ID = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const FN = `http://127.0.0.1:5001/${P}/asia-east2`;
const owner = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const ADMIN_UID = "Wu1LJDetI4eBmUqQC2T4ybrNixE3";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (url, body, headers = {}) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }).then((r) => r.json());
const enc = (v) => {
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
};
const dec = (v) => v && ("stringValue" in v ? v.stringValue : "integerValue" in v ? Number(v.integerValue) : "doubleValue" in v ? v.doubleValue : "booleanValue" in v ? v.booleanValue : "mapValue" in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)])) : "arrayValue" in v ? (v.arrayValue.values || []).map(dec) : v.timestampValue);
const seed = (path, data) => fetch(`${FS}/${path}`, { method: "PATCH", headers: owner, body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
const read = async (path) => { const j = await fetch(`${FS}/${path}`, { headers: owner }).then((r) => r.json()); return j.fields ? dec({ mapValue: { fields: j.fields } }) : null; };
const call = (name, data, token) => post(`${FN}/${name}`, { data }, token ? { Authorization: `Bearer ${token}` } : {});
let ok = 0, bad = 0;
const check = (label, cond, extra = "") => { console.log(cond ? "PASS" : "FAIL", label, cond ? "" : extra); cond ? ok++ : bad++; };
const err = (r) => r.error?.status ? `${r.error.status} ${r.error.message}` : "";

// accounts
await post(`${ID}/projects/${P}/accounts:batchCreate`, { users: [{ localId: ADMIN_UID, email: "qa-admin@example.com", emailVerified: true,
  customAttributes: JSON.stringify({ admin: true }), providerUserInfo: [{ providerId: "google.com", rawId: "qa-admin-google", email: "qa-admin@example.com" }] }] }, owner);
const admin = (await post(`${ID}/accounts:signInWithIdp?key=x`, { requestUri: "http://localhost", returnSecureToken: true,
  postBody: `id_token=${encodeURIComponent(JSON.stringify({ sub: "qa-admin-google", email: "qa-admin@example.com", email_verified: true }))}&providerId=google.com` })).idToken;
async function player(name, tokens, withName = true) {
  const r = await post(`${ID}/accounts:signUp?key=x`, { email: `${name}@example.com`, password: "secret123", returnSecureToken: true });
  await seed(`users/${r.localId}`, { uid: r.localId, username: withName ? name : "", tokens, role: "user", referredByUid: "", createdAt: new Date() });
  if (withName) await seed(`usernames/${name.toLowerCase()}`, { uid: r.localId, username: name });
  return { uid: r.localId, token: r.idToken };
}
// cards: heaven A (hell H), card B without hell card, card C 1/2 only
await seed("cards/boost-A", { name: "天堂A", tokenValue: 110, conversionValue: 100, hellCardId: "boost-H", modePrices: { half: 66, fifth: 34, tenth: 23 }, createdAt: new Date() });
await seed("cards/boost-H", { name: "地獄H", tokenValue: 10, conversionValue: 10, createdAt: new Date() });
await seed("cards/boost-L", { name: "低毛利", tokenValue: 50, conversionValue: 100, hellCardId: "boost-H", modePrices: { half: 50, fifth: 20, tenth: 11 }, createdAt: new Date() });
const saved = await call("adminSaveInstantDraw", { mode: "all", dailyTokenLimit: 0, cardIds: ["boost-A", "boost-L"] }, admin);
check("low-margin card is reported as having no Boost", saved.result?.noBoost?.join() === "低毛利", JSON.stringify(saved));

const nums = (n) => Array.from({ length: n }, (_, i) => i + 1);
const act = async (p, data) => { await sleep(300); return call("instantBoostAction", data, p.token); };
const tap = (seedValue, stage, hit) => { for (let ms = 0; ms < BOOST_THROW_WINDOW_MS; ms += 5) if (boostThrowHits(seedValue, stage, ms) === hit) return ms; throw new Error("no tap"); };
// Plays one stage, waiting until the chosen tap could really have happened.
async function play(p, runId, stage, hit) {
  const started = await act(p, { action: "start", runId });
  const tapMs = tap(started.result.run.seed, stage, hit);
  await sleep(tapMs);
  return act(p, { action: "throw", runId, tapMs });
}

const p1 = await player("BoostA", 100000);
check("9 numbers cannot Boost", err(await call("instantDraw", { cardId: "boost-A", shareMode: "1/10", numbers: nums(9), unitPrice: 23, boost: "free" }, p1.token)).startsWith("FAILED_PRECONDITION"));
await sleep(1600);
check("low-margin card cannot Boost", err(await call("instantDraw", { cardId: "boost-L", shareMode: "1/10", numbers: nums(10), unitPrice: 11, boost: "free" }, p1.token)).startsWith("FAILED_PRECONDITION"));
await sleep(1600);

// Free Boost: 20 numbers, +2 then +4 on a new board.
const d1 = await call("instantDraw", { cardId: "boost-A", shareMode: "1/10", numbers: nums(20), unitPrice: 23, boost: "free" }, p1.token);
const run1 = d1.result?.boostRun;
check("free Boost charges only the numbers and hides the board", d1.result?.tokens === 100000 - 460 && run1?.status === "ready" && !JSON.stringify(d1).includes("heaven") && !run1.seed, JSON.stringify(d1));
const u1 = await read(`users/${p1.uid}`);
check("free Boost timer starts at 8 hours", Math.abs(u1.instantBoostFreeAt - Date.now() - 8 * 3600e3) < 60000);
await sleep(1600);
check("no second draw while a round is open", err(await call("instantDraw", { cardId: "boost-A", shareMode: "1/10", numbers: nums(1), unitPrice: 23 }, p1.token)).startsWith("FAILED_PRECONDITION"));
const other = await player("BoostO", 0);
check("another player cannot touch the run", err(await act(other, { action: "start", runId: run1.runId })).startsWith("NOT_FOUND"));
const t1 = await play(p1, run1.runId, 0, true);
check("a hit offers take or challenge", t1.result?.run.status === "decide" && t1.result.run.prize === 2, JSON.stringify(t1));
await act(p1, { action: "challenge", runId: run1.runId });
const t2 = await play(p1, run1.runId, 1, true);
check("the top stage goes straight to picking", t2.result?.run.status === "pick" && t2.result.run.prize === 4, JSON.stringify(t2));
check("wrong picks refused", err(await act(p1, { action: "finish", runId: run1.runId, first: [], second: [1, 2] })).startsWith("INVALID_ARGUMENT"));
const f1 = await act(p1, { action: "finish", runId: run1.runId, first: [], second: [1, 2, 3, 4] });
const bonus = f1.result?.draws?.filter((x) => x.bonus) || [];
check("24 cards revealed, 4 free on the new board", f1.result?.draws?.length === 24 && bonus.every((x) => x.board === 2), JSON.stringify(f1).slice(0, 300));
check("full board holds exactly its 2 heavens", f1.result.draws.filter((x) => !x.bonus && x.resultSide === "heaven").length === 2);
const records = await Promise.all(f1.result.draws.filter((x) => x.recordId).map((x) => read(`drawRecords/${x.recordId}`)));
check("free hell gives no card, free heaven costs nothing", bonus.every((x) => (x.resultSide === "heaven") === Boolean(x.recordId)) && records.filter((r) => r.bonus).every((r) => r.tokenCost === 0 && r.uid === p1.uid), JSON.stringify(bonus));
check("round closed on the player", !(await read(`users/${p1.uid}`)).instantBoostRunId);
await sleep(1600);

check("free Boost refused during the countdown", err(await call("instantDraw", { cardId: "boost-A", shareMode: "1/10", numbers: nums(10), unitPrice: 23, boost: "free" }, p1.token)).startsWith("FAILED_PRECONDITION"));
await sleep(1600);

// Paid Boost: fee charged, a miss loses the prize but the numbers still open.
const before = (await read(`users/${p1.uid}`)).tokens;
const d2 = await call("instantDraw", { cardId: "boost-A", shareMode: "1/2", numbers: nums(10), unitPrice: 66, boost: "paid" }, p1.token);
check("paid Boost charges numbers plus 4", d2.result?.tokens === before - 660 - 264, JSON.stringify(d2));
const t3 = await play(p1, d2.result.boostRun.runId, 0, false);
check("a miss opens the bought numbers with no free ones", t3.result?.draws?.length === 10 && t3.result.draws.every((x) => !x.bonus), JSON.stringify(t3).slice(0, 300));
check("the fee is recorded once", (await read(`drawRecords/${t3.result.draws[0].recordId}`)).boostFee === 264);
await sleep(1600);

// Limit: three paid a day.
await seed(`users/${p1.uid}`, { ...(await read(`users/${p1.uid}`)), instantBoostPaidDay: new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), instantBoostPaidCount: 3 });
check("fourth paid Boost refused", err(await call("instantDraw", { cardId: "boost-A", shareMode: "1/2", numbers: nums(10), unitPrice: 66, boost: "paid" }, p1.token)).startsWith("RESOURCE_EXHAUSTED"));
await sleep(1600);

// A round left open is settled, keeping a prize already won.
const p2 = await player("BoostB", 100000);
const d3 = await call("instantDraw", { cardId: "boost-A", shareMode: "1/5", numbers: nums(15), unitPrice: 34, boost: "free" }, p2.token);
const runId = d3.result.boostRun.runId;
await play(p2, runId, 0, true);
const left = await read(`instantBoostRuns/${runId}`);
await seed(`instantBoostRuns/${runId}`, { ...left, expiresAtMs: 1, createdAt: new Date() });
const r1 = await act(p2, { action: "resume", runId });
check("expired round settles with its +2", r1.result?.draws?.length === 17 && r1.result.draws.filter((x) => x.bonus).length === 2, JSON.stringify(r1).slice(0, 300));
check("board stays private from the player", (await fetch(`${FS}/instantBoostRuns/${runId}`, { headers: { Authorization: `Bearer ${p2.token}` } })).status === 403);

console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
