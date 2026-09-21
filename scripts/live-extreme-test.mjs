import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAdditionalUserInfo,
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
} from "firebase/auth";
import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  getFirestore,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";

const require = createRequire(import.meta.url);
const firebaseToolsAuth = require("/usr/local/lib/node_modules/firebase-tools/lib/auth.js");
const firebaseToolsApi = require("/usr/local/lib/node_modules/firebase-tools/lib/apiv2.js");

const PROJECT_ID = "drawcard-26e01";
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBJEFwKf6hGSEv0gR-amTuKk0FJ7igNGE4",
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
};
const RECORD_COUNT = 12_000;
const SLOT_COUNT = 1_200;
const SHIPPING_COUNT = 1_200;
const ADMIN_BATCH_SIZE = 400;
const CLIENT_BATCH_SIZE = 400;
const DATABASE_ROOT = `projects/${PROJECT_ID}/databases/(default)`;
const API_ROOT = `https://firestore.googleapis.com/v1/${DATABASE_ROOT}`;

if (process.env.ALLOW_LIVE_EXTREME_TEST !== PROJECT_ID) {
  throw new Error(`Refusing live writes. Set ALLOW_LIVE_EXTREME_TEST=${PROJECT_ID} explicitly.`);
}

function encode(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return {
    mapValue: {
      fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])),
    },
  };
}

async function apiRequest(accessToken, path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Firestore API ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function commitWrites(accessToken, writes) {
  for (let start = 0; start < writes.length; start += ADMIN_BATCH_SIZE) {
    const batch = writes.slice(start, start + ADMIN_BATCH_SIZE);
    await apiRequest(accessToken, "/documents:commit", {
      method: "POST",
      body: JSON.stringify({ writes: batch }),
    });
    console.log(`ADMIN_PROGRESS ${Math.min(start + batch.length, writes.length)}/${writes.length}`);
  }
}

function documentWrite(path, fields) {
  return {
    update: {
      name: `${DATABASE_ROOT}/documents/${path}`,
      fields: encode(fields).mapValue.fields,
    },
  };
}

function deleteWrite(path) {
  return { delete: `${DATABASE_ROOT}/documents/${path}` };
}

function elapsed(startedAt) {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

async function main() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const prefix = `__stress_${stamp}`;
  const email = `${prefix}@example.test`;
  const password = `Stress-${crypto.randomUUID()}-Aa1!`;
  const roomId = `${prefix}_room`;
  const app = initializeApp(FIREBASE_CONFIG, prefix);
  const auth = getAuth(app);
  const db = getFirestore(app);
  let testUser;
  let createdAuthUser = false;
  let accessToken;
  let uid = "";
  const createdPaths = [];
  const metrics = {};

  try {
    const account = firebaseToolsAuth.getProjectDefaultAccount(process.cwd())
      || firebaseToolsAuth.getGlobalDefaultAccount();
    if (!account) throw new Error("Firebase CLI is not signed in.");
    firebaseToolsAuth.setActiveAccount({}, account);
    accessToken = await firebaseToolsApi.getAccessToken();

    let credential;
    try {
      credential = await createUserWithEmailAndPassword(auth, email, password);
      createdAuthUser = true;
      metrics.authMode = "temporary-email-account";
    } catch (error) {
      if (error?.code !== "auth/operation-not-allowed") throw error;
      credential = await signInWithCredential(
        auth,
        GoogleAuthProvider.credential(null, accessToken),
      );
      createdAuthUser = Boolean(getAdditionalUserInfo(credential)?.isNewUser);
      metrics.authMode = "firebase-cli-google-account";
    }
    testUser = credential.user;
    uid = testUser.uid;
    console.log(`TEST_ACCOUNT ${uid} ${prefix}`);

    const now = new Date();
    const seedWrites = [
      ...(metrics.authMode === "temporary-email-account" ? [documentWrite(`users/${uid}`, {
        uid,
        email,
        username: `Stress_${stamp}`,
        displayName: "Extreme stress test",
        photoURL: "",
        phoneNumber: "",
        role: "user",
        tokens: 1_000,
        createdAt: now,
        updatedAt: now,
      })] : []),
      documentWrite(`draws/${roomId}`, {
        title: "EXTREME TEST ROOM",
        slug: roomId,
        status: "completed",
        currentRound: 1,
        totalRounds: 1,
        createdAt: now,
        updatedAt: now,
      }),
      documentWrite(`draws/${roomId}/rounds/round-001`, {
        round: "round-001",
        roundNumber: 1,
        createdAt: now,
        updatedAt: now,
      }),
    ];
    if (metrics.authMode === "temporary-email-account") createdPaths.push(`users/${uid}`);
    createdPaths.push(`draws/${roomId}`, `draws/${roomId}/rounds/round-001`);

    for (let index = 0; index < RECORD_COUNT; index += 1) {
      const recordId = `${prefix}_record_${String(index).padStart(5, "0")}`;
      const path = `drawRecords/${recordId}`;
      const group = Math.floor(index / (RECORD_COUNT / 4));
      const collectionStatus = ["pending", "shipping", "shipped", "converted"][group];
      const record = {
        uid,
        username: `Stress_${stamp}`,
        drawId: roomId,
        drawTitle: "EXTREME TEST ROOM",
        roomSlug: roomId,
        round: "round-001",
        roundSort: 1,
        number: (index % 100) + 1,
        tokenCost: 100 + (index % 900),
        targetCardId: `stress-target-${index % 96}`,
        targetCardName: `極限測試天堂卡 ${index} — 長名稱 Pokémon ポケモン`,
        targetCardImageUrl: "",
        targetCardValue: 100,
        cardId: `stress-card-${index % 96}`,
        cardName: `極限測試所得卡 ${index} — Long Card Name テスト`,
        cardCategory: index % 2 ? "比卡超" : "其他",
        cardImageUrl: "",
        cardValue: 100,
        cardConversionValue: 80,
        collectionStatus,
        resultSide: index % 3 ? "heaven" : "hell",
        createdAt: new Date(now.getTime() - index * 1_000),
        assignedAt: new Date(now.getTime() - index * 1_000 + 500),
        updatedAt: now,
      };
      if (collectionStatus === "shipping") {
        Object.assign(record, {
          shippingRequested: true,
          shippingRecipient: "Extreme Test",
          shippingPhone: "00000000",
          shippingRegion: "hong-kong",
          shippingMethod: "sf-door",
          shippingAddress: "TEST ONLY",
          shippingNote: "",
          shippingRequestedAt: now,
        });
      }
      if (collectionStatus === "shipped") {
        Object.assign(record, { deliveryStatus: "delivered", deliveredAt: now });
      }
      if (collectionStatus === "converted") {
        Object.assign(record, { convertedToTokens: true, convertedAt: now, tokenRefund: 80 });
      }
      seedWrites.push(documentWrite(path, record));
      createdPaths.push(path);
    }

    for (let index = 0; index < SLOT_COUNT; index += 1) {
      const slotId = `${prefix}_${String(index).padStart(5, "0")}`;
      const path = `draws/${roomId}/rounds/round-001/slots/${slotId}`;
      seedWrites.push(documentWrite(path, {
        uid,
        username: `Stress_${stamp}`,
        number: index + 1,
        round: "round-001",
        status: "locked",
        tokenCost: 100,
        targetCardId: `stress-target-${index % 96}`,
        targetCardName: `極限測試卡 ${index}`,
        targetCardImageUrl: "",
        targetCardValue: 100,
        updatedAt: now,
      }));
      createdPaths.push(path);
    }

    const seedStartedAt = performance.now();
    await commitWrites(accessToken, seedWrites);
    metrics.seedMs = elapsed(seedStartedAt);

    const queryStartedAt = performance.now();
    const recordsSnapshot = await getDocs(query(
      collection(db, "drawRecords"),
      where("uid", "==", uid),
    ));
    metrics.recordQueryMs = elapsed(queryStartedAt);
    metrics.records = recordsSnapshot.size;
    if (recordsSnapshot.size !== RECORD_COUNT) {
      throw new Error(`Expected ${RECORD_COUNT} records, received ${recordsSnapshot.size}.`);
    }

    const slotQueryStartedAt = performance.now();
    const slotsSnapshot = await getDocs(query(
      collectionGroup(db, "slots"),
      where("uid", "==", uid),
    ));
    metrics.slotQueryMs = elapsed(slotQueryStartedAt);
    metrics.slots = slotsSnapshot.size;
    if (slotsSnapshot.size !== SLOT_COUNT) {
      throw new Error(`Expected ${SLOT_COUNT} slots, received ${slotsSnapshot.size}.`);
    }

    const concurrentStartedAt = performance.now();
    const concurrentResults = await Promise.all(Array.from({ length: 3 }, () => getDocs(query(
      collection(db, "drawRecords"),
      where("uid", "==", uid),
    ))));
    metrics.threeConcurrentQueriesMs = elapsed(concurrentStartedAt);
    if (concurrentResults.some((snapshot) => snapshot.size !== RECORD_COUNT)) {
      throw new Error("A concurrent record query returned an incomplete result.");
    }

    const shippingStartedAt = performance.now();
    const shippingIds = Array.from(
      { length: SHIPPING_COUNT },
      (_, index) => `${prefix}_record_${String(index).padStart(5, "0")}`,
    );
    for (let start = 0; start < shippingIds.length; start += CLIENT_BATCH_SIZE) {
      const batch = writeBatch(db);
      shippingIds.slice(start, start + CLIENT_BATCH_SIZE).forEach((recordId) => {
        batch.update(doc(db, "drawRecords", recordId), {
          collectionStatus: "shipping",
          shippingRequested: true,
          shippingRecipient: "Extreme Test",
          shippingPhone: "00000000",
          shippingRegion: "hong-kong",
          shippingMethod: "sf-door",
          shippingAddress: "TEST ONLY",
          shippingNote: "",
          shippingRequestedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }
    metrics.shipping1200Ms = elapsed(shippingStartedAt);

    if (metrics.authMode === "temporary-email-account") {
      const raceRecordId = `${prefix}_record_${String(SHIPPING_COUNT).padStart(5, "0")}`;
      async function convertRaceRecord() {
        return runTransaction(db, async (transaction) => {
          const userRef = doc(db, "users", uid);
          const recordRef = doc(db, "drawRecords", raceRecordId);
          const userSnapshot = await transaction.get(userRef);
          const recordSnapshot = await transaction.get(recordRef);
          const record = recordSnapshot.data();
          if (record?.convertedToTokens || record?.collectionStatus !== "pending") {
            throw new Error("already-converted");
          }
          transaction.update(recordRef, {
            collectionStatus: "converted",
            convertedToTokens: true,
            convertedAt: serverTimestamp(),
            tokenRefund: 80,
            updatedAt: serverTimestamp(),
          });
          transaction.update(userRef, {
            tokens: Number(userSnapshot.data()?.tokens || 0) + 80,
            lastConversionRecordId: raceRecordId,
            lastConversionAmount: 80,
            updatedAt: serverTimestamp(),
          });
        });
      }

      const raceResults = await Promise.allSettled(
        Array.from({ length: 20 }, () => convertRaceRecord()),
      );
      metrics.conversionRaceSuccesses = raceResults.filter((result) => result.status === "fulfilled").length;
      metrics.conversionRaceRejected = raceResults.filter((result) => result.status === "rejected").length;
      if (metrics.conversionRaceSuccesses !== 1) {
        throw new Error(`Expected one conversion winner, got ${metrics.conversionRaceSuccesses}.`);
      }
    } else {
      metrics.conversionRace = "skipped-live-wallet-mutation";
    }

    console.log(`RESULT ${JSON.stringify(metrics)}`);
  } finally {
    if (accessToken && createdPaths.length) {
      const cleanupStartedAt = performance.now();
      const cleanupWrites = createdPaths.reverse().map(deleteWrite);
      await commitWrites(accessToken, cleanupWrites);
      metrics.cleanupMs = elapsed(cleanupStartedAt);
      console.log(`CLEANUP deleted=${cleanupWrites.length} ms=${metrics.cleanupMs}`);
    }
    if (testUser && createdAuthUser) {
      await deleteUser(testUser);
      console.log(`AUTH_CLEANUP deleted=${uid}`);
    }
    await deleteApp(app);
  }
}

main().catch((error) => {
  console.error("EXTREME_TEST_FAILED", error);
  process.exitCode = 1;
});
