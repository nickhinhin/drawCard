// 自助抽卡 end-to-end on the emulators: admin settings, charging, the daily limit,
// refusals (price, mode, pool, numbers, names, tokens, switched off, too fast) and odds.
//   firebase emulators:exec --project livedraw-7e3c2 --only auth,firestore,functions "node scripts/verify-instant-draw.mjs"
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
await seed("cards/inst-A", { name: "天堂A", category: "測試", tokenValue: 100, conversionValue: 900, hellCardId: "inst-H", modePrices: { half: 100, fifth: 40, tenth: 20 }, createdAt: new Date() });
await seed("cards/inst-H", { name: "地獄H", category: "測試", tokenValue: 10, conversionValue: 8, createdAt: new Date() });
await seed("cards/inst-B", { name: "無地獄B", tokenValue: 50, modePrices: { half: 50, fifth: 20, tenth: 10 }, createdAt: new Date() });
await seed("cards/inst-C", { name: "只限1/2", tokenValue: 30, hellCardId: "inst-H", allowedShareModes: ["1/2"], modePrices: { half: 30, fifth: 12, tenth: 6 }, createdAt: new Date() });

// ---- admin settings ----
const p0 = await player("InstPa", 1000);
const s1 = await call("adminSaveInstantDraw", { mode: "all", dailyTokenLimit: 500, cardIds: ["inst-A", "inst-B", "inst-C"] }, p0.token);
check("player cannot change settings", err(s1).startsWith("PERMISSION_DENIED"), JSON.stringify(s1));
const s2 = await call("adminSaveInstantDraw", { mode: "all", dailyTokenLimit: 500, cardIds: ["inst-A", "inst-B", "inst-C"] }, admin);
check("admin saves; card without hell card is left out", s2.result?.cards === 2 && s2.result.skipped.includes("無地獄B") && s2.result.cardIds.join() === "inst-A,inst-C", JSON.stringify(s2));
const pub = await read("publicSiteSettings/instantDraw");
check("public pool has prices, not conversion values or hell ids", pub.cards.length === 2 && pub.cards[0].modePrices.fifth === 40 && !("conversionValue" in pub.cards[0]) && !("hellCardId" in pub.cards[0]), JSON.stringify(pub.cards[0]));
const s3 = await call("adminSaveInstantDraw", { mode: "all", dailyTokenLimit: 500, cardIds: ["inst-B"] }, admin);
check("cannot switch on with no drawable card", err(s3).startsWith("FAILED_PRECONDITION"), JSON.stringify(s3));
check("bad limit refused", err(await call("adminSaveInstantDraw", { mode: "all", dailyTokenLimit: -5, cardIds: ["inst-A"] }, admin)).startsWith("INVALID_ARGUMENT"));

// ---- a normal draw ----
const d1 = await call("instantDraw", { cardId: "inst-A", shareMode: "1/5", numbers: [3, 7, 12], unitPrice: 40 }, p0.token);
check("draw 3 numbers at 1/5", d1.result?.draws?.length === 3, JSON.stringify(d1));
const u1 = await read(`users/${p0.uid}`);
check("tokens deducted 120 and today's spend recorded", u1.tokens === 880 && u1.instantDrawSpent === 120, JSON.stringify({ tokens: u1.tokens, spent: u1.instantDrawSpent }));
const recs = await Promise.all(d1.result.draws.map((x) => read(`drawRecords/${x.recordId}`)));
check("records are settled cards owned by the player", recs.every((r) => r.uid === p0.uid && r.source === "instant" && r.collectionStatus === "pending" && r.tokenCost === 40 && r.shareMode === "1/5"), JSON.stringify(recs[0]));
check("heaven gives the chosen card, hell the hell card", recs.every((r) => (r.resultSide === "heaven" ? r.cardId === "inst-A" && r.cardConversionValue === 900 : r.cardId === "inst-H" && r.cardConversionValue === 8)), JSON.stringify(recs.map((r) => [r.resultSide, r.cardId])));
check("numbers recorded", recs.map((r) => r.number).sort((a, b) => a - b).join() === "3,7,12");

// ---- refusals ----
await sleep(1600);
check("wrong price refused (stale page)", err(await call("instantDraw", { cardId: "inst-A", shareMode: "1/2", numbers: [1], unitPrice: 99 }, p0.token)).startsWith("FAILED_PRECONDITION"));
await sleep(1600);
check("mode not offered by the card refused", err(await call("instantDraw", { cardId: "inst-C", shareMode: "1/10", numbers: [1], unitPrice: 6 }, p0.token)).startsWith("FAILED_PRECONDITION"));
await sleep(1600);
check("card outside the pool refused", err(await call("instantDraw", { cardId: "inst-B", shareMode: "1/2", numbers: [1], unitPrice: 50 }, p0.token)).startsWith("FAILED_PRECONDITION"));
await sleep(1600);
for (const [label, numbers] of [["no numbers", []], ["duplicate numbers", [2, 2]], ["number 21", [21]], ["21 numbers", Array.from({ length: 21 }, (_, i) => (i % 20) + 1)]]) {
  check(`${label} refused`, err(await call("instantDraw", { cardId: "inst-A", shareMode: "1/2", numbers, unitPrice: 100 }, p0.token)).startsWith("INVALID_ARGUMENT"));
}
check("bad mode refused", err(await call("instantDraw", { cardId: "inst-A", shareMode: "1/3", numbers: [1], unitPrice: 100 }, p0.token)).startsWith("INVALID_ARGUMENT"));
await sleep(1600);
const over = await call("instantDraw", { cardId: "inst-A", shareMode: "1/2", numbers: [1, 2, 3, 4], unitPrice: 100 }, p0.token);
check("daily limit: 120 + 400 > 500 refused", err(over).startsWith("RESOURCE_EXHAUSTED") && over.error.message.includes("380"), JSON.stringify(over));
await sleep(1600);
const fast1 = await call("instantDraw", { cardId: "inst-A", shareMode: "1/2", numbers: [1], unitPrice: 100 }, p0.token);
const fast2 = await call("instantDraw", { cardId: "inst-A", shareMode: "1/2", numbers: [2], unitPrice: 100 }, p0.token);
check("second draw within 1.5 s refused (anti-script)", Boolean(fast1.result) && err(fast2).startsWith("RESOURCE_EXHAUSTED"), JSON.stringify([fast1.error, fast2.error]));
const u2 = await read(`users/${p0.uid}`);
check("only successful draws were charged (880 - 100)", u2.tokens === 780 && u2.instantDrawSpent === 220, JSON.stringify({ tokens: u2.tokens, spent: u2.instantDrawSpent }));
check("not signed in refused", err(await call("instantDraw", { cardId: "inst-A", shareMode: "1/2", numbers: [1], unitPrice: 100 })).startsWith("UNAUTHENTICATED"));
const poor = await player("InstPb", 50);
check("not enough tokens refused", err(await call("instantDraw", { cardId: "inst-A", shareMode: "1/2", numbers: [1], unitPrice: 100 }, poor.token)).startsWith("FAILED_PRECONDITION"));
const nameless = await player("InstPc", 1000, false);
check("player without a name refused", err(await call("instantDraw", { cardId: "inst-A", shareMode: "1/2", numbers: [1], unitPrice: 100 }, nameless.token)).includes("玩家名稱"));
const u3 = await read(`users/${poor.uid}`);
check("refused draws charge nothing", u3.tokens === 50 && !u3.instantDrawSpent);

// ---- switched off ----
await call("adminSaveInstantDraw", { mode: "off", dailyTokenLimit: 500, cardIds: ["inst-A"] }, admin);
const rich = await player("InstPd", 100000);
check("switched off: draws refused", err(await call("instantDraw", { cardId: "inst-A", shareMode: "1/2", numbers: [1], unitPrice: 100 }, rich.token)).includes("暫未開放"));

// ---- admin test mode: only allow-listed admins may draw ----
check("unknown mode refused", err(await call("adminSaveInstantDraw", { mode: "beta", dailyTokenLimit: 500, cardIds: ["inst-A"] }, admin)).startsWith("INVALID_ARGUMENT"));
const sm = await call("adminSaveInstantDraw", { mode: "admin", dailyTokenLimit: 0, cardIds: ["inst-A"] }, admin);
check("admin test mode saved", sm.result?.ok === true && (await read("publicSiteSettings/instantDraw")).mode === "admin", JSON.stringify(sm));
await sleep(1600);
check("admin test mode: player refused", err(await call("instantDraw", { cardId: "inst-A", shareMode: "1/2", numbers: [1], unitPrice: 100 }, rich.token)).includes("暫未開放"));
await seed(`users/${ADMIN_UID}`, { uid: ADMIN_UID, username: "InstAdmin", tokens: 1000, role: "admin", createdAt: new Date() });
await seed("usernames/instadmin", { uid: ADMIN_UID, username: "InstAdmin" });
const adminDraw = await call("instantDraw", { cardId: "inst-A", shareMode: "1/2", numbers: [1, 2], unitPrice: 100 }, admin);
check("admin test mode: admin draws with real tokens", adminDraw.result?.draws?.length === 2 && (await read(`users/${ADMIN_UID}`)).tokens === 800, JSON.stringify(adminDraw.error || adminDraw.result?.tokens));
await sleep(1600);

// ---- fixed split: buying all 20 numbers gives exactly the mode's heavens ----
await call("adminSaveInstantDraw", { mode: "all", dailyTokenLimit: 0, cardIds: ["inst-A", "inst-C"] }, admin);
await sleep(1600);
const all20 = Array.from({ length: 20 }, (_, k) => k + 1);
const splits = { "1/2": [], "1/10": [] };
for (const [mode, price] of [["1/2", 100], ["1/10", 20]]) {
  for (let i = 0; i < 15; i++) {
    const r = await call("instantDraw", { cardId: "inst-A", shareMode: mode, numbers: all20, unitPrice: price }, rich.token);
    if (!r.result) { console.log("draw failed", JSON.stringify(r.error)); break; }
    splits[mode].push(r.result.draws.filter((x) => x.resultSide === "heaven").length);
    await sleep(1550);
  }
}
check(`1/2, all 20 numbers: always 10 heaven (${splits["1/2"].join(",")})`, splits["1/2"].length === 15 && splits["1/2"].every((n) => n === 10));
check(`1/10, all 20 numbers: always 2 heaven (${splits["1/10"].join(",")})`, splits["1/10"].length === 15 && splits["1/10"].every((n) => n === 2));
const ur = await read(`users/${rich.uid}`);
check("no daily limit when set to 0; balance exact", ur.tokens === 100000 - 15 * 20 * 100 - 15 * 20 * 20, `tokens=${ur.tokens}`);
console.log(`SUMMARY ${ok}/${ok + bad} passed`);
if (bad) process.exit(1);
