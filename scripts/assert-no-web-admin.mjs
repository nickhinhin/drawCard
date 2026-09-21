import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const forbidden = ["管理後台", "代幣審批", "付款設定", "直播結果派發"];

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  }));
  return nested.flat();
}

const files = (await filesUnder("dist")).filter((path) => /\.(js|html|css)$/.test(path));
for (const file of files) {
  const source = await readFile(file, "utf8");
  const match = forbidden.find((label) => source.includes(label));
  if (match) throw new Error(`公開網站 bundle 仍包含管理後台內容：${match} (${file})`);
}

console.log("公開網站 bundle 已確認不包含管理後台入口或管理頁文字。");
