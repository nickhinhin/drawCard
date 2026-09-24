#!/usr/bin/env node
/**
 * Copies only reusable LiveDraw operational data between Firebase projects.
 * It deliberately excludes accounts, draws, and every customer activity record.
 * Run with --apply after reviewing the dry-run summary.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const sourceProject = "drawcard-26e01";
const targetProject = "livedraw-7e3c2";
const apply = process.argv.includes("--apply");
const verifyOnly = process.argv.includes("--verify");

// `liveState` contains an active draw reference, so it must not travel without draws.
const collectionPlan = [
  { name: "cards" },
  { name: "publicCardShowcase" },
  { name: "promoCodes" },
  { name: "settings", excludeIDs: new Set(["liveState"]) },
];

async function accessToken() {
  const configPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  if (!config.tokens?.access_token) throw new Error("Firebase CLI login token is unavailable.");
  return config.tokens.access_token;
}

async function firestoreRequest(token, project, suffix, options = {}) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/${suffix}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    },
  );
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || `Firestore request failed (${response.status}).`);
  return body;
}

async function listDocuments(token, project, collection) {
  const documents = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({ pageSize: "300" });
    if (pageToken) query.set("pageToken", pageToken);
    const page = await firestoreRequest(token, project, `documents/${collection}?${query}`);
    documents.push(...(page.documents || []));
    pageToken = page.nextPageToken || "";
  } while (pageToken);
  return documents;
}

function documentID(document) {
  return document.name.split("/").at(-1);
}

function targetDocument(sourceDocument) {
  const id = documentID(sourceDocument);
  return {
    name: `projects/${targetProject}/databases/(default)/documents/${sourceDocument.name.split("/documents/").at(-1)}`,
    fields: sourceDocument.fields || {},
    // Preserve source IDs but never overwrite an unexpected target document.
    currentDocument: { exists: false },
    id,
  };
}

async function commit(token, documents) {
  for (let start = 0; start < documents.length; start += 400) {
    const slice = documents.slice(start, start + 400);
    await firestoreRequest(token, targetProject, "documents:commit", {
      method: "POST",
      body: JSON.stringify({
        writes: slice.map(({ name, fields, currentDocument }) => ({ update: { name, fields }, currentDocument })),
      }),
    });
  }
}

const token = await accessToken();
const planned = [];
for (const item of collectionPlan) {
  const source = await listDocuments(token, sourceProject, item.name);
  const target = await listDocuments(token, targetProject, item.name);
  if (target.length && !verifyOnly) throw new Error(`Target collection ${item.name} is not empty; migration stopped to prevent overwrites.`);
  const selected = source.filter((document) => !item.excludeIDs?.has(documentID(document)));
  planned.push({ ...item, source, selected, target });
  console.log(`${item.name}: source ${selected.length}, target ${target.length}${item.excludeIDs ? ` (${source.length - selected.length} excluded)` : ""}`);
}

if (verifyOnly) {
  for (const item of planned) {
    const sourceIDs = new Set(item.selected.map(documentID));
    const targetIDs = new Set(item.target.map(documentID));
    const missing = [...sourceIDs].filter((id) => !targetIDs.has(id));
    const unexpected = [...targetIDs].filter((id) => !sourceIDs.has(id));
    if (missing.length || unexpected.length) {
      throw new Error(`${item.name} verification failed: ${missing.length} missing, ${unexpected.length} unexpected.`);
    }
  }
  console.log("Verification complete: every selected document ID matches the source.");
  process.exit(0);
}

if (!apply) {
  console.log("Dry run only. Re-run with --apply to copy these documents.");
  process.exit(0);
}

for (const item of planned) {
  await commit(token, item.selected.map(targetDocument));
  const copied = await listDocuments(token, targetProject, item.name);
  if (copied.length !== item.selected.length) {
    throw new Error(`${item.name} verification failed: expected ${item.selected.length}, found ${copied.length}.`);
  }
  console.log(`${item.name}: copied and verified (${copied.length})`);
}

console.log("Migration complete. No member, draw, or activity-record collections were read or copied.");
