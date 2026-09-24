import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// The admin workspace ships only from the separate admin Hosting site.
// Fail the public build if any admin-only UI or endpoint leaks into dist/.
const publicDir = "dist";
const adminMarkers = [
  "LiveDraw 管理後台",
  "adminReviewTokenRequest",
  "adminBatchWrite",
  "adminUploadImage",
  "adminEnsureDrawSlots",
  "adminLiveHealth",
  "adminAuditAnalyze",
  "adminMonitorSession",
];

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  }));
  return nested.flat();
}

const files = (await listFiles(publicDir)).filter((file) => /\.(js|html)$/.test(file));
for (const file of files) {
  const content = await readFile(file, "utf8");
  const leaked = adminMarkers.find((marker) => content.includes(marker));
  if (leaked) {
    throw new Error(`公開網站建置包含管理後台代碼（${leaked}）：${file}`);
  }
}

console.log("已確認公開網站建置不包含管理後台。");
