// 我的紀錄 from the revamp design, reading the member's real purchase records
// (drawRecords + live slots, same sources as the current site's MyRecords).
import React, { useEffect, useMemo, useState } from "react";
import { collection, collectionGroup, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import {
  formatRoundLabel, getOriginalDrawPrice, getRecordAcquiredAt, isPurchaseRecord, isRoomPurchasable,
  mergePurchaseRecords, useDocsByIds,
} from "../../App.jsx";
import { Coin, EmptyBox, FONT_NUM, Main, MembersOnly, PageTitle, Pager, fmt, fmtDay, fmtTime, ghostBtn, paginate } from "../ui.jsx";

const CSS = "\nbody{margin:0;background:#0b0e12}\n*{box-sizing:border-box}\na{color:#ffffff;text-decoration:none}a:hover{color:#ffe390}\nbutton,input,textarea{font-family:inherit}\nbutton:disabled{cursor:not-allowed}\n:focus-visible{outline:2px solid #f4022b;outline-offset:2px}\ninput::placeholder,textarea::placeholder{color:#6b767f}\n.ld-nav{transition:background-color 150ms,color 150ms}\n.ld-nav:hover{background-color:#13161b !important;color:#ffffff !important}\n.ld-lift{transition:border-color 150ms,box-shadow 150ms}\n.ld-lift:hover{border-color:#6b767f !important}\n.ld-link:hover{color:#ffffff !important}\n@keyframes ld-blink{0%,100%{opacity:1}50%{opacity:.35}}\n@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none !important;transition:none !important}}\n\n.ld-menubtn,.ld-tabbar,.ld-drawer-close,.ld-backdrop{display:none}\n@media (max-width:760px){\n.ld-root{padding-bottom:68px}\n.ld-header{padding:8px 12px !important;gap:8px !important;flex-wrap:nowrap !important;position:sticky;top:0;z-index:40}\n.ld-search,.ld-hide-m,.ld-uname{display:none !important}\n.ld-logo{width:auto !important;flex:1 1 auto !important;min-width:0}\n.ld-logo img{width:104px !important;height:auto !important}\n.ld-tools{gap:6px !important;flex-wrap:nowrap !important}\n.ld-tools > a,.ld-tools > button,.ld-tools > span > button{height:38px !important}\n.ld-menubtn{display:flex !important}\n.ld-main h1{font-size:34px !important;line-height:40px !important}\n.ld-rtable{min-width:0 !important}\n.ld-rhead{display:none !important}\n.ld-rrow{grid-template-columns:minmax(0,1fr) auto !important;gap:8px 12px !important;padding:14px 16px !important}\n.ld-rrow > :nth-child(2){grid-column:1 / -1;order:-1}\n.ld-rrow > :nth-child(3),.ld-rrow > :nth-child(5){justify-self:end}\n.ld-tools > a:first-child > span:last-child,.ld-tools > span > button > span{display:none !important}\n.ld-logo{min-width:96px !important}\n.ld-bleed{margin:-12px -12px 0 !important}\n.ld-tools > span > button{padding:0 8px !important;gap:4px !important}\n.ld-tools > span > button > svg:last-child{display:none}\n.ld-tools > button{width:38px !important}\n.ld-tools > a:last-child{padding:0 3px !important;border:0 !important}\n.ld-tools > a:first-child{padding:0 4px 0 8px !important;gap:5px !important;font-size:17px !important}\n.ld-side{display:none !important}\n.ld-side.ld-side-open{display:flex !important;position:fixed;top:0;left:0;bottom:0;width:min(300px,84vw);z-index:80;overflow-y:auto;box-shadow:12px 0 40px rgba(0,0,0,.6)}\n.ld-side.ld-side-open .ld-drawer-close{display:flex !important}\n.ld-backdrop{display:block !important;position:fixed;top:0;right:0;bottom:0;left:0;z-index:79;border:0;background:rgba(0,0,0,.6)}\n.ld-main{padding:12px !important;gap:12px !important}\n.ld-footer{padding:24px 16px 20px !important;gap:16px !important}\n.ld-tabbar{display:flex !important;position:fixed;left:0;right:0;bottom:0;z-index:60;height:64px;background:#080b0e;border-top:1px solid #282d36}\n}\n";

const ICON = <><path d="m4 6 1.5 1.5L8.5 4.5"></path><path d="m4 12.5 1.5 1.5 3-3"></path><path d="M11.5 6H21M11.5 12.5H21M11.5 19H21M4.5 19h3"></path></>;
const PAGE_SIZE = 12;
const GRID = "190px minmax(280px, 1fr) 90px 140px 100px";

function useMyRecords(uid) {
  const [records, setRecords] = useState(null);
  const [slots, setSlots] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(query(collection(db, "drawRecords"), where("uid", "==", uid)), (snapshot) => {
      setRecords(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      setError("");
    }, (err) => { console.error("Draw records listener failed.", err); setError("未能載入我的紀錄，請重新整理。"); setRecords([]); });
  }, [uid]);
  useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(query(collectionGroup(db, "slots"), where("uid", "==", uid)), (snapshot) => {
      setSlots(snapshot.docs.map((item) => {
        const parts = item.ref.path.split("/");
        const data = item.data();
        return {
          id: `slot-${parts[1]}-${parts[2] === "rounds" ? parts[3] : "legacy"}-${item.id}`,
          drawId: parts[1] || "", round: parts[2] === "rounds" ? parts[3] : "",
          number: Number(data.number || item.id), tokenCost: Number(data.tokenCost || 0),
          targetCardId: data.targetCardId || "", targetCardName: data.targetCardName || "",
          targetCardImageUrl: data.targetCardImageUrl || "",
          targetCardValue: Number(data.targetCardValue || data.tokenCost || 0),
          createdAt: data.updatedAt || data.createdAt, slotOnly: true,
        };
      }));
    }, (err) => console.error("Slot history listener failed.", err));
  }, [uid]);
  return { records, slots, error };
}

function CardArt({ record }) {
  const img = record.cardImageUrl || record.targetCardImageUrl;
  if (img) {
    return <img src={img} alt="" style={{ flex: "0 0 auto", width: "44px", height: "62px", objectFit: "cover", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", ...(record.resultSide === "heaven" ? { boxShadow: "0 0 0 2px #fdc800, 0 0 14px rgba(253, 200, 0, 0.35)" } : {}) }} />;
  }
  return (
    <span aria-hidden="true" style={{ flex: "0 0 auto", position: "relative", display: "block", width: "40px", height: "60px", borderRadius: "4px", overflow: "hidden", border: "1px solid #5a1222", background: "linear-gradient(160deg, #7a0c20 0%, #3a0812 45%, #0b0e12 100%)" }}>
      <img src="/revamp/images/logo-mark.png" alt="" style={{ position: "absolute", left: "50%", top: "50%", width: "54%", transform: "translate(-50%, -50%)" }} />
    </span>
  );
}

function ResultBadge({ record }) {
  const heaven = record.resultSide === "heaven";
  const pending = !record.cardId;
  const label = pending ? "待開牌" : heaven ? "天堂" : "地獄";
  const colors = pending
    ? { bg: "#13161b", border: "#282d36", color: "#c3c8cd", dot: "#6b767f" }
    : heaven ? { bg: "#041737", border: "#4fb3ff", color: "#c2ebff", dot: "#4fb3ff" } : { bg: "#4a0511", border: "#ae031d", color: "#ffd7c1", dot: "#f4022b" };
  return (
    <span style={{ justifySelf: "start", display: "inline-flex", alignItems: "center", gap: "6px", height: "30px", padding: "0 12px", borderRadius: "4px", border: `1px solid ${colors.border}`, background: colors.bg, color: colors.color, fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "15px" }}>
      <span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "999px", background: colors.dot }}></span>{label}
    </span>
  );
}

function OngoingGroup({ group }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px 24px", padding: "18px 20px", borderRadius: "10px", border: "1px solid #f4022b", background: "#181015", boxShadow: "0 0 0 2px #f4022b, 0 0 24px rgba(244, 2, 43, 0.35)" }}>
      <span style={{ display: "flex", alignItems: "center", gap: "12px", flex: "1 1 280px", minWidth: "0" }}>
        <CardArt record={group.first} />
        <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", height: "22px", padding: "0 8px", borderRadius: "4px", background: "#f4022b", color: "#ffffff", fontSize: "12px", fontWeight: "700", letterSpacing: "0.04em" }}>LIVE</span>
            <span style={{ fontSize: "14px", color: "#c3c8cd" }}>{group.room}・{group.round}</span>
          </span>
          <strong style={{ fontSize: "16px", lineHeight: "22px" }}>{group.first.targetCardName || "等待開牌"}</strong>
        </span>
      </span>
      <span style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {group.numbers.map((n) => (
          <span key={n} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "44px", height: "32px", padding: "0 10px", borderRadius: "4px", border: "1px solid #f4022b", background: "#ae031d", fontFamily: FONT_NUM, fontStyle: "italic", fontWeight: "800", fontSize: "18px" }}>#{n}</span>
        ))}
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "14px", color: "#c3c8cd" }}>繳付<Coin /><strong style={{ fontFamily: FONT_NUM, fontSize: "20px", color: "#ffffff" }}>{fmt(group.paid)}</strong></span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: "700" }}>
        <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "999px", background: "#f4022b", animation: "ld-blink 1.2s ease-in-out infinite" }}></span>等待開抽
      </span>
      <a href="/beta/live" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "6px", height: "44px", padding: "0 18px", borderRadius: "4px", background: "#f4022b", color: "#ffffff", fontSize: "16px", fontWeight: "700" }}>觀看直播
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>
      </a>
    </div>
  );
}

function Records({ uid }) {
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const { records, slots, error } = useMyRecords(uid);
  const purchases = useMemo(() => (records || []).filter(isPurchaseRecord), [records]);
  const { docsById: rooms, loading: roomsLoading } = useDocsByIds("draws", [...purchases, ...slots].map((r) => r.drawId));
  const merged = useMemo(() => mergePurchaseRecords(purchases, slots, rooms), [purchases, slots, rooms]);
  const roomLabel = (r) => {
    const room = rooms[r.drawId];
    const title = room?.title || r.drawTitle || "LiveDraw 直播";
    const day = fmtDay(room?.liveAt || room?.firstRoundAt || r.createdAt);
    return day && !title.includes(day) ? `${day} ${title}` : title;
  };
  const isLiveActive = (r) => r.source !== "instant" && !r.cardId && isRoomPurchasable(rooms[r.drawId]);
  const ongoing = useMemo(() => {
    const groups = new Map();
    merged.filter(isLiveActive).forEach((r) => {
      const key = `${r.drawId}|${r.round}|${r.targetCardId}`;
      if (!groups.has(key)) groups.set(key, { key, first: r, room: roomLabel(r), round: formatRoundLabel(r.round), numbers: [], paid: 0 });
      const g = groups.get(key);
      g.numbers.push(r.number);
      g.paid += getOriginalDrawPrice(r);
    });
    return [...groups.values()].map((g) => ({ ...g, numbers: g.numbers.sort((a, b) => a - b) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merged, rooms]);
  const done = merged.filter((r) => !isLiveActive(r)).filter((r) => tab === "all" || (tab === "self" ? r.source === "instant" : r.source !== "instant"));
  const shown = paginate(done, page, PAGE_SIZE);
  const loading = records === null || roomsLoading;

  const tabs = [{ id: "all", label: "全部" }, { id: "live", label: "直播抽卡" }, { id: "self", label: "自助抽卡" }];
  return (
    <Main css={CSS}>
      <PageTitle icon={ICON} title="我的紀錄">
        <div role="group" aria-label="篩選紀錄" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {tabs.map((t) => {
            const on = tab === t.id;
            return <button key={t.id} type="button" aria-pressed={on} onClick={() => { setTab(t.id); setPage(1); }} style={{ height: "40px", padding: "0 16px", borderRadius: "6px", border: `1px solid ${on ? "#d50125" : "#282d36"}`, background: on ? "#d50125" : "#13161b", color: on ? "#ffffff" : "#c3c8cd", fontSize: "15px", fontWeight: "700", cursor: "pointer" }}>{t.label}</button>;
          })}
        </div>
      </PageTitle>
      {error && <EmptyBox><span role="alert">{error}</span></EmptyBox>}

      {tab !== "self" && (
        <section aria-labelledby="ongoing-title" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <h2 id="ongoing-title" style={{ margin: "0", fontSize: "22px", lineHeight: "30px", fontWeight: "700" }}>正在抽卡</h2>
          {loading ? <EmptyBox>載入中…</EmptyBox> : ongoing.length ? ongoing.map((g) => <OngoingGroup key={g.key} group={g} />) : (
            <EmptyBox>
              <span style={{ flex: "1 1 260px" }}>暫時沒有正在抽卡的紀錄。</span>
              <a href="/beta/live" style={ghostBtn}>直播抽卡</a>
              <a href="/beta/selfdraw" style={ghostBtn}>自助抽卡</a>
            </EmptyBox>
          )}
        </section>
      )}

      <section aria-labelledby="done-title" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <h2 id="done-title" style={{ margin: "0", fontSize: "22px", lineHeight: "30px", fontWeight: "700" }}>已完成</h2>
        <div style={{ overflowX: "auto", borderRadius: "10px", border: "1px solid #14181d", background: "#05070a" }}>
          <div className="ld-rtable" style={{ minWidth: "820px" }}>
            <div className="ld-rhead" aria-hidden="true" style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", gap: "16px", padding: "12px 20px", borderBottom: "1px solid #14181d", fontSize: "13px", lineHeight: "18px", fontWeight: "700", color: "#a0a5ad" }}>
              <span>玩法</span><span>中獎卡牌</span><span>號碼</span><span>繳付代幣</span><span>結果</span>
            </div>
            <ul style={{ listStyle: "none", margin: "0", padding: "0" }}>
              {shown.items.map((r) => {
                const self = r.source === "instant";
                return (
                  <li key={r.id} className="ld-rrow" style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", gap: "16px", padding: "14px 20px", borderTop: "1px solid #14181d" }}>
                    <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span style={{ fontSize: "15px", lineHeight: "22px", color: "#ffffff" }}>{self ? "自助抽卡" : roomLabel(r)}</span>
                      <span style={{ fontSize: "12px", lineHeight: "16px", color: "#a0a5ad" }}>{self ? `天堂與地獄${r.shareMode ? `・${r.shareMode}` : ""}` : formatRoundLabel(r.round)}</span>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: "0" }}>
                      <CardArt record={r} />
                      <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                        <strong style={{ fontSize: "15px", lineHeight: "22px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.cardName || "未分配卡牌"}</strong>
                        <span style={{ fontSize: "13px", lineHeight: "18px", color: "#c3c8cd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>所屬盲盒：{r.targetCardName || "未選卡牌"}</span>
                        <span style={{ fontSize: "12px", lineHeight: "16px", color: "#6b767f" }}>取得時間：{fmtTime(getRecordAcquiredAt(r))}</span>
                      </span>
                    </span>
                    <span style={{ fontFamily: FONT_NUM, fontStyle: "italic", fontWeight: "800", fontSize: "22px" }}>#{r.number}{r.bonus ? <small style={{ fontSize: "12px", color: "#ffe390" }}> 贈送</small> : null}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: FONT_NUM, fontWeight: "700", fontSize: "19px", color: "#c3c8cd" }}><Coin />{fmt(getOriginalDrawPrice(r))}</span>
                    <ResultBadge record={r} />
                  </li>
                );
              })}
            </ul>
            {!loading && !done.length && <div style={{ padding: "32px 20px", textAlign: "center", fontSize: "15px", color: "#a0a5ad" }}>這個分類暫時未有已完成紀錄。</div>}
            {loading && <div style={{ padding: "32px 20px", textAlign: "center", fontSize: "15px", color: "#a0a5ad" }}>載入中…</div>}
          </div>
        </div>
        <Pager page={shown.page} totalPages={shown.totalPages} onChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      </section>
    </Main>
  );
}

export default function RecordsPage({ session }) {
  if (!session.ready) return <MembersOnly css={CSS} title="我的紀錄" icon={ICON} />;
  return <Records uid={session.profile.uid || session.authUser.uid} />;
}
