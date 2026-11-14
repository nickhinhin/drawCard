import React from "react";
import { toMillis } from "../App.jsx";
import { useSession } from "./session.jsx";

// Small pieces shared by the hand-wired /beta pages, in the revamp design's style.
export const FONT_NUM = "'Barlow Condensed', 'Noto Sans TC', sans-serif";
export const FONT_TITLE = "'Barlow Condensed', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif";

export const fmt = (value) => Number(value || 0).toLocaleString("en-US");

// 29/10 13:17 (Hong Kong time).
export function fmtTime(value) {
  const ms = toMillis(value);
  if (!ms) return "--";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Hong_Kong", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ms));
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("day")}/${get("month")} ${get("hour")}:${get("minute")}`;
}

export function fmtDay(value) {
  const ms = toMillis(value);
  if (!ms) return "";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Hong_Kong", day: "2-digit", month: "2-digit" }).formatToParts(new Date(ms));
  return `${parts.find((p) => p.type === "day")?.value}/${parts.find((p) => p.type === "month")?.value}`;
}

export function Coin({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="#fdc800" stroke="#f88f00" strokeWidth="2"></circle>
      <path d="M13.4 5.2 7.9 13h3.9l-1.2 5.8 5.6-8h-4z" fill="#f88f00"></path>
    </svg>
  );
}

export const MAIN_STYLE = { flex: "999 1 560px", minWidth: "0", display: "flex", flexDirection: "column", gap: "24px", padding: "24px" };

export function Main({ css, children, style }) {
  return (
    <main className="ld-main" style={{ ...MAIN_STYLE, ...style }}>
      {css && <style>{css}</style>}
      {children}
    </main>
  );
}

export function PageTitle({ icon, title, children }) {
  return (
    <section style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px 24px", padding: "28px 32px", borderRadius: "10px", border: "1px solid #14181d", background: "#05070a" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
        <span aria-hidden="true" style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", width: "48px", height: "48px", borderRadius: "10px", border: "1px solid #4a0511", background: "#181015", color: "#f4022b" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
        </span>
        <h1 style={{ margin: "0", fontFamily: FONT_TITLE, fontStyle: "italic", fontWeight: "900", fontSize: "40px", lineHeight: "46px" }}>{title}</h1>
      </div>
      {children}
    </section>
  );
}

export function EmptyBox({ children }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 20px", padding: "20px", borderRadius: "10px", border: "1px dashed #282d36", fontSize: "15px", color: "#c3c8cd" }}>
      {children}
    </div>
  );
}

export const ghostBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px", height: "44px", padding: "0 16px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "15px", fontWeight: "700", cursor: "pointer" };
export const redBtn = { ...ghostBtn, border: "1px solid #f4022b", background: "#f4022b" };

export function Pager({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  const btn = (enabled) => ({ height: "44px", padding: "0 18px", borderRadius: "999px", border: `1px solid ${enabled ? "#282d36" : "#14181d"}`, background: enabled ? "#13161b" : "#0b0e12", color: enabled ? "#ffffff" : "#6b767f", fontSize: "15px", fontWeight: "700", cursor: enabled ? "pointer" : "default" });
  return (
    <nav aria-label="分頁" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", paddingTop: "8px" }}>
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} style={btn(page > 1)}>上一頁</button>
      <span style={{ fontFamily: FONT_NUM, fontWeight: "700", fontSize: "17px", color: "#c3c8cd" }}>第 {page} / {totalPages} 頁</span>
      <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)} style={btn(page < totalPages)}>下一頁</button>
    </nav>
  );
}

export function paginate(items, page, size) {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), totalPages);
  return { items: items.slice((current - 1) * size, current * size), page: current, totalPages };
}

// Shown in place of a members-only page for guests (and while the account loads).
export function MembersOnly({ css, title, icon }) {
  const session = useSession();
  return (
    <Main css={css}>
      <PageTitle icon={icon} title={title} />
      <EmptyBox>
        {!session.authReady || (session.signedIn && !session.profile) ? (
          <span>載入中…</span>
        ) : (
          <>
            <span style={{ flex: "1 1 260px" }}>請先登入或註冊，即可查看{title}。</span>
            <button type="button" style={ghostBtn} onClick={() => session.openLogin("")}>登入</button>
            <button type="button" style={redBtn} onClick={() => session.openLogin("", "register")}>註冊</button>
          </>
        )}
      </EmptyBox>
    </Main>
  );
}
