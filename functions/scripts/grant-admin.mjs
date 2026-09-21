import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const [uidArg, emailArg] = process.argv.slice(2);
const uid = String(uidArg || "").trim();
const expectedEmail = String(emailArg || "").trim().toLowerCase();
const allowedUids = new Set(String(process.env.ADMIN_UID_ALLOWLIST || "").split(",").map((item) => item.trim()).filter(Boolean));

if (!uid || !expectedEmail) {
  throw new Error("用法：ADMIN_UID_ALLOWLIST=... npm run grant-admin -- <firebase-uid> <google-email>");
}
if (!allowedUids.has(uid)) throw new Error("UID 不在 ADMIN_UID_ALLOWLIST，已拒絕授權。");

initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const user = await auth.getUser(uid);
if (!user.emailVerified || String(user.email || "").toLowerCase() !== expectedEmail) {
  throw new Error("Firebase UID、已驗證 Google 電郵不匹配，已拒絕授權。");
}

await auth.setCustomUserClaims(uid, { ...(user.customClaims || {}), admin: true });
console.log(`已為 UID ${uid} 設定 admin claim；請登出再登入以刷新權限。`);
