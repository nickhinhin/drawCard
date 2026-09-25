import { logger } from "firebase-functions";
import {
  onDocumentDeletedWithAuthContext,
  onDocumentUpdatedWithAuthContext,
  onDocumentWrittenWithAuthContext,
} from "firebase-functions/v2/firestore";

// Tamper-evident data-change log. Every write to the collections below — from
// players, admin functions or the Firebase console — produces one structured
// Cloud Logging entry. A log sink routes these entries (filter:
// jsonPayload.auditType="livedraw-data-change") to a retention-locked log
// bucket, so they cannot be edited or deleted during the retention period.
export const AUDIT_TYPE = "livedraw-data-change";
const MAX_TEXT_LENGTH = 300;
const MAX_ARRAY_ITEMS = 50;
// Stable fields copied from the document on every entry, so suspicious-activity
// rules can tell who owns a record and what state it is in even when unchanged.
const CONTEXT_FIELDS = [
  "uid", "username", "email", "status", "amount", "hkdAmount", "verifiedHkdAmount", "proofMode",
  "promoCodeId", "reviewedBy", "createdAt", "cardId", "targetCardId", "resultSide", "tokenCost",
  "drawId", "referredByUid", "referrerUid", "shippingAddress", "shippingPhone", "active", "code",
];

const auditOptions = {
  region: "asia-east2",
  memory: "256MiB",
  timeoutSeconds: 30,
  // Retry on failure; the analysis removes duplicate deliveries by eventId.
  retry: true,
};

// Firestore values become plain JSON; long strings (e.g. image URLs) are trimmed.
export function auditValue(value, depth = 0) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value?.path === "string" && typeof value?.firestore === "object") return `ref:${value.path}`;
  if (typeof value === "string") {
    return value.length > MAX_TEXT_LENGTH ? `${value.slice(0, MAX_TEXT_LENGTH)}…(${value.length} chars)` : value;
  }
  if (typeof value !== "object") return value;
  if (depth > 6) return "[nested]";
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => auditValue(item, depth + 1));
    return value.length > MAX_ARRAY_ITEMS ? [...items, `…(${value.length} items)`] : items;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, auditValue(item, depth + 1)]));
}

// Untrimmed JSON form of a value, used only to decide whether a field changed.
function fullJson(value) {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item?.toDate === "function") return item.toDate().toISOString();
    if (typeof item?.path === "string" && typeof item?.firestore === "object") return `ref:${item.path}`;
    return item;
  });
}

// Returns only the top-level fields that changed, with their old and new values.
// Changes are detected on the full value so edits past the display trimming are still logged.
export function auditChanges(before, after) {
  const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].sort();
  const changes = {};
  for (const key of keys) {
    if (fullJson(before?.[key]) !== fullJson(after?.[key])) {
      changes[key] = { before: auditValue(before?.[key]) ?? null, after: auditValue(after?.[key]) ?? null };
    }
  }
  return changes;
}

export function auditEntry(event) {
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  const operation = before && after ? "update" : after ? "create" : "delete";
  const path = event.data?.after?.ref?.path || event.data?.before?.ref?.path || event.document || "";
  return {
    auditType: AUDIT_TYPE,
    eventId: event.id,
    eventTime: event.time,
    operation,
    collection: path.split("/").slice(0, -1).filter((_part, index) => index % 2 === 0).join("/"),
    path,
    // authType: app_user | service_account | api_key | system | unauthenticated | unknown.
    // Console and gcloud edits appear as a service account or the owner's account.
    authType: event.authType || "unknown",
    authId: event.authId || "",
    changes: auditChanges(before, after),
    context: auditContext(after || before),
  };
}

export function auditContext(data) {
  return Object.fromEntries(CONTEXT_FIELDS
    .filter((field) => data?.[field] !== undefined)
    .map((field) => [field, auditValue(data[field])]));
}

function auditTrigger(document) {
  return onDocumentWrittenWithAuthContext({ ...auditOptions, document }, (event) => {
    const entry = auditEntry(event);
    if (!Object.keys(entry.changes).length) return;
    logger.write({ severity: "NOTICE", message: `${entry.operation} ${entry.path}`, ...entry });
  });
}

export const auditUsers = auditTrigger("users/{uid}");
export const auditUsernames = auditTrigger("usernames/{usernameId}");
export const auditTokenRequests = auditTrigger("tokenRequests/{requestId}");
export const auditDrawRecords = auditTrigger("drawRecords/{recordId}");
export const auditDraws = auditTrigger("draws/{drawId}");
export const auditRounds = auditTrigger("draws/{drawId}/rounds/{roundId}");
export const auditSlots = auditTrigger("draws/{drawId}/rounds/{roundId}/slots/{slotId}");
export const auditLegacySlots = auditTrigger("draws/{drawId}/slots/{slotId}");
export const auditMonitorSessions = auditTrigger("monitorSessions/{sessionId}");
export const auditCards = auditTrigger("cards/{cardId}");
export const auditPromoCodes = auditTrigger("promoCodes/{codeId}");
export const auditPromoRedemptions = auditTrigger("promoRedemptions/{redemptionId}");
export const auditSettings = auditTrigger("settings/{settingId}");
export const auditSiteSettings = auditTrigger("publicSiteSettings/{settingId}");
export const auditAffiliateApplications = auditTrigger("affiliateApplications/{applicationId}");
export const auditAffiliateCodes = auditTrigger("affiliateCodes/{codeId}");
export const auditAffiliateReferrals = auditTrigger("affiliateReferrals/{referralId}");

// Admin audit documents are written once by functions; any later edit or
// deletion of them is itself suspicious and gets logged. Separate update and
// delete triggers mean the many normal creates do not invoke a function at all.
function adminAuditLogTrigger(trigger) {
  return trigger({ ...auditOptions, document: "adminAuditLogs/{auditId}" }, (event) => {
    // Delete events carry the removed snapshot itself rather than a before/after change.
    const data = "before" in (event.data || {}) ? event.data : { before: event.data, after: { exists: false } };
    const entry = auditEntry({ ...event, data });
    logger.write({ severity: "WARNING", message: `${entry.operation} ${entry.path}`, ...entry });
  });
}

export const auditAdminAuditLogUpdates = adminAuditLogTrigger(onDocumentUpdatedWithAuthContext);
export const auditAdminAuditLogDeletes = adminAuditLogTrigger(onDocumentDeletedWithAuthContext);
