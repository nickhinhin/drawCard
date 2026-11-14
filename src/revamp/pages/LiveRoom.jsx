// 直播抽卡 on /beta, built to the revamp design (LiveDraw.html). The data and rules are the
// main site's: the same live rooms, card pools, number board, chat and the server's
// purchaseLiveNumber function, so a purchase here is checked and charged exactly as there.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  collection, doc, getDoc, getDocs, limit, limitToLast, onSnapshot, orderBy, query, runTransaction, serverTimestamp, where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../firebase";
import { reportClientError } from "../../errorReporting.js";
import {
  KickEmbed,
  LIVE_SNAPSHOT_OPTIONS,
  PENDING_SELECTION_KEY,
  buildRoomCards,
  ensureUsernameClaim,
  formatRoundLabel,
  getCardCategories,
  getCardCategory,
  getDefaultRoomRound,
  getRoomCurrentRound,
  getRoomPoolIds,
  getRoomRoundOptions,
  getRoomShareMode,
  getRoundDisplayStatus,
  getRoundSchedule,
  getRoundSlotResultSide,
  getRoundSortValue,
  getRoundsByDate,
  getSafeErrorMessage,
  isBlockedChatText,
  isPurchaseRecord,
  isRoomPurchasable,
  isRoundBuyingBlocked,
  isSnapshotReady,
  requestLogin,
  roomChatCooldownSeconds,
  toMillis,
  useCardCategories,
  useDocsByIds,
  useLivePresence,
  usePageVisible,
} from "../../App.jsx";
import LegacyUI from "../LegacyUI.jsx";
import { openRoomResults } from "./ResultPages.jsx";
import { BASE } from "../runtime.jsx";
import { Coin, EmptyBox, FONT_NUM, FONT_TITLE, Main, fmt, fmtTime } from "../ui.jsx";
import { CSS as LIVE_CSS } from "./LiveDrawPage.jsx";

const SEL = "0 0 0 2px #f4022b, 0 0 24px rgba(244, 2, 43, 0.35)";
const HEAVEN_RATE = { "1/2": 0.5, "1/5": 0.2, "1/10": 0.1 };
const RANGES = [
  { id: "all", name: "全部", ok: () => true },
  { id: "lo", name: "2,000 以下", ok: (p) => p < 2000 },
  { id: "mid", name: "2,000 – 4,000", ok: (p) => p >= 2000 && p <= 4000 },
  { id: "hi", name: "4,000 以上", ok: (p) => p > 4000 },
];
const QUICK = ["恭喜！", "好運！", "🔥🔥🔥", "天堂來了！"];
const HELL_IMG = "/revamp/images/hell-card-mystery-psa10.webp";
const UNCERTAIN = /(?:unavailable|deadline-exceeded|internal|network-request-failed)$/;
const EXPECTED = /(?:resource-exhausted|failed-precondition|invalid-argument|already-exists)$/;
// Local preview only (stripped from builds): ?sampleLive lets a guest walk through every
// step; the final button shows the success screen without calling the server.
const SAMPLE = import.meta.env.DEV && new URLSearchParams(window.location.search).has("sampleLive");

// Extra layout for the real player (Kick iframe / video) and the docked mini player.
const PAGE_CSS = `
.ld-live-player .kick-frame-wrap{position:absolute;inset:0;width:100%;height:100%;margin:0;border:0;border-radius:0;aspect-ratio:auto}
.ld-live-player .stream-player-stage,.ld-live-player .kick-frame{width:100%;height:100%}
.ld-live-player .stream-fallback{height:100%;display:flex;align-items:center;justify-content:center;color:#a0a5ad}
.ld-live-docked{position:fixed !important;left:24px;bottom:24px;z-index:50;width:340px;max-width:calc(100% - 32px);border:1px solid #f4022b !important;box-shadow:0 8px 24px rgba(0,0,0,.5),0 0 24px rgba(244,2,43,.35);background:#05070a}
.ld-live-docked .stream-mute-btn,.ld-live-docked .stream-fullscreen-btn{display:none}
.ld-live-player .stream-mute-btn,.ld-live-player .stream-fullscreen-btn{z-index:3}
@media (max-width:760px){.ld-live-docked{left:12px;bottom:76px;width:184px}}
`;

const hk = (date, options) => new Intl.DateTimeFormat("zh-HK", { timeZone: "Asia/Hong_Kong", ...options }).format(date);
function roundTime(room, roundId) {
  const at = getRoundSchedule(room, roundId);
  return at instanceof Date ? hk(at, { hour: "2-digit", minute: "2-digit", hour12: false }) : "時間待定";
}
function roundDay(room, roundId) {
  const at = getRoundSchedule(room, roundId);
  if (!(at instanceof Date)) return "";
  const dm = hk(at, { day: "2-digit", month: "2-digit" });
  return `${dm}（${hk(at, { weekday: "narrow" })}）`;
}
const scrollTo = (el) => { try { el?.scrollIntoView({ behavior: "smooth", block: "start" }); } catch { /* old browsers */ } };

// ---- data ----

function useLiveRooms(roomSlug) {
  const [active, setActive] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requested, setRequested] = useState(undefined); // undefined: not needed / loading

  useEffect(() => onSnapshot(
    query(collection(db, "draws"), where("status", "in", ["live", "scheduled", "draft"])),
    LIVE_SNAPSHOT_OPTIONS,
    (snapshot) => {
      setActive(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)));
      setError("");
      if (isSnapshotReady(snapshot)) setLoading(false);
    },
    (err) => {
      console.error("Room list listener failed.", err);
      setError(getSafeErrorMessage(err, "未能載入直播。"));
      setLoading(false);
    },
  ), []);

  const slugIsActive = Boolean(roomSlug && active.some((room) => room.id === roomSlug || room.slug === roomSlug));
  // A link to a room that is no longer open (e.g. from 過往直播) is looked up once.
  useEffect(() => {
    if (!roomSlug || loading || slugIsActive) { setRequested(undefined); return undefined; }
    let cancelled = false;
    setRequested(undefined);
    getDoc(doc(db, "draws", roomSlug))
      .then(async (snap) => {
        if (snap.exists()) return { id: snap.id, ...snap.data() };
        const bySlug = await getDocs(query(collection(db, "draws"), where("slug", "==", roomSlug), limit(1)));
        return bySlug.empty ? null : { id: bySlug.docs[0].id, ...bySlug.docs[0].data() };
      })
      .then((room) => { if (!cancelled) setRequested(room); })
      .catch(() => { if (!cancelled) setRequested(null); });
    return () => { cancelled = true; };
  }, [loading, roomSlug, slugIsActive]);

  return { rooms: active, loading: loading || (Boolean(roomSlug) && !slugIsActive && requested === undefined), error, requested };
}

function useSlots(roomId, roundId) {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!roomId || !roundId) { setSlots([]); setLoading(false); return undefined; }
    setLoading(true);
    setSlots([]);
    return onSnapshot(
      query(collection(db, "draws", roomId, "rounds", roundId, "slots"), orderBy("number", "asc")),
      LIVE_SNAPSHOT_OPTIONS,
      async (snapshot) => {
        try {
          const list = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
          if (list.length || roundId !== "round-001") { setSlots(list); return; }
          // Rooms from before rounds existed keep their numbers on the room itself.
          const legacy = await getDocs(query(collection(db, "draws", roomId, "slots"), orderBy("number", "asc")));
          setSlots(legacy.docs.map((item) => ({ id: item.id, ...item.data() })));
        } finally {
          if (isSnapshotReady(snapshot)) setLoading(false);
        }
      },
      (err) => { console.error("Room slots listener failed.", err); setLoading(false); },
    );
  }, [roomId, roundId]);
  return { slots, loading };
}

function useChat(roomId, enabled) {
  const [msgs, setMsgs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setMsgs([]);
    setLoaded(false);
    if (!roomId || !enabled) return undefined;
    return onSnapshot(
      query(collection(db, "draws", roomId, "messages"), orderBy("createdAt", "asc"), limitToLast(30)),
      LIVE_SNAPSHOT_OPTIONS,
      (snapshot) => {
        setMsgs(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        if (isSnapshotReady(snapshot)) setLoaded(true);
      },
      (err) => { console.error("Room chat listener failed.", err); setLoaded(true); },
    );
  }, [roomId, enabled]);
  return { msgs, loaded };
}

function useMyRecords(uid, open) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || !uid) return undefined;
    setLoading(true);
    return onSnapshot(query(collection(db, "drawRecords"), where("uid", "==", uid)), LIVE_SNAPSHOT_OPTIONS, (snapshot) => {
      setRecords(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
        .filter(isPurchaseRecord)
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
        .slice(0, 20));
      if (isSnapshotReady(snapshot)) setLoading(false);
    }, (err) => { console.error("Room record drawer listener failed.", err); setLoading(false); });
  }, [open, uid]);
  return { records, loading };
}

// ---- small pieces in the design's style ----

const Icon = ({ size = 18, sw = 2.2, children, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{children}</svg>
);
const CloseX = ({ size = 16 }) => <Icon size={size}><path d="M6 6l12 12M18 6 6 18" /></Icon>;
const LiveTag = ({ small }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: small ? "4px" : "6px", height: small ? "18px" : "26px", padding: small ? "0 6px" : "0 10px", borderRadius: small ? "3px" : "4px", background: "#f4022b", color: "#ffffff", fontSize: small ? "11px" : "13px", fontWeight: "700", letterSpacing: "0.04em" }}>
    <span aria-hidden="true" style={{ width: small ? "5px" : "6px", height: small ? "5px" : "6px", borderRadius: "999px", background: "#ffffff", animation: "ld-blink 1.2s ease-in-out infinite" }}></span>LIVE
  </span>
);
const roundBtn = { flex: "0 0 auto", width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", cursor: "pointer" };
const fabBtn = { display: "inline-flex", alignItems: "center", gap: "8px", height: "48px", padding: "0 16px", borderRadius: "6px", fontSize: "15px", fontWeight: "700", cursor: "pointer", boxShadow: "0 8px 24px rgba(0, 0, 0, 0.55)", border: "1px solid #282d36", background: "linear-gradient(180deg, #21252d 0%, #13161b 100%)", color: "#ffffff" };
const backdrop = { position: "fixed", top: "0", right: "0", bottom: "0", left: "0", zIndex: "89", border: "0", background: "rgba(0, 0, 0, 0.6)" };
const dialog = { position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", zIndex: "90", maxWidth: "calc(100% - 24px)", display: "flex", flexDirection: "column", padding: "20px", borderRadius: "10px", border: "1px solid #282d36", background: "#05070a", boxShadow: "0 16px 48px rgba(0, 0, 0, 0.6)" };

function Slab({ img, width, big }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: big ? "6px" : "4px", width, padding: big ? "7px" : "5px", borderRadius: big ? "8px" : "7px", border: "1px solid #3a404b", background: "linear-gradient(180deg, #2a2f38 0%, #13161b 100%)", boxShadow: big ? "0 0 0 2px #fdc800, 0 0 32px rgba(253, 200, 0, 0.45)" : "0 0 18px rgba(253, 200, 0, 0.18)" }}>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: big ? "22px" : "16px", padding: big ? "0 8px" : "0 5px", borderRadius: "3px", background: "#05070a", border: "1px solid #3a2a00", fontFamily: FONT_NUM, fontWeight: "800", fontSize: big ? "12px" : "10px", letterSpacing: "0.06em", color: "#ffe390" }}>
        <span>PSA</span><span style={{ color: "#fdc800", fontSize: big ? "15px" : undefined }}>10</span>
      </span>
      <span style={{ position: "relative", display: "block", aspectRatio: "63 / 88", borderRadius: big ? "4px" : "3px", overflow: "hidden", background: "#0b0e12" }}>
        {img && <img src={img} alt="" loading="lazy" decoding="async" style={{ position: "absolute", top: "0", left: "0", width: "100%", height: "100%", objectFit: "cover" }} />}
      </span>
    </span>
  );
}

// ---- page ----

export default function LiveRoom({ session }) {
  const profile = session.ready ? session.profile : null;
  const uid = profile?.uid || "";
  const [roomSlug, setRoomSlug] = useState(() => new URLSearchParams(window.location.search).get("room") || "");
  const { rooms, loading: roomsLoading, error: roomsError, requested } = useLiveRooms(roomSlug);
  const [startRound, setStartRound] = useState("");

  useEffect(() => {
    const onPop = () => setRoomSlug(new URLSearchParams(window.location.search).get("room") || "");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const bySlug = (room) => room.id === roomSlug || room.slug === roomSlug;
  const room = (roomSlug && rooms.find(bySlug))
    || rooms.find((item) => item.status === "live") || rooms.find((item) => item.status === "draft") || rooms[0] || null;

  // A finished room opens its read-only results page.
  const finished = Boolean(roomSlug && requested && requested.status === "completed");
  useEffect(() => { if (finished) openRoomResults(requested); }, [finished, requested]);
  if (finished) return null;
  if (roomsLoading) return <Main css={LIVE_CSS}><Heading /><EmptyBox>正在載入直播…</EmptyBox></Main>;
  if (!room) {
    return (
      <Main css={LIVE_CSS}>
        <Heading />
        <EmptyBox><span>{roomsError || "暫時未有直播，直播資料準備中，請稍後再試。"}</span></EmptyBox>
      </Main>
    );
  }
  return <Room key={room.id} room={room} rooms={rooms} profile={profile} uid={uid} session={session} startRound={startRound} onRoom={(id, roundId) => {
    window.history.pushState({}, "", `${BASE}/live?room=${encodeURIComponent(id)}`);
    setStartRound(roundId);
    setRoomSlug(id);
  }} />;
}

function Heading() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px" }}>
      <h1 style={{ margin: "0", fontFamily: FONT_TITLE, fontWeight: "900", fontSize: "34px", lineHeight: "40px" }}>直播抽卡</h1>
    </div>
  );
}

function Room({ room, rooms, profile, uid, session, startRound, onRoom }) {
  const signedIn = Boolean(uid);
  const pageVisible = usePageVisible();
  useLivePresence(room, uid, pageVisible);
  const isLive = room.status === "live";

  // Rounds of every open room, grouped by date (the design's 場次 list).
  const sessions = useMemo(() => {
    const list = rooms.filter((item) => item.status === "live" || item.status === "scheduled" || item.id === room.id);
    const out = [];
    list.forEach((item) => {
      getRoundsByDate(item, getRoomRoundOptions(item)).forEach((group) => {
        group.rounds.forEach((roundId) => {
          const status = getRoundDisplayStatus(item, roundId);
          const at = getRoundSchedule(item, roundId);
          out.push({
            key: `${item.id}/${roundId}`, room: item, roomId: item.id, roundId, group: `${item.id}/${group.key}`, groupLabel: group.fullLabel,
            label: formatRoundLabel(roundId), time: roundTime(item, roundId), mode: getRoomShareMode(item, roundId),
            status: status.key, statusLabel: status.label, at: at instanceof Date ? at.getTime() : Number.MAX_SAFE_INTEGER,
          });
        });
      });
    });
    return out.sort((a, b) => {
      if (a.roomId !== b.roomId) {
        if (a.room.status === "live") return -1;
        if (b.room.status === "live") return 1;
      }
      return a.roomId === b.roomId ? getRoundSortValue(a.roundId) - getRoundSortValue(b.roundId) : a.at - b.at;
    });
  }, [room.id, rooms]);

  const roundOptionsKey = getRoomRoundOptions(room).join("|");
  const [roundId, setRoundId] = useState(() => (getRoomRoundOptions(room).includes(startRound) ? startRound : getDefaultRoomRound(room)));
  useEffect(() => {
    if (!roundOptionsKey.split("|").includes(roundId)) setRoundId(getDefaultRoomRound(room));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundOptionsKey]);

  // Cards: the pools of the rooms on screen plus their hell cards (as on the main site).
  const [hellIds, setHellIds] = useState([]);
  const poolIds = useMemo(() => rooms.flatMap((item) => getRoomPoolIds(item)), [rooms]);
  const { docsById, loading: cardsLoading } = useDocsByIds(signedIn ? "cards" : "publicCardShowcase", [...poolIds, ...hellIds]);
  const library = useMemo(() => Object.values(docsById).filter((card) => !card.archived && card.active !== false), [docsById]);
  useEffect(() => {
    const next = [...new Set(library.map((card) => String(card.hellCardId || "")).filter(Boolean))].sort();
    setHellIds((cur) => (cur.join("|") === next.join("|") ? cur : next));
  }, [library]);
  const savedCategories = useCardCategories(library, signedIn);
  const cards = useMemo(() => buildRoomCards(room, library, roundId), [room, library, roundId]);

  const { slots, loading: slotsLoading } = useSlots(room.id, roundId);
  const mode = getRoomShareMode(room, roundId);
  const total = slots.length || Number(room.cardCount) || 20;
  const heavenCount = Math.round(total * (HEAVEN_RATE[mode] || 0.5));
  const roundEnded = getRoundSortValue(roundId) < getRoomCurrentRound(room);
  const blocked = isRoundBuyingBlocked(room, roundId);
  const canBuy = isRoomPurchasable(room) && !roundEnded && !blocked;
  const buyNote = !isRoomPurchasable(room) ? "此直播尚未開放購買號碼，開放後即可選號。"
    : roundEnded ? `${formatRoundLabel(roundId)}已結束，不能再購買號碼。`
    : blocked ? `${formatRoundLabel(roundId)}已停止購買。` : "";

  // Wizard state.
  const [step, setStep] = useState(1);
  const [cardId, setCardId] = useState("");
  const [flash, setFlash] = useState("");
  const [pick, setPick] = useState(null);
  const [done, setDone] = useState(null); // { number, card, roundId }
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState("");
  const requestRef = useRef(null); // { key, id }: the same id is reused when a retry follows an unknown outcome
  const card = cards.find((item) => item.id === cardId) || null;
  const [ui, setUi] = useState({ cat: "全部", range: "all", sort: "high", help: false });
  const [panel, setPanel] = useState(""); // chat | nums | sess | rec
  const [dial, setDial] = useState(false);
  const wizRef = useRef(null);
  const sessRef = useRef(null);
  const advRef = useRef(null);
  useEffect(() => () => clearTimeout(advRef.current), []);

  const goStep = (n) => {
    setStep(n);
    const el = wizRef.current;
    if (el) {
      const top = el.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.5) scrollTo(el);
    }
  };

  // A taken number drops out of the player's pick.
  useEffect(() => {
    if (!pick) return;
    const slot = slots.find((item) => Number(item.number) === pick);
    if (slot && slot.status !== "available") setPick(null);
  }, [pick, slots]);

  // A guest's card / round / number come back after they sign in (same key as the main site).
  const guestRestored = useRef(false);
  useEffect(() => {
    if (!uid || guestRestored.current || cardsLoading) return;
    let pending = null;
    try { pending = JSON.parse(sessionStorage.getItem(PENDING_SELECTION_KEY) || "null"); } catch { return; }
    if (!pending || pending.roomId !== room.id || !roundOptionsKey.split("|").includes(pending.round)) return;
    guestRestored.current = true;
    sessionStorage.removeItem(PENDING_SELECTION_KEY);
    if (Date.now() - pending.savedAt > 30 * 60 * 1000) return;
    setRoundId(pending.round);
    if (pending.cardId) { setCardId(pending.cardId); setStep(2); }
    if (pending.number) setPick(Number(pending.number));
  }, [cardsLoading, room.id, roundOptionsKey, uid]);
  function rememberGuest(number) {
    try {
      sessionStorage.setItem(PENDING_SELECTION_KEY, JSON.stringify({ roomId: room.id, cardId, round: roundId, number, savedAt: Date.now() }));
    } catch { /* private browsing: pick again after signing in */ }
  }

  function chooseSession(s) {
    setPanel("");
    if (s.status === "completed") return;
    if (s.roomId === room.id && s.roundId === roundId && !done) return;
    setPick(null);
    setDone(null);
    setBuyError("");
    if (s.roomId !== room.id) {
      onRoom(s.roomId, s.roundId);
      return;
    }
    // Keep the card when it is also offered for the new round's odds.
    const keep = cardId && buildRoomCards(room, library, s.roundId).some((item) => item.id === cardId);
    if (!keep) setCardId("");
    setRoundId(s.roundId);
    setStep(keep ? 2 : 1);
  }
  const openSessions = sessions.filter((s) => s.status !== "completed");
  const sIdx = openSessions.findIndex((s) => s.roomId === room.id && s.roundId === roundId);

  function toggleNumber(slot) {
    if (!canBuy || !card) return;
    if (slot.status !== "available") return;
    const n = Number(slot.number);
    if (!signedIn && !SAMPLE) {
      rememberGuest(n);
      requestLogin("請先登入或註冊，即可選擇號碼。");
      return;
    }
    setPick((cur) => (cur === n ? null : n));
  }

  async function confirm() {
    if (!card || !pick || buying || !canBuy) return;
    if (SAMPLE && !signedIn) { setDone({ number: pick, card, roundId }); setPick(null); return; }
    if (!signedIn) { rememberGuest(pick); requestLogin("請先登入或註冊，再付款鎖定號碼。"); return; }
    const tokenCost = Number(card.tokenValue || room.tokenCost || 10);
    const key = `${room.id}|${roundId}|${pick}|${card.id}|${tokenCost}`;
    if (requestRef.current?.key !== key) requestRef.current = { key, id: crypto.randomUUID() };
    setBuying(true);
    setBuyError("");
    try {
      await httpsCallable(functions, "purchaseLiveNumber")({
        requestId: requestRef.current.id, drawId: room.id, roundId, number: pick,
        cardId: card.id, shareMode: mode, tokenCost,
      });
      requestRef.current = null;
      setDone({ number: pick, card, roundId });
      setPick(null);
    } catch (error) {
      const code = String(error?.code || "");
      const uncertain = UNCERTAIN.test(code);
      if (!uncertain) requestRef.current = null;
      if (uncertain || /permission-denied$/.test(code)) {
        reportClientError(error, `live-purchase:${room.id}:${roundId}:${pick}`);
      } else if (!EXPECTED.test(code)) {
        reportClientError({ message: error?.message, code, stack: error?.stack }, "beta-live-purchase");
      }
      setBuyError(getSafeErrorMessage(error, "購買未能確認，請再按確認重試；同一筆購買不會重複扣款。"));
    } finally {
      setBuying(false);
    }
  }

  // ---- render values ----
  const finished = Boolean(done);
  const balance = session.tokens;
  const unit = card ? Number(card.tokenValue || room.tokenCost || 10) : 0;
  const enough = unit <= balance || !signedIn;
  const sessionLabel = formatRoundLabel(roundId);
  const sessionTime = roundTime(room, roundId);
  const half = mode === "1/2";
  const soldCount = slots.filter((slot) => slot.status !== "available").length;
  const hellCard = card ? library.find((item) => item.id === library.find((c) => c.id === card.id)?.hellCardId) : null;
  const hellName = hellCard?.name || "隨機 PSA10";
  const hellImg = hellCard?.thumbUrl || hellCard?.imageUrl || HELL_IMG;

  const LABELS = ["選擇卡牌", "選擇號碼", "確認購買"];
  const TITLES = [
    ["選擇卡牌", ""],
    ["選擇號碼", "按一個號碼，每個盲盒可選 1 個號碼；灰色號碼已被其他玩家購買。"],
    ["確認購買", `確認後號碼即時鎖定，於 ${sessionTime} 直播開抽時揭曉天堂與地獄。`],
  ];
  const stepCols = finished ? "repeat(3, minmax(0, 1fr))" : LABELS.map((_, k) => (k + 1 === step ? "1.6fr" : "1fr")).join(" ");

  const categories = getCardCategories(cards, savedCategories)
    .map((name) => ({ name, count: name === "全部" ? cards.length : cards.filter((c) => getCardCategory(c) === name).length }))
    .filter((c) => c.name === "全部" || c.count > 0);
  const range = RANGES.find((r) => r.id === ui.range) || RANGES[0];
  const sortHigh = ui.sort !== "low";
  const shown = cards
    .filter((c) => (ui.cat === "全部" || getCardCategory(c) === ui.cat) && range.ok(Number(c.tokenValue || 0)))
    .sort((a, b) => (sortHigh ? b.tokenValue - a.tokenValue : a.tokenValue - b.tokenValue));

  const chatOn = isLive;
  const { msgs } = useChat(room.id, chatOn && pageVisible);
  const lastId = msgs.length ? msgs[msgs.length - 1].id : "";
  const seenIdRef = useRef("");
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!lastId) return;
    if (!seenIdRef.current || panel === "chat") { seenIdRef.current = lastId; setUnread(0); return; }
    const at = msgs.findIndex((m) => m.id === seenIdRef.current);
    setUnread(at === -1 ? msgs.length : msgs.length - 1 - at);
  }, [lastId, msgs, panel]);
  const openPanel = (name) => { setPanel(name); setDial(false); };

  const SessionTag = room.status === "live" && getRoundSortValue(roundId) === getRoomCurrentRound(room);

  return (
    <Main css={LIVE_CSS + PAGE_CSS} style={{ gap: "20px" }}>
      <Heading />

      <Player room={room} isLive={isLive} sessionLabel={sessionLabel} msgs={chatOn ? msgs.slice(-3) : []} onChat={() => openPanel("chat")} />

      <section ref={wizRef} className="ld-wiz" aria-labelledby="wiz-title" style={{ display: "flex", flexDirection: "column", gap: "18px", padding: "18px 20px 20px", borderRadius: "10px", border: "1px solid #3a414b", background: "#080b0e", boxShadow: "inset 0 3px 0 #f4022b", scrollMarginTop: "84px" }}>
        <div ref={sessRef} style={{ display: "flex", alignItems: "stretch", gap: "8px", scrollMarginTop: "84px" }}>
          <button type="button" onClick={() => sIdx > 0 && chooseSession(openSessions[sIdx - 1])} aria-label="上一場" disabled={sIdx <= 0} style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "56px", borderRadius: "6px", border: "1px solid #282d36", background: "#13161b", color: sIdx <= 0 ? "#3a414b" : "#ffffff", cursor: "pointer" }}>
            <Icon><path d="m15 6-6 6 6 6" /></Icon>
          </button>
          <button type="button" onClick={() => openPanel("sess")} aria-haspopup="dialog" style={{ flex: "1 1 auto", minWidth: "0", display: "flex", alignItems: "center", gap: "12px", height: "56px", padding: "0 14px", borderRadius: "6px", border: "1px solid #f4022b", background: "#181015", color: "#ffffff", textAlign: "left", cursor: "pointer" }}>
            <span style={{ flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column" }}>
              <span id="sess-title" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "18px", lineHeight: "24px", fontWeight: "900", whiteSpace: "nowrap" }}>
                {sessionLabel}{SessionTag && <LiveTag small />}
              </span>
              <span style={{ fontSize: "13px", lineHeight: "18px", color: "#a0a5ad", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {sessionTime} 開抽・<strong style={{ color: half ? "#fdc800" : "#ffffff" }}>{mode}</strong>・已售 {soldCount}/{total}
              </span>
            </span>
            <span style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "13px", fontWeight: "700", color: "#ff4d68", whiteSpace: "nowrap" }}>
              <span className="ld-hide-m">轉場次</span><Icon size={16}><path d="m6 9 6 6 6-6" /></Icon>
            </span>
          </button>
          <button type="button" onClick={() => sIdx < openSessions.length - 1 && chooseSession(openSessions[sIdx + 1])} aria-label="下一場" disabled={sIdx >= openSessions.length - 1} style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "56px", borderRadius: "6px", border: "1px solid #282d36", background: "#13161b", color: sIdx >= openSessions.length - 1 ? "#3a414b" : "#ffffff", cursor: "pointer" }}>
            <Icon><path d="m9 6 6 6-6 6" /></Icon>
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "0 0 14px", borderBottom: "1px solid #282d36" }}>
          <h2 id="wiz-title" style={{ position: "absolute", width: "1px", height: "1px", margin: "-1px", padding: "0", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: "0" }}>
            {finished ? "已完成" : `第 ${step} 步／共 3 步`}：{finished ? "購買成功" : TITLES[step - 1][0]}
          </h2>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "10px" }}>
            {!finished && step > 1 && (
              <button type="button" onClick={() => goStep(step - 1)} aria-label="上一步" title="上一步" style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", cursor: "pointer" }}>
                <Icon><path d="m15 6-6 6 6 6" /></Icon>
              </button>
            )}
            <ol aria-label="步驟" className="ld-steps" style={{ flex: "1 1 auto", minWidth: "0", listStyle: "none", margin: "0", padding: "0", display: "grid", gridTemplateColumns: stepCols, gap: "8px", alignItems: "end" }}>
              {LABELS.map((label, i) => {
                const n = i + 1;
                const cur = !finished && step === n;
                const isDone = finished || step > n;
                return (
                  <li key={label} aria-current={cur ? "step" : undefined} className={cur ? "ld-stepcur" : ""} style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <span style={{ display: "flex", alignItems: "baseline", gap: "6px", minWidth: "0", whiteSpace: "nowrap" }}>
                      <span style={{ flex: "0 0 auto", fontFamily: FONT_NUM, fontStyle: "italic", fontWeight: "900", fontSize: cur ? "30px" : "16px", lineHeight: "1", color: cur || isDone ? "#f4022b" : "#4a525c" }}>{isDone ? "✓" : n}</span>
                      <span className="ld-slbl" style={{ minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", fontSize: cur ? "22px" : "13px", lineHeight: cur ? "28px" : "18px", fontWeight: cur ? "900" : "500", color: cur ? "#ffffff" : isDone ? "#c3c8cd" : "#6b767f" }}>{label}</span>
                    </span>
                    <span aria-hidden="true" style={{ display: "block", height: "4px", borderRadius: "999px", background: cur || isDone ? "#f4022b" : "#21252d", boxShadow: cur ? "0 0 10px rgba(244, 2, 43, 0.7)" : "none" }}></span>
                  </li>
                );
              })}
            </ol>
            <button type="button" onClick={() => setUi({ ...ui, help: !ui.help })} aria-expanded={ui.help} aria-label="玩法說明" title="玩法說明" style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", borderRadius: "4px", border: "0", background: "transparent", color: "#a0a5ad", cursor: "pointer" }}>
              <Icon size={20} sw={1.8}><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6" /><path d="M12 17v.4" /></Icon>
            </button>
          </div>
          {ui.help && (
            <ol style={{ margin: "0", padding: "14px 16px 14px 36px", display: "flex", flexDirection: "column", gap: "6px", borderRadius: "6px", background: "#0b0e12", fontSize: "14px", lineHeight: "22px", color: "#c3c8cd" }}>
              <li><strong style={{ color: "#ffffff" }}>選擇場次</strong>：在上方隨時轉換場次。每場 {total} 個號碼，1/2 即有一半天堂；1/5 即五分之一；1/10 即十分之一。</li>
              <li><strong style={{ color: "#ffffff" }}>選擇卡牌</strong>：抽中天堂即可獲得所選卡牌。</li>
              <li><strong style={{ color: "#ffffff" }}>選擇號碼</strong>：每個盲盒可選 1 個號碼；想再抽可再購買新盲盒。</li>
              <li><strong style={{ color: "#ffffff" }}>確認購買</strong>：直播開抽時揭曉結果；抽中地獄可獲對應的地獄卡牌。</li>
            </ol>
          )}
        </div>

        {buyNote && !finished && (
          <div role="status" style={{ padding: "12px 16px", borderRadius: "6px", border: "1px solid #4a0511", background: "#181015", color: "#ffd7c1", fontSize: "14px", lineHeight: "20px", fontWeight: "700" }}>{buyNote}</div>
        )}

        {!finished && step === 2 && card && (
          <ul aria-label="你的選擇" style={{ listStyle: "none", margin: "0", padding: "0", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
            <li style={{ display: "inline-flex", alignItems: "center", gap: "8px", maxWidth: "100%", minHeight: "34px", padding: "4px 12px", borderRadius: "999px", border: "1px solid #282d36", background: "#13161b", fontSize: "14px", lineHeight: "20px", fontWeight: "700" }}>
              <span style={{ flex: "0 0 auto", color: "#f4022b" }}><Icon size={16} sw={3}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon></span>
              <span style={{ flex: "0 0 auto", fontWeight: "500", color: "#a0a5ad" }}>卡牌</span>
              <span style={{ minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.name}</span>
            </li>
          </ul>
        )}

        {!finished && step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div role="group" aria-label="卡牌類別" style={{ display: "flex", gap: "22px", overflowX: "auto", borderBottom: "1px solid #282d36", scrollbarWidth: "none" }}>
                {categories.map((k) => {
                  const on = k.name === ui.cat;
                  return (
                    <button key={k.name} type="button" onClick={() => setUi({ ...ui, cat: k.name })} aria-pressed={on} style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "baseline", gap: "4px", height: "40px", padding: "0 2px", marginBottom: "-1px", border: "0", borderBottom: `3px solid ${on ? "#f4022b" : "transparent"}`, background: "transparent", color: on ? "#ffffff" : "#a0a5ad", fontSize: "15px", lineHeight: "37px", fontWeight: on ? "700" : "500", cursor: "pointer", whiteSpace: "nowrap" }}>
                      {k.name}<span style={{ fontSize: "12px", fontWeight: "500", color: on ? "#ff4d68" : "#6b767f" }}>{k.count}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ flex: "1 1 auto", fontSize: "13px", lineHeight: "18px", color: "#a0a5ad", whiteSpace: "nowrap" }}>共 {shown.length} 張</span>
                <label style={{ position: "relative", flex: "0 0 auto", display: "inline-flex", alignItems: "center" }}>
                  <span style={{ position: "absolute", left: "10px", fontSize: "13px", color: "#a0a5ad", pointerEvents: "none" }}>價錢</span>
                  <select value={range.id} onChange={(e) => setUi({ ...ui, range: e.target.value })} aria-label="價錢範圍" style={{ appearance: "none", WebkitAppearance: "none", height: "34px", padding: "0 28px 0 46px", borderRadius: "4px", border: `1px solid ${range.id === "all" ? "#282d36" : "#f4022b"}`, background: "#13161b", color: "#ffffff", fontSize: "13px", fontWeight: "700", fontFamily: "inherit", cursor: "pointer" }}>
                    {RANGES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a0a5ad" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ position: "absolute", right: "9px", pointerEvents: "none" }}><path d="m6 9 6 6 6-6" /></svg>
                </label>
                <button type="button" onClick={() => setUi({ ...ui, sort: sortHigh ? "low" : "high" })} aria-label={`排序：${sortHigh ? "價錢高至低" : "價錢低至高"}，按一下切換`} style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "4px", height: "34px", padding: "0 10px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "13px", fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f4022b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5" /></svg>
                  {sortHigh ? "高至低" : "低至高"}
                </button>
              </div>
            </div>
            {cardsLoading && !cards.length ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "#a0a5ad", fontSize: "14px" }}>正在載入卡池…</div>
            ) : !shown.length ? (
              <div style={{ padding: "32px 16px", textAlign: "center", borderRadius: "10px", border: "1px dashed #282d36", color: "#a0a5ad", fontSize: "14px" }}>
                {cards.length ? "沒有符合條件的卡牌，請更改類別或價錢範圍。" : (room.poolText || "此場次暫時未有可選卡牌。")}
              </div>
            ) : null}
            <div className="ld-cgrid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(128px, 100%), 1fr))", gap: "10px" }}>
              {shown.map((c) => {
                const sel = cardId === c.id || flash === c.id;
                return (
                  <button key={c.id} type="button" aria-pressed={sel} className={`${sel ? "" : "ld-lift"} ld-ccard`} onClick={() => {
                    setCardId(c.id); setPick(null); setFlash(c.id); setBuyError("");
                    clearTimeout(advRef.current);
                    advRef.current = setTimeout(() => { setFlash(""); goStep(2); }, 260);
                  }} style={{ position: "relative", display: "flex", flexDirection: "column", gap: "6px", padding: "8px", textAlign: "left", borderRadius: "10px", border: `1px solid ${sel ? "#f4022b" : "#282d36"}`, background: sel ? "#181015" : "#0b0e12", boxShadow: sel ? SEL : "none", color: "#ffffff", cursor: "pointer" }}>
                    {sel && (
                      <span aria-hidden="true" style={{ position: "absolute", top: "8px", right: "8px", zIndex: "1", display: "flex", alignItems: "center", justifyContent: "center", width: "26px", height: "26px", borderRadius: "999px", background: "#f4022b", color: "#ffffff", boxShadow: "0 0 0 2px #05070a" }}>
                        <Icon size={16} sw={3}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>
                      </span>
                    )}
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 0", borderRadius: "6px", background: "radial-gradient(60% 60% at 50% 50%, #2a2000 0%, #05070a 80%)" }}>
                      <Slab img={c.thumbUrl || c.imageUrl} width="82%" />
                    </span>
                    <span className="ld-cname" style={{ display: "block", height: "36px", overflow: "hidden", fontSize: "12px", lineHeight: "18px", fontWeight: "700" }}>{c.name}</span>
                    <span style={{ display: "inline-flex", alignItems: "baseline", gap: "4px", whiteSpace: "nowrap" }}>
                      <span style={{ alignSelf: "center", display: "inline-flex" }}><Coin size={16} /></span>
                      <strong className="ld-cprice" style={{ fontFamily: FONT_NUM, fontWeight: "800", fontSize: "20px", lineHeight: "22px" }}>{fmt(c.tokenValue)}</strong>
                      <span className="ld-hide-m" style={{ fontSize: "12px", color: "#a0a5ad" }}>／盲盒</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 24px", padding: "14px 16px", borderRadius: "10px", border: "1px solid #14181d", background: "#05070a", fontSize: "14px", lineHeight: "20px", color: "#c3c8cd" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <span style={{ height: "22px", padding: "0 8px", borderRadius: "4px", border: "1px solid #4fb3ff", background: "#041737", color: "#c2ebff", fontSize: "12px", lineHeight: "20px", fontWeight: "700" }}>中天堂</span>獲得你選擇的卡牌
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <span style={{ height: "22px", padding: "0 8px", borderRadius: "4px", border: "1px solid #ae031d", background: "#4a0511", color: "#ffd7c1", fontSize: "12px", lineHeight: "20px", fontWeight: "700" }}>中地獄</span>
                <img src={HELL_IMG} alt="" style={{ display: "block", height: "32px", aspectRatio: "316 / 530", objectFit: "cover", borderRadius: "2px" }} />保底獲得隨機 PSA10
              </span>
            </div>
          </div>
        )}

        {!finished && step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ padding: "20px", borderRadius: "10px", border: "1px solid #282d36", background: "radial-gradient(80% 60% at 50% 0%, rgba(244, 2, 43, 0.12) 0%, rgba(244, 2, 43, 0) 70%), #05070a" }}>
              {slotsLoading && !slots.length ? (
                <div style={{ padding: "24px", textAlign: "center", color: "#a0a5ad", fontSize: "14px" }}>正在載入號碼…</div>
              ) : (
                <div className="ld-ngrid" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "10px" }}>
                  {slots.map((slot) => <NumberTile key={slot.id} slot={slot} room={room} roundId={roundId} uid={uid} pick={pick} canBuy={canBuy && Boolean(card)} onToggle={() => toggleNumber(slot)} />)}
                </div>
              )}
            </div>
            <ul style={{ listStyle: "none", margin: "0", padding: "0", display: "flex", flexWrap: "wrap", gap: "8px 20px", fontSize: "13px", lineHeight: "18px", color: "#c3c8cd" }}>
              <li style={{ display: "flex", alignItems: "center", gap: "8px" }}><span aria-hidden="true" style={{ width: "16px", height: "16px", borderRadius: "4px", border: "1px solid #282d36", background: "#21252d" }}></span>可選</li>
              <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "16px", height: "16px", borderRadius: "4px", border: "1px solid #14181d", background: "#05070a" }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#a0a5ad" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </span>已被購買
              </li>
              <li style={{ display: "flex", alignItems: "center", gap: "8px" }}><span aria-hidden="true" style={{ width: "16px", height: "16px", borderRadius: "4px", border: "1px solid #f4022b", background: "#ae031d" }}></span>我的號碼</li>
            </ul>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "14px 16px", borderRadius: "10px", border: `1px solid ${pick ? "#f4022b" : "#282d36"}`, background: "#181015" }}>
              <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                <strong style={{ fontSize: "17px", lineHeight: "24px" }}>{pick ? `已選號碼 #${pick}` : "請按一個號碼"}</strong>
                <span style={{ fontSize: "13px", lineHeight: "18px", color: "#a0a5ad" }}>每個盲盒 {fmt(unit)} 代幣（1 個號碼）</span>
              </span>
              <button type="button" onClick={() => pick && goStep(3)} disabled={!pick} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", minHeight: "52px", padding: "0 26px", borderRadius: "4px", border: "0", background: pick ? "#f4022b" : "#21252d", color: pick ? "#ffffff" : "#a0a5ad", boxShadow: pick ? "0 6px 20px rgba(244, 2, 43, 0.4)" : "none", fontSize: "18px", fontWeight: "900", cursor: "pointer" }}>
                下一步：確認購買<Icon size={20}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>
              </button>
            </div>
          </div>
        )}

        {!finished && step === 3 && card && pick && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", padding: "24px", borderRadius: "10px", border: "1px solid #282d36", background: "#05070a" }}>
              <div style={{ flex: "0 1 180px", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", borderRadius: "6px", background: "radial-gradient(60% 60% at 50% 50%, #2a2000 0%, #05070a 80%)" }}>
                <Slab img={card.imageUrl || card.thumbUrl} width="140px" big />
              </div>
              <dl style={{ flex: "1 1 340px", margin: "0", display: "grid", gridTemplateColumns: "auto 1fr", gap: "12px 20px", alignContent: "start", fontSize: "15px", lineHeight: "22px" }}>
                <dt style={{ color: "#a0a5ad" }}>場次</dt>
                <dd style={{ margin: "0", fontWeight: "700" }}>{sessionLabel}・{roundDay(room, roundId)}{sessionTime} 開抽</dd>
                <dt style={{ color: "#a0a5ad" }}>盲盒機率</dt>
                <dd style={{ margin: "0" }}>{Math.round((HEAVEN_RATE[mode] || 0.5) * 100)}%機率（{heavenCount} 個天堂・{total - heavenCount} 個地獄）</dd>
                <dt style={{ color: "#a0a5ad" }}>天堂卡牌</dt>
                <dd style={{ margin: "0", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", fontWeight: "700" }}>{card.name}</dd>
                <dt style={{ color: "#a0a5ad" }}>地獄卡牌</dt>
                <dd style={{ margin: "0", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", fontWeight: "700" }}>
                  <img src={hellImg} alt="" style={{ display: "block", height: "44px", aspectRatio: "316 / 530", objectFit: "cover", borderRadius: "3px" }} />{hellName}
                </dd>
                <dt style={{ color: "#a0a5ad" }}>號碼</dt>
                <dd style={{ margin: "0", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "44px", height: "32px", padding: "0 10px", borderRadius: "4px", border: "1px solid #f4022b", background: "#ae031d", fontFamily: FONT_NUM, fontStyle: "italic", fontWeight: "800", fontSize: "18px" }}>#{pick}</span>
                </dd>
              </dl>
              {!enough && (
                <span style={{ flex: "1 1 100%", display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: "8px", color: "#ffd7c1" }}>
                  <strong>代幣不足，尚欠 {fmt(Math.max(0, unit - balance))} 代幣</strong>
                  <a href={`${BASE}/topup`} style={{ color: "#ffffff", textDecoration: "underline" }}>前往充值</a>
                </span>
              )}
              {buyError && (
                <span role="alert" style={{ flex: "1 1 100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid #ae031d", background: "#181015", color: "#ffd7c1", fontSize: "14px", lineHeight: "20px", fontWeight: "700" }}>{buyError}</span>
              )}
            </div>
            <button type="button" onClick={confirm} disabled={!enough || buying || !canBuy} style={{ position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", minHeight: "60px", padding: "0 28px", borderRadius: "6px", border: "0", background: enough && canBuy ? "linear-gradient(180deg, #ffe390 0%, #fdc800 45%, #f88f00 100%)" : "#21252d", color: enough && canBuy ? "#1a1300" : "#a0a5ad", boxShadow: enough && canBuy ? "0 0 0 2px #fdc800, 0 0 32px rgba(253, 200, 0, 0.45)" : "none", fontSize: "20px", fontWeight: "900", cursor: buying ? "progress" : "pointer" }}>
              {enough && canBuy && !buying && <span aria-hidden="true" style={{ position: "absolute", top: "0", bottom: "0", left: "0", width: "30%", background: "linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.55) 50%, rgba(255, 255, 255, 0) 100%)", animation: "ld-shimmer 2400ms ease-in-out infinite" }}></span>}
              <span style={{ position: "relative" }}>{buying ? "正在鎖定號碼…" : signedIn || SAMPLE ? "確認購買" : "登入後確認購買"}</span>
              <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: FONT_NUM, fontSize: "24px" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="#fdc800" stroke="#1a1300" strokeWidth="2"></circle><path d="M13.4 5.2 7.9 13h3.9l-1.2 5.8 5.6-8h-4z" fill="#1a1300"></path></svg>
                {fmt(unit)}
              </span>
            </button>
          </div>
        )}

        {finished && (
          <div role="status" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", padding: "40px 24px", borderRadius: "10px", border: "1px solid #3a2a00", background: "radial-gradient(60% 80% at 50% 0%, rgba(253, 200, 0, 0.16) 0%, rgba(253, 200, 0, 0) 70%), #05070a", textAlign: "center" }}>
            <span aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "72px", height: "72px", borderRadius: "999px", background: "#fdc800", color: "#1a1300", boxShadow: "0 0 0 2px #fdc800, 0 0 32px rgba(253, 200, 0, 0.45)" }}>
              <Icon size={36} sw={2.6}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>
            </span>
            <h2 style={{ margin: "0", fontFamily: FONT_TITLE, fontStyle: "italic", fontWeight: "900", fontSize: "40px", lineHeight: "44px" }}>購買成功！</h2>
            <p style={{ margin: "0", fontSize: "16px", lineHeight: "24px", color: "#c3c8cd" }}>
              {formatRoundLabel(done.roundId)}・號碼 <strong style={{ color: "#ffffff" }}>#{done.number}</strong> 已鎖定，{roundTime(room, done.roundId)} 直播開抽，記得準時收看。
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "12px", marginTop: "6px" }}>
              <button type="button" onClick={() => { setDone(null); setPick(null); goStep(2); }} style={{ display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "52px", padding: "0 24px", borderRadius: "4px", border: "0", background: "#f4022b", color: "#ffffff", fontSize: "17px", fontWeight: "900", cursor: "pointer" }}>同一卡牌再買一個盲盒</button>
              <button type="button" onClick={() => { setDone(null); setPick(null); setCardId(""); setStep(1); scrollTo(sessRef.current); }} style={{ display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "52px", padding: "0 22px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "16px", fontWeight: "700", cursor: "pointer" }}>選購其他場次</button>
            </div>
            <a href={`${BASE}/records`} className="ld-link" style={{ display: "inline-flex", alignItems: "center", gap: "6px", minHeight: "32px", fontSize: "14px", color: "#a0a5ad" }}>
              到「我的紀錄」查看已購買的號碼<Icon size={16} sw={2}><path d="m9 6 6 6-6 6" /></Icon>
            </a>
          </div>
        )}
      </section>

      <div className="ld-fab" style={{ position: "fixed", right: "24px", bottom: "24px", zIndex: "55", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "10px" }}>
        <div className={`ld-fab-more ${dial ? "ld-dial-open" : ""}`} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "10px" }}>
          <button type="button" onClick={() => openPanel("nums")} style={fabBtn}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f4022b" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 4 7 20M17 4l-2 16M4 9h16M3.5 15h16" /></svg>天堂地獄號碼
          </button>
          <button type="button" onClick={() => (signedIn ? openPanel("rec") : requestLogin("請先登入或註冊，即可查看我的紀錄。"))} aria-haspopup="dialog" style={fabBtn}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f4022b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 6h10M10 12h10M10 18h10" /><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17" /></svg>我的紀錄
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button type="button" className="ld-fab-toggle" onClick={() => setDial(!dial)} aria-label="更多快捷功能" aria-expanded={dial} style={{ display: "none", alignItems: "center", justifyContent: "center", width: "48px", height: "48px", borderRadius: "6px", border: "1px solid #282d36", background: "linear-gradient(180deg, #21252d 0%, #13161b 100%)", color: "#ffffff", cursor: "pointer", boxShadow: "0 8px 24px rgba(0, 0, 0, 0.55)" }}>
            <Icon size={20} style={{ transform: dial ? "rotate(45deg)" : "none", transition: "transform 150ms" }}><path d="M12 5v14M5 12h14" /></Icon>
          </button>
          {chatOn && (
            <button type="button" onClick={() => openPanel("chat")} style={{ ...fabBtn, position: "relative", border: "1px solid #f4022b", background: "linear-gradient(180deg, #d50125 0%, #ae031d 100%)", boxShadow: "0 0 0 1px rgba(244, 2, 43, 0.35), 0 8px 24px rgba(244, 2, 43, 0.4)" }}>
              <Icon size={20} sw={1.9}><path d="M4 12a8 7 0 1 1 3.4 5.7L4 19l1-3.6A6.6 6.6 0 0 1 4 12z" /></Icon>大廳聊天
              {panel !== "chat" && unread > 0 && (
                <span aria-label={`${unread} 則未讀訊息`} style={{ position: "absolute", top: "-6px", right: "-4px", minWidth: "22px", height: "22px", padding: "0 6px", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", border: "2px solid #0b0e12", background: "#ffffff", color: "#d50125", fontSize: "12px", fontWeight: "900" }}>{unread}</span>
              )}
            </button>
          )}
        </div>
      </div>

      {panel === "chat" && chatOn && <ChatPanel room={room} profile={profile} msgs={msgs} onClose={() => setPanel("")} />}

      {panel === "nums" && (
        <>
          <button type="button" onClick={() => setPanel("")} aria-label="關閉天堂地獄號碼" style={backdrop}></button>
          <section className="ld-nums" role="dialog" aria-labelledby="nums-title" style={{ ...dialog, width: "460px", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column" }}>
                <h2 id="nums-title" style={{ margin: "0", fontSize: "20px", lineHeight: "28px", fontWeight: "700" }}>天堂地獄號碼</h2>
                <span style={{ fontSize: "14px", lineHeight: "20px", color: "#a0a5ad" }}>{sessionLabel}・即時更新・已售 {soldCount} / {total}</span>
              </div>
              <button type="button" onClick={() => setPanel("")} aria-label="關閉" style={roundBtn}><CloseX /></button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "8px" }}>
              {slots.map((slot) => {
                const taken = slot.status !== "available";
                const mine = taken && slot.uid === uid;
                const side = getRoundSlotResultSide(room, roundId, slot);
                const sub = side ? (side === "heaven" ? "天堂" : "地獄") : mine ? "我的" : taken ? "已售" : "可選";
                const bg = side === "heaven" ? "#12924f" : side === "hell" ? "#4a0511" : mine ? "#d50125" : taken ? "#05070a" : "#21252d";
                return (
                  <div key={slot.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "56px", borderRadius: "6px", border: `1px solid ${mine ? "#f4022b" : taken ? "#14181d" : "#3a414b"}`, background: bg, color: taken && !mine && !side ? "#4a525c" : "#ffffff" }}>
                    <span style={{ fontSize: "18px", lineHeight: "22px", fontWeight: "900" }}>{slot.number}</span>
                    <span style={{ fontSize: "11px", lineHeight: "14px" }}>{sub}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: "13px", color: "#a0a5ad" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><span aria-hidden="true" style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#21252d", border: "1px solid #3a414b" }}></span>可選</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><span aria-hidden="true" style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#05070a", border: "1px solid #14181d" }}></span>已被購買</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><span aria-hidden="true" style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#d50125" }}></span>我的號碼</span>
            </div>
            <button type="button" onClick={() => { setPanel(""); if (!finished) goStep(card ? 2 : 1); }} style={{ height: "48px", borderRadius: "4px", border: "0", background: "#f4022b", color: "#ffffff", fontSize: "16px", fontWeight: "700", cursor: "pointer" }}>
              {finished ? "知道了" : card ? "去選擇號碼" : "去選擇卡牌"}
            </button>
          </section>
        </>
      )}

      {panel === "sess" && (
        <>
          <button type="button" onClick={() => setPanel("")} aria-label="關閉場次列表" style={backdrop}></button>
          <section className="ld-nums" role="dialog" aria-labelledby="sesslist-title" style={{ ...dialog, width: "560px", maxHeight: "86vh", overflowY: "auto", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column" }}>
                <h2 id="sesslist-title" style={{ margin: "0", fontSize: "20px", lineHeight: "28px", fontWeight: "700" }}>選擇場次</h2>
                <span style={{ fontSize: "13px", lineHeight: "18px", color: "#a0a5ad" }}>共 {sessions.length} 場・已結束的場次可在「過往直播及賽果」查看</span>
              </div>
              <button type="button" onClick={() => setPanel("")} aria-label="關閉" style={roundBtn}><CloseX /></button>
            </div>
            {[...new Set(sessions.map((s) => s.group))].map((groupKey) => {
              const list = sessions.filter((s) => s.group === groupKey);
              return (
                <div key={groupKey} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {new Set(sessions.map((s) => s.group)).size > 1 && <strong style={{ fontSize: "14px", color: "#c3c8cd" }}>{list[0].groupLabel}</strong>}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
                    {list.map((s) => {
                      const sel = s.roomId === room.id && s.roundId === roundId;
                      const ended = s.status === "completed";
                      const tag = ended ? "已結束" : sel ? "已選擇" : s.status === "live" ? "● 直播中" : s.statusLabel === "可購買" ? "可預訂" : s.statusLabel;
                      const tagColor = ended ? "#4a525c" : sel || s.status === "live" ? "#ff4d68" : s.status === "locked" ? "#a0a5ad" : "#22c55e";
                      return (
                        <button key={s.key} type="button" onClick={() => chooseSession(s)} aria-pressed={sel} disabled={ended} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px", padding: "8px 10px", borderRadius: "6px", border: `1px solid ${sel ? "#f4022b" : ended ? "#14181d" : "#282d36"}`, background: sel ? "#181015" : ended ? "#05070a" : "#13161b", color: ended ? "#4a525c" : "#ffffff", textAlign: "left", cursor: ended ? "not-allowed" : "pointer" }}>
                          <span style={{ fontSize: "14px", lineHeight: "18px", fontWeight: "700", whiteSpace: "nowrap" }}>{s.label}</span>
                          <span style={{ fontSize: "12px", lineHeight: "16px", color: ended ? "#4a525c" : "#a0a5ad", whiteSpace: "nowrap" }}>{s.time}・<strong style={{ color: ended ? "#4a525c" : s.mode === "1/2" ? "#fdc800" : "#c3c8cd" }}>{s.mode}</strong></span>
                          <span style={{ fontSize: "11px", lineHeight: "14px", fontWeight: "700", color: tagColor }}>{tag}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <a href={`${BASE}/results`} className="ld-link" style={{ alignSelf: "center", display: "inline-flex", alignItems: "center", gap: "6px", minHeight: "36px", fontSize: "14px", color: "#a0a5ad" }}>
              <Icon size={16} sw={1.8}><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3.5 4.5V8H7" /><path d="M12 7.5V12l3 2" /></Icon>查看已結束場次賽果
            </a>
          </section>
        </>
      )}

      {panel === "rec" && signedIn && <RecordsDrawer uid={uid} roomId={room.id} onClose={() => setPanel("")} />}
    </Main>
  );
}

function NumberTile({ slot, room, roundId, uid, pick, canBuy, onToggle }) {
  const n = Number(slot.number);
  const taken = slot.status !== "available";
  const owned = taken && slot.uid === uid;
  const mine = !taken && pick === n;
  const side = getRoundSlotResultSide(room, roundId, slot);
  const who = owned ? "你" : slot.username || "已售";
  const cardName = slot.targetCardName || "";
  const disabled = taken || !canBuy;
  const aria = taken ? `號碼 ${n}，${owned ? "你的號碼" : `已被 ${who} 購買`}${cardName ? `，卡牌：${cardName}` : ""}${side ? `，${side === "heaven" ? "天堂" : "地獄"}` : ""}` : `號碼 ${n}${mine ? "，已選" : "，可選"}`;
  return (
    <button type="button" onClick={onToggle} disabled={disabled} aria-pressed={mine} aria-label={aria} className={mine || taken || !canBuy ? "" : "ld-lift"} style={{
      position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px", height: "84px", borderRadius: "10px",
      border: `1px solid ${owned ? "#f4022b" : taken ? "#14181d" : mine ? "#f4022b" : "#282d36"}`,
      background: taken ? (owned ? "#181015" : "#05070a") : mine ? "linear-gradient(180deg, #d50125 0%, #ae031d 100%)" : "linear-gradient(180deg, #21252d 0%, #13161b 100%)",
      boxShadow: mine ? SEL : taken ? "none" : "inset 0 1px 0 rgba(255, 255, 255, 0.08)",
      color: taken ? "#a0a5ad" : "#ffffff", cursor: taken || !canBuy ? "not-allowed" : "pointer", opacity: !taken && !canBuy ? 0.55 : 1,
    }}>
      {side && (
        <span style={{ position: "absolute", top: "6px", right: "6px", height: "18px", padding: "0 6px", borderRadius: "3px", background: side === "heaven" ? "#12924f" : "#d50125", color: "#ffffff", fontSize: "11px", lineHeight: "18px", fontWeight: "700" }}>{side === "heaven" ? "天堂" : "地獄"}</span>
      )}
      {taken ? (
        <>
          <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", lineHeight: "18px", color: owned ? "#ff6b82" : "#a0a5ad", maxWidth: "100%", padding: "0 6px", overflow: "hidden", whiteSpace: "nowrap" }}>
            {!owned && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b767f" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true" style={{ flex: "0 0 auto" }}><path d="M6 6l12 12M18 6 6 18" /></svg>}
            <span style={{ fontFamily: FONT_NUM, fontStyle: "italic", fontWeight: "800", fontSize: "17px", color: owned ? "#ffffff" : "#c3c8cd" }}>{n}</span>・<span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{owned ? "我的號碼" : who}</span>
          </span>
          <span style={{ display: "block", width: "100%", height: "30px", padding: "0 8px", overflow: "hidden", fontSize: "11px", lineHeight: "15px", color: "#c3c8cd", textAlign: "center", overflowWrap: "anywhere" }}>{cardName}</span>
        </>
      ) : (
        <>
          <span style={{ fontFamily: FONT_NUM, fontStyle: "italic", fontWeight: "800", fontSize: "32px", lineHeight: "34px" }}>{n}</span>
          <span style={{ fontSize: "12px", lineHeight: "16px", color: mine ? "#ffffff" : "#a0a5ad" }}>{mine ? "我的號碼" : "可選"}</span>
        </>
      )}
    </button>
  );
}

// The real Kick stream in the design's frame. When it scrolls out of view the same player
// docks to the corner (moving the element would reload the stream).
function Player({ room, isLive, sessionLabel, msgs, onChat }) {
  const holderRef = useRef(null);
  const [visible, setVisible] = useState(true);
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    const el = holderRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver((entries) => {
      const vis = Boolean(entries[0]) && entries[0].intersectionRatio > 0.25;
      setVisible(vis);
      if (vis) setClosed(false);
    }, { threshold: [0, 0.25, 0.5, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const docked = isLive && !visible && !closed;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: "16px" }}>
      <section aria-label="直播畫面" style={{ flex: "1 1 100%", minWidth: "0", display: "flex", flexDirection: "column", gap: "12px", padding: "16px", borderRadius: "10px", border: "1px solid #4a0511", background: "#05070a" }}>
        <div ref={holderRef} style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", maxHeight: "540px" }}>
          <div className={`ld-player ld-live-player${docked ? " ld-live-docked" : ""}`} style={docked ? { borderRadius: "10px", overflow: "hidden" } : { position: "absolute", inset: "0", borderRadius: "6px", overflow: "hidden", border: "1px solid #282d36", background: "radial-gradient(70% 90% at 50% 45%, #2a0710 0%, #05070a 72%)" }}>
            <div style={{ position: "relative", width: "100%", aspectRatio: docked ? "16 / 9" : undefined, height: docked ? undefined : "100%" }}>
              <LegacyUI><KickEmbed kickUrl={room.kickUrl} title={room.title || "LiveDraw 直播"} /></LegacyUI>
              {isLive && !docked && (
                <span style={{ position: "absolute", top: "14px", left: "14px", pointerEvents: "none" }}><LiveTag /></span>
              )}
              {!docked && msgs.length > 0 && (
                <button type="button" className="ld-ovl" onClick={onChat} aria-label="開啟大廳聊天" style={{ position: "absolute", left: "14px", bottom: "70px", maxWidth: "60%", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "6px", padding: "0", border: "0", background: "none", cursor: "pointer", textAlign: "left" }}>
                  {msgs.map((m) => (
                    <span key={m.id} style={{ maxWidth: "100%", padding: "4px 12px", borderRadius: "999px", background: "rgba(5, 7, 10, 0.66)", fontSize: "13px", lineHeight: "20px", color: "#ffffff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      <strong style={{ color: "#fdc800" }}>{m.username}</strong>{"\u3000"}{m.text}
                    </span>
                  ))}
                </button>
              )}
              {!docked && (
                <div aria-hidden="true" style={{ position: "absolute", left: "0", right: "0", bottom: "0", zIndex: 2, display: "flex", alignItems: "center", padding: "12px 14px", minHeight: "64px", background: "linear-gradient(0deg, rgba(5, 7, 10, 0.85), rgba(5, 7, 10, 0))", pointerEvents: "none" }}>
                  <span style={{ fontSize: "14px", color: "#c3c8cd", paddingRight: "110px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{room.title || "LiveDraw 直播"}</span>
                </div>
              )}
              {docked && (
                <button type="button" onClick={() => setClosed(true)} aria-label="關閉迷你播放器" style={{ position: "absolute", top: "6px", right: "6px", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", border: "1px solid #282d36", background: "rgba(5, 7, 10, 0.7)", color: "#ffffff", cursor: "pointer", zIndex: 3 }}>
                  <CloseX />
                </button>
              )}
            </div>
            {docked && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px" }}>
                <span className="ld-hide-m" style={{ flex: "1 1 auto", fontSize: "14px", fontWeight: "700" }}>{sessionLabel}・直播中</span>
                <button type="button" onClick={() => holderRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })} style={{ flex: "1 1 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px", height: "36px", padding: "0 12px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
                  <Icon size={14} sw={1.8}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></Icon>返回大畫面
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function ChatPanel({ room, profile, msgs, onClose }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const logRef = useRef(null);
  const cooldownMs = roomChatCooldownSeconds(room) * 1000;
  const last = profile?.lastChatAt?.toMillis ? profile.lastChatAt.toMillis() : 0;
  const wait = Math.max(0, cooldownMs - (now - last));
  useEffect(() => {
    if (!wait) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [wait]);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [msgs.length]);
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Same write as the main site's chat (firestore.rules check the cooldown and the text).
  async function send(raw) {
    const clean = String(raw || "").trim();
    if (!clean || sending) return;
    if (!profile) { requestLogin("請先登入或註冊，即可在聊天室發言。"); return; }
    if (wait > 0) return;
    if (isBlockedChatText(clean)) {
      setError("為保障玩家安全，聊天室不可發送連結、電話號碼或其他聯絡／付款方式。如需協助，請使用「聯絡客服」。");
      return;
    }
    setSending(true);
    setError("");
    try {
      const claimed = await ensureUsernameClaim(profile.uid, profile.username);
      await runTransaction(db, async (tx) => {
        const userRef = doc(db, "users", profile.uid);
        const messageRef = doc(collection(db, "draws", room.id, "messages"));
        const userSnap = await tx.get(userRef);
        const lastChatAt = userSnap.data()?.lastChatAt;
        if (lastChatAt?.toMillis) {
          const elapsed = Date.now() - lastChatAt.toMillis();
          if (elapsed < cooldownMs) throw new Error(`請等待 ${Math.ceil((cooldownMs - elapsed) / 1000)} 秒後再發送訊息。`);
        }
        tx.update(userRef, { lastChatAt: serverTimestamp(), lastChatMessageId: messageRef.id, updatedAt: serverTimestamp() });
        tx.set(messageRef, { drawId: room.id, source: "draw", uid: profile.uid, username: claimed, text: clean.slice(0, 500), createdAt: serverTimestamp() });
      });
      setText("");
      setNow(Date.now());
    } catch (err) {
      console.error(err);
      setError(getSafeErrorMessage(err, "訊息未能發送，請再試一次。"));
    } finally {
      setSending(false);
    }
  }

  const waitSec = Math.ceil(wait / 1000);
  const slow = roomChatCooldownSeconds(room) > 3;
  return (
    <>
      <button type="button" className="ld-chat-bd" onClick={onClose} aria-label="關閉大廳聊天" style={backdrop}></button>
      <aside className="ld-chat" role="dialog" aria-labelledby="chat-title" style={{ position: "fixed", top: "16px", right: "16px", bottom: "16px", zIndex: "90", width: "380px", maxWidth: "calc(100% - 32px)", display: "flex", flexDirection: "column", gap: "14px", padding: "20px", borderRadius: "10px", border: "1px solid #282d36", background: "#05070a", boxShadow: "-12px 0 40px rgba(0, 0, 0, 0.6)" }}>
        <span className="ld-grab" aria-hidden="true" style={{ display: "none", alignSelf: "center", width: "40px", height: "4px", margin: "-8px 0 -4px", borderRadius: "999px", background: "#3a414b" }}></span>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
          <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "12px", lineHeight: "16px", letterSpacing: "0.1em", color: "#a0a5ad" }}>LIVE CHAT</span>
            <h2 id="chat-title" style={{ margin: "0", fontSize: "20px", lineHeight: "28px", fontWeight: "700" }}>大廳聊天</h2>
          </div>
          {slow && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "28px", padding: "0 10px", borderRadius: "999px", background: "#13161b", fontSize: "13px", color: "#c3c8cd" }}>
              慢速模式：每 {roomChatCooldownSeconds(room)} 秒
            </span>
          )}
          <button type="button" onClick={onClose} aria-label="關閉" style={roundBtn}><CloseX /></button>
        </div>
        <ul ref={logRef} aria-live="polite" style={{ listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column", gap: "14px", flex: "1 1 auto", minHeight: "0", overflowY: "auto" }}>
          {!msgs.length && <li style={{ fontSize: "14px", color: "#a0a5ad" }}>大廳暫時未有訊息。</li>}
          {msgs.map((m) => {
            const own = profile && m.uid === profile.uid;
            return (
              <li key={m.id} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                <span aria-hidden="true" style={{ flex: "0 0 auto", width: "30px", height: "30px", borderRadius: "999px", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${own ? "#f4022b" : "#282d36"}`, background: own ? "#4a0511" : "#21252d", color: "#ffffff", fontSize: "13px", fontWeight: "700" }}>{String(m.username || "?").charAt(0)}</span>
                <span style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
                  <span style={{ fontSize: "14px", lineHeight: "20px" }}><strong>{m.username}</strong> <span style={{ fontSize: "12px", color: "#6b767f" }}>{fmtTime(m.createdAt).split(" ")[1] || ""}</span></span>
                  <span style={{ fontSize: "14px", lineHeight: "20px", color: "#c3c8cd", overflowWrap: "anywhere" }}>{m.text}</span>
                </span>
              </li>
            );
          })}
        </ul>
        {error && <p role="alert" style={{ margin: "0", fontSize: "13px", lineHeight: "18px", color: "#ffd7c1" }}>{error}</p>}
        {profile ? (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {QUICK.map((q) => (
                <button key={q} type="button" onClick={() => send(q)} disabled={sending || wait > 0} style={{ height: "34px", padding: "0 14px", borderRadius: "999px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "14px", cursor: "pointer" }}>{q}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <input type="text" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) send(text); }} aria-label="輸入大廳訊息" placeholder="輸入大廳訊息…" disabled={sending} style={{ flex: "1 1 auto", minWidth: "0", height: "44px", padding: "0 12px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "16px", outline: "none" }} />
              <button type="button" onClick={() => send(text)} disabled={sending || wait > 0 || !text.trim()} style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "6px", height: "44px", padding: "0 16px", borderRadius: "4px", border: "0", background: "#f4022b", color: "#ffffff", fontSize: "16px", fontWeight: "700", cursor: "pointer", opacity: sending || wait > 0 || !text.trim() ? 0.6 : 1 }}>
                <Icon size={16} sw={2}><path d="M21 3 10 14" /><path d="M21 3 14.5 21l-4.5-7-7-4.5z" /></Icon>
                {sending ? "發送中…" : wait > 0 ? `等待 ${waitSec} 秒` : "發送"}
              </button>
            </div>
          </>
        ) : (
          <button type="button" onClick={() => requestLogin("請先登入或註冊，即可在聊天室發言。")} style={{ height: "44px", borderRadius: "4px", border: "0", background: "#f4022b", color: "#ffffff", fontSize: "16px", fontWeight: "700", cursor: "pointer" }}>登入後即可發言</button>
        )}
      </aside>
    </>
  );
}

function RecordsDrawer({ uid, roomId, onClose }) {
  const { records, loading } = useMyRecords(uid, true);
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <button type="button" onClick={onClose} aria-label="關閉我的紀錄" style={backdrop}></button>
      <aside className="ld-rec" role="dialog" aria-labelledby="rec-title" style={{ position: "fixed", top: "0", bottom: "0", left: "0", zIndex: "90", width: "440px", maxWidth: "92vw", display: "flex", flexDirection: "column", borderRight: "1px solid #282d36", background: "#0b0e12", boxShadow: "12px 0 40px rgba(0, 0, 0, 0.6)", animation: "ld-recin 220ms ease-out both" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "20px 20px 16px", borderBottom: "1px solid #1d2128" }}>
          <h2 id="rec-title" style={{ flex: "1 1 auto", margin: "0", fontSize: "26px", lineHeight: "32px", fontWeight: "900" }}>我的紀錄</h2>
          <button type="button" onClick={onClose} aria-label="關閉" style={{ ...roundBtn, width: "44px", height: "44px", borderRadius: "6px" }}><Icon><path d="m15 6-6 6 6 6" /></Icon></button>
        </div>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #1d2128", fontSize: "13px", fontWeight: "700", color: "#a0a5ad" }}>{loading ? "載入中…" : `最近 ${records.length} 筆`}</div>
        <ul style={{ listStyle: "none", margin: "0", padding: "0", flex: "1 1 auto", minHeight: "0", overflowY: "auto" }}>
          {!loading && !records.length && <li style={{ padding: "20px", fontSize: "14px", color: "#a0a5ad" }}>暫時未有抽卡紀錄。</li>}
          {records.map((r) => {
            const res = r.cardId ? (r.resultSide === "hell" ? "地獄" : "天堂") : "待開";
            const resBg = r.cardId ? (r.resultSide === "hell" ? "#d50125" : "#12924f") : "#3a414b";
            return (
              <li key={r.id} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "14px 20px", borderBottom: "1px solid #1d2128" }}>
                <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                  {r.targetCardImageUrl || r.cardImageUrl
                    ? <img src={r.targetCardImageUrl || r.cardImageUrl} alt="" style={{ flex: "0 0 auto", display: "block", width: "52px", aspectRatio: "63 / 88", objectFit: "cover", borderRadius: "4px", background: "#13161b" }} />
                    : <span style={{ flex: "0 0 auto", width: "52px", aspectRatio: "63 / 88", borderRadius: "4px", background: "#13161b" }}></span>}
                  <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", lineHeight: "22px" }}>{r.drawTitle || r.roomSlug || "直播抽卡"}</strong>
                    <span style={{ fontSize: "13px", lineHeight: "18px", color: "#c3c8cd" }}>{formatRoundLabel(r.round)}・#{r.number || "--"}</span>
                    <span style={{ fontSize: "12px", lineHeight: "18px", color: "#a0a5ad", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>所屬盲盒：{r.targetCardName || "未選卡牌"}</span>
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <Coin size={24} />
                    <strong style={{ fontFamily: FONT_NUM, fontWeight: "800", fontSize: "22px", lineHeight: "24px" }}>{fmt(r.tokenCost)}</strong>
                  </span>
                  <span style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
                    {r.drawId === roomId && <span style={{ height: "24px", padding: "0 8px", borderRadius: "3px", border: "1px solid #f4022b", color: "#ff6b82", fontSize: "12px", lineHeight: "22px", fontWeight: "700" }}>本直播</span>}
                    <span style={{ height: "24px", padding: "0 8px", borderRadius: "3px", background: resBg, color: "#ffffff", fontSize: "12px", lineHeight: "24px", fontWeight: "700" }}>{res}</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        <a href={`${BASE}/records`} className="ld-link" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", minHeight: "52px", borderTop: "1px solid #1d2128", fontSize: "14px", fontWeight: "700", color: "#c3c8cd" }}>
          查看全部紀錄<Icon size={14} sw={2}><path d="m9 6 6 6-6 6" /></Icon>
        </a>
      </aside>
    </>
  );
}
