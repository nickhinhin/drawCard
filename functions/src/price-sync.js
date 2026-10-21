import { FieldValue } from "firebase-admin/firestore";
import { cardPrice } from "./instant-draw.js";

export const OPEN_PRICE_STATUSES = ["live", "scheduled", "draft"];
const PRICE_MODES = { half: "1/2", fifth: "1/5", tenth: "1/10" };

// Only the card library determines prices; room/public copies are display caches.
export function canonicalPrices(card) {
  return Object.fromEntries(Object.entries(PRICE_MODES).map(([key, mode]) => [key, cardPrice(card, mode)]));
}

// Returns a minimal price-only patch, leaving room contents and history intact.
export function roomPricePatch(room, cards) {
  if (!OPEN_PRICE_STATUSES.includes(room?.status)) return null;
  const ids = Array.isArray(room.poolCardIds) ? room.poolCardIds : (room.poolCards || []).map((card) => card.id);
  const values = { ...(room.poolCardValues || {}) };
  let changed = false;
  for (const id of ids) {
    const card = cards.get(id);
    if (!card) continue;
    const price = cardPrice(card, "1/2");
    if (values[id] !== price) { values[id] = price; changed = true; }
  }
  const poolCards = (Array.isArray(room.poolCards) ? room.poolCards : undefined)?.map((copy) => {
    const card = cards.get(copy.id);
    if (!card) return copy;
    const patch = copyPricePatch(copy, card);
    if (!patch) return copy;
    changed = true;
    return { ...copy, ...patch };
  });
  return changed ? { poolCardValues: values, ...(poolCards ? { poolCards } : {}) } : null;
}

// A complete mode comparison also repairs copies when the library price did not change.
export function copyPricePatch(copy, card) {
  const prices = canonicalPrices(card);
  return copy.tokenValue === prices.half && Object.keys(prices).every((key) => copy.modePrices?.[key] === prices[key])
    ? null : { tokenValue: prices.half, modePrices: prices };
}

// Reads both sides in one transaction; delayed/retried events never write old event prices.
export async function syncRoomPrices(db, ref, dryRun = false) {
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const room = snapshot.data();
    if (!OPEN_PRICE_STATUSES.includes(room?.status)) return 0;
    const ids = [...new Set(Array.isArray(room.poolCardIds) ? room.poolCardIds : (room.poolCards || []).map((card) => card.id))];
    const cards = ids.length ? await tx.getAll(...ids.map((id) => db.collection("cards").doc(id))) : [];
    const patch = roomPricePatch(room, new Map(cards.filter((card) => card.exists).map((card) => [card.id, card.data()])));
    if (!patch) return 0;
    if (!dryRun) tx.update(ref, { ...patch, updatedAt: FieldValue.serverTimestamp() });
    return 1;
  });
}

// Synchronizes current public prices while preserving pool order, pause flags and other settings.
export async function syncCardPrices(db, cardId, { dryRun = false, rooms = true } = {}) {
  const copies = await db.runTransaction(async (tx) => {
    const cardRef = db.collection("cards").doc(cardId);
    const showcaseRef = db.collection("publicCardShowcase").doc(cardId);
    const instantRef = db.collection("publicSiteSettings").doc("instantDraw");
    const [snapshot, showcase, instant] = await tx.getAll(cardRef, showcaseRef, instantRef);
    if (!snapshot.exists) return 0;
    const card = snapshot.data();
    let changed = 0;
    const patch = showcase.exists ? copyPricePatch(showcase.data(), card) : null;
    if (patch) {
      changed++;
      if (!dryRun) tx.update(showcaseRef, { ...patch, updatedAt: FieldValue.serverTimestamp() });
    }
    let instantChanged = false;
    const cards = (Array.isArray(instant.data()?.cards) ? instant.data().cards : undefined)?.map((copy) => {
      if (copy.id !== cardId) return copy;
      const update = copyPricePatch(copy, card);
      if (!update) return copy;
      instantChanged = true;
      return { ...copy, ...update };
    });
    if (instantChanged) {
      changed++;
      if (!dryRun) tx.update(instantRef, { cards });
    }
    return changed;
  });
  let updatedRooms = 0;
  if (rooms) {
    const snapshot = await db.collection("draws").where("poolCardIds", "array-contains", cardId).get();
    for (const room of snapshot.docs) {
      if (OPEN_PRICE_STATUSES.includes(room.data().status)) updatedRooms += await syncRoomPrices(db, room.ref, dryRun);
    }
  }
  return { copies, rooms: updatedRooms };
}

// Repairs existing drift independently of formula changes. Dry runs do not write anything.
export async function syncAllPrices(db, dryRun = false) {
  const [rooms, cards] = await Promise.all([
    db.collection("draws").where("status", "in", OPEN_PRICE_STATUSES).get(),
    db.collection("cards").get(),
  ]);
  let updatedRooms = 0, copies = 0;
  for (const room of rooms.docs) updatedRooms += await syncRoomPrices(db, room.ref, dryRun);
  for (const card of cards.docs) copies += (await syncCardPrices(db, card.id, { dryRun, rooms: false })).copies;
  return { rooms: updatedRooms, copies };
}

// Both web and native admin writers finish by repairing price projections. This
// also rejects stale projection values from an old admin tab after a newer edit.
export async function syncAdminPriceWrites(db, operations) {
  const cardIds = new Set();
  const roomRefs = new Map();
  let allRooms = false;
  for (const operation of operations) {
    if (!operation.data || operation.mode === "delete") continue;
    const { collectionName, documentId, data } = operation;
    if (collectionName === "cards" && ["tokenValue", "modePrices"].some((key) => Object.hasOwn(data, key))) {
      cardIds.add(documentId);
      allRooms = true;
    }
    if (collectionName === "publicCardShowcase") cardIds.add(documentId);
    if (collectionName === "publicSiteSettings" && documentId === "instantDraw" && Array.isArray(data.cards)) {
      data.cards.forEach((card) => cardIds.add(String(card.id)));
    }
    if (collectionName === "draws" && ["status", "poolCardIds", "poolCards", "poolCardValues"].some((key) => Object.hasOwn(data, key))) {
      roomRefs.set(documentId, db.collection("draws").doc(documentId));
    }
  }
  for (const cardId of cardIds) await syncCardPrices(db, cardId, { rooms: false });
  if (allRooms) {
    const rooms = await db.collection("draws").where("status", "in", OPEN_PRICE_STATUSES).get();
    rooms.docs.forEach((room) => roomRefs.set(room.id, room.ref));
  }
  for (const ref of roomRefs.values()) await syncRoomPrices(db, ref);
}
