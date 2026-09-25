// Helpers for the admin live monitor: client error reports and log grouping.
export const CLIENT_ERROR_TYPE = "livedraw-client-error";

const clean = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
// Keeps line breaks (stack traces) but drops other control characters.
// eslint-disable-next-line no-control-regex
const cleanMultiline = (value, max) => String(value ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, max);
const CLIENT_ERROR_PREFIX = "client error: ";

// Short device / browser label from a user agent, e.g. "iPhone · Safari".
export function summarizeUserAgent(userAgent = "") {
  const ua = String(userAgent);
  const device = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows" : /Macintosh|Mac OS X/.test(ua) ? "Mac" : "其他裝置";
  const browser = /FBAN|FBAV|Instagram|Line\//.test(ua) ? "App 內置瀏覽器" : /Edg\//.test(ua) ? "Edge"
    : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox"
      : /Safari\//.test(ua) ? "Safari" : "其他瀏覽器";
  return `${device} · ${browser}`;
}

// Keeps only safe, bounded fields from a browser error report.
export function sanitizeClientError(data = {}, uid = "") {
  return {
    clientErrorType: CLIENT_ERROR_TYPE,
    message: clean(data.message, 300) || "(no message)",
    code: clean(data.code, 80),
    where: clean(data.where, 80),
    page: clean(data.page, 120),
    site: data.site === "admin" ? "admin" : "public",
    appVersion: clean(data.appVersion, 40),
    userAgent: clean(data.userAgent, 200),
    stack: cleanMultiline(data.stack, 1500),
    uid: clean(uid, 128),
  };
}

// Simple per-instance limiter so one browser cannot flood the logs.
export function createRateLimiter(limit, windowMs, now = () => Date.now()) {
  const hits = new Map();
  return (key) => {
    const time = now();
    const recent = (hits.get(key) || []).filter((stamp) => time - stamp < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(time);
    hits.set(key, recent);
    if (hits.size > 5000) hits.delete(hits.keys().next().value);
    return true;
  };
}

// Groups browser error reports by message so the admin sees each problem once.
export function groupClientErrors(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const payload = entry.jsonPayload || {};
    const message = String(payload.message || "").replace(CLIENT_ERROR_PREFIX, "");
    const key = `${payload.code}|${message}`;
    if (!groups.has(key)) {
      groups.set(key, {
        message, code: payload.code || "", where: payload.where || "",
        count: 0, users: new Set(), sites: new Set(), places: new Set(), pages: new Set(), devices: new Set(),
        stack: "", lastSeen: "", firstSeen: entry.timestamp,
      });
    }
    const group = groups.get(key);
    group.count += 1;
    if (payload.uid) group.users.add(payload.uid);
    group.sites.add(payload.site || "public");
    if (payload.where) group.places.add(payload.where);
    if (payload.page) group.pages.add(payload.page);
    if (payload.userAgent) group.devices.add(summarizeUserAgent(payload.userAgent));
    // Entries arrive newest first, so the first stack seen is the latest one.
    if (!group.stack && payload.stack) group.stack = payload.stack;
    if (!group.lastSeen || entry.timestamp > group.lastSeen) group.lastSeen = entry.timestamp;
    if (entry.timestamp < group.firstSeen) group.firstSeen = entry.timestamp;
  }
  return [...groups.values()]
    .map(({ users, sites, places, pages, devices, ...group }) => ({
      ...group,
      users: users.size,
      userIds: [...users].slice(0, 10),
      sites: [...sites],
      places: [...places].slice(0, 5),
      pages: [...pages].slice(0, 5),
      devices: [...devices].slice(0, 5),
    }))
    .sort((left, right) => right.count - left.count);
}

// Groups Cloud Run / Cloud Functions errors and warnings by service and message.
export function groupServerErrors(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const service = entry.resource?.labels?.service_name || entry.resource?.labels?.function_name || "unknown";
    const request = entry.httpRequest;
    // Request logs have no text: describe the failed call instead of showing "{}".
    const raw = entry.textPayload || entry.jsonPayload?.message || entry.jsonPayload?.error
      || (request ? `HTTP ${request.status} ${request.requestMethod || ""} ${String(request.requestUrl || "").replace(/^https?:\/\/[^/]+/, "").split("?")[0]}`
        : JSON.stringify(entry.jsonPayload || entry.protoPayload?.status || {}));
    const text = clean(raw, 240);
    const key = `${service}|${entry.severity}|${text.slice(0, 120)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        service, severity: entry.severity, message: text, detail: cleanMultiline(raw, 2000),
        count: 0, lastSeen: "", firstSeen: entry.timestamp,
      });
    }
    const group = groups.get(key);
    group.count += 1;
    if (!group.lastSeen || entry.timestamp > group.lastSeen) group.lastSeen = entry.timestamp;
    if (entry.timestamp < group.firstSeen) group.firstSeen = entry.timestamp;
  }
  return [...groups.values()].sort((left, right) => right.count - left.count);
}

const toMs = (value) => (typeof value?.toMillis === "function" ? value.toMillis() : value ? new Date(value).getTime() : NaN);

// Summary of one monitored live session, computed when the admin stops monitoring.
export function buildMonitorReport({ startMs, endMs, records = [], requests = [], shipping = 0 }) {
  const purchases = records.filter((record) => record.source !== "vip");
  const buyers = new Map();
  const rounds = new Map();
  const minutes = new Map();
  for (const record of purchases) {
    const tokens = Number(record.tokenCost || 0);
    const buyerKey = record.uid || record.username || "?";
    const buyer = buyers.get(buyerKey) || { name: record.username || record.uid || "?", count: 0, tokens: 0 };
    buyer.count += 1;
    buyer.tokens += tokens;
    buyers.set(buyerKey, buyer);
    const roundKey = `${record.drawTitle || record.drawId || ""}|${record.round || ""}`;
    const round = rounds.get(roundKey) || { room: record.drawTitle || record.drawId || "", round: record.round || "", count: 0, tokens: 0 };
    round.count += 1;
    round.tokens += tokens;
    rounds.set(roundKey, round);
    const minuteKey = Math.floor(toMs(record.createdAt) / 60000);
    if (Number.isFinite(minuteKey)) minutes.set(minuteKey, (minutes.get(minuteKey) || 0) + 1);
  }
  const busiest = [...minutes.entries()].sort((left, right) => right[1] - left[1])[0];

  const submitted = requests.filter((request) => {
    const created = toMs(request.createdAt);
    return created >= startMs && created < endMs;
  });
  const reviewed = requests.filter((request) => {
    const reviewedAt = toMs(request.reviewedAt);
    return reviewedAt >= startMs && reviewedAt < endMs;
  });
  const approved = reviewed.filter((request) => request.status === "approved");
  const waits = reviewed.map((request) => toMs(request.reviewedAt) - toMs(request.createdAt)).filter((ms) => Number.isFinite(ms) && ms >= 0);

  return {
    durationMinutes: Math.round((endMs - startMs) / 60000),
    sales: {
      purchases: purchases.length,
      tokens: purchases.reduce((sum, record) => sum + Number(record.tokenCost || 0), 0),
      buyers: buyers.size,
      busiestMinute: busiest ? { at: new Date(busiest[0] * 60000).toISOString(), purchases: busiest[1] } : null,
      byRound: [...rounds.values()].sort((left, right) => right.tokens - left.tokens),
      topBuyers: [...buyers.values()].sort((left, right) => right.tokens - left.tokens).slice(0, 10),
    },
    tokenRequests: {
      submitted: submitted.length,
      approved: approved.length,
      rejected: reviewed.filter((request) => request.status === "rejected").length,
      approvedHkd: approved.reduce((sum, request) => sum + Number(request.verifiedHkdAmount || 0), 0),
      approvedTokens: approved.reduce((sum, request) => sum + Number(request.amount || 0), 0),
      pendingAtEnd: requests.filter((request) => ["pending", "awaiting_upload"].includes(request.status)).length,
      averageWaitMinutes: waits.length ? Math.round(waits.reduce((sum, ms) => sum + ms, 0) / waits.length / 60000) : 0,
      longestWaitMinutes: waits.length ? Math.round(Math.max(...waits) / 60000) : 0,
    },
    shippingRequests: shipping,
  };
}
