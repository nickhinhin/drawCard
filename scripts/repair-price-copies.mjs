// Defaults to a read-only drift check. Use --apply with authorized Google ADC
// credentials to repair display copies; canonical prices and purchase records stay intact.
import { createRequire } from "node:module";
import { syncAllPrices } from "../functions/src/price-sync.js";
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { Firestore } = require("@google-cloud/firestore");
const db = new Firestore({ projectId: process.env.GOOGLE_CLOUD_PROJECT || "livedraw-7e3c2" });
const apply = process.argv.includes("--apply");
try {
  console.log(JSON.stringify({ apply, ...await syncAllPrices(db, !apply) }));
} finally {
  await db.terminate();
}
