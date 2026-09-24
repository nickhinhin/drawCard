import { deleteApp, initializeApp } from "firebase/app";
import {
  collection,
  collectionGroup,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
} from "firebase/auth";
import { connectStorageEmulator, getStorage } from "firebase/storage";

const projectId = "livedraw-7e3c2";
const firestorePort = Number(process.env.FIRESTORE_EMULATOR_HOST?.split(":").at(-1) || 8080);
const authPort = Number(process.env.FIREBASE_AUTH_EMULATOR_HOST?.split(":").at(-1) || 9099);
const storagePort = Number(process.env.FIREBASE_STORAGE_EMULATOR_HOST?.split(":").at(-1) || 9199);

function string(value) {
  return { stringValue: value };
}

function integer(value) {
  return { integerValue: String(value) };
}

function boolean(value) {
  return { booleanValue: value };
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

async function renameUsername(firestore, uid, currentUsername, nextUsername) {
  const cleanUsername = nextUsername.trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9_]/g, "").slice(0, 24);
  const currentKey = currentUsername.toLowerCase();
  const nextKey = cleanUsername.toLowerCase();

  await runTransaction(firestore, async (transaction) => {
    const profileRef = doc(firestore, "users", uid);
    const currentRef = doc(firestore, "usernames", currentKey);
    const nextRef = doc(firestore, "usernames", nextKey);
    const currentSnap = await transaction.get(currentRef);
    const nextSnap = await transaction.get(nextRef);

    if (nextSnap.exists() && nextSnap.data()?.uid !== uid) {
      throw new Error("The renamed test username is unexpectedly claimed.");
    }

    transaction.update(profileRef, { username: cleanUsername, updatedAt: serverTimestamp() });
    if (nextSnap.exists()) {
      transaction.update(nextRef, { username: cleanUsername });
    } else {
      transaction.set(nextRef, { uid, username: cleanUsername, createdAt: serverTimestamp() });
    }
    if (currentSnap.exists() && currentSnap.data()?.uid === uid) transaction.delete(currentRef);
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
            title: string("Permission audit room"),
            round: string("round-001"),
            currentRound: integer(1),
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
          name: `projects/${projectId}/databases/(default)/documents/draws/${drawId}/rounds/round-001`,
          fields: {
            round: string("round-001"),
            roundNumber: integer(1),
            updatedAt: timestamp(),
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
        roomLink: `https://livedraw-7e3c2.web.app/?room=${drawId}`,
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

    const ownedSlots = await getDocs(query(
      collectionGroup(firestore, "slots"),
      where("uid", "==", uid),
    ));
    if (!ownedSlots.docs.some((item) => item.ref.path === slotPath)) {
      throw new Error("The consolidated user slot-history query did not return the purchased slot.");
    }

    const tokenRequestRef = doc(collection(firestore, "tokenRequests"));
    const proofPath = `token-proofs/${uid}/${tokenRequestRef.id}`;
    const quotaBatch = writeBatch(firestore);
    quotaBatch.set(tokenRequestRef, {
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
      proofPath,
      proofFileName: "proof.jpg",
      proofUrl: "",
      status: "awaiting_upload",
      adminNote: "",
      promoCode: "",
      promoCodeId: "",
      quotaVersion: 1,
      createdAt: serverTimestamp(),
    });
    quotaBatch.update(userRef, {
      lastTokenRequestId: tokenRequestRef.id,
      lastTokenRequestAt: serverTimestamp(),
      pendingTokenRequestCount: 1,
      tokenRequestWindowStartedAt: serverTimestamp(),
      tokenRequestWindowCount: 1,
      updatedAt: serverTimestamp(),
    });
    // Payment requests are created by the submitTokenPaymentRequest function only
    // after the proof is stored, so a browser-created "awaiting_upload" request must fail.
    let clientPaymentRequestRejected = false;
    try {
      await quotaBatch.commit();
    } catch (error) {
      clientPaymentRequestRejected = /permission|insufficient/i.test(String(error?.code || error?.message));
    }
    if (!clientPaymentRequestRejected) {
      throw new Error("A browser-created payment request without proof was accepted.");
    }

    await runTransaction(firestore, async (transaction) => {
      const currentUser = await transaction.get(userRef);
      const messageRef = doc(collection(firestore, "draws", drawId, "messages"));
      if (!currentUser.exists()) throw new Error("Test user cannot be reloaded.");

      transaction.update(userRef, { lastChatAt: serverTimestamp(), lastChatMessageId: messageRef.id, updatedAt: serverTimestamp() });
      transaction.set(messageRef, {
        drawId,
        source: "draw",
        uid,
        username,
        text: "Permission audit message",
        createdAt: serverTimestamp(),
      });
    });

    const renamedUsername = await renameUsername(firestore, uid, username, "Renamed_Player");
    const scheduledDrawId = `${drawId}-scheduled`;
    const scheduledSlotPath = `draws/${scheduledDrawId}/rounds/round-001/slots/1`;
    await seedDocuments([
      {
        update: {
          name: `projects/${projectId}/databases/(default)/documents/draws/${scheduledDrawId}`,
          fields: {
            status: string("scheduled"),
            title: string("Scheduled permission audit room"),
            preorderOpen: boolean(true),
            round: string("round-001"),
            currentRound: integer(1),
            shareMode: string("1/10"),
            roundShareModes: map({ "round-001": string("1/10") }),
            poolCardIds: array(["card-1"]),
            poolCardValues: map({ "card-1": integer(10) }),
          },
        },
      },
      {
        update: {
          name: `projects/${projectId}/databases/(default)/documents/draws/${scheduledDrawId}/rounds/round-001`,
          fields: {
            round: string("round-001"),
            roundNumber: integer(1),
            updatedAt: timestamp(),
          },
        },
      },
      {
        update: {
          name: `projects/${projectId}/databases/(default)/documents/${scheduledSlotPath}`,
          fields: {
            number: integer(1),
            round: string("round-001"),
            status: string("available"),
          },
        },
      },
    ]);

    const scheduledSlotRef = doc(firestore, scheduledSlotPath);
    const scheduledRecordRef = doc(collection(firestore, "drawRecords"));
    await runTransaction(firestore, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      const slotSnap = await transaction.get(scheduledSlotRef);
      const tokenCost = 50;

      if (!slotSnap.exists() || slotSnap.data()?.status !== "available") {
        throw new Error("Scheduled test slot is not available.");
      }

      transaction.update(userRef, {
        tokens: userSnap.data().tokens - tokenCost,
        lastPurchaseRecordId: scheduledRecordRef.id,
        updatedAt: serverTimestamp(),
      });
      transaction.update(scheduledSlotRef, {
        purchaseRecordId: scheduledRecordRef.id,
        status: "locked",
        uid,
        username: renamedUsername,
        tokenCost,
        targetCardId: "card-1",
        targetCardName: "Permission audit card",
        targetCardImageUrl: "",
        targetCardValue: tokenCost,
        shareMode: "1/10",
        round: "round-001",
        updatedAt: serverTimestamp(),
      });
      transaction.set(scheduledRecordRef, {
        slotId: "1",
        uid,
        username: renamedUsername,
        drawId: scheduledDrawId,
        drawTitle: "Scheduled permission audit room",
        roomSlug: scheduledDrawId,
        roomLink: `https://livedraw-7e3c2.web.app/?room=${scheduledDrawId}`,
        round: "round-001",
        roundSort: 1,
        number: 1,
        tokenCost,
        targetCardId: "card-1",
        targetCardName: "Permission audit card",
        targetCardImageUrl: "",
        targetCardValue: tokenCost,
        shareMode: "1/10",
        createdAt: serverTimestamp(),
      });
    });

    const [profileAfter, claimAfter, oldClaimAfter, slotAfter, scheduledSlotAfter] = await Promise.all([
      getDoc(userRef),
      getDoc(doc(firestore, "usernames", renamedUsername.toLowerCase())),
      getDoc(doc(firestore, "usernames", username.toLowerCase())),
      getDoc(slotRef),
      getDoc(scheduledSlotRef),
    ]);
    const [recordsAfter, requestsAfter] = await Promise.all([
      getDocs(query(collection(firestore, "drawRecords"), where("uid", "==", uid))),
      getDocs(query(collection(firestore, "tokenRequests"), where("uid", "==", uid))),
    ]);

    // A second account racing for the same case-insensitive username must lose without changing the first owner.
    const secondApp = initializeApp(
      { projectId, apiKey: "permission-audit-second" },
      `permission-audit-second-${stamp}`,
    );
    const secondAuth = getAuth(secondApp);
    const secondFirestore = getFirestore(secondApp);
    connectAuthEmulator(secondAuth, `http://127.0.0.1:${authPort}`, { disableWarnings: true });
    connectFirestoreEmulator(secondFirestore, "127.0.0.1", firestorePort);
    const secondCredential = await createUserWithEmailAndPassword(
      secondAuth,
      `permission-audit-second-${stamp}@example.test`,
      "not-a-real-password",
    );
    await seedDocuments([{
      update: {
        name: `projects/${projectId}/databases/(default)/documents/users/${secondCredential.user.uid}`,
        fields: {
          uid: string(secondCredential.user.uid),
          email: string(secondCredential.user.email),
          displayName: string("Second permission audit"),
          photoURL: string(""),
          username: string(""),
          tokens: integer(0),
          role: string("user"),
          createdAt: timestamp(),
          updatedAt: timestamp(),
        },
      },
    }]);
    let duplicateUsernameRejected = false;
    let duplicateUsernameError = "";
    try {
      await ensureUsernameClaim(secondFirestore, secondCredential.user.uid, renamedUsername.toUpperCase());
    } catch (error) {
      duplicateUsernameError = String(error?.message || error);
      duplicateUsernameRejected = /already|使用|claimed|permission-denied|permissions/i.test(duplicateUsernameError);
    }
    await signOut(secondAuth).catch(() => undefined);
    await deleteApp(secondApp);

    if (
      profileAfter.data()?.username !== renamedUsername
      || claimAfter.data()?.uid !== uid
      || oldClaimAfter.exists()
      || slotAfter.data()?.status !== "locked"
      || scheduledSlotAfter.data()?.status !== "locked"
      || recordsAfter.size < 2
      || !requestsAfter.empty
      || !duplicateUsernameRejected
    ) {
      throw new Error(`Permission audit completed but persisted data was not correct: ${JSON.stringify({
        profileUsername: profileAfter.data()?.username,
        expectedUsername: renamedUsername,
        claimUid: claimAfter.data()?.uid,
        oldClaimExists: oldClaimAfter.exists(),
        liveSlotStatus: slotAfter.data()?.status,
        scheduledSlotStatus: scheduledSlotAfter.data()?.status,
        recordCount: recordsAfter.size,
        requestsEmpty: requestsAfter.empty,
        duplicateUsernameRejected,
        duplicateUsernameError,
      })}`);
    }

    console.log("PASS: username repair, rename and duplicate rejection; live purchase, scheduled preorder, record reads, and live chat are allowed; browser-created payment requests without proof are rejected.");
  } finally {
    await signOut(auth).catch(() => undefined);
    await deleteApp(app);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
