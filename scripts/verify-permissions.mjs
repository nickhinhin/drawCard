import { deleteApp, initializeApp } from "firebase/app";
import {
  addDoc,
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
} from "firebase/auth";
import {
  connectStorageEmulator,
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";

const projectId = "drawcard-26e01";
const firestorePort = Number(process.env.FIRESTORE_EMULATOR_HOST?.split(":").at(-1) || 8080);
const authPort = Number(process.env.FIREBASE_AUTH_EMULATOR_HOST?.split(":").at(-1) || 9099);
const storagePort = Number(process.env.FIREBASE_STORAGE_EMULATOR_HOST?.split(":").at(-1) || 9199);

function string(value) {
  return { stringValue: value };
}

function integer(value) {
  return { integerValue: String(value) };
}

function timestamp() {
  return { timestampValue: new Date().toISOString() };
}

function array(values) {
  return { arrayValue: { values: values.map((value) => string(value)) } };
}

function map(values) {
  return { mapValue: { fields: values } };
}

async function seedDocuments(writes) {
  const response = await fetch(
    `http://127.0.0.1:${firestorePort}/v1/projects/${projectId}/databases/(default)/documents:commit`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer owner",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ writes }),
    },
  );

  if (!response.ok) {
    throw new Error(`Unable to seed Firestore emulator: ${await response.text()}`);
  }
}

async function ensureUsernameClaim(firestore, uid, username) {
  const cleanUsername = username.trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9_]/g, "").slice(0, 24);
  const key = cleanUsername.toLowerCase();

  if (cleanUsername.length < 3) {
    throw new Error("Expected a valid legacy username for the permissions test.");
  }

  await runTransaction(firestore, async (transaction) => {
    const profileRef = doc(firestore, "users", uid);
    const claimRef = doc(firestore, "usernames", key);
    const profileSnap = await transaction.get(profileRef);
    const claimSnap = await transaction.get(claimRef);

    if (!profileSnap.exists()) {
      throw new Error("Test profile was not seeded.");
    }
    if (claimSnap.exists() && claimSnap.data()?.uid !== uid) {
      throw new Error("Test username is unexpectedly claimed by another user.");
    }

    if (claimSnap.exists()) {
      if (claimSnap.data()?.username !== cleanUsername) {
        transaction.update(claimRef, { username: cleanUsername });
      }
    } else {
      transaction.set(claimRef, { uid, username: cleanUsername, createdAt: serverTimestamp() });
    }

    if (profileSnap.data()?.username !== cleanUsername) {
      transaction.update(profileRef, { username: cleanUsername, updatedAt: serverTimestamp() });
    }
  });

  return cleanUsername;
}

async function run() {
  const stamp = Date.now();
  const app = initializeApp(
    {
      projectId,
      apiKey: "permission-audit",
      storageBucket: `${projectId}.firebasestorage.app`,
    },
    `permission-audit-${stamp}`,
  );
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const storage = getStorage(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${authPort}`, { disableWarnings: true });
  connectFirestoreEmulator(firestore, "127.0.0.1", firestorePort);
  connectStorageEmulator(storage, "127.0.0.1", storagePort);

  try {
    const email = `permission-audit-${stamp}@example.test`;
    const credential = await createUserWithEmailAndPassword(auth, email, "not-a-real-password");
    const uid = credential.user.uid;
    const drawId = `permission-audit-${stamp}`;
    const slotPath = `draws/${drawId}/rounds/round-001/slots/1`;

    await seedDocuments([
      {
        update: {
          name: `projects/${projectId}/databases/(default)/documents/users/${uid}`,
          fields: {
            uid: string(uid),
            email: string(email),
            displayName: string("Permission audit"),
            photoURL: string(""),
            username: string("Legacy User"),
            tokens: integer(100),
            role: string("user"),
            createdAt: timestamp(),
            updatedAt: timestamp(),
          },
        },
      },
      {
        update: {
          name: `projects/${projectId}/databases/(default)/documents/draws/${drawId}`,
          fields: {
            status: string("live"),
            round: string("round-001"),
            shareMode: string("1/5"),
            roundShareModes: map({ "round-001": string("1/5") }),
            poolCardIds: array(["card-1"]),
            poolCardValues: map({ "card-1": integer(10) }),
          },
        },
      },
      {
        update: {
          name: `projects/${projectId}/databases/(default)/documents/cards/card-1`,
          fields: {
            name: string("Permission audit card"),
            tokenValue: integer(10),
            modePrices: map({
              half: integer(10),
              fifth: integer(25),
              tenth: integer(50),
            }),
          },
        },
      },
      {
        update: {
          name: `projects/${projectId}/databases/(default)/documents/${slotPath}`,
          fields: {
            number: integer(1),
            round: string("round-001"),
            status: string("available"),
          },
        },
      },
    ]);

    const username = await ensureUsernameClaim(firestore, uid, "Legacy User");
    const userRef = doc(firestore, "users", uid);
    const slotRef = doc(firestore, slotPath);
    const recordRef = doc(collection(firestore, "drawRecords"));

    await runTransaction(firestore, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      const slotSnap = await transaction.get(slotRef);
      const tokenCost = 25;

      if (!slotSnap.exists() || slotSnap.data()?.status !== "available") {
        throw new Error("Test slot is not available.");
      }

      transaction.update(userRef, {
        tokens: userSnap.data().tokens - tokenCost,
        lastPurchaseRecordId: recordRef.id,
        updatedAt: serverTimestamp(),
      });
      transaction.update(slotRef, {
        purchaseRecordId: recordRef.id,
        status: "locked",
        uid,
        username,
        tokenCost,
        targetCardId: "card-1",
        targetCardName: "Permission audit card",
        targetCardImageUrl: "",
        targetCardValue: tokenCost,
        shareMode: "1/5",
        round: "round-001",
        updatedAt: serverTimestamp(),
      });
      transaction.set(recordRef, {
        slotId: "1",
        uid,
        username,
        drawId,
        drawTitle: "Permission audit room",
        roomSlug: drawId,
        roomLink: `/room=${drawId}`,
        round: "round-001",
        roundSort: 1,
        number: 1,
        tokenCost,
        targetCardId: "card-1",
        targetCardName: "Permission audit card",
        targetCardImageUrl: "",
        targetCardValue: tokenCost,
        shareMode: "1/5",
        createdAt: serverTimestamp(),
      });
    });

    const proofRef = storageRef(storage, `token-proofs/${uid}/proof.jpg`);
    await uploadBytes(
      proofRef,
      new Blob(["permission audit"], { type: "image/jpeg" }),
      { contentType: "image/jpeg" },
    );
    await getDownloadURL(proofRef);

    await addDoc(collection(firestore, "tokenRequests"), {
      uid,
      username,
      email,
      amount: 525,
      hkdAmount: 500,
      exchangeRate: 1.05,
      packageType: "preset",
      fpsIdentifier: "0000000",
      fpsName: "Permission audit",
      proofMode: "storage",
      proofPath: `token-proofs/${uid}/proof.jpg`,
      proofFileName: "proof.jpg",
      proofUrl: `https://firebasestorage.googleapis.com/v0/b/${projectId}.firebasestorage.app/o/token-proofs%2F${uid}%2Fproof.jpg?alt=media&token=test`,
      status: "pending",
      adminNote: "",
      promoCode: "",
      createdAt: serverTimestamp(),
    });

    await runTransaction(firestore, async (transaction) => {
      const currentUser = await transaction.get(userRef);
      const messageRef = doc(collection(firestore, "draws", drawId, "messages"));
      if (!currentUser.exists()) throw new Error("Test user cannot be reloaded.");

      transaction.update(userRef, { lastChatAt: serverTimestamp(), updatedAt: serverTimestamp() });
      transaction.set(messageRef, {
        drawId,
        source: "draw",
        uid,
        username,
        text: "Permission audit message",
        createdAt: serverTimestamp(),
      });
    });

    const [profileAfter, claimAfter, slotAfter] = await Promise.all([
      getDoc(userRef),
      getDoc(doc(firestore, "usernames", username.toLowerCase())),
      getDoc(slotRef),
    ]);
    const [recordsAfter, requestsAfter] = await Promise.all([
      getDocs(query(collection(firestore, "drawRecords"), where("uid", "==", uid))),
      getDocs(query(collection(firestore, "tokenRequests"), where("uid", "==", uid))),
    ]);
    if (
      profileAfter.data()?.username !== username
      || claimAfter.data()?.uid !== uid
      || slotAfter.data()?.status !== "locked"
      || recordsAfter.empty
      || requestsAfter.empty
    ) {
      throw new Error("Permission audit completed but persisted data was not correct.");
    }

    console.log("PASS: legacy username repair, proof upload, number purchase, token request, record reads, and room chat are allowed by Firebase rules.");
  } finally {
    await signOut(auth).catch(() => undefined);
    await deleteApp(app);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
