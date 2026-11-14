// 過往直播及賽果 and a room's result page on /beta, built to the revamp design
// (Results.html / ResultDetail.html). The data is the main site's: completed live rooms,
// their per-round number records, heaven/hell sides and result photos, all read-only.
import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import {
  ARCHIVE_PAGE_SIZE,
  LIVE_SNAPSHOT_OPTIONS,
  formatRoundLabel,
  getBlindBoxOdds,
  getRoomRoundCount,
  getRoomRoundOptions,
  getRoomShareMode,
  getRoundDisplayStatus,
  getRoundSchedule,
  getRoundSlotResultSide,
  getRoundsByDate,
  getSafeErrorMessage,
  isSnapshotReady,
  toMillis,
} from "../../App.jsx";
import { BASE, navigate } from "../runtime.jsx";
import { EmptyBox, FONT_NUM, FONT_TITLE, Main, fmtTime, ghostBtn } from "../ui.jsx";
import { CSS as RESULTS_CSS } from "./ResultsPage.jsx";
import { CSS as DETAIL_CSS } from "./ResultDetailPage.jsx";

const HERO_BG = "radial-gradient(60% 140% at 100% 0%, rgba(244, 2, 43, 0.18) 0%, rgba(244, 2, 43, 0) 60%), #05070a";
const PANEL = { borderRadius: "10px", border: "1px solid #14181d", background: "#05070a" };
const ARROW = <path d="M5 12h14M13 6l6 6-6 6"></path>;
const CHEVRON = <path d="m9 6 6 6-6 6"></path>;
const LOCK = <><rect x="4.5" y="10.5" width="15" height="10" rx="2"></rect><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"></path></>;

const Svg = ({ size = 18, sw = 2.2, stroke = "currentColor", children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

// Hong Kong date parts for a Date.
const hkParts = (date) => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  const weekday = new Intl.DateTimeFormat("zh-HK", { timeZone: "Asia/Hong_Kong", weekday: "narrow" }).format(date);
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour"), mm: get("minute"), wd: weekday };
};
const pad = (value) => String(value).padStart(2, "0");

// A room's live date: its first scheduled round, else when it was created.
function roomDate(room) {
  const first = getRoundSchedule(room, "round-001");
  if (first instanceof Date) return first;
  const ms = toMillis(room.createdAt);
  return ms ? new Date(ms) : null;
}

function roundTime(room, roundId) {
  const at = getRoundSchedule(room, roundId);
  if (!(at instanceof Date)) return "時間待定";
  const p = hkParts(at);
  return `${p.hh}:${p.mm}`;
}

const resultCount = (room) => Object.values(room.roundResultImages || {}).filter(Boolean).length;
const resultHref = (room, roundId) => `${BASE}/result?room=${encodeURIComponent(room.id)}${roundId ? `&round=${roundId}` : ""}`;

// ---------------------------------------------------------------------------
// 過往直播及賽果

export function ResultsRoute() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pageSize, setPageSize] = useState(ARCHIVE_PAGE_SIZE);

  useEffect(() => onSnapshot(
    query(collection(db, "draws"), where("status", "==", "completed"), orderBy("createdAt", "desc"), limit(pageSize)),
    LIVE_SNAPSHOT_OPTIONS,
    (snapshot) => {
      setRooms(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      setError("");
      if (isSnapshotReady(snapshot)) setLoading(false);
    },
    (err) => {
      console.error("Archive room listener failed.", err);
      setError(getSafeErrorMessage(err, "未能載入過往直播及賽果。"));
      setLoading(false);
    },
  ), [pageSize]);

  const [latest, ...older] = rooms;
  const months = useMemo(() => {
    const groups = [];
    older.forEach((room) => {
      const date = roomDate(room);
      const p = date ? hkParts(date) : null;
      const key = p ? `${p.y}-${p.m}` : "unknown";
      let group = groups.find((item) => item.key === key);
      if (!group) {
        group = { key, label: p ? `${p.y} 年 ${p.m} 月` : "日期待定", rooms: [] };
        groups.push(group);
      }
      group.rooms.push({ room, p });
    });
    return groups;
  }, [older]);

  return (
    <Main css={RESULTS_CSS}>
      <section aria-labelledby="res-title" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "16px 24px", padding: "28px 32px", borderRadius: "10px", border: "1px solid #14181d", background: HERO_BG }}>
        <div style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ fontSize: "13px", lineHeight: "18px", fontWeight: "700", color: "#f4022b" }}>直播紀錄</span>
          <h1 id="res-title" style={{ margin: "0", fontFamily: FONT_TITLE, fontStyle: "italic", fontWeight: "900", fontSize: "48px", lineHeight: "54px" }}>過往直播及賽果</h1>
        </div>
      </section>

      {loading ? <EmptyBox>正在載入過往直播及賽果…</EmptyBox>
        : error ? <EmptyBox>{error}</EmptyBox>
          : !latest ? <EmptyBox>暫時未有已封存直播。</EmptyBox>
            : (
              <>
                <LatestArchive room={latest} />
                {months.map((group) => (
                  <section key={group.key} aria-label={group.label} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px" }}>
                      <h2 style={{ margin: "0", fontSize: "20px", lineHeight: "28px", fontWeight: "700" }}>{group.label}</h2>
                      <span style={{ fontSize: "14px", color: "#a0a5ad" }}>顯示 {group.rooms.length} 個已封存直播</span>
                    </div>
                    <ul style={{ listStyle: "none", margin: "0", padding: "0", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))", gap: "12px" }}>
                      {group.rooms.map(({ room, p }) => <ArchiveCard key={room.id} room={room} p={p} />)}
                    </ul>
                  </section>
                ))}
                {rooms.length >= pageSize && (
                  <div style={{ display: "flex", justifyContent: "center", paddingTop: "8px" }}>
                    <button type="button" onClick={() => setPageSize((size) => size + ARCHIVE_PAGE_SIZE)} style={{ height: "48px", padding: "0 28px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "16px", fontWeight: "700", cursor: "pointer" }}>載入更多過往直播</button>
                  </div>
                )}
              </>
            )}
    </Main>
  );
}

function LatestArchive({ room }) {
  const date = roomDate(room);
  const p = date ? hkParts(date) : null;
  const rounds = getRoomRoundOptions(room);
  return (
    <section aria-labelledby="latest-title" style={{ display: "flex", flexWrap: "wrap", gap: "24px", padding: "24px", borderRadius: "10px", border: "1px solid #4a0511", background: "#0b0e12" }}>
      <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <span style={{ display: "inline-flex", alignSelf: "flex-start", alignItems: "center", height: "24px", padding: "0 8px", borderRadius: "4px", background: "#ae031d", color: "#ffffff", fontSize: "12px", fontWeight: "700" }}>最新封存</span>
        <h2 id="latest-title" style={{ margin: "0", fontFamily: FONT_TITLE, fontStyle: "italic", fontWeight: "900", fontSize: "36px", lineHeight: "40px" }}>{room.title || "過往直播"}</h2>
        <span style={{ fontSize: "15px", color: "#c3c8cd" }}>{p ? `${pad(p.d)}/${pad(p.m)}/${p.y}（${p.wd}）・` : ""}{getRoomRoundCount(room)} 場・{resultCount(room)} 個賽果</span>
        <span style={{ fontSize: "12px", color: "#6b767f" }}>封存於 {fmtTime(room.archivedAt || room.updatedAt || room.createdAt)}</span>
        <a href={resultHref(room)} style={{ marginTop: "6px", display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: "8px", height: "48px", padding: "0 22px", borderRadius: "4px", background: "#f4022b", color: "#ffffff", fontSize: "16px", fontWeight: "700", boxShadow: "0 6px 20px rgba(244, 2, 43, 0.35)" }}>
          查看賽果<Svg>{ARROW}</Svg>
        </a>
      </div>
      <div style={{ flex: "2 1 420px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", fontSize: "13px", color: "#a0a5ad" }}>
          <span>當晚 {rounds.length} 個場次</span>
          <span style={{ display: "flex", gap: "12px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><span aria-hidden="true" style={{ width: "12px", height: "12px", borderRadius: "3px", border: "1px solid #4fb3ff", background: "#041737" }}></span>二份之一</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><span aria-hidden="true" style={{ width: "12px", height: "12px", borderRadius: "3px", border: "1px solid #282d36", background: "#13161b" }}></span>{rounds.some((id) => getRoomShareMode(room, id) === "1/5") ? "五份之一／十分之一" : "十分之一"}</span>
          </span>
        </div>
        <ol style={{ listStyle: "none", margin: "0", padding: "0", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(76px, 100%), 1fr))", gap: "8px" }}>
          {rounds.map((roundId) => {
            const n = Number(roundId.slice(6));
            const time = roundTime(room, roundId);
            const half = getRoomShareMode(room, roundId) === "1/2";
            return (
              <li key={roundId}>
                <a href={resultHref(room, roundId)} className="ld-lift" aria-label={`第 ${n} 場，${time}，盲盒機率${getBlindBoxOdds(getRoomShareMode(room, roundId)).label}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "56px", borderRadius: "6px", border: `1px solid ${half ? "#4fb3ff" : "#282d36"}`, background: half ? "#041737" : "#13161b", color: "#ffffff" }}>
                  <strong style={{ fontFamily: FONT_NUM, fontStyle: "italic", fontWeight: "800", fontSize: "20px", lineHeight: "22px" }}>{n}</strong>
                  <span style={{ fontSize: "11px", lineHeight: "14px", color: half ? "#c2ebff" : "#a0a5ad" }}>{time}</span>
                </a>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function ArchiveCard({ room, p }) {
  return (
    <li>
      <a href={resultHref(room)} className="ld-lift" style={{ display: "flex", alignItems: "center", gap: "16px", padding: "16px", borderRadius: "6px", border: "1px solid #282d36", background: "#0b0e12", color: "#ffffff" }}>
        <span aria-hidden="true" style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "72px", height: "72px", borderRadius: "10px", border: "1px solid #4a0511", background: "#181015" }}>
          <strong style={{ fontFamily: FONT_NUM, fontStyle: "italic", fontWeight: "900", fontSize: "32px", lineHeight: "32px" }}>{p ? p.d : "--"}</strong>
          <span style={{ fontSize: "12px", lineHeight: "16px", color: "#c3c8cd" }}>{p ? `${p.m} 月（${p.wd}）` : ""}</span>
        </span>
        <span style={{ flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
          <strong style={{ fontSize: "16px", lineHeight: "22px" }}>{room.title || "過往直播"}</strong>
          <span style={{ fontSize: "13px", lineHeight: "18px", color: "#c3c8cd" }}>{getRoomRoundCount(room)} 場・{resultCount(room)} 個賽果</span>
          <span style={{ fontSize: "12px", lineHeight: "16px", color: "#6b767f" }}>封存於 {fmtTime(room.archivedAt || room.updatedAt || room.createdAt)}</span>
        </span>
        <span style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "2px", fontSize: "14px", fontWeight: "700", color: "#f4022b" }}>查看<Svg size={16}>{CHEVRON}</Svg></span>
      </a>
    </li>
  );
}

// ---------------------------------------------------------------------------
// One room's results

// Number records don't change once a room is archived, so they are read once per visit.
const slotCache = new Map();
function loadSlots(roomId, roundId) {
  const key = `${roomId}/${roundId}`;
  if (!slotCache.has(key)) {
    const task = getDocs(query(collection(db, "draws", roomId, "rounds", roundId, "slots"), orderBy("number", "asc")))
      .then(async (snapshot) => {
        if (!snapshot.empty || roundId !== "round-001") return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        // Rooms from before rounds existed keep their numbers on the room itself.
        const legacy = await getDocs(query(collection(db, "draws", roomId, "slots"), orderBy("number", "asc")));
        return legacy.docs.map((item) => ({ id: item.id, ...item.data() }));
      });
    task.catch(() => slotCache.delete(key));
    slotCache.set(key, task);
  }
  return slotCache.get(key);
}

function useRoom(slug) {
  const [state, setState] = useState({ room: null, loading: true, error: "" });
  useEffect(() => {
    if (!slug) { setState({ room: null, loading: false, error: "" }); return undefined; }
    let cancelled = false;
    setState({ room: null, loading: true, error: "" });
    getDoc(doc(db, "draws", slug))
      .then(async (snap) => {
        if (snap.exists()) return { id: snap.id, ...snap.data() };
        const bySlug = await getDocs(query(collection(db, "draws"), where("slug", "==", slug), limit(1)));
        return bySlug.empty ? null : { id: bySlug.docs[0].id, ...bySlug.docs[0].data() };
      })
      .then((room) => { if (!cancelled) setState({ room, loading: false, error: "" }); })
      .catch((err) => { if (!cancelled) setState({ room: null, loading: false, error: getSafeErrorMessage(err, "未能載入賽果。") }); });
    return () => { cancelled = true; };
  }, [slug]);
  return state;
}

const BackLink = () => (
  <a href={`${BASE}/results`} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 16px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "15px", fontWeight: "700" }}>
    <Svg sw={2}><path d="m15 6-6 6 6 6"></path></Svg>返回過往直播及賽果
  </a>
);

export function ResultDetailRoute({ session }) {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("room") || "";
  const { room, loading, error } = useRoom(slug);

  if (loading || !room) {
    return (
      <Main css={DETAIL_CSS}>
        <BackLink />
        <EmptyBox>{loading ? "正在載入賽果…" : error || "找不到這場直播的賽果。"}</EmptyBox>
      </Main>
    );
  }
  return <RoomResults key={room.id} room={room} uid={session?.ready ? session.profile?.uid || "" : ""} startRound={params.get("round") || ""} />;
}

function RoomResults({ room, uid, startRound }) {
  const rounds = useMemo(() => getRoomRoundOptions(room), [room]);
  const groups = useMemo(() => getRoundsByDate(room, rounds), [room, rounds]);
  const [roundId, setRoundId] = useState(rounds.includes(startRound) ? startRound : rounds[0]);
  const [slotsByRound, setSlotsByRound] = useState({});
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // The selected round first, then the rest for the 已被購買 counts on each card.
    const order = [roundId, ...rounds.filter((id) => id !== roundId)];
    order.forEach((id) => {
      loadSlots(room.id, id)
        .then((list) => { if (!cancelled) setSlotsByRound((current) => (current[id] ? current : { ...current, [id]: list })); })
        .catch((err) => {
          console.error("Result slots load failed.", err);
          if (!cancelled && id === roundId) setFailed(true);
        });
    });
    return () => { cancelled = true; };
    // Loads once per room; picking another round reuses what is already loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, rounds]);

  const pick = (id) => {
    setRoundId(id);
    window.history.replaceState({}, "", `${BASE}/result?room=${encodeURIComponent(room.id)}&round=${id}`);
  };

  const groupOf = (id) => groups.find((group) => group.rounds.includes(id));
  const dayOf = (id) => {
    const at = getRoundSchedule(room, id);
    if (!(at instanceof Date)) return "";
    const p = hkParts(at);
    return `${pad(p.d)}/${pad(p.m)}`;
  };
  const weekdayOf = (id) => {
    const at = getRoundSchedule(room, id);
    return at instanceof Date ? `${dayOf(id)}（${hkParts(at).wd}）` : "";
  };

  const slots = slotsByRound[roundId];
  const total = slots?.length || Number(room.cardCount) || 20;
  const label = formatRoundLabel(roundId);
  const odds = getBlindBoxOdds(getRoomShareMode(room, roundId));
  const status = getRoundDisplayStatus(room, roundId);
  const image = room.roundResultImages?.[roundId] || "";
  const dateLabel = groupOf(roundId)?.fullLabel || "日期待定・抽卡場次";

  const tiles = (slots || []).map((slot) => {
    const picked = slot.status !== "available";
    const side = getRoundSlotResultSide(room, roundId, slot);
    const who = picked ? (uid && slot.uid === uid ? "我的號碼" : slot.username || "已選") : "";
    return { n: slot.number, picked, side, who };
  });
  const heaven = tiles.filter((t) => t.side === "heaven").map((t) => `#${t.n} ${t.who}`);
  const hell = tiles.filter((t) => t.side === "hell").map((t) => `#${t.n} ${t.who}`);
  const pickedCount = tiles.filter((t) => t.picked).length;
  const emptyList = (kind) => (pickedCount ? `本場未有${kind}號碼被選中` : "本場未有玩家選號");

  useEffect(() => {
    if (!zoom) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setZoom(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  return (
    <Main css={DETAIL_CSS}>
      <BackLink />

      <section aria-labelledby="detail-title" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "16px 24px", padding: "28px 32px", borderRadius: "10px", border: "1px solid #14181d", background: HERO_BG }}>
        <div style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={{ display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: "6px", height: "24px", padding: "0 8px", borderRadius: "4px", background: "#21252d", color: "#ffffff", fontSize: "12px", fontWeight: "700" }}>
            <Svg size={12}>{LOCK}</Svg>{room.status === "completed" ? "已封存直播" : "已完成場次"}
          </span>
          <h1 id="detail-title" style={{ margin: "0", fontFamily: FONT_TITLE, fontStyle: "italic", fontWeight: "900", fontSize: "52px", lineHeight: "56px" }}>{room.title || "過往直播"}</h1>
        </div>
        <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", padding: "8px 18px", borderRadius: "999px", background: "#ffffff", color: "#05070a", lineHeight: "20px" }}>
          <strong style={{ fontFamily: FONT_NUM, fontStyle: "italic", fontSize: "17px" }}>{dateLabel}</strong>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#ae031d" }}>{status.label}</span>
        </span>
      </section>

      <section aria-label="場次" style={{ display: "flex", gap: "12px", overflowX: "auto", padding: "4px 4px 12px" }}>
        {rounds.map((id) => {
          const on = id === roundId;
          const list = slotsByRound[id];
          const count = list ? list.filter((slot) => slot.status !== "available").length : null;
          return (
            <button key={id} type="button" onClick={() => pick(id)} aria-pressed={on} className={on ? "" : "ld-lift"} style={{ flex: "0 0 216px", display: "flex", flexDirection: "column", gap: "8px", padding: "14px 16px", textAlign: "left", borderRadius: "6px", border: `1px solid ${on ? "#f4022b" : "#282d36"}`, background: on ? "#181015" : "#0b0e12", boxShadow: on ? "0 0 0 2px #f4022b, 0 0 24px rgba(244, 2, 43, 0.35)" : "none", color: "#ffffff", cursor: "pointer" }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <span style={{ fontFamily: FONT_NUM, fontStyle: "italic", fontWeight: "800", fontSize: "24px", lineHeight: "28px" }}>{formatRoundLabel(id)}</span>
                <span style={{ height: "22px", padding: "0 8px", borderRadius: "4px", background: "#21252d", color: "#c3c8cd", fontSize: "12px", lineHeight: "22px", fontWeight: "700" }}>{getRoundDisplayStatus(room, id).label}</span>
              </span>
              <span style={{ fontSize: "13px", lineHeight: "18px", color: "#c3c8cd" }}>盲盒機率：<strong style={{ color: "#ffffff" }}>{getBlindBoxOdds(getRoomShareMode(room, id)).label}</strong></span>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", fontSize: "13px", lineHeight: "18px", color: "#a0a5ad", whiteSpace: "nowrap" }}>
                <span>{dayOf(id)} {roundTime(room, id)}</span>
                <span>{count === null ? "" : count ? `${count} / ${list.length || total} 已被購買` : "未有選號"}</span>
              </span>
            </button>
          );
        })}
      </section>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "flex-start" }}>
        <section aria-labelledby="photo-title" style={{ flex: "1 1 320px", minWidth: "0", display: "flex", flexDirection: "column", gap: "12px", padding: "20px", ...PANEL }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 10px" }}>
            <Svg size={22} sw={1.8} stroke="#f4022b"><rect x="3.5" y="4.5" width="17" height="15" rx="2"></rect><circle cx="9" cy="10" r="1.8"></circle><path d="m20.5 16-5-5-9 8.5"></path></Svg>
            <h2 id="photo-title" style={{ margin: "0", fontSize: "20px", lineHeight: "28px", fontWeight: "700" }}>{label}賽果</h2>
            <span style={{ fontSize: "13px", color: "#a0a5ad" }}>{dateLabel}</span>
          </div>
          {image ? (
            <>
              <button type="button" onClick={() => setZoom(true)} aria-label={`放大查看${label}賽果圖片`} style={{ position: "relative", display: "block", width: "100%", aspectRatio: "4 / 3", padding: "0", borderRadius: "6px", border: "1px solid #282d36", overflow: "hidden", background: "#0b0e12", cursor: "zoom-in" }}>
                <img src={image} alt={`${label}賽果`} style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain" }} />
                <span style={{ position: "absolute", left: "12px", bottom: "12px", display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 12px", borderRadius: "4px", background: "rgba(5, 7, 10, 0.82)", color: "#ffffff", fontSize: "13px", fontWeight: "700" }}>
                  <Svg size={16} sw={1.8}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"></path></Svg>按圖放大查看
                </span>
              </button>
              <p style={{ margin: "0", fontSize: "13px", color: "#a0a5ad" }}>賽果圖片於直播開抽後上載，與號碼紀錄一併封存。</p>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px", aspectRatio: "4 / 3", borderRadius: "6px", border: "1px dashed #282d36", textAlign: "center", padding: "16px" }}>
              <strong style={{ fontSize: "16px" }}>本場未有賽果</strong>
              <span style={{ fontSize: "14px", color: "#a0a5ad" }}>{slots && !pickedCount ? "本場未有玩家選號。" : "本場未有上載賽果圖片。"}</span>
            </div>
          )}
        </section>

        <section aria-labelledby="board-title" style={{ flex: "2 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "14px", padding: "20px", ...PANEL }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "6px 14px" }}>
            <h2 id="board-title" style={{ margin: "0", fontSize: "20px", lineHeight: "28px", fontWeight: "700" }}>{label}號碼紀錄</h2>
            <span style={{ fontFamily: FONT_NUM, fontWeight: "700", fontSize: "17px", color: "#c3c8cd" }}>{pickedCount} / {total} 已被購買</span>
            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "700", color: "#a0a5ad" }}><Svg size={14} sw={2}>{LOCK}</Svg>唯讀</span>
          </div>
          {!slots ? <EmptyBox>{failed ? "未能載入號碼紀錄，請重新整理再試。" : "正在載入號碼紀錄…"}</EmptyBox> : !slots.length ? <EmptyBox>本場未有號碼紀錄。</EmptyBox> : (
            <ol className="ld-rgrid" style={{ listStyle: "none", margin: "0", padding: "0", display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "10px" }}>
              {tiles.map((t) => <Tile key={t.n} t={t} />)}
            </ol>
          )}
          <ul style={{ listStyle: "none", margin: "0", padding: "0", display: "flex", flexWrap: "wrap", gap: "8px 20px", fontSize: "13px", lineHeight: "18px", color: "#c3c8cd" }}>
            <li style={{ display: "flex", alignItems: "center", gap: "8px" }}><span aria-hidden="true" style={{ width: "16px", height: "16px", borderRadius: "4px", border: "1px solid #4fb3ff", background: "#041737" }}></span>天堂</li>
            <li style={{ display: "flex", alignItems: "center", gap: "8px" }}><span aria-hidden="true" style={{ width: "16px", height: "16px", borderRadius: "4px", border: "1px solid #ae031d", background: "#4a0511" }}></span>地獄</li>
            <li style={{ display: "flex", alignItems: "center", gap: "8px" }}><span aria-hidden="true" style={{ width: "16px", height: "16px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b" }}></span>未選</li>
          </ul>
        </section>
      </div>

      <section aria-labelledby="sum-title" style={{ display: "flex", flexWrap: "wrap", gap: "16px 24px", padding: "20px 24px", ...PANEL }}>
        <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: "4px" }}>
          <h2 id="sum-title" style={{ margin: "0", fontSize: "17px", lineHeight: "24px", fontWeight: "700" }}>{label}摘要</h2>
          <span style={{ fontSize: "14px", color: "#c3c8cd" }}>盲盒機率：{odds.label}（{total} 個號碼中 {Math.round((total * odds.heavenRate) / 100)} 個天堂）</span>
          <span style={{ fontSize: "14px", color: "#a0a5ad" }}>{weekdayOf(roundId) ? `${weekdayOf(roundId)}${roundTime(room, roundId)} 開抽` : "開抽時間待定"}</span>
        </div>
        <div style={{ flex: "2 1 280px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: "700", color: "#c2ebff" }}><span aria-hidden="true" style={{ width: "10px", height: "10px", borderRadius: "999px", background: "#4fb3ff" }}></span>天堂 {heaven.length} 個</span>
          <span style={{ fontSize: "14px", lineHeight: "22px", color: "#c3c8cd" }}>{heaven.length ? heaven.join("、") : emptyList("天堂")}</span>
        </div>
        <div style={{ flex: "2 1 280px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: "700", color: "#ffd7c1" }}><span aria-hidden="true" style={{ width: "10px", height: "10px", borderRadius: "999px", background: "#f4022b" }}></span>地獄 {hell.length} 個</span>
          <span style={{ fontSize: "14px", lineHeight: "22px", color: "#c3c8cd" }}>{hell.length ? hell.join("、") : emptyList("地獄")}</span>
        </div>
      </section>

      {zoom && image && (
        <div role="dialog" aria-modal="true" aria-label={`${label}賽果圖片`} onClick={() => setZoom(false)} style={{ position: "fixed", inset: "0", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", background: "rgba(0, 0, 0, 0.85)", cursor: "zoom-out" }}>
          <img src={image} alt={`${label}賽果`} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: "6px" }} />
          <button type="button" onClick={() => setZoom(false)} style={{ ...ghostBtn, position: "absolute", top: "16px", right: "16px" }}>關閉</button>
        </div>
      )}
    </Main>
  );
}

function Tile({ t }) {
  if (t.side) {
    const h = t.side === "heaven";
    const color = h ? "#c2ebff" : "#ffd7c1";
    return (
      <li aria-label={`號碼 ${t.n}：${h ? "天堂" : "地獄"}，${t.who}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px", minWidth: "0", height: "84px", padding: "0 4px", borderRadius: "10px", border: `1px solid ${h ? "#4fb3ff" : "#ae031d"}`, background: h ? "#041737" : "#2a0710", boxShadow: h ? "0 0 16px rgba(79, 179, 255, 0.25)" : "none" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontFamily: FONT_NUM, fontStyle: "italic", fontWeight: "900", fontSize: "22px", lineHeight: "26px", color }}>
          <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "999px", background: h ? "#4fb3ff" : "#f4022b" }}></span>{h ? "天堂" : "地獄"}
        </span>
        <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "12px", lineHeight: "16px", color }}>#{t.n}・{t.who}</span>
      </li>
    );
  }
  // Picked but no side recorded yet: the number and who picked it.
  return (
    <li aria-label={`號碼 ${t.n}：${t.picked ? t.who : "未選"}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px", minWidth: "0", height: "84px", padding: "0 4px", borderRadius: "10px", border: `1px solid ${t.picked ? "#6b767f" : "#282d36"}`, background: t.picked ? "#13161b" : "#0b0e12" }}>
      <span style={{ fontFamily: FONT_NUM, fontStyle: "italic", fontWeight: "800", fontSize: "26px", lineHeight: "28px", color: "#ffffff" }}>{t.n}</span>
      <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "12px", lineHeight: "16px", color: t.picked ? "#c3c8cd" : "#a0a5ad" }}>{t.picked ? t.who : "未選"}</span>
    </li>
  );
}

// The live room sends finished rooms here.
export const openRoomResults = (room) => navigate(resultHref(room), { replace: true });
