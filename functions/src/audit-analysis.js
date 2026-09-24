// Rule-based review of data-change audit entries (see audit.js). Each entry is
// { time, operation, collection, path, authType, authId, changes, context }.
// Thresholds live in AUDIT_THRESHOLDS so they can be tuned without touching rules.
export const FUNCTIONS_SERVICE_ACCOUNT = "livedraw-functions@livedraw-7e3c2.iam.gserviceaccount.com";

export const AUDIT_THRESHOLDS = {
  fastApprovalMs: 2 * 60 * 1000,
  largeDepositHkd: 10000,
  largeGrantTokens: 30000,
  priceChangeRatio: 0.2,
  promoRedeemers: 10,
  referralsPerDay: 10,
  purchaseBurstCount: 20,
  purchaseBurstMs: 60 * 1000,
  rejectionsPerUser: 3,
  nightStartHour: 1,
  nightEndHour: 6,
};

const SENSITIVE_COLLECTIONS = new Set([
  "users", "tokenRequests", "drawRecords", "draws", "draws/rounds", "draws/rounds/slots", "cards",
  "promoCodes", "promoRedemptions", "settings", "publicSiteSettings", "affiliateApplications",
  "affiliateCodes", "affiliateReferrals", "adminAuditLogs", "usernames",
]);
const DELETE_WATCH = new Set([
  "users", "tokenRequests", "drawRecords", "draws", "draws/rounds/slots", "cards", "promoRedemptions",
  "affiliateApplications", "affiliateCodes", "affiliateReferrals",
]);
const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

// Firebase Auth users appear with their uid (authType "app_user" or "unknown");
// console and gcloud edits carry an email address instead.
const isPlayer = (entry) => Boolean(entry.authId) && !String(entry.authId).includes("@")
  && entry.authType !== "service_account";
// Admin SDK writes from our functions report authType "unknown" or "service_account";
// the functions' service account ID is what identifies them.
const isServer = (entry) => entry.authId === FUNCTIONS_SERVICE_ACCOUNT;
const changed = (entry, field) => Object.hasOwn(entry.changes || {}, field);
const after = (entry, field) => entry.changes?.[field]?.after;
const before = (entry, field) => entry.changes?.[field]?.before;
const context = (entry, field) => (changed(entry, field) ? after(entry, field) : entry.context?.[field]);
const millis = (value) => (value ? new Date(value).getTime() : NaN);
const actorOf = (entry) => `${entry.authType}${entry.authId ? `:${entry.authId}` : ""}`;

function hongKongHour(time) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Hong_Kong", hour: "2-digit", hour12: false }).format(new Date(time)));
}

function finding(severity, rule, title, entry, detail) {
  return {
    severity, rule, title, detail,
    time: entry?.time || "", path: entry?.path || "", actor: entry ? actorOf(entry) : "",
  };
}

function priceShift(oldValue, newValue) {
  const oldNumber = Number(oldValue);
  const newNumber = Number(newValue);
  if (!Number.isFinite(oldNumber) || !Number.isFinite(newNumber) || oldNumber <= 0) return 0;
  return Math.abs(newNumber - oldNumber) / oldNumber;
}

export function analyzeAuditEntries(entries, thresholds = AUDIT_THRESHOLDS) {
  const t = { ...AUDIT_THRESHOLDS, ...thresholds };
  const findings = [];
  const promoRedeemers = new Map();
  const phoneOwners = new Map();
  const addressOwners = new Map();
  const referralsByReferrer = new Map();
  const purchasesByActor = new Map();
  const rejectionsByUser = new Map();

  // The same event can be read from both the locked and the default log bucket.
  const seen = new Set();
  const uniqueEntries = entries.filter((entry) => {
    if (!entry.eventId) return true;
    if (seen.has(entry.eventId)) return false;
    seen.add(entry.eventId);
    return true;
  });

  for (const entry of uniqueEntries) {
    const collection = entry.collection;
    const approvedNow = changed(entry, "status") && after(entry, "status") === "approved";

    // 1. Changes that did not come from the website or our Cloud Functions.
    if (SENSITIVE_COLLECTIONS.has(collection) && !isPlayer(entry) && !isServer(entry)) {
      findings.push(finding("high", "direct-edit", "唔經網站或伺服器嘅直接修改", entry,
        `${entry.operation} ${entry.path}，改動欄位：${Object.keys(entry.changes || {}).join(", ") || "-"}`));
    }

    // 2. Token balance went up without an approved deposit or a card conversion.
    if (collection === "users" && entry.operation === "update" && changed(entry, "tokens")) {
      const gain = Number(after(entry, "tokens")) - Number(before(entry, "tokens"));
      if (gain > 0 && !changed(entry, "lastTokenGrantRequestId") && !changed(entry, "lastConversionRecordId")) {
        findings.push(finding("high", "unexplained-tokens", "代幣無故增加", entry,
          `代幣 ${before(entry, "tokens")} → ${after(entry, "tokens")}（+${gain}），冇對應批准入數或卡牌兌換`));
      }
    }

    // 3. Approver approved their own request or application.
    if ((collection === "tokenRequests" || collection === "affiliateApplications") && approvedNow) {
      const owner = context(entry, "uid");
      const reviewer = context(entry, "reviewedBy");
      if (owner && reviewer && owner === reviewer) {
        findings.push(finding("high", "self-approval", "自己批准自己", entry, `申請人同批准人都係 ${owner}`));
      }
    }

    // 4. Payment details that customers pay to were changed.
    if (entry.path === "settings/payment" && entry.operation !== "create") {
      findings.push(finding("high", "payment-settings", "收款資料被改", entry,
        ["fpsIdentifier", "fpsName"].filter((field) => changed(entry, field))
          .map((field) => `${field}: ${before(entry, field)} → ${after(entry, field)}`).join("；") || "付款設定有改動"));
    }

    // 5. Results changed after a card was already awarded.
    if (collection === "drawRecords" && entry.operation === "update") {
      for (const field of ["cardId", "resultSide"]) {
        if (changed(entry, field) && before(entry, field)) {
          findings.push(finding("high", "result-tampering", "已派發賽果被改", entry,
            `${field}: ${before(entry, field)} → ${after(entry, field)}`));
        }
      }
      for (const field of ["cardConversionValue", "cardValue"]) {
        if (changed(entry, field) && before(entry, field) !== null && before(entry, field) !== undefined) {
          findings.push(finding("medium", "awarded-value-change", "已派發卡牌價值被改", entry,
            `${field}: ${before(entry, field)} → ${after(entry, field)}`));
        }
      }
    }
    if (collection === "draws" && changed(entry, "roundResultSides")) {
      const oldSides = before(entry, "roundResultSides") || {};
      const newSides = after(entry, "roundResultSides") || {};
      for (const [round, sides] of Object.entries(oldSides)) {
        for (const [slot, side] of Object.entries(sides || {})) {
          const next = newSides?.[round]?.[slot];
          // A set side that changes or is cleared (a two-step swap) is flagged.
          if (side && next !== side) {
            findings.push(finding("high", "result-tampering", "天堂地獄結果被改", entry, `${round} #${slot}: ${side} → ${next || "（清除）"}`));
          }
        }
      }
    }

    // 6. Deletions of records, and any change to the admin audit trail.
    if (collection === "adminAuditLogs" && entry.operation !== "create") {
      findings.push(finding("critical", "audit-tampering", "管理員審計紀錄被修改或刪除", entry, `${entry.operation} ${entry.path}`));
    } else if (entry.operation === "delete" && DELETE_WATCH.has(collection)) {
      findings.push(finding("high", "deletion", "紀錄被刪除", entry, `刪除 ${entry.path}`));
    }

    // 7 & 8. Very fast or very large deposit approvals.
    if (collection === "tokenRequests" && approvedNow && context(entry, "proofMode") !== "promo") {
      const waited = millis(entry.time) - millis(context(entry, "createdAt"));
      if (Number.isFinite(waited) && waited >= 0 && waited < t.fastApprovalMs) {
        findings.push(finding("medium", "fast-approval", "極速批准入數", entry,
          `提交後 ${Math.round(waited / 1000)} 秒已批准（HK$${context(entry, "verifiedHkdAmount") ?? context(entry, "hkdAmount")}）`));
      }
      const hkd = Number(context(entry, "verifiedHkdAmount") ?? context(entry, "hkdAmount") ?? 0);
      const tokens = Number(context(entry, "amount") || 0);
      if (hkd >= t.largeDepositHkd || tokens >= t.largeGrantTokens) {
        findings.push(finding("medium", "large-deposit", "大額入數", entry, `核實 HK$${hkd}，批出 ${tokens} 代幣`));
      }
    }

    // 9. Pricing and program rules changed.
    if (["settings/tokenPackages", "settings/vipProgram", "settings/cardPricing"].includes(entry.path) && entry.operation !== "create") {
      findings.push(finding("medium", "rules-change", "價錢或規則設定被改", entry, `${entry.path}：${Object.keys(entry.changes || {}).join(", ")}`));
    }
    if (collection === "cards" && entry.operation === "update") {
      const shifts = ["tokenValue", "conversionValue"].filter((field) => changed(entry, field))
        .map((field) => [field, priceShift(before(entry, field), after(entry, field))])
        .filter(([, shift]) => shift >= t.priceChangeRatio);
      if (shifts.length) {
        findings.push(finding("medium", "card-price-change", "卡價大幅改動", entry,
          shifts.map(([field, shift]) => `${field}: ${before(entry, field)} → ${after(entry, field)}（${Math.round(shift * 100)}%）`).join("；")));
      }
    }
    if (collection === "promoCodes" && entry.operation === "update" && changed(entry, "amount")) {
      findings.push(finding("medium", "promo-change", "推廣碼金額被改", entry, `amount: ${before(entry, "amount")} → ${after(entry, "amount")}`));
    }

    // Aggregations for rules 10–15.
    if (collection === "promoRedemptions" && entry.operation === "create") {
      const code = context(entry, "promoCodeId") || "?";
      if (!promoRedeemers.has(code)) promoRedeemers.set(code, { uids: new Set(), entry });
      promoRedeemers.get(code).uids.add(context(entry, "uid"));
    }
    if (collection === "drawRecords" && changed(entry, "shippingPhone") && after(entry, "shippingPhone")) {
      const phone = String(after(entry, "shippingPhone")).replace(/\D/g, "");
      if (!phoneOwners.has(phone)) phoneOwners.set(phone, { uids: new Set(), entry });
      phoneOwners.get(phone).uids.add(context(entry, "uid"));
    }
    if (collection === "drawRecords" && changed(entry, "shippingAddress") && after(entry, "shippingAddress")) {
      const address = String(after(entry, "shippingAddress")).replace(/\s+/g, "");
      // SF pickup points are shared by many customers by design.
      if (!address.startsWith("【順豐")) {
        if (!addressOwners.has(address)) addressOwners.set(address, { uids: new Set(), entry });
        addressOwners.get(address).uids.add(context(entry, "uid"));
      }
    }
    if (collection === "affiliateReferrals" && entry.operation === "create") {
      const referrer = context(entry, "referrerUid") || "?";
      if (!referralsByReferrer.has(referrer)) referralsByReferrer.set(referrer, []);
      referralsByReferrer.get(referrer).push(entry);
    }
    if (collection === "draws/rounds/slots" && isPlayer(entry) && after(entry, "status") === "locked") {
      if (!purchasesByActor.has(entry.authId)) purchasesByActor.set(entry.authId, []);
      purchasesByActor.get(entry.authId).push(entry);
    }
    if (collection === "tokenRequests" && changed(entry, "status") && after(entry, "status") === "rejected") {
      const owner = context(entry, "uid") || "?";
      if (!rejectionsByUser.has(owner)) rejectionsByUser.set(owner, []);
      rejectionsByUser.get(owner).push(entry);
    }

    // 13. Sensitive server-side actions late at night (Hong Kong time).
    if (isServer(entry) && (approvedNow || collection === "settings")) {
      const hour = hongKongHour(entry.time);
      if (hour >= t.nightStartHour && hour < t.nightEndHour) {
        findings.push(finding("low", "night-admin", "深夜管理操作", entry, `香港時間 ${hour} 點：${entry.operation} ${entry.path}`));
      }
    }
  }

  // 10. One promo code redeemed by many accounts.
  for (const [code, { uids, entry }] of promoRedeemers) {
    if (uids.size >= t.promoRedeemers) {
      findings.push(finding("medium", "promo-abuse", "推廣碼被大量帳戶兌換", entry, `${code} 被 ${uids.size} 個帳戶兌換`));
    }
  }
  // 11. The same phone or home address used by several accounts.
  for (const [label, owners] of [["電話", phoneOwners], ["地址", addressOwners]]) {
    for (const [value, { uids, entry }] of owners) {
      if (uids.size >= 2) {
        findings.push(finding("medium", "shared-contact", `多個帳戶用同一${label}`, entry, `${label} ${value} 被 ${uids.size} 個帳戶使用：${[...uids].join(", ")}`));
      }
    }
  }
  // 12. Many referrals for one referrer inside 24 hours.
  for (const [referrer, list] of referralsByReferrer) {
    const sorted = list.sort((a, b) => millis(a.time) - millis(b.time));
    for (let start = 0, end = 0; end < sorted.length; end += 1) {
      while (millis(sorted[end].time) - millis(sorted[start].time) > 86400000) start += 1;
      if (end - start + 1 >= t.referralsPerDay) {
        findings.push(finding("medium", "referral-farming", "推薦人 24 小時內大量新帳戶", sorted[end], `${referrer} 24 小時內帶來 ${end - start + 1} 個新帳戶`));
        break;
      }
    }
  }
  // 14. Purchase bursts that look automated.
  for (const [actor, list] of purchasesByActor) {
    const sorted = list.sort((a, b) => millis(a.time) - millis(b.time));
    for (let start = 0, end = 0; end < sorted.length; end += 1) {
      while (millis(sorted[end].time) - millis(sorted[start].time) > t.purchaseBurstMs) start += 1;
      if (end - start + 1 >= t.purchaseBurstCount) {
        findings.push(finding("low", "purchase-burst", "疑似機械人大量購買", sorted[end], `${actor} 一分鐘內購買 ${end - start + 1} 個號碼`));
        break;
      }
    }
  }
  // 15. Repeatedly rejected deposit requests.
  for (const [owner, list] of rejectionsByUser) {
    if (list.length >= t.rejectionsPerUser) {
      findings.push(finding("low", "many-rejections", "多次申請被駁回", list.at(-1), `${owner} 有 ${list.length} 個申請被駁回`));
    }
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || millis(a.time) - millis(b.time));
  const summary = findings.reduce((counts, item) => ({ ...counts, [item.severity]: (counts[item.severity] || 0) + 1 }),
    { critical: 0, high: 0, medium: 0, low: 0 });
  return { findings, summary, entryCount: uniqueEntries.length };
}
