import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { cardPrice, cardShareModes } from "./instant-draw.js";

// Validate identifiers before using any client value as a Firestore document path.
function identifier(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new HttpsError("invalid-argument", "購買資料不正確，請重新選擇號碼。");
  }
  return value;
}

// Atomically reserve one number and debit its owner. A stable request ID makes retries
// return the original receipt, including after a committed response was lost.
export async function purchaseLiveSlot(db, request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "請先登入後再購買號碼。");
  const uid = request.auth.uid;
  const { drawId, roundId, cardId, requestId } = Object.fromEntries(
    ["drawId", "roundId", "cardId", "requestId"].map((key) => [key, identifier(request.data?.[key])]),
  );
  const { number, tokenCost, shareMode } = request.data;
  if (!/^round-\d{3,6}$/.test(roundId) || !Number.isSafeInteger(number) || number < 1 || number > 100000
    || !Number.isSafeInteger(tokenCost) || tokenCost <= 0 || !["1/2", "1/5", "1/10"].includes(shareMode)) {
    throw new HttpsError("invalid-argument", "購買資料不正確，請重新選擇號碼。");
  }
  const recordId = `live_${createHash("sha256").update(`${uid}:${requestId}`).digest("hex")}`;
  const recordRef = db.doc(`drawRecords/${recordId}`);
  const userRef = db.doc(`users/${uid}`);
  const roomRef = db.doc(`draws/${drawId}`);
  const roundRef = roomRef.collection("rounds").doc(roundId);
  const slotRef = roundRef.collection("slots").doc(String(number));
  return db.runTransaction(async (tx) => {
    const receipt = await tx.get(recordRef);
    if (receipt.exists) {
      const previous = receipt.data();
      if (previous.uid !== uid || previous.drawId !== drawId || previous.round !== roundId
        || previous.number !== number || previous.targetCardId !== cardId
        || previous.tokenCost !== tokenCost || previous.shareMode !== shareMode) {
        throw new HttpsError("invalid-argument", "購買識別碼已使用，請重新選擇號碼。");
      }
      return { ok: true, recordId };
    }
    const [userSnap, roomSnap, roundSnap, slotSnap, cardSnap] = await tx.getAll(
      userRef, roomRef, roundRef, slotRef, db.doc(`cards/${cardId}`),
    );
    if (!userSnap.exists) throw new HttpsError("failed-precondition", "找不到會員帳戶，請重新登入。");
    const user = userSnap.data();
    const room = roomSnap.data();
    const card = cardSnap.data();
    if (!room || !(room.status === "live" || (room.status === "scheduled" && room.preorderOpen === true))) {
      throw new HttpsError("failed-precondition", "本場暫未開放購買或已結束。");
    }
    const roundSort = Number(roundId.split("-")[1]);
    if (!roundSnap.exists || roundSnap.data().roundNumber !== roundSort || roundSort < Number(room.currentRound || 1)) {
      throw new HttpsError("failed-precondition", "此場次已完結或未開放，請重新選擇。");
    }
    if (room.buyingBlockedRounds?.includes(roundId) || room.buyingBlockedRound === roundId) {
      throw new HttpsError("failed-precondition", "本場已停止購買。");
    }
    if (!slotSnap.exists || slotSnap.data().status !== "available") {
      throw new HttpsError("already-exists", "這個號碼已被選走，請選擇其他號碼。");
    }
    if (slotSnap.data().number !== number || (slotSnap.data().round && slotSnap.data().round !== roundId)) {
      throw new HttpsError("failed-precondition", "號碼資料需要更新，請聯絡客服。");
    }
    const latestMode = room.roundShareModes?.[roundId] ?? room.shareMode ?? "1/2";
    if (!card || card.archived || !room.poolCardIds?.includes(cardId) || !cardShareModes(card).includes(latestMode)) {
      throw new HttpsError("failed-precondition", "此卡牌已下架或不適用於本場，請重新選擇。");
    }
    const price = cardPrice(card, latestMode);
    if (!Number.isSafeInteger(price) || price <= 0) throw new HttpsError("failed-precondition", "此卡牌價格未設定，請聯絡客服。");
    if (shareMode !== latestMode || tokenCost !== price) {
      throw new HttpsError("failed-precondition", "價格或玩法已更新，請重新選擇卡牌並確認後再購買。");
    }
    if (!Number.isSafeInteger(user.tokens) || user.tokens < price) {
      throw new HttpsError("failed-precondition", `你需要 ${price} 代幣才可購買此號碼。`);
    }
    const username = String(user.username || "");
    if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) throw new HttpsError("failed-precondition", "請先設定玩家名稱後再購買。");
    const claimRef = db.doc(`usernames/${username.toLowerCase()}`);
    const claim = await tx.get(claimRef);
    if (claim.exists && claim.data().uid !== uid) throw new HttpsError("failed-precondition", "玩家名稱已被使用，請重新設定。");
    const now = FieldValue.serverTimestamp();
    if (!claim.exists) tx.create(claimRef, { uid, username, createdAt: now });
    const purchase = {
      uid, username, tokenCost: price, targetCardId: cardId, targetCardName: String(card.name || ""),
      targetCardImageUrl: String(card.thumbUrl || card.imageUrl || ""), targetCardValue: price,
      shareMode: latestMode, round: roundId,
    };
    tx.update(userRef, { tokens: user.tokens - price, lastPurchaseRecordId: recordId, updatedAt: now });
    tx.update(slotRef, { ...purchase, purchaseRecordId: recordId, status: "locked", updatedAt: now });
    tx.create(recordRef, {
      ...purchase, slotId: String(number), number, roundSort, drawId,
      drawTitle: String(room.title || ""), roomSlug: String(room.slug || drawId),
      roomLink: `https://livedraw-7e3c2.web.app/?room=${drawId}`,
      affiliateReferrerUid: user.referredByUid || "", createdAt: now,
    });
    return { ok: true, recordId };
  });
}
