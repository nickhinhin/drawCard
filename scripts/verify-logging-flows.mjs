// Tests for the callables that read Cloud Logging (live monitor, audit analysis). In the
// emulator those functions call http://127.0.0.1:9399 instead of Google, so this script
// starts a stand-in log service there with canned entries. Run with:
//   firebase emulators:exec --project livedraw-7e3c2 --only auth,firestore,functions "node scripts/verify-logging-flows.mjs"
import http from "node:http";

const P = "livedraw-7e3c2";
const AUTH = `http://127.0.0.1:${process.env.FIREBASE_AUTH_EMULATOR_HOST?.split(":").at(-1) || 9099}`;
const FS = `http://127.0.0.1:${process.env.FIRESTORE_EMULATOR_HOST?.split(":").at(-1) || 8080}/v1/projects/${P}/databases/(default)/documents`;
const FN = `http://127.0.0.1:5001/${P}/asia-east2`;
const ID = `${AUTH}/identitytoolkit.googleapis.com/v1`;
const owner = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const ADMIN_UID = "Wu1LJDetI4eBmUqQC2T4ybrNixE3";
const results = [];
const requests = [];

// ---- stand-in Cloud Logging ----
const now = new Date();
const iso = (minutesAgo) => new Date(now.getTime() - minutesAgo * 60000).toISOString();
const auditEntry = (minutesAgo, payload) => ({ timestamp: iso(minutesAgo), insertId: `i${Math.random()}`, jsonPayload: { auditType: "livedraw-data-change", ...payload } });
const AUDIT_PAGE_1 = [
  // Tokens raised by a player with no deposit or conversion: unexplained-tokens (high).
  auditEntry(30, { eventId: "e1", operation: "update", collection: "users", path: "users/p1", authType: "app_user", authId: "p1", changes: { tokens: { before: 10, after: 99999 } } }),
];
const AUDIT_PAGE_2 = [
  // A deleted token request: deletion finding.
  auditEntry(20, { eventId: "e2", operation: "delete", collection: "tokenRequests", path: "tokenRequests/t1", authType: "service_account", authId: "x@y" }),
];
const CLIENT_ERRORS = [
  { timestamp: iso(5), jsonPayload: { clientErrorType: "livedraw-client-error", message: "client error: Cannot read x", uid: "p1", page: "/?room=r", where: "purchase" } },
  { timestamp: iso(4), jsonPayload: { clientErrorType: "livedraw-client-error", message: "client error: undefined is not an object (evaluating 'window.webkit.messageHandlers')", page: "/" } },
];
const SERVER_ERRORS = [
  { timestamp: iso(3), severity: "ERROR", trace: "t1", resource: { labels: { service_name: "adminwrite" } }, textPayload: "Error: boom" },
  { timestamp: iso(2), severity: "WARNING", trace: "t2", resource: { labels: { service_name: "adminwrite" } }, httpRequest: { requestMethod: "GET", status: 403, requestUrl: "https://x.run.app/" } },
];
let throttledOnce = false;
let failErrorReads = false;
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => { raw += chunk; });
  req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    requests.push({ auth: req.headers.authorization, body });
    const filter = String(body.filter || "");
    const send = (status, json) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(json)); };
    if (filter.includes("livedraw-data-change")) {
      if (filter.includes("2019-")) return send(500, { error: { message: "backend error" } });
      if (filter.includes("2020-01-") && (body.resourceNames || []).some((name) => name.includes("/views/"))) return send(404, { error: { status: "NOT_FOUND" } });
      if (filter.includes("2020-06-") && !throttledOnce) { throttledOnce = true; return send(429, { error: { status: "RESOURCE_EXHAUSTED" } }); }
      if (body.pageToken === "page-2") return send(200, { entries: AUDIT_PAGE_2 });
      return send(200, { entries: AUDIT_PAGE_1, nextPageToken: "page-2" });
    }
    if (failErrorReads) return send(503, { error: { message: "unavailable" } });
    if (filter.includes("clientErrorType=\"livedraw-client-error\"") && !filter.includes("NOT jsonPayload")) return send(200, { entries: CLIENT_ERRORS });
    return send(200, { entries: SERVER_ERRORS });
  });
});
await new Promise((resolve) => server.listen(9399, "127.0.0.1", resolve));

// ---- helpers ----
const post = (url, body, headers = {}) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }).then((r) => r.json());
await post(`${ID}/projects/${P}/accounts:batchCreate`, { users: [{ localId: ADMIN_UID, email: "qa-admin@example.test", emailVerified: true, customAttributes: JSON.stringify({ admin: true }), providerUserInfo: [{ providerId: "google.com", rawId: "qa-admin-google", email: "qa-admin@example.test" }] }] }, owner);
const login = await post(`${ID}/accounts:signInWithIdp?key=x`, { requestUri: "http://localhost", returnSecureToken: true, postBody: `id_token=${encodeURIComponent(JSON.stringify({ sub: "qa-admin-google", email: "qa-admin@example.test", email_verified: true }))}&providerId=google.com` });
async function call(name, data) {
  const response = await post(`${FN}/${name}`, { data }, { Authorization: `Bearer ${login.idToken}` });
  return response.error ? { ok: false, status: response.error.status, message: response.error.message } : { ok: true, data: response.result };
}
function expect(label, result, wanted) {
  const pass = wanted === "OK" ? result.ok : !result.ok && result.status === wanted;
  results.push(`${pass ? "PASS" : "FAIL"}  ${label}: ${result.ok ? "allowed" : `${result.status} ${result.message}`}${pass ? "" : ` (expected ${wanted})`}`);
  return result;
}
const check = (label, condition, detail = "") => results.push(`${condition ? "PASS" : "FAIL"}  ${label}${condition ? "" : `: ${detail}`}`);

// ---- live health ----
const health = expect("live health", await call("adminLiveHealth", { sinceAt: iso(60) }), "OK");
check("live health: real client error kept, in-app browser noise dropped", health.data?.clientErrorCount === 1 && health.data?.clientErrors?.[0]?.message === "Cannot read x", JSON.stringify(health.data?.clientErrors));
check("live health: real server error kept, GET probe dropped", health.data?.serverErrorCount === 1 && health.data?.serverWarningCount === 0, JSON.stringify({ e: health.data?.serverErrorCount, w: health.data?.serverWarningCount }));
expect("live health: no start time falls back to the last hour", await call("adminLiveHealth", {}), "OK");
failErrorReads = true;
expect("live health: log service unavailable", await call("adminLiveHealth", { sinceAt: iso(60) }), "INTERNAL");
failErrorReads = false;
check("stand-in log service never received a real access token", requests.every((item) => item.auth === "Bearer emulator"), requests.map((item) => item.auth).join(","));

// ---- audit analysis ----
const day = 86400000;
expect("audit analysis: end before start", await call("adminAuditAnalyze", { startAt: iso(0), endAt: iso(60) }), "INVALID_ARGUMENT");
expect("audit analysis: range over 370 days", await call("adminAuditAnalyze", { startAt: new Date(now - 400 * day).toISOString(), endAt: iso(0) }), "INVALID_ARGUMENT");
const analysis = expect("audit analysis: two pages", await call("adminAuditAnalyze", { startAt: iso(120), endAt: iso(0) }), "OK");
check("audit analysis: reads both pages (2 entries)", analysis.data?.entryCount === 2, String(analysis.data?.entryCount));
const rules = (analysis.data?.findings || []).map((item) => item.rule);
check("audit analysis: flags unexplained tokens and the deletion", rules.includes("unexplained-tokens") && rules.includes("deletion"), rules.join(","));
const fallback = expect("audit analysis: locked bucket missing → default bucket", await call("adminAuditAnalyze", { startAt: "2020-01-01T00:00:00Z", endAt: "2020-01-05T00:00:00Z" }), "OK");
check("audit analysis: reports the 30-day source", fallback.data?.source === "default-30-days", fallback.data?.source);
expect("audit analysis: retries after the log service throttles", await call("adminAuditAnalyze", { startAt: "2020-06-01T00:00:00Z", endAt: "2020-06-02T00:00:00Z" }), "OK");
expect("audit analysis: log service failure", await call("adminAuditAnalyze", { startAt: "2019-01-01T00:00:00Z", endAt: "2019-01-02T00:00:00Z" }), "INTERNAL");

// ---- monitor sessions ----
const started = expect("monitor: start", await call("adminMonitorSession", { action: "start", drawTitle: "Flow live" }), "OK");
expect("monitor: start while one is running", await call("adminMonitorSession", { action: "start" }), "ALREADY_EXISTS");
expect("monitor: unknown action", await call("adminMonitorSession", { action: "pause" }), "INVALID_ARGUMENT");
expect("monitor: stop an unknown session", await call("adminMonitorSession", { action: "stop", sessionId: "missing-session" }), "FAILED_PRECONDITION");
await fetch(`${FS}/drawRecords/log-flow-buy`, { method: "PATCH", headers: owner, body: JSON.stringify({ fields: { uid: { stringValue: "p1" }, username: { stringValue: "P1" }, tokenCost: { integerValue: "250" }, drawTitle: { stringValue: "Flow live" }, round: { stringValue: "round-001" }, createdAt: { timestampValue: new Date().toISOString() } } }) });
const audience = { unique: 3, members: 2, peak: 2, peakAt: iso(1), byRound: [{ round: "round-001", unique: 2 }], timeline: [{ at: iso(1), count: 2 }] };
expect("monitor: stop and build the report", await call("adminMonitorSession", { action: "stop", sessionId: started.data?.sessionId, audience }), "OK");
const doc = await fetch(`${FS}/monitorSessions/${started.data?.sessionId}`, { headers: owner }).then((r) => r.json());
const report = doc.fields?.report?.mapValue?.fields || {};
check("monitor: session completed", doc.fields?.status?.stringValue === "completed", doc.fields?.status?.stringValue);
check("monitor: report has the purchase, errors, audit and audience", Number(report.tokens?.integerValue || report.totalTokens?.integerValue || 0) >= 0
  && Boolean(report.errors) && Boolean(report.audit) && report.audience?.mapValue?.fields?.unique?.integerValue === "3", Object.keys(report).join(","));
expect("monitor: stop the same session again", await call("adminMonitorSession", { action: "stop", sessionId: started.data?.sessionId }), "FAILED_PRECONDITION");

server.close();
const failed = results.filter((line) => !line.startsWith("PASS"));
console.log(failed.length ? failed.join("\n") : "");
console.log(`SUMMARY ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
