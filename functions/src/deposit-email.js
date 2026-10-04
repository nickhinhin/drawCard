import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import nodemailer from "nodemailer";

// Emails the team whenever a player submits a 入金 (FPS payment proof) request.
// Mail is sent through the team Gmail account with an App Password stored in
// Secret Manager: firebase functions:secrets:set GMAIL_APP_PASSWORD
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");
export const DEPOSIT_EMAIL_ADDRESS = "livedraw.internal@gmail.com";
const ADMIN_SITE_URL = "https://livedraw-adminpage-7e3c2.web.app";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]
));
const formatNumber = (value) => Number(value || 0).toLocaleString("en-US");

function formatHongKongTime(date) {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(date);
}

// Builds the notification for one token request, or null when it is not a 入金
// (promo-code redemptions are created by players directly and need no email).
export function buildDepositEmail(requestId, data, createdAt = new Date()) {
  if (!data || data.proofMode !== "storage") return null;
  const username = String(data.username || data.uid || "未知會員");
  const hkd = formatNumber(data.hkdAmount);
  const duplicates = Array.isArray(data.duplicateProofRequestIds) ? data.duplicateProofRequestIds.length : 0;
  const rows = [
    ["會員", username],
    ["入金金額", `HK$${hkd}`],
    ["代幣", formatNumber(data.amount)],
    ["提交時間", `${formatHongKongTime(createdAt)}（香港時間）`],
    ["申請編號", requestId],
  ];
  const warning = duplicates
    ? `注意：此付款證明與另外 ${duplicates} 個申請使用的圖片完全相同，請核實後才批准。`
    : "";
  const subject = `${duplicates ? "【重複證明】" : ""}新入金申請：${username} HK$${hkd}`;
  const text = [
    "收到新的入金申請，請到管理後台「代幣審核」核對銀行紀錄後處理。",
    "",
    ...rows.map(([label, value]) => `${label}：${value}`),
    ...(warning ? ["", warning] : []),
    "",
    `管理後台：${ADMIN_SITE_URL}`,
  ].join("\n");
  const html = `<p>收到新的入金申請，請到管理後台「代幣審核」核對銀行紀錄後處理。</p>
<table cellpadding="6" style="border-collapse:collapse">${rows.map(([label, value]) => (
    `<tr><td style="color:#666">${escapeHtml(label)}</td><td><strong>${escapeHtml(value)}</strong></td></tr>`
  )).join("")}</table>
${warning ? `<p style="color:#c00"><strong>${escapeHtml(warning)}</strong></p>` : ""}
<p><a href="${ADMIN_SITE_URL}">開啟管理後台</a></p>`;
  return { subject, text, html };
}

// Not retried: a failed send is logged (and shown in 直播監察) rather than risking
// duplicate emails; the request itself is already saved and visible in 代幣審核.
export const emailNewDepositRequest = onDocumentCreated({
  document: "tokenRequests/{requestId}",
  region: "asia-east2",
  secrets: [GMAIL_APP_PASSWORD],
  timeoutSeconds: 30,
  memory: "256MiB",
}, async (event) => {
  const createdAt = event.time ? new Date(event.time) : new Date();
  const email = buildDepositEmail(event.params.requestId, event.data?.data(), createdAt);
  if (!email) return;
  // The emulator can read the real secret from Secret Manager; never send real mail
  // while testing.
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    logger.info("Emulator: deposit email not sent.", { requestId: event.params.requestId, subject: email.subject });
    return;
  }
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user: DEPOSIT_EMAIL_ADDRESS, pass: GMAIL_APP_PASSWORD.value() },
  });
  try {
    await transport.sendMail({ from: `LiveDraw 入金通知 <${DEPOSIT_EMAIL_ADDRESS}>`, to: DEPOSIT_EMAIL_ADDRESS, ...email });
  } catch (error) {
    logger.error("Deposit email failed.", { requestId: event.params.requestId, error: String(error?.message || error) });
  }
});
