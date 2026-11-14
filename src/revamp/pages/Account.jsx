// 帳戶設定 on /beta, built to the revamp design (Account.html). The rules are the main
// site's: the same username claim, phone-password change (re-sign-in first), the
// submitAffiliateApplication server function and the phone-verification gift.
import React, { useEffect, useState } from "react";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebase";
import {
  PHONE_PASSWORD_PATTERN,
  PhoneGiftCard,
  displayEmail,
  getPasswordAuthErrorMessage,
  getSafeErrorMessage,
  phoneLoginEmail,
  saveProfileUsername,
} from "../../App.jsx";
import LegacyUI from "../LegacyUI.jsx";
import { FONT_NUM, FONT_TITLE, Main, fmt } from "../ui.jsx";
import { CSS } from "./AccountPage.jsx";

const PANEL = { display: "flex", flexDirection: "column", gap: "14px", padding: "24px", borderRadius: "10px", border: "1px solid #14181d", background: "#05070a" };
const FIELD = { height: "52px", padding: "0 16px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "17px" };
const LABEL = { display: "flex", flexDirection: "column", gap: "8px" };
const LABEL_TEXT = { fontSize: "14px", fontWeight: "700", color: "#c3c8cd" };
const CHECK = <path d="m5 12.5 4.5 4.5L19 7.5"></path>;

const Svg = ({ size = 18, sw = 1.8, stroke = "currentColor", children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const Done = ({ children }) => (
  <span role="status" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "14px", color: "#ffe390" }}><Svg size={16} sw={2.4}>{CHECK}</Svg>{children}</span>
);
const Problem = ({ children }) => <p role="alert" style={{ margin: "0", fontSize: "14px", lineHeight: "20px", color: "#ffd7c1" }}>{children}</p>;

const isPhoneAccount = (user) => Boolean(user?.phoneNumber) && (user.providerData || []).some((item) => item.providerId === "phone");
const hasPhonePassword = (user) => (user?.providerData || []).some((item) => item.providerId === "password");

export default function Account({ session }) {
  const { authUser, profile } = session;
  const name = profile?.username || "玩家";
  const contactLine = displayEmail(authUser?.email) || authUser?.phoneNumber || "";
  const tier = session.vip?.currentTier?.name || "";
  const canChangePassword = isPhoneAccount(authUser) && hasPhonePassword(authUser);

  return (
    <Main css={CSS}>
      <section aria-labelledby="acc-title" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "20px 28px", padding: "28px 32px", borderRadius: "10px", border: "1px solid #14181d", background: "radial-gradient(60% 140% at 100% 0%, rgba(244, 2, 43, 0.16) 0%, rgba(244, 2, 43, 0) 60%), #05070a" }}>
        <span aria-hidden="true" style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", width: "84px", height: "84px", borderRadius: "999px", background: "#4a0511", border: "2px solid #f4022b", boxShadow: "0 0 24px rgba(244, 2, 43, 0.35)", fontFamily: FONT_NUM, fontStyle: "italic", fontWeight: "900", fontSize: "40px" }}>{(profile?.username || authUser?.displayName || "P").trim().charAt(0).toUpperCase()}</span>
        <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontFamily: FONT_NUM, fontStyle: "italic", fontWeight: "800", fontSize: "15px", letterSpacing: "0.08em", color: "#f4022b" }}>ACCOUNT</span>
          <h1 id="acc-title" style={{ margin: "0", fontFamily: FONT_TITLE, fontStyle: "italic", fontWeight: "900", fontSize: "40px", lineHeight: "46px" }}>帳戶設定</h1>
          <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 14px", fontSize: "15px", color: "#c3c8cd" }}>
            <strong style={{ color: "#ffffff" }}>{name}</strong>
            {contactLine && <span>{contactLine}</span>}
            {tier && <span style={{ display: "inline-flex", alignItems: "center", height: "24px", padding: "0 8px", borderRadius: "4px", background: "#fdc800", color: "#1a1300", fontFamily: FONT_NUM, fontStyle: "italic", fontWeight: "900", fontSize: "15px" }}>{tier}</span>}
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "48px", padding: "0 16px", borderRadius: "4px", border: "1px solid #3a2a00", background: "#1a1300", fontFamily: FONT_NUM, fontWeight: "800", fontSize: "22px", color: "#ffe390" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="#fdc800" stroke="#f88f00" strokeWidth="2"></circle><path d="M13.4 5.2 7.9 13h3.9l-1.2 5.8 5.6-8h-4z" fill="#f88f00"></path></svg>{fmt(profile?.tokens)}
          </span>
          <button type="button" onClick={session.logout} style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "48px", padding: "0 18px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "16px", fontWeight: "700", cursor: "pointer" }}>
            <Svg><path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5"></path><path d="M15 8l4 4-4 4M19 12H9"></path></Svg>登出
          </button>
        </div>
      </section>

      {profile && <LegacyUI><PhoneGiftCard authUser={authUser} profile={profile} /></LegacyUI>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(400px, 100%), 1fr))", gap: "24px", alignItems: "start" }}>
        <NameSection authUser={authUser} profile={profile} />
        {canChangePassword && <PasswordSection authUser={authUser} />}
      </div>

      <InviteSection profile={profile} />
    </Main>
  );
}

function NameSection({ authUser, profile }) {
  const saved = profile?.username || "";
  const [name, setName] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setName(saved); }, [saved]);

  const trimmed = name.trim();
  const unchanged = !trimmed || trimmed === saved;
  async function save() {
    if (unchanged || busy) return;
    setBusy(true);
    setDone(false);
    setError("");
    try {
      setName(await saveProfileUsername(authUser.uid, trimmed, saved));
      setDone(true);
    } catch (err) {
      console.error(err);
      setError(getSafeErrorMessage(err, "未能更改名稱，請稍後再試。"));
    } finally {
      setBusy(false);
    }
  }
  const on = !unchanged && !busy;
  return (
    <section aria-labelledby="name-title" style={PANEL}>
      <h2 id="name-title" style={{ margin: "0", fontSize: "20px", lineHeight: "28px", fontWeight: "700" }}>玩家名稱</h2>
      <label style={LABEL}>
        <span style={LABEL_TEXT}>名稱</span>
        <input className="ld-field" type="text" value={name} maxLength={24} placeholder="e.g. nick_draws" onChange={(event) => { setName(event.target.value); setDone(false); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter") save(); }} style={{ ...FIELD, fontWeight: "700" }} />
      </label>
      <p style={{ margin: "0", fontSize: "13px", lineHeight: "20px", color: "#a0a5ad" }}>3–24 個英文字母、數字或底線。名稱必須獨有；改名不會更改以往抽卡、交易或聊天紀錄內保存的名稱。</p>
      {error && <Problem>{error}</Problem>}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
        <button type="button" onClick={save} disabled={!on} style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "48px", padding: "0 18px", borderRadius: "4px", border: `1px solid ${on ? "#f4022b" : "#282d36"}`, background: on ? "#f4022b" : "#13161b", color: on ? "#ffffff" : "#a0a5ad", fontSize: "16px", fontWeight: "700", cursor: on ? "pointer" : "default" }}>
          <Svg><path d="M4 20h4L19 9l-4-4L4 16z"></path><path d="m13.5 6.5 4 4"></path></Svg>{busy ? "儲存中…" : "更改名稱"}
        </button>
        {done && <Done>名稱已更新</Done>}
      </div>
    </section>
  );
}

function PasswordSection({ authUser }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const edit = (setter) => (event) => { setter(event.target.value); setDone(false); setError(""); };

  const rules = [
    { label: "最少 8 個字元", ok: next.length >= 8 },
    { label: "包含英文字母", ok: /[A-Za-z]/.test(next) },
    { label: "包含數字", ok: /[0-9]/.test(next) },
    { label: "兩次輸入一致", ok: next.length > 0 && next === again },
  ];
  const invalid = !current || rules.some((rule) => !rule.ok) || !PHONE_PASSWORD_PATTERN.test(next);
  const on = !invalid && !busy;

  async function save() {
    if (!on) return;
    setBusy(true);
    setError("");
    try {
      await reauthenticateWithCredential(authUser, EmailAuthProvider.credential(phoneLoginEmail(authUser.phoneNumber), current));
      await updatePassword(authUser, next);
      setCurrent("");
      setNext("");
      setAgain("");
      setDone(true);
    } catch (err) {
      setError(["auth/invalid-credential", "auth/wrong-password"].includes(err?.code) ? "現有密碼不正確。" : getPasswordAuthErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="pw-title" style={PANEL}>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <h2 id="pw-title" style={{ margin: "0", fontSize: "20px", lineHeight: "28px", fontWeight: "700" }}>更改登入密碼</h2>
        <span style={{ fontSize: "13px", lineHeight: "20px", color: "#a0a5ad" }}>忘記現有密碼？請登出後在登入畫面按「忘記密碼」，以 SMS 驗證碼重設。</span>
      </div>
      <label style={LABEL}>
        <span style={LABEL_TEXT}>現有密碼</span>
        <input className="ld-field" type="password" autoComplete="current-password" value={current} onChange={edit(setCurrent)} style={FIELD} />
      </label>
      <label style={LABEL}>
        <span style={LABEL_TEXT}>新密碼</span>
        <input className="ld-field" type="password" autoComplete="new-password" maxLength={64} value={next} onChange={edit(setNext)} placeholder="最少 8 個字元，須包含英文字母及數字" style={FIELD} />
      </label>
      <label style={LABEL}>
        <span style={LABEL_TEXT}>再輸入一次新密碼</span>
        <input className="ld-field" type="password" autoComplete="new-password" maxLength={64} value={again} onChange={edit(setAgain)} style={FIELD} />
      </label>
      <ul aria-label="密碼要求" style={{ listStyle: "none", margin: "0", padding: "0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))", gap: "6px 12px", fontSize: "13px", lineHeight: "18px" }}>
        {rules.map((rule) => (
          <li key={rule.label} style={{ display: "flex", alignItems: "center", gap: "6px", color: rule.ok ? "#ffffff" : "#a0a5ad" }}>
            {rule.ok ? <Svg size={14} sw={2.6} stroke="#fdc800">{CHECK}</Svg> : (
              <span aria-hidden="true" style={{ width: "14px", height: "14px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><span style={{ width: "6px", height: "6px", borderRadius: "999px", background: "#6b767f" }}></span></span>
            )}
            {rule.label}
          </li>
        ))}
      </ul>
      {error && <Problem>{error}</Problem>}
      <button type="button" onClick={save} disabled={!on} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", height: "52px", borderRadius: "4px", border: "0", background: on ? "#f4022b" : "#21252d", color: on ? "#ffffff" : "#a0a5ad", boxShadow: on ? "0 6px 20px rgba(244, 2, 43, 0.35)" : "none", fontSize: "17px", fontWeight: "700", cursor: on ? "pointer" : "default" }}>
        <Svg><rect x="4.5" y="10.5" width="15" height="10" rx="2"></rect><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"></path></Svg>{busy ? "更新中…" : "更新密碼"}
      </button>
      {done && <Done>密碼已更新，下次登入請使用新密碼。</Done>}
    </section>
  );
}

function InviteSection({ profile }) {
  const code = profile?.affiliateCode || "";
  const status = profile?.affiliateStatus || (code ? "approved" : "none");
  // Invite links point at the main site, which records who invited the new member.
  const link = code ? `${window.location.origin}/?ref=${encodeURIComponent(code)}` : "";
  const [contact, setContact] = useState(profile?.phoneNumber || displayEmail(profile?.email) || "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function apply() {
    if (busy) return;
    if (contact.trim().length < 3) { setError("請輸入聯絡資料（最少 3 個字元）。"); return; }
    if (message.trim().length < 5) { setError("請輸入留言（最少 5 個字元）。"); return; }
    setBusy(true);
    setError("");
    try {
      await httpsCallable(functions, "submitAffiliateApplication", { limitedUseAppCheckTokens: true })({ contact: contact.trim(), message: message.trim() });
      setMessage("");
      setSent(true);
    } catch (err) {
      setError(getSafeErrorMessage(err, "未能提交申請，請稍後再試。"));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  }

  const pending = status === "pending" || sent;
  const on = !busy && !pending;
  return (
    <section aria-labelledby="aff-title" style={{ display: "flex", flexWrap: "wrap", gap: "24px", padding: "24px", borderRadius: "10px", border: "1px solid #3a2a00", background: "radial-gradient(60% 120% at 0% 0%, rgba(253, 200, 0, 0.08) 0%, rgba(253, 200, 0, 0) 60%), #05070a" }}>
      <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <span aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "48px", height: "48px", borderRadius: "10px", border: "1px solid #3a2a00", background: "#1a1300", color: "#fdc800" }}>
          <Svg size={24}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"></path><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"></path></Svg>
        </span>
        <h2 id="aff-title" style={{ margin: "0", fontFamily: FONT_TITLE, fontStyle: "italic", fontWeight: "900", fontSize: "30px", lineHeight: "34px" }}>邀請朋友計劃</h2>
        <p style={{ margin: "0", fontSize: "14px", lineHeight: "22px", color: "#c3c8cd" }}>申請獲管理員批准後，系統先會發出及啟用你的專屬連結。</p>
      </div>
      <div style={{ flex: "2 1 420px", display: "flex", flexDirection: "column", gap: "14px" }}>
        {status === "approved" && link ? (
          <>
            <span style={LABEL_TEXT}>你的專屬連結</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
              <input className="ld-field" value={link} readOnly aria-label="專屬邀請連結" onFocus={(event) => event.target.select()} style={{ ...FIELD, flex: "1 1 260px", minWidth: "0", fontSize: "15px" }} />
              <button type="button" onClick={copy} style={{ flex: "0 0 auto", height: "52px", padding: "0 20px", borderRadius: "4px", border: `1px solid ${copied ? "#22c55e" : "#282d36"}`, background: "#13161b", color: copied ? "#86efac" : "#ffffff", fontSize: "16px", fontWeight: "700", cursor: "pointer" }}>{copied ? "已複製" : "複製連結"}</button>
            </div>
          </>
        ) : (
          <>
            {status === "rejected" && !sent && (
              <Problem>上次申請未獲批准{profile?.affiliateReviewNote ? `：${profile.affiliateReviewNote}` : "。你可以更新資料後重新申請。"}</Problem>
            )}
            {!pending && (
              <>
                <label style={LABEL}>
                  <span style={LABEL_TEXT}>聯絡資料</span>
                  <input className="ld-field" type="text" value={contact} maxLength={200} onChange={(event) => setContact(event.target.value)} placeholder="電話、WhatsApp、Email 或社交平台" style={{ ...FIELD, fontSize: "16px", fontWeight: "700" }} />
                </label>
                <label style={LABEL}>
                  <span style={LABEL_TEXT}>留言</span>
                  <textarea className="ld-field" rows="4" maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="簡單介紹自己、推廣渠道或合作方式" style={{ minHeight: "112px", padding: "14px 16px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "16px", lineHeight: "24px", resize: "vertical" }} />
                </label>
              </>
            )}
            {error && <Problem>{error}</Problem>}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
              <button type="button" onClick={apply} disabled={!on} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", flex: "1 1 240px", height: "52px", borderRadius: "4px", border: "0", background: on ? "#f4022b" : "#21252d", color: on ? "#ffffff" : "#a0a5ad", fontSize: "17px", fontWeight: "700", cursor: on ? "pointer" : "default" }}>
                <Svg sw={2}><path d="M21 3 10 14"></path><path d="M21 3 14.5 21l-4.5-7-7-4.5z"></path></Svg>
                {pending ? "已提交申請" : busy ? "提交中…" : status === "rejected" ? "重新申請" : "申請邀請連結"}
              </button>
              {pending && <span role="status" style={{ flex: "1 1 240px", fontSize: "14px", lineHeight: "22px", color: "#ffe390" }}>已提交申請，管理員批准後會發出你的專屬連結。</span>}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
