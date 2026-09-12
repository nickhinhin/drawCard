/* global fetch, URLSearchParams, process, console */

const auth = require("/usr/local/lib/node_modules/firebase-tools/lib/auth.js");
const api = require("/usr/local/lib/node_modules/firebase-tools/lib/apiv2.js");

const PROJECT_ID = "drawcard-26e01";
const DATABASE_ROOT = `projects/${PROJECT_ID}/databases/(default)`;
const API_ROOT = `https://firestore.googleapis.com/v1/${DATABASE_ROOT}`;
const SHOWCASE_LIMIT = 12;

function readValue(value) {
  if (!value) return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  return undefined;
}

function cardFromDocument(document) {
  const fields = document.fields || {};
  return {
    id: document.name.split("/").pop(),
    name: String(readValue(fields.name) || "").trim(),
    imageUrl: String(readValue(fields.imageUrl) || "").trim(),
    tokenValue: Number(readValue(fields.tokenValue) || 0),
    category: String(readValue(fields.category) || "其他").trim() || "其他",
  };
}

async function firestoreRequest(token, path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Firestore request failed (${response.status}): ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
}

async function listDocuments(token, collectionId) {
  const documents = [];
  let pageToken = "";
  do {
    const search = new URLSearchParams({ pageSize: "300" });
    if (pageToken) search.set("pageToken", pageToken);
    const response = await firestoreRequest(
      token,
      `/documents/${collectionId}?${search.toString()}`,
    );
    documents.push(...(response.documents || []));
    pageToken = response.nextPageToken || "";
  } while (pageToken);
  return documents;
}

async function main() {
  const account = auth.getProjectDefaultAccount(process.cwd()) || auth.getGlobalDefaultAccount();
  if (!account) throw new Error("Firebase CLI is not signed in.");
  auth.setActiveAccount({}, account);
  const token = await api.getAccessToken();

  const [cardDocuments, showcaseDocuments] = await Promise.all([
    listDocuments(token, "cards"),
    listDocuments(token, "publicCardShowcase"),
  ]);
  const featuredCards = cardDocuments
    .map(cardFromDocument)
    .filter((card) => card.name && card.imageUrl && card.tokenValue > 0)
    .sort((left, right) => right.tokenValue - left.tokenValue)
    .slice(0, SHOWCASE_LIMIT);

  if (!featuredCards.length) throw new Error("No cards with valid images were found.");

  const writes = showcaseDocuments.map((document) => ({
    update: {
      name: document.name,
      fields: {
        ...(document.fields || {}),
        active: { booleanValue: false },
      },
    },
    updateMask: { fieldPaths: ["active"] },
  }));

  featuredCards.forEach((card, index) => {
    writes.push({
      update: {
        name: `${DATABASE_ROOT}/documents/publicCardShowcase/${card.id}`,
        fields: {
          name: { stringValue: card.name },
          imageUrl: { stringValue: card.imageUrl },
          tokenValue: { integerValue: String(Math.round(card.tokenValue)) },
          category: { stringValue: card.category },
          active: { booleanValue: true },
          rank: { integerValue: String(index + 1) },
          updatedAt: { timestampValue: new Date().toISOString() },
        },
      },
      updateMask: {
        fieldPaths: ["name", "imageUrl", "tokenValue", "category", "active", "rank", "updatedAt"],
      },
    });
  });

  await firestoreRequest(token, "/documents:commit", {
    method: "POST",
    body: JSON.stringify({ writes }),
  });
  console.log(`Published ${featuredCards.length} cards to the public Beta showcase.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
