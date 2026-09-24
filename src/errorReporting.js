import { httpsCallable } from "firebase/functions";
import { IS_ADMIN_SITE } from "./appVariant.js";
import { functions } from "./firebase.js";

// Sends user-visible errors and uncaught exceptions to the admin live monitor.
// Each message is sent at most once a minute and a page sends at most 30 reports.
const MAX_REPORTS_PER_PAGE = 30;
const REPEAT_WINDOW_MS = 60 * 1000;
const IGNORED = [/ResizeObserver loop/i, /chrome-extension:\/\//i, /Script error\.?$/i];
const lastSent = new Map();
let reportsSent = 0;

export function reportClientError(error, where = "") {
  try {
    const message = String(error?.message || error || "").slice(0, 300);
    const code = String(error?.code || "").slice(0, 80);
    if (!message || IGNORED.some((pattern) => pattern.test(message))) return;
    const key = `${code}|${message}`;
    const now = Date.now();
    if (reportsSent >= MAX_REPORTS_PER_PAGE || now - (lastSent.get(key) || 0) < REPEAT_WINDOW_MS) return;
    lastSent.set(key, now);
    reportsSent += 1;
    httpsCallable(functions, "reportClientError")({
      message,
      code,
      where: String(where).slice(0, 80),
      page: window.location.pathname,
      site: IS_ADMIN_SITE ? "admin" : "public",
      userAgent: navigator.userAgent,
    }).catch(() => {});
  } catch {
    // Reporting must never break the page.
  }
}

export function installGlobalErrorReporting() {
  window.addEventListener("error", (event) => reportClientError(event.error || event.message, "window.error"));
  window.addEventListener("unhandledrejection", (event) => reportClientError(event.reason, "unhandledrejection"));
}
