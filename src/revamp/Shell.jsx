import React, { useEffect, useState } from "react";
import { useSession } from "./session.jsx";
import { formatTokenNumber } from "../App.jsx";

// Header, side menu, footer and phone tab bar shared by every /beta page
// (markup from the revamp design; pages render only their own <main>).
const SUPPORT_WHATSAPP_URL = "https://wa.me/85270736165";
const FONT_NUM = "'Barlow Condensed', 'Noto Sans TC', sans-serif";

const ICONS = {
  home: <><path d="M3 10.5 12 3l9 7.5"></path><path d="M5 9.5V21h5v-6h4v6h5V9.5"></path></>,
  live: <><path d="M3 7a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><path d="m16 10.5 5-3v9l-5-3"></path></>,
  selfdraw: <><path d="M12 2.8 20.5 7.5v9L12 21.2 3.5 16.5v-9z"></path><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9.2"></path></>,
  results: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"></path><path d="M3.5 4.5V8H7"></path><path d="M12 7.5V12l3 2"></path></>,
  cards: <><rect x="8" y="3" width="12" height="16" rx="2"></rect><path d="M5 6.5V19a2 2 0 0 0 2 2h9"></path></>,
  records: <><path d="m4 6 1.5 1.5L8.5 4.5"></path><path d="m4 12.5 1.5 1.5 3-3"></path><path d="M11.5 6H21M11.5 12.5H21M11.5 19H21M4.5 19h3"></path></>,
  topup: <><path d="M19 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9.5a2 2 0 0 0-2-2H5"></path><path d="M16.5 14h1"></path></>,
  account: <><circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path></>,
};

const BADGE = {
  live: { text: "LIVE", background: "#f4022b", color: "#ffffff" },
  selfdraw: { text: "24H", background: "#3a2a00", color: "#ffe390" },
};

const SIDE_MAIN = [
  { id: "home", href: "/beta/", label: "首頁" },
  { id: "live", href: "/beta/live", label: "直播抽卡" },
  { id: "selfdraw", href: "/beta/selfdraw", label: "自助抽卡" },
  { id: "results", href: "/beta/results", label: "過往直播及賽果" },
];
const SIDE_MINE = [
  { id: "cards", href: "/beta/cards", label: "我的卡牌" },
  { id: "records", href: "/beta/records", label: "我的紀錄" },
  { id: "topup", href: "/beta/topup", label: "充值代幣" },
  { id: "account", href: "/beta/account", label: "帳戶設定" },
];
const TABS = [
  { id: "home", href: "/beta/", label: "首頁" },
  { id: "live", href: "/beta/live", label: "直播抽卡" },
  { id: "selfdraw", href: "/beta/selfdraw", label: "自助抽卡" },
  { id: "results", href: "/beta/results", label: "賽果" },
  { id: "cards", href: "/beta/cards", label: "我的卡牌" },
];

const LANGS = [
  { id: "zh-HK", name: "繁體中文", short: "繁" },
  { id: "en", name: "English", short: "EN" },
  { id: "zh-CN", name: "简体中文", short: "简" },
  { id: "ja", name: "日本語", short: "日" },
];

function readLang() {
  try { return window.localStorage.getItem("ld-lang") || "zh-HK"; } catch { return "zh-HK"; }
}

function Icon({ name, size = 20, color, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      {ICONS[name]}
    </svg>
  );
}

function SideLink({ item, active }) {
  const on = item.id === active;
  const badge = BADGE[item.id];
  return (
    <a className="ld-nav" href={item.href} aria-current={on ? "page" : undefined} style={{ flex: "1 1 160px", display: "flex", alignItems: "center", gap: "12px", minHeight: "44px", padding: "0 12px", borderRadius: "6px", ...(on ? { background: "#4a0511" } : {}), color: on ? "#ffffff" : "#c3c8cd", fontSize: "15px", fontWeight: on ? "700" : "500" }}>
      <Icon name={item.id} style={{ flex: "0 0 auto", ...(on ? { color: "#f4022b" } : {}) }} />
      <span style={{ flex: "1 1 auto" }}>{item.label}</span>
      {badge && <span style={{ display: "inline-flex", alignItems: "center", height: "20px", padding: "0 6px", borderRadius: "4px", background: badge.background, color: badge.color, fontSize: "11px", fontWeight: "700", letterSpacing: "0.04em" }}>{badge.text}</span>}
    </a>
  );
}

// Logged-out buttons are not in the design's phone layout; keep them on one line there.
const SHELL_CSS = "@media (max-width:760px){.ld-tools > a.ld-authbtn{height:38px !important;padding:0 10px !important;font-size:14px !important;border:1px solid #282d36 !important}.ld-tools > a.ld-authbtn.ld-authreg{border-color:#f4022b !important}.ld-demo{top:auto !important;bottom:76px !important;right:12px !important}}";

const headerBtn = { whiteSpace: "nowrap", display: "flex", alignItems: "center", height: "42px", padding: "0 24px", borderRadius: "4px", color: "#ffffff", fontSize: "16px", fontWeight: "700" };

export default function Shell({ active, children }) {
  const session = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [lang, setLang] = useState(readLang);
  const home = active === "home";
  const current = LANGS.find((item) => item.id === lang) || LANGS[0];
  const { signedIn, tokens, username, vip } = session;
  const balanceText = formatTokenNumber(tokens);
  const vipName = vip.currentTier?.name || "VIP";
  const nextTier = vip.nextTier;
  const nextProgress = nextTier ? Math.round(vip.tiers.find((tier) => tier.id === nextTier.id)?.progress || 0) : 100;

  useEffect(() => { setMenuOpen(false); }, [active]);

  const login = (action) => (event) => {
    event.preventDefault();
    session.openLogin("", action);
  };

  return (
    <div className="ld-root" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#0b0e12", color: "#ffffff", fontFamily: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif", fontSize: "16px", lineHeight: "24px" }}>
      <style>{SHELL_CSS}</style>
      <header className="ld-header" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 20px", minHeight: "64px", padding: "10px 24px", background: "#080b0e", borderBottom: "1px solid #14181d" }}>
        <button type="button" className="ld-menubtn" onClick={() => setMenuOpen((open) => !open)} aria-label="開啟選單" aria-expanded={menuOpen} style={{ flex: "0 0 auto", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", cursor: "pointer" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>
        </button>
        <a href="/beta/" className="ld-logo" aria-label="LiveDraw TCG 首頁" style={{ display: "flex", alignItems: "center", flex: "0 0 auto", width: "164px" }}>
          <img src="/revamp/images/logo.png" alt="LiveDraw TCG" style={{ display: "block", width: "152px", height: "37px" }} />
        </a>
        <label className="ld-search" style={{ flex: "1 1 260px", maxWidth: "520px", ...(home ? { margin: "0 auto" } : {}), display: "flex", alignItems: "center", gap: "10px", height: "42px", padding: "0 14px", background: "#13161b", border: "1px solid #282d36", borderRadius: "4px", color: "#a0a5ad" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
          <input type="search" aria-label="搜尋卡牌、卡盒或關鍵字" placeholder="搜尋卡牌、卡盒或關鍵字…" style={{ flex: "1 1 auto", minWidth: "0", height: "100%", background: "transparent", border: "0", outline: "none", color: "#ffffff", fontSize: "14px" }} />
        </label>
        <div className="ld-tools" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", ...(home ? {} : { marginLeft: "auto" }) }}>
          {signedIn && (
            <a href="/beta/topup" aria-label={`代幣餘額 ${balanceText}，前往充值`} style={{ display: "flex", alignItems: "center", gap: "8px", height: "42px", padding: "0 6px 0 12px", background: "#13161b", border: "1px solid #282d36", borderRadius: "4px", color: "#ffffff", fontFamily: FONT_NUM, fontWeight: "700", fontSize: "20px", fontVariantNumeric: "tabular-nums" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="#fdc800" stroke="#f88f00" strokeWidth="2"></circle><path d="M13.4 5.2 7.9 13h3.9l-1.2 5.8 5.6-8h-4z" fill="#f88f00"></path></svg>
              <span>{balanceText}</span>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", borderRadius: "4px", background: "#4a0511", color: "#ffffff" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>
              </span>
            </a>
          )}
          <a href="/beta/topup" className="ld-hide-m" aria-current={active === "topup" ? "page" : undefined} style={{ display: "flex", alignItems: "center", height: "42px", padding: "0 20px", background: "#f4022b", borderRadius: "4px", color: "#ffffff", fontSize: "16px", fontWeight: "700" }}>充值</a>
          <span style={{ position: "relative", display: "flex" }}>
            <button type="button" onClick={() => setLangOpen((open) => !open)} aria-haspopup="menu" aria-expanded={langOpen} aria-label={`翻譯：選擇語言（目前：${current.name}）`} title="翻譯" style={{ display: "flex", alignItems: "center", gap: "6px", height: "42px", padding: "0 10px 0 12px", background: langOpen ? "#13161b" : "transparent", border: "1px solid #282d36", borderRadius: "4px", color: "#ffffff", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path><path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"></path></svg>
              <span style={{ minWidth: "18px", textAlign: "center" }}>{current.short}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: langOpen ? "rotate(180deg)" : "none" }}><path d="m6 9 6 6 6-6"></path></svg>
            </button>
            {langOpen && (
              <div role="menu" aria-label="翻譯語言" style={{ position: "absolute", top: "48px", right: "0", zIndex: "60", minWidth: "210px", display: "flex", flexDirection: "column", gap: "2px", padding: "6px", borderRadius: "6px", border: "1px solid #282d36", background: "#0b0e12", boxShadow: "0 12px 32px rgba(0, 0, 0, 0.6)" }}>
                <span style={{ padding: "8px 10px 6px", fontSize: "12px", lineHeight: "16px", fontWeight: "700", letterSpacing: "0.04em", color: "#a0a5ad" }}>翻譯 / Language</span>
                {LANGS.map((item) => {
                  const on = item.id === current.id;
                  return (
                    <button key={item.id} type="button" role="menuitemradio" aria-checked={on} className="ld-nav" onClick={() => { try { window.localStorage.setItem("ld-lang", item.id); } catch { /* preference only */ } setLang(item.id); setLangOpen(false); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", height: "40px", padding: "0 10px", borderRadius: "4px", border: "0", background: on ? "#181015" : "transparent", color: "#ffffff", fontSize: "15px", fontWeight: on ? "700" : "500", textAlign: "left", cursor: "pointer" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "10px" }}><span style={{ minWidth: "26px", fontSize: "12px", fontWeight: "700", color: "#a0a5ad" }}>{item.short}</span>{item.name}</span>
                      {on && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f4022b" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"></path></svg>}
                    </button>
                  );
                })}
              </div>
            )}
          </span>
          <button type="button" aria-label="通知" style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "44px", height: "42px", background: "transparent", border: home ? "0" : "1px solid #282d36", borderRadius: "4px", color: "#ffffff", cursor: "pointer" }}>
            <svg width={home ? 22 : 20} height={home ? 22 : 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"></path><path d="M10 20a2 2 0 0 0 4 0"></path></svg>
          </button>
          {signedIn ? (
            <a href="/beta/account" aria-current={active === "account" ? "page" : undefined} style={{ display: "flex", alignItems: "center", gap: "10px", height: "42px", padding: "0 12px 0 4px", border: `1px solid ${active === "account" ? "#f4022b" : "#282d36"}`, borderRadius: "4px", color: "#ffffff" }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "999px", background: "#4a0511", border: "1px solid #f4022b", fontWeight: "700", fontSize: "14px" }}>{(username || "?").charAt(0).toUpperCase()}</span>
              <span className="ld-uname" style={{ display: "flex", flexDirection: "column", lineHeight: "15px" }}>
                <span style={{ fontSize: "14px", fontWeight: "700" }}>{username || "玩家"}</span>
                {vip.currentTier && <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.04em", color: "#ffe390" }}>{vip.currentTier.name}</span>}
              </span>
            </a>
          ) : (
            <>
              <a href="#login" className="ld-authbtn" onClick={login("")} style={{ ...headerBtn, border: "1px solid #282d36", background: "#13161b" }}>登入</a>
              <a href="#register" className="ld-authbtn ld-authreg" onClick={login("register")} style={{ ...headerBtn, background: "#f4022b" }}>註冊</a>
            </>
          )}
        </div>
      </header>

      <div style={{ flex: "1 0 auto", display: "flex", flexWrap: "wrap", alignItems: "stretch" }}>
        {menuOpen && <button type="button" className="ld-backdrop" onClick={() => setMenuOpen(false)} aria-label="關閉選單"></button>}
        <nav className={`ld-side ${menuOpen ? "ld-side-open" : ""}`} aria-label="主選單" style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: "16px", padding: "20px 12px", background: "#080b0e", borderRight: "1px solid #14181d" }}>
          <button type="button" className="ld-drawer-close" onClick={() => setMenuOpen(false)} aria-label="關閉選單" style={{ alignSelf: "flex-end", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>
          </button>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {SIDE_MAIN.map((item) => <SideLink key={item.id} item={item} active={active} />)}
            <div style={{ flex: "1 1 100%", padding: "16px 12px 4px", fontSize: "12px", lineHeight: "16px", fontWeight: "700", letterSpacing: "0.08em", color: "#a0a5ad" }}>我的</div>
            {SIDE_MINE.map((item) => <SideLink key={item.id} item={item} active={active} />)}
          </div>
          {signedIn && (
            <a href="/beta/topup" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "14px", borderRadius: "10px", background: "#1a1300", border: "1px solid #3a2a00", color: "#ffffff" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fdc800" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5 7.5 12 12 5l4.5 7L21 8.5 19 19H5z"></path></svg>
                <span style={{ fontFamily: FONT_NUM, fontStyle: "italic", fontWeight: "800", fontSize: "20px", lineHeight: "20px", color: "#ffe390" }}>{vip.currentTier ? vipName : "未入級"}</span>
                {nextTier && <span style={{ marginLeft: "auto", fontSize: "12px", lineHeight: "16px", color: "#c3c8cd" }}>距離 {nextTier.name}</span>}
              </span>
              <span aria-hidden="true" style={{ display: "block", height: "6px", borderRadius: "999px", background: "#3a2a00", overflow: "hidden" }}>
                <span style={{ display: "block", width: `${nextProgress}%`, height: "100%", borderRadius: "999px", background: "linear-gradient(90deg, #f88f00, #fdc800)" }}></span>
              </span>
              <span style={{ fontSize: "12px", lineHeight: "16px", color: "#c3c8cd" }}>
                {nextTier ? <>再入金 <strong style={{ color: "#ffe390" }}>HK${formatTokenNumber(vip.remaining)}</strong> 即升級</> : "已達最高 VIP 等級"}
              </span>
            </a>
          )}
          <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "44px", padding: "0 12px", borderRadius: "6px", background: "#13161b", border: "1px solid #282d36", color: "#ffffff", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2"></path><rect x="3" y="13" width="4" height="7" rx="1.5"></rect><rect x="17" y="13" width="4" height="7" rx="1.5"></rect></svg>
            聯絡客服
          </a>
          {signedIn && (
            <button type="button" onClick={session.logout} style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "40px", padding: "0 12px", borderRadius: "6px", background: "transparent", border: "0", color: "#a0a5ad", fontSize: "14px", fontWeight: "500", cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"></path><path d="M10 17l-5-5 5-5"></path><path d="M5 12h11"></path></svg>
              登出
            </button>
          )}
        </nav>
        {children}
      </div>

      <footer className="ld-footer" style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "32px 24px 24px", background: "#05070a", borderTop: "1px solid #14181d" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "32px 64px" }}>
          <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <img src="/revamp/images/logo.png" alt="LiveDraw TCG" style={{ display: "block", width: "152px", height: "37px" }} />
            <p style={{ margin: "0", fontSize: "14px", lineHeight: "22px", color: "#c3c8cd" }}>專為卡牌收藏家而設的直播抽卡平台。</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", minWidth: "140px" }}>
            <h2 style={{ margin: "0 0 4px", fontSize: "15px", lineHeight: "22px", fontWeight: "700" }}>關於平台</h2>
            <a href="#" className="ld-link" style={{ fontSize: "14px", color: "#a0a5ad" }}>公司簡介</a>
            <a href="#" className="ld-link" style={{ fontSize: "14px", color: "#a0a5ad" }}>服務條款</a>
            <a href="#" className="ld-link" style={{ fontSize: "14px", color: "#a0a5ad" }}>隱私條款</a>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", minWidth: "140px" }}>
            <h2 style={{ margin: "0 0 4px", fontSize: "15px", lineHeight: "22px", fontWeight: "700" }}>買家指南</h2>
            <a href="#" className="ld-link" style={{ fontSize: "14px", color: "#a0a5ad" }}>抽盲盒流程</a>
            <a href="#" className="ld-link" style={{ fontSize: "14px", color: "#a0a5ad" }}>常見問題</a>
            <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer" className="ld-link" style={{ fontSize: "14px", color: "#a0a5ad" }}>聯絡客服</a>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "8px", paddingTop: "16px", borderTop: "1px solid #14181d", fontSize: "12px", lineHeight: "16px", color: "#a0a5ad" }}>
          <span>© 2026 LiveDraw TCG. All rights reserved.</span>
          <span>每晚 20:30 直播開抽・自助抽卡 24 小時開放</span>
        </div>
      </footer>

      <nav className="ld-tabbar" aria-label="快捷導覽">
        {TABS.map((item) => {
          const on = item.id === active;
          return (
            <a key={item.id} href={item.href} aria-current={on ? "page" : undefined} style={{ position: "relative", flex: "1 1 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", color: on ? "#ffffff" : "#a0a5ad", fontSize: "11px", lineHeight: "14px", fontWeight: on ? "700" : "500" }}>
              {on && <span aria-hidden="true" style={{ position: "absolute", top: "0", left: "28%", right: "28%", height: "3px", borderRadius: "0 0 3px 3px", background: "#f4022b" }}></span>}
              <Icon name={item.id} size={22} color={on ? "#f4022b" : undefined} />
              {item.label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
