// 充值代幣 on /beta, built to the revamp design (TopUp.html). Money rules are the main
// site's: the same token packages, FPS details, request limits, the server's
// submitTokenPaymentRequest function for payment proofs, promo codes and VIP rewards.
// The design's credit card option is left out: there is no card payment behind it yet.
import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, onSnapshot, query, runTransaction, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { db } from "../../firebase";
import { reportClientError } from "../../errorReporting.js";
import {
  LIVE_SNAPSHOT_OPTIONS,
  MAX_PROOF_SOURCE_BYTES,
  MIN_CUSTOM_PAYMENT_HKD,
  TOKEN_REQUEST_COOLDOWN_MS,
  TOKEN_REQUEST_DAILY_LIMIT,
  TOKEN_REQUEST_PENDING_LIMIT,
  TOKEN_REQUEST_WINDOW_MS,
  calculateTokenAmount,
  ensureUsernameClaim,
  getPromoRedemptionId,
  getSafeErrorMessage,
  getTokenBonusRate,
  getVipState,
  isSnapshotReady,
  normalizePromoCode,
  parsePromoCode,
  submitTokenPaymentRequest,
  toMillis,
  usePaymentSettings,
  useTokenPackages,
  useVipProgram,
} from "../../App.jsx";
import { asset } from "../runtime.jsx";
import { FONT_NUM, FONT_TITLE } from "../ui.jsx";
import { CSS } from "./TopUpPage.jsx";

const fmt = (value) => Number(value || 0).toLocaleString("en-US");
const SEL = "0 0 0 2px #f4022b, 0 0 24px rgba(244, 2, 43, 0.35)";
const STATUS = { pending: "待審核", approved: "已批准", rejected: "已駁回", awaiting_upload: "上傳付款證明中" };
const BADGE = {
  approved: ["#3a2a00", "#fdc800", "#ffe390"],
  rejected: ["#2a0710", "#ae031d", "#ffd7c1"],
  other: ["#21252d", "#282d36", "#ffffff"],
};
const CUSTOM_HINT = "最少 HK$100；HK$500 起 +5%、HK$3,000 起 +8%、HK$10,000 起 +10%、HK$30,000 起 +17% 額外代幣";

// 30/09/2026 19:22 in Hong Kong time.
function fullTime(value) {
  const ms = toMillis(value);
  if (!ms) return "--";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ms));
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

// Same message the main site shows, reported unless it is an expected outcome.
function failMessage(error, fallback) {
  console.error(error);
  const message = getSafeErrorMessage(error, fallback);
  const expected = /(resource-exhausted|failed-precondition|invalid-argument|already-exists)$/.test(String(error?.code || ""));
  if (!expected && (error?.code || /權限|失敗|未能|Failed|permission|network/i.test(message))) {
    reportClientError({ message, code: error?.code, stack: error?.stack }, fallback || "beta top-up");
  }
  return message;
}

// The main site's limits on how often members may ask for tokens.
function requestLimitMessage(requests) {
  const now = Date.now();
  const pending = requests.filter((request) => ["awaiting_upload", "pending"].includes(request.status)).length;
  const times = requests.map((request) => toMillis(request.createdAt)).filter(Boolean);
  const latest = Math.max(0, ...times);
  if (pending >= TOKEN_REQUEST_PENDING_LIMIT) return `最多只可以同時有 ${TOKEN_REQUEST_PENDING_LIMIT} 個待處理代幣申請。`;
  if (latest && now - latest < TOKEN_REQUEST_COOLDOWN_MS) return "每次代幣申請需要相隔最少 1 分鐘。";
  if (times.filter((at) => now - at < TOKEN_REQUEST_WINDOW_MS).length >= TOKEN_REQUEST_DAILY_LIMIT) return "24 小時內最多只可以提交 5 次代幣申請。";
  return "";
}

export default function TopUp({ profile }) {
  const packages = useTokenPackages(true);
  const payment = usePaymentSettings(true);
  const vipTiers = useVipProgram(true);
  const [sel, setSel] = useState(() => packages[0].hkd);
  const [custom, setCustom] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeNote, setCodeNote] = useState({ text: "", error: false });
  const [payOpen, setPayOpen] = useState(false);
  const [payStep, setPayStep] = useState("form");
  const [proof, setProof] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState("");
  const [done, setDone] = useState({ hkd: 0, coins: 0 });
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [vipRewards, setVipRewards] = useState([]);

  useEffect(() => {
    if (sel !== "custom" && !packages.some((item) => item.hkd === Number(sel))) setSel(packages[0].hkd);
  }, [sel, packages]);

  useEffect(() => {
    setRequestsLoading(true);
    return onSnapshot(query(collection(db, "tokenRequests"), where("uid", "==", profile.uid)), LIVE_SNAPSHOT_OPTIONS, (snapshot) => {
      setRequests(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)));
      if (isSnapshotReady(snapshot)) setRequestsLoading(false);
    }, (error) => {
      console.error("Token request listener failed.", error);
      setRequestsLoading(false);
    });
  }, [profile.uid]);

  useEffect(() => onSnapshot(query(collection(db, "drawRecords"), where("uid", "==", profile.uid)), LIVE_SNAPSHOT_OPTIONS, (snapshot) => {
    setVipRewards(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.source === "vip"));
  }, (error) => {
    console.error("VIP reward listener failed.", error);
    setVipRewards([]);
  }), [profile.uid]);

  const isCustom = sel === "custom";
  const hkd = isCustom ? Number(custom || 0) : Number(sel);
  const coins = isCustom ? calculateTokenAmount(hkd) : packages.find((item) => item.hkd === hkd)?.tokens || 0;
  const base = Math.max(0, Math.floor(hkd));
  const bonusRate = base > 0 ? Math.round((Math.max(0, coins - base) / base) * 100) : 0;
  const invalid = !Number.isSafeInteger(hkd) || hkd < MIN_CUSTOM_PAYMENT_HKD || hkd > 1000000 || coins < 1 || coins > 1000000;
  const customBad = isCustom && custom !== "" && invalid;

  const approvedDeposit = requests
    .filter((request) => request.status === "approved" && request.proofMode !== "promo")
    .reduce((sum, request) => sum + Number(request.verifiedHkdAmount ?? request.hkdAmount ?? 0), 0);
  const deposit = Math.max(Number(profile.totalDeposits || 0), approvedDeposit);

  useEffect(() => {
    if (!payOpen || busy) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setPayOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [payOpen, busy]);

  async function submitFps() {
    if (busy) return;
    setPayError("");
    if (invalid) { setPayError(`請選擇套餐，或輸入最少 HK$${MIN_CUSTOM_PAYMENT_HKD} 的自訂金額。`); return; }
    if (!proof) { setPayError("請上傳付款證明供管理員審核。"); return; }
    if (!String(proof.type || "").startsWith("image/")) { setPayError("付款證明必須是圖片（截圖或相片）。"); return; }
    if (proof.size > MAX_PROOF_SOURCE_BYTES) { setPayError("圖片太大（超過 25MB），請改用截圖。"); return; }
    if (!payment.fpsIdentifier || !payment.fpsName) { setPayError("平台尚未設定 FPS 收款資料，請聯絡管理員。"); return; }
    const limit = requestLimitMessage(requests);
    if (limit) { setPayError(limit); return; }
    setBusy(true);
    try {
      await ensureUsernameClaim(profile.uid, profile.username);
      // The server stores the proof first and only then creates the pending request.
      await submitTokenPaymentRequest({
        proof,
        hkdAmount: hkd,
        amount: coins,
        packageType: isCustom ? "custom" : "preset",
        fpsIdentifier: payment.fpsIdentifier,
        fpsName: payment.fpsName,
      });
      setDone({ hkd, coins });
      setPayStep("done");
      setProof(null);
      setSel(packages[0].hkd);
      setCustom("");
    } catch (error) {
      setPayError(failMessage(error, "提交失敗，請稍後再試。"));
    } finally {
      setBusy(false);
    }
  }

  async function applyCode() {
    if (codeBusy) return;
    const parsed = parsePromoCode(code);
    if (!parsed) { setCodeNote({ text: "邀請碼格式不正確。請輸入「英文字母-代幣數目」，例如 EVENT-500。", error: true }); return; }
    const limit = requestLimitMessage(requests);
    if (limit) { setCodeNote({ text: limit, error: true }); return; }
    setCodeBusy(true);
    setCodeNote({ text: "", error: false });
    try {
      const claimedUsername = await ensureUsernameClaim(profile.uid, profile.username);
      const requestRef = doc(collection(db, "tokenRequests"));
      const promoRef = doc(db, "promoCodes", parsed.code);
      const redemptionRef = doc(db, "promoRedemptions", getPromoRedemptionId(parsed.code, profile.uid));
      const [promoSnapshot, redemptionSnapshot] = await Promise.all([getDoc(promoRef), getDoc(redemptionRef)]);
      if (!promoSnapshot.exists() || promoSnapshot.data().active !== true
        || promoSnapshot.data().code !== parsed.code
        || Number(promoSnapshot.data().amount || 0) !== parsed.amount) {
        throw new Error("邀請碼未啟用、已停用或代幣數目不正確。");
      }
      if (redemptionSnapshot.exists()) throw new Error("你已使用過此邀請碼，每位用戶只可使用一次。");
      const verified = promoSnapshot.data();
      const now = Date.now();
      const windowStartedAt = toMillis(profile.tokenRequestWindowStartedAt);
      const activeWindow = windowStartedAt > 0 && now - windowStartedAt < TOKEN_REQUEST_WINDOW_MS;
      const batch = writeBatch(db);
      batch.set(requestRef, {
        uid: profile.uid,
        affiliateReferrerUid: profile.referredByUid || "",
        username: claimedUsername,
        email: profile.email || "",
        amount: verified.amount,
        hkdAmount: 0,
        exchangeRate: 0,
        packageType: "promo",
        fpsIdentifier: "",
        fpsName: "",
        proofMode: "promo",
        proofPath: "",
        proofFileName: "",
        proofUrl: "",
        status: "pending",
        adminNote: "",
        promoCode: parsed.code || normalizePromoCode(code),
        promoCodeId: parsed.code,
        quotaVersion: 1,
        createdAt: serverTimestamp(),
      });
      batch.set(redemptionRef, {
        uid: profile.uid,
        promoCodeId: parsed.code,
        code: parsed.code,
        amount: verified.amount,
        requestId: requestRef.id,
        createdAt: serverTimestamp(),
      });
      batch.update(doc(db, "users", profile.uid), {
        lastTokenRequestId: requestRef.id,
        lastTokenRequestAt: serverTimestamp(),
        pendingTokenRequestCount: Number(profile.pendingTokenRequestCount || 0) + 1,
        tokenRequestWindowStartedAt: activeWindow ? profile.tokenRequestWindowStartedAt : serverTimestamp(),
        tokenRequestWindowCount: activeWindow ? Number(profile.tokenRequestWindowCount || 0) + 1 : 1,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setCode("");
      setCodeNote({ text: `已提交邀請碼申請（${fmt(verified.amount)} 代幣），批准後代幣會加入帳戶。`, error: false });
    } catch (error) {
      setCodeNote({ text: failMessage(error, "提交失敗，請稍後再試。"), error: true });
    } finally {
      setCodeBusy(false);
    }
  }

  const amounts = [{ id: "custom", title: "自訂金額", sub: "HK$100 起", preset: false }]
    .concat(packages.map((item) => ({ id: item.hkd, title: `HK$${fmt(item.hkd)}`, sub: `可得 ${fmt(item.tokens)} 代幣`, preset: true, coinsText: fmt(item.tokens), bonus: `+${getTokenBonusRate(item)}%` })))
    .map((item) => {
      const on = sel === item.id;
      return {
        ...item,
        isCustom: item.id === "custom", pressed: on,
        pick: () => setSel(item.id),
        border: on ? "#f4022b" : "#282d36", bg: on ? "#181015" : "#0b0e12", glow: on ? SEL : "none", cls: on ? "" : "ld-lift",
      };
    });

  const shownCoins = payStep === "done" ? done.coins : coins;
  const shownHkd = payStep === "done" ? done.hkd : hkd;
  const closePay = () => { if (!busy) setPayOpen(false); };

  const v = {
    amounts, isCustom, custom,
    onCustom: (event) => setCustom(event.target.value),
    customBorder: customBad ? "#f4022b" : "#282d36",
    customHint: customBad ? `入金金額最少 HK$${MIN_CUSTOM_PAYMENT_HKD}` : CUSTOM_HINT,
    customHintColor: customBad ? "#ffd7c1" : "#a0a5ad",
    coinsText: fmt(shownCoins), hkdText: `HK$${fmt(shownHkd)}`, bonusText: `+${bonusRate}%`, hasBonus: bonusRate > 0,
    invalid,
    ctaBg: invalid ? "#21252d" : "#f4022b", ctaColor: invalid ? "#a0a5ad" : "#ffffff",
    ctaGlow: invalid ? "none" : "0 6px 20px rgba(244, 2, 43, 0.35)",
    confirm: () => {
      if (invalid) return;
      setPayStep("form");
      setPayError("");
      setCopied(false);
      setPayOpen(true);
    },
    submitted: false, submittedText: "",
    codeOpen, code,
    toggleCode: () => setCodeOpen((open) => !open),
    onCode: (event) => setCode(normalizePromoCode(event.target.value)),
    applyCode, codeBusy, codeBtnLabel: codeBusy ? "提交中…" : "套用",
    codeNote: codeNote.text || (codeOpen ? "每位用戶每個完整邀請碼只可使用一次。批准後代幣會加入帳戶，活動獎勵不會計入 VIP 累積入金。" : ""),
    codeError: codeNote.error,
    requestsNote: requestsLoading ? "正在載入申請紀錄…" : requests.length ? "" : "暫時未有申請。",
    requests: requests.map((request) => {
      const [badgeBg, badgeBorder, badgeColor] = BADGE[request.status] || BADGE.other;
      return {
        coinsText: fmt(request.amount),
        time: fullTime(request.createdAt),
        hkdText: Number(request.hkdAmount) > 0 ? `HK$${fmt(request.hkdAmount)}・FPS` : request.promoCode ? `—・活動碼 ${request.promoCode}` : "—",
        statusLabel: STATUS[request.status] || request.status,
        badgeBg, badgeBorder, badgeColor,
        hasProof: Boolean(request.proofUrl), proofUrl: request.proofUrl,
        proofLabel: request.proofMode === "dummy" ? "測試證明" : "付款證明",
      };
    }),
    payOpen, payForm: payStep === "form", payDone: payStep === "done", busy,
    closePay,
    isFps: true,
    fpsId: payment.fpsIdentifier || "尚未設定", fpsName: payment.fpsName || "尚未設定",
    copyFps: () => {
      if (!payment.fpsIdentifier) return;
      try { navigator.clipboard?.writeText(payment.fpsIdentifier); } catch { /* clipboard blocked */ }
      setCopied(true);
    },
    copyLabel: copied ? "已複製" : "複製 FPS 號碼", copyBorder: copied ? "#22c55e" : "#282d36", copyColor: copied ? "#86efac" : "#ffffff",
    onFile: (event) => { setProof(event.target.files?.[0] || null); setPayError(""); },
    fileLabel: proof?.name || "未選擇圖片", fileColor: proof ? "#ffffff" : "#a0a5ad", fileBorder: proof ? "#22c55e" : "#3a404b",
    fpsDisabled: !proof || busy, fpsBtnBg: proof && !busy ? "#f4022b" : "#21252d", fpsBtnColor: proof && !busy ? "#ffffff" : "#a0a5ad",
    fpsBtnLabel: busy ? "提交中…" : "上載並提交申請",
    submitFps, payError,
    doneTitle: "申請已提交",
    doneText: "我們會盡快核對你的付款證明，審核後代幣會存入你的帳戶，可在「我的代幣申請」查看進度。",
    doneIconBg: "#f4022b", doneGlow: "rgba(244, 2, 43, 0.5)", doneMethod: "FPS",
    vip: { deposit, profile, rewards: vipRewards, tiers: vipTiers },
  };
  return <TopUpView v={v} />;
}

function TopUpView({ v }) {
  return (<>
<style>{CSS}</style>
<main className="ld-main" style={{flex: "999 1 560px", minWidth: "0", display: "flex", flexDirection: "column", gap: "24px", padding: "24px"}}>{"\n\n  "}
  <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "24px"}}>{"\n\n    "}
    <section aria-labelledby="topup-title" style={{flex: "3 1 520px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px", padding: "28px", borderRadius: "10px", border: "1px solid #14181d", background: "#05070a"}}>{"\n      "}
      <div style={{display: "flex", alignItems: "flex-start", gap: "14px"}}>{"\n        "}
        <span aria-hidden="true" style={{flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", width: "48px", height: "48px", borderRadius: "10px", border: "1px solid #3a2a00", background: "#1a1300"}}>
          <svg width="28" height="28" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10.5" fill="#fdc800" stroke="#f88f00" strokeWidth="2"></circle>
            <path d="M13.4 5.2 7.9 13h3.9l-1.2 5.8 5.6-8h-4z" fill="#f88f00"></path>
          </svg>
        </span>{"\n        "}
        <div style={{display: "flex", flexDirection: "column", gap: "2px"}}>{"\n          "}
          <h1 id="topup-title" style={{margin: "0", fontFamily: "'Barlow Condensed', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "40px", lineHeight: "46px"}}>{"充值代幣"}</h1>{"\n        "}
        </div>{"\n      "}
      </div>{"\n      "}
      <div style={{display: "flex", flexDirection: "column", gap: "12px"}}>{"\n        "}
        <h2 style={{margin: "0", fontSize: "17px", lineHeight: "24px", fontWeight: "700"}}>{"選擇入金金額"}</h2>{"\n        "}
        <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))", gap: "12px"}}>{"\n          "}
          {(Array.isArray(v.amounts) ? v.amounts : []).map((a, $index) => (<React.Fragment key={$index}>{"\n            "}
            <button type="button" onClick={a?.pick} aria-pressed={a?.pressed} className={a?.cls} style={{position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", minHeight: "96px", padding: "16px 18px", textAlign: "left", borderRadius: "6px", border: `1px solid ${asset(a?.border) ?? ''}`, background: `${asset(a?.bg) ?? ''}`, boxShadow: `${asset(a?.glow) ?? ''}`, color: "#ffffff", cursor: "pointer"}}>{"\n              "}
              <span style={{display: "flex", flexDirection: "column", gap: "2px"}}>{"\n                "}
                <span style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "24px", lineHeight: "28px"}}>{a?.title}</span>{"\n                "}
                <span style={{fontSize: "13px", lineHeight: "18px", color: "#a0a5ad", whiteSpace: "nowrap"}}>{a?.sub}</span>{"\n              "}
              </span>{"\n              "}
              {a?.preset ? (<>{"\n                "}
                <span style={{display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px"}}>{"\n                  "}
                  <span style={{display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "24px", lineHeight: "26px", color: "#ffe390"}}>
                    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="10.5" fill="#fdc800" stroke="#f88f00" strokeWidth="2"></circle>
                      <path d="M13.4 5.2 7.9 13h3.9l-1.2 5.8 5.6-8h-4z" fill="#f88f00"></path>
                    </svg>{a?.coinsText}
                  </span>{"\n                  "}
                  <span style={{height: "22px", padding: "0 8px", borderRadius: "4px", background: "#3a2a00", border: "1px solid #f88f00", color: "#ffffff", fontSize: "12px", lineHeight: "20px", fontWeight: "700", whiteSpace: "nowrap"}}>{a?.bonus}{" 額外"}</span>{"\n                "}
                </span>{"\n              "}
              </>) : null}{"\n              "}
              {a?.isCustom ? (<>{"\n                "}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a0a5ad" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 20h4L19 9l-4-4L4 16z"></path>
                  <path d="m13.5 6.5 4 4"></path>
                </svg>{"\n              "}
              </>) : null}{"\n            "}
            </button>{"\n          "}
          </React.Fragment>))}{"\n        "}
        </div>{"\n        "}
        {v.isCustom ? (<>{"\n          "}
          <label style={{display: "flex", flexDirection: "column", gap: "8px"}}>{"\n            "}
            <span style={{fontSize: "14px", fontWeight: "700"}}>{"自訂入金金額（HK$）"}</span>{"\n            "}
            <span style={{display: "flex", alignItems: "center", gap: "8px", height: "52px", padding: "0 16px", borderRadius: "4px", border: `1px solid ${asset(v.customBorder) ?? ''}`, background: "#13161b"}}>{"\n              "}
              <span style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "700", fontSize: "20px", color: "#a0a5ad"}}>{"HK$"}</span>{"\n              "}
              <input type="number" inputMode="numeric" min="100" step="1" value={v.custom} onChange={v.onCustom} placeholder="最少 100" style={{flex: "1 1 auto", minWidth: "0", height: "100%", background: "transparent", border: "0", outline: "none", color: "#ffffff", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "700", fontSize: "22px"}} />{"\n            "}
            </span>{"\n            "}
            <span style={{fontSize: "13px", color: `${asset(v.customHintColor) ?? ''}`}}>{v.customHint}</span>{"\n          "}
          </label>{"\n        "}
        </>) : null}{"\n      "}
      </div>{"\n      "}
      <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px 20px", padding: "18px 20px", borderRadius: "6px", border: "1px solid #3a2a00", background: "#1a1300"}}>{"\n        "}
        <div style={{display: "flex", flexDirection: "column", gap: "4px"}}>{"\n          "}
          <span style={{fontSize: "14px", fontWeight: "700", color: "#c3c8cd"}}>{"可領取的代幣"}</span>{"\n          "}
          <span style={{display: "inline-flex", alignItems: "center", gap: "10px"}}>
            <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="10.5" fill="#fdc800" stroke="#f88f00" strokeWidth="2"></circle>
              <path d="M13.4 5.2 7.9 13h3.9l-1.2 5.8 5.6-8h-4z" fill="#f88f00"></path>
            </svg>
            <strong style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "52px", lineHeight: "54px", color: "#ffe390", fontVariantNumeric: "tabular-nums"}}>{v.coinsText}</strong>
          </span>{"\n          "}
          <span style={{fontSize: "14px", color: "#c3c8cd"}}>{"付款金額 "}
            <strong style={{color: "#ffffff"}}>{v.hkdText}</strong>
          </span>{"\n        "}
        </div>{"\n        "}
        {v.hasBonus ? (<>{"\n          "}
          <span style={{display: "inline-flex", flexDirection: "column", alignItems: "center", padding: "8px 14px", borderRadius: "6px", background: "#3a2a00", border: "1px solid #fdc800", color: "#ffe390"}}>
            <strong style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "26px", lineHeight: "28px", color: "#ffffff"}}>{v.bonusText}</strong>
            <span style={{fontSize: "12px", lineHeight: "16px", color: "#ffffff"}}>{"額外代幣"}</span>
          </span>{"\n        "}
        </>) : null}{"\n      "}
      </div>{"\n      "}
      {v.submitted ? (<>{"\n        "}
        <div role="status" style={{display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderRadius: "6px", border: "1px solid #282d36", background: "#13161b", fontSize: "14px", color: "#ffffff"}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fdc800" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7.5"></path>
          </svg>{v.submittedText}
        </div>{"\n      "}
      </>) : null}{"\n      "}
      <div style={{display: "flex", flexDirection: "column", gap: "12px"}}>{"\n        "}
        <button type="button" onClick={v.confirm} disabled={v.invalid} style={{height: "56px", borderRadius: "4px", border: "0", background: `${asset(v.ctaBg) ?? ''}`, color: `${asset(v.ctaColor) ?? ''}`, boxShadow: `${asset(v.ctaGlow) ?? ''}`, fontSize: "18px", fontWeight: "900", cursor: "pointer"}}>{"確認金額"}</button>{"\n        "}
        <button type="button" onClick={v.toggleCode} aria-expanded={v.codeOpen} style={{display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", height: "48px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "16px", fontWeight: "700", cursor: "pointer"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3.5" y="8" width="17" height="4" rx="1"></rect>
            <path d="M5 12v8.5h14V12M12 8v12.5"></path>
            <path d="M12 8S10.5 3.5 8 4.2 7.6 8 12 8zM12 8s1.5-4.5 4-3.8S16.4 8 12 8z"></path>
          </svg>{"使用推廣活動邀請碼"}
        </button>{"\n        "}
        {v.codeOpen ? (<>{"\n          "}
          <div style={{display: "flex", gap: "8px"}}>{"\n            "}
            <input type="text" aria-label="推廣活動邀請碼" placeholder="輸入邀請碼" value={v.code} onChange={v.onCode} style={{flex: "1 1 auto", minWidth: "0", height: "48px", padding: "0 14px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "16px", letterSpacing: "0.08em", textTransform: "uppercase", outline: "none"}} />{"\n            "}
            <button type="button" onClick={v.applyCode} disabled={v.codeBusy} style={{flex: "0 0 auto", height: "48px", padding: "0 18px", borderRadius: "4px", border: "1px solid #282d36", background: "#21252d", color: "#ffffff", fontSize: "16px", fontWeight: "700", cursor: "pointer"}}>{v.codeBtnLabel}</button>{"\n          "}
          </div>{"\n        "}
          {v.codeNote ? <p role={v.codeError ? "alert" : undefined} style={{margin: "0", fontSize: "13px", lineHeight: "20px", color: v.codeError ? "#ffd7c1" : "#a0a5ad"}}>{v.codeNote}</p> : null}
        </>) : null}{"\n      "}
      </div>{"\n    "}
    </section>{"\n\n    "}
    <section aria-labelledby="req-title" style={{flex: "2 1 340px", minWidth: "0", display: "flex", flexDirection: "column", gap: "16px", padding: "28px", borderRadius: "10px", border: "1px solid #14181d", background: "#05070a"}}>{"\n      "}
      <div style={{display: "flex", alignItems: "center", gap: "10px"}}>{"\n        "}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f4022b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M12 7v5l3.5 2"></path>
        </svg>{"\n        "}
        <h2 id="req-title" style={{margin: "0", fontSize: "22px", lineHeight: "30px", fontWeight: "700"}}>{"我的代幣申請"}</h2>{"\n      "}
      </div>{"\n      "}
      {v.requestsNote ? <p style={{margin: "0", fontSize: "15px", color: "#a0a5ad"}}>{v.requestsNote}</p> : null}
      <ul style={{listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column", gap: "10px", maxHeight: "640px", overflowY: "auto"}}>{"\n        "}
        {(Array.isArray(v.requests) ? v.requests : []).map((r, $index) => (<React.Fragment key={$index}>{"\n          "}
          <li style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 14px", padding: "16px", borderRadius: "6px", border: "1px solid #282d36", background: "#0b0e12"}}>{"\n            "}
            <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true" style={{flex: "0 0 auto"}}>
              <circle cx="12" cy="12" r="10.5" fill="#fdc800" stroke="#f88f00" strokeWidth="2"></circle>
              <path d="M13.4 5.2 7.9 13h3.9l-1.2 5.8 5.6-8h-4z" fill="#f88f00"></path>
            </svg>{"\n            "}
            <span style={{flex: "1 1 160px", minWidth: "0", display: "flex", flexDirection: "column"}}>{"\n              "}
              <strong style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "22px", lineHeight: "26px"}}>{r?.coinsText}{" 代幣"}</strong>{"\n              "}
              <span style={{fontSize: "12px", lineHeight: "16px", color: "#6b767f"}}>{r?.time}</span>{"\n              "}
              <span style={{fontSize: "14px", lineHeight: "20px", color: "#c3c8cd"}}>{"付款金額："}{r?.hkdText}</span>{"\n            "}
            </span>{"\n            "}
            <span style={{display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px"}}>{"\n              "}
              <span style={{display: "inline-flex", alignItems: "center", gap: "4px", height: "26px", padding: "0 10px", borderRadius: "4px", border: `1px solid ${asset(r?.badgeBorder) ?? ''}`, background: `${asset(r?.badgeBg) ?? ''}`, color: `${asset(r?.badgeColor) ?? ''}`, fontSize: "13px", lineHeight: "24px", fontWeight: "700"}}>{r?.statusLabel}</span>{"\n              "}
              {r?.hasProof ? (<>{"\n                "}
                <a href={r?.proofUrl} target="_blank" rel="noreferrer" style={{display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "14px", fontWeight: "700", color: "#f4022b"}}>{r?.proofLabel}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 4h6v6M20 4l-9 9"></path>
                    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"></path>
                  </svg>
                </a>{"\n              "}
              </>) : null}{"\n              "}
              {"\n            "}
            </span>{"\n          "}
          </li>{"\n        "}
        </React.Fragment>))}{"\n      "}
      </ul>{"\n    "}
    </section>{"\n\n  "}
  </div>{"\n\n  "}
  <VipSection vip={v.vip} />
  {v.payOpen ? (<>
    <div onMouseDown={v.closePay} style={{position: "fixed", top: "0", right: "0", bottom: "0", left: "0", zIndex: "90", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "56px 16px 24px", overflowY: "auto", background: "rgba(0, 0, 0, 0.72)"}}>{"\n  "}
      <section role="dialog" aria-modal="true" aria-labelledby="pay-title" onMouseDown={(e) => e.stopPropagation()} style={{position: "relative", width: "100%", maxWidth: "640px", display: "flex", flexDirection: "column", gap: "18px", padding: "28px", borderRadius: "10px", border: "1px solid #282d36", background: "#0b0e12", boxShadow: "0 24px 60px rgba(0, 0, 0, 0.6)"}}>{"\n    "}
        <button type="button" onClick={v.closePay} disabled={v.busy} aria-label="關閉" style={{position: "absolute", top: "20px", right: "20px", width: "44px", height: "44px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", cursor: "pointer"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18"></path>
          </svg>
        </button>{"\n\n    "}
        {v.payForm ? (<>{"\n    "}
          <div style={{display: "flex", flexDirection: "column", gap: "6px", paddingRight: "56px"}}>{"\n      "}
            <h2 id="pay-title" style={{margin: "0", fontSize: "28px", lineHeight: "36px", fontWeight: "900"}}>{"入金資料及付款"}</h2>{"\n      "}
            <p style={{margin: "0", fontSize: "15px", lineHeight: "22px", color: "#c3c8cd"}}>{"請按以下資料以 FPS 轉數快付款，再上載付款證明；所有申請須經人工審核。"}</p>{"\n    "}
          </div>{"\n    "}
          <div style={{display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px"}}>{"\n      "}
            <div style={{display: "flex", flexDirection: "column", gap: "4px", padding: "16px 18px", borderRadius: "6px", border: "1px solid #282d36", background: "#05070a"}}>{"\n        "}
              <span style={{fontSize: "14px", fontWeight: "700", color: "#c3c8cd"}}>{"入金金額"}</span>{"\n        "}
              <strong style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "26px", lineHeight: "30px"}}>{v.hkdText}</strong>{"\n      "}
            </div>{"\n      "}
            <div style={{display: "flex", flexDirection: "column", gap: "4px", padding: "16px 18px", borderRadius: "6px", border: "1px solid #3a2a00", background: "#1a1300"}}>{"\n        "}
              <span style={{fontSize: "14px", fontWeight: "700", color: "#c3c8cd"}}>{"可領取代幣"}</span>{"\n        "}
              <strong style={{display: "inline-flex", alignItems: "center", gap: "8px", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "26px", lineHeight: "30px", color: "#ffe390"}}>
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="10.5" fill="#fdc800" stroke="#f88f00" strokeWidth="2"></circle>
                  <path d="M13.4 5.2 7.9 13h3.9l-1.2 5.8 5.6-8h-4z" fill="#f88f00"></path>
                </svg>{v.coinsText}
              </strong>{"\n      "}
            </div>{"\n    "}
          </div>{"\n\n    "}
          
          {v.isFps ? (<>{"\n    "}
            <div style={{display: "flex", flexDirection: "column", gap: "16px"}}>{"\n      "}
              <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px 24px", padding: "18px 20px", borderRadius: "6px", border: "1px solid #282d36", background: "#05070a"}}>{"\n        "}
                <div style={{flex: "1 1 140px", display: "flex", flexDirection: "column", gap: "2px"}}>
                  <span style={{fontSize: "14px", color: "#c3c8cd"}}>{"平台 FPS 識別碼"}</span>
                  <strong style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "24px", lineHeight: "28px", letterSpacing: "0.04em"}}>{v.fpsId}</strong>
                </div>{"\n        "}
                <div style={{flex: "1 1 140px", display: "flex", flexDirection: "column", gap: "2px"}}>
                  <span style={{fontSize: "14px", color: "#c3c8cd"}}>{"收款人姓名"}</span>
                  <strong style={{fontSize: "17px", lineHeight: "28px"}}>{v.fpsName}</strong>
                </div>{"\n        "}
                <button type="button" onClick={v.copyFps} style={{flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 16px", borderRadius: "4px", border: `1px solid ${asset(v.copyBorder) ?? ''}`, background: "#13161b", color: `${asset(v.copyColor) ?? ''}`, fontSize: "15px", fontWeight: "700", cursor: "pointer"}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="8" y="8" width="12" height="12" rx="2"></rect>
                    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>
                  </svg>{v.copyLabel}
                </button>{"\n      "}
              </div>{"\n      "}
              <ol style={{margin: "0", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px", fontSize: "14px", lineHeight: "22px", color: "#c3c8cd"}}>{"\n        "}
                <li>{"用銀行 App 以轉數快轉賬 "}
                  <strong style={{color: "#ffffff"}}>{v.hkdText}</strong>{" 至以上識別碼"}
                </li>{"\n        "}
                <li>{"截圖付款紀錄（須見到金額、日期及收款人）"}</li>{"\n        "}
                <li>{"上載付款證明並提交，審核後代幣會存入你的帳戶"}</li>{"\n      "}
              </ol>{"\n      "}
              <div style={{display: "flex", flexDirection: "column", gap: "8px"}}>{"\n        "}
                <span style={{fontSize: "16px", fontWeight: "700"}}>{"付款證明圖片"}</span>{"\n        "}
                <label style={{display: "flex", alignItems: "center", gap: "12px", minHeight: "60px", padding: "8px 10px", borderRadius: "6px", border: `1px dashed ${asset(v.fileBorder) ?? ''}`, background: "#05070a", cursor: "pointer"}}>{"\n          "}
                  <input type="file" accept="image/*" onChange={v.onFile} style={{position: "absolute", width: "1px", height: "1px", opacity: "0", overflow: "hidden"}} />{"\n          "}
                  <span style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "42px", padding: "0 16px", borderRadius: "999px", border: "1px solid #282d36", background: "#13161b", fontSize: "15px", fontWeight: "700"}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3.5" y="4.5" width="17" height="15" rx="2"></rect>
                      <circle cx="9" cy="10" r="1.6"></circle>
                      <path d="m20.5 16-5-5-8 8.5"></path>
                    </svg>{"選擇圖片"}
                  </span>{"\n          "}
                  <span style={{minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "15px", color: `${asset(v.fileColor) ?? ''}`}}>{v.fileLabel}</span>{"\n        "}
                </label>{"\n      "}
              </div>{"\n      "}
              {v.payError ? <p role="alert" style={{margin: "0", fontSize: "14px", lineHeight: "20px", color: "#ffd7c1"}}>{v.payError}</p> : null}
              <button type="button" onClick={v.submitFps} disabled={v.fpsDisabled} style={{display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", height: "56px", borderRadius: "4px", border: "0", background: `${asset(v.fpsBtnBg) ?? ''}`, color: `${asset(v.fpsBtnColor) ?? ''}`, fontSize: "18px", fontWeight: "900", cursor: "pointer"}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 16V4M7 9l5-5 5 5"></path>
                  <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"></path>
                </svg>{v.fpsBtnLabel}
              </button>{"\n    "}
            </div>{"\n    "}
          </>) : null}{"\n\n    "}
        </>) : null}{"\n\n    "}
        {v.payDone ? (<>{"\n    "}
          <div role="status" style={{display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", padding: "20px 8px 4px", textAlign: "center"}}>{"\n      "}
            <span aria-hidden="true" style={{display: "flex", alignItems: "center", justifyContent: "center", width: "72px", height: "72px", borderRadius: "999px", background: `${asset(v.doneIconBg) ?? ''}`, boxShadow: `0 0 32px ${asset(v.doneGlow) ?? ''}`}}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12.5 4.5 4.5L19 7.5"></path>
              </svg>
            </span>{"\n      "}
            <h2 id="pay-title" style={{margin: "0", fontSize: "28px", lineHeight: "36px", fontWeight: "900"}}>{v.doneTitle}</h2>{"\n      "}
            <p style={{margin: "0", maxWidth: "420px", fontSize: "15px", lineHeight: "24px", color: "#c3c8cd"}}>{v.doneText}</p>{"\n      "}
            <div style={{display: "flex", gap: "24px", padding: "14px 20px", borderRadius: "6px", border: "1px solid #282d36", background: "#05070a", fontSize: "14px", color: "#c3c8cd"}}>
              <span>{"付款金額 "}
                <strong style={{color: "#ffffff"}}>{v.hkdText}</strong>
              </span>
              <span>{"代幣 "}
                <strong style={{color: "#ffe390"}}>{v.coinsText}</strong>
              </span>
              <span>{"方式 "}
                <strong style={{color: "#ffffff"}}>{v.doneMethod}</strong>
              </span>
            </div>{"\n      "}
            <button type="button" onClick={v.closePay} style={{width: "100%", height: "52px", borderRadius: "4px", border: "0", background: "#f4022b", color: "#ffffff", fontSize: "17px", fontWeight: "900", cursor: "pointer"}}>{"完成"}</button>{"\n    "}
          </div>{"\n    "}
        </>) : null}{"\n  "}
      </section>
    </div>
  </>) : null}
</main></>);
}

const SHIELD = "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)";
const CHECK = <path d="m5 12.5 4.5 4.5L19 7.5"></path>;
const LOCK = <><rect x="4.5" y="10.5" width="15" height="10" rx="2"></rect><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"></path></>;
const LOGO = "/revamp/images/logo-mark.png";

// The design's placeholder artwork (pack / box / card) when a tier has no reward image.
function TierArt({ index, tier, dim }) {
  if (tier.rewardImageUrl) {
    return <img src={tier.rewardImageUrl} alt={tier.rewardName || `${tier.name} 獎勵卡牌`} style={{ maxWidth: "100%", maxHeight: "88px", objectFit: "contain" }} />;
  }
  const kind = index % 3;
  if (kind === 1) {
    return (
      <span style={{ position: "relative", display: "block", width: "72px", aspectRatio: "4 / 3", borderRadius: "5px", overflow: "hidden", border: "1px solid #5a1222", background: "linear-gradient(160deg, #7a0c20 0%, #3a0812 50%, #0b0e12 100%)", opacity: dim ? 0.7 : 1 }}>
        <span style={{ position: "absolute", left: "0", right: "0", top: "0", height: "22%", background: "rgba(0, 0, 0, 0.3)", borderBottom: "1px solid rgba(255, 255, 255, 0.12)" }}></span>
        <img src={LOGO} alt="" style={{ position: "absolute", left: "50%", top: "58%", width: "30%", transform: "translate(-50%, -50%)" }} />
      </span>
    );
  }
  if (kind === 2) {
    return (
      <span style={{ position: "relative", display: "block", width: "52px", aspectRatio: "63 / 88", borderRadius: "4px", overflow: "hidden", border: "1px solid #3a1018", background: "linear-gradient(150deg, #4a0511 0%, #1d0a10 55%, #0b0e12 100%)" }}>
        <img src={LOGO} alt="" style={{ position: "absolute", left: "50%", top: "50%", width: "40%", transform: "translate(-50%, -50%)", opacity: "0.7" }} />
      </span>
    );
  }
  return (
    <span style={{ position: "relative", display: "block", width: "46px", aspectRatio: "5 / 8", borderRadius: "5px", overflow: "hidden", border: "1px solid #5a1222", background: "linear-gradient(160deg, #7a0c20 0%, #3a0812 45%, #0b0e12 100%)", opacity: dim ? 0.7 : 1 }}>
      <img src={LOGO} alt="" style={{ position: "absolute", left: "50%", top: "50%", width: "46%", transform: "translate(-50%, -50%)" }} />
    </span>
  );
}

function VipSection({ vip: { deposit, profile, rewards, tiers } }) {
  const state = getVipState(tiers, deposit);
  const [claimingId, setClaimingId] = useState("");
  const [claimedIds, setClaimedIds] = useState(() => new Set());
  const [message, setMessage] = useState({ text: "", error: false });
  const byTier = useMemo(() => new Map(rewards.map((reward) => [reward.vipTierId, reward])), [rewards]);

  // Same claim as the main site: only rewards the server issued can be claimed.
  async function claim(reward) {
    if (!reward?.id) return;
    setClaimingId(reward.id);
    setMessage({ text: "", error: false });
    try {
      await runTransaction(db, async (transaction) => {
        const rewardRef = doc(db, "drawRecords", reward.id);
        const snapshot = await transaction.get(rewardRef);
        if (!snapshot.exists()) throw new Error("VIP 獎勵需要管理員批准入數後先會發放。");
        const saved = snapshot.data();
        if (saved.uid !== profile.uid || saved.source !== "vip") throw new Error("VIP 獎勵記錄不正確，請聯絡客服。");
        if (saved.cardId || saved.vipRewardStatus === "claimed") return;
        if (saved.vipRewardStatus !== "claimable" || !saved.targetCardId) throw new Error("此 VIP 獎勵暫時未能領取。");
        transaction.update(rewardRef, {
          vipRewardStatus: "claimed",
          cardId: saved.targetCardId,
          cardName: saved.targetCardName || "VIP 升級獎勵",
          cardCategory: "VIP 獎勵",
          cardImageUrl: saved.targetCardImageUrl || "",
          cardValue: Number(saved.targetCardValue || 0),
          cardConversionValue: Number(saved.targetCardValue || 0),
          collectionStatus: "pending",
          claimedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      setClaimedIds((current) => new Set([...current, reward.id]));
      setMessage({ text: "VIP 卡牌獎勵已領取，已加入「我的卡牌」。", error: false });
    } catch (error) {
      setMessage({ text: failMessage(error), error: true });
    } finally {
      setClaimingId("");
    }
  }

  const last = state.tiers.length - 1;
  return (
    <section id="vip" aria-labelledby="vip-title" style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "28px", borderRadius: "10px", border: "1px solid #3a2a00", background: "radial-gradient(60% 120% at 0% 0%, rgba(253, 200, 0, 0.1) 0%, rgba(253, 200, 0, 0) 60%), #05070a" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px 24px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h2 id="vip-title" style={{ margin: "0", fontFamily: FONT_TITLE, fontStyle: "italic", fontWeight: "900", fontSize: "40px", lineHeight: "46px" }}>VIP 等級</h2>
            <span style={{ display: "inline-flex", alignItems: "center", height: "30px", padding: "0 12px", borderRadius: "4px", background: state.currentTier ? "#fdc800" : "#21252d", color: state.currentTier ? "#1a1300" : "#c3c8cd", fontFamily: FONT_NUM, fontStyle: "italic", fontWeight: "900", fontSize: "20px" }}>{state.currentTier?.name || "未入級"}</span>
          </div>
          <p style={{ margin: "0", fontSize: "15px", color: "#c3c8cd" }}>累積入金 <strong style={{ color: "#ffffff" }}>HK${fmt(deposit)}</strong>・每次升級即送指定實體卡</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "16px 20px", borderRadius: "6px", border: "1px solid #3a2a00", background: "#1a1300", maxWidth: "100%" }}>
          {state.nextTier ? (
            <>
              <span style={{ fontSize: "13px", color: "#c3c8cd" }}>距離 {state.nextTier.name}</span>
              <strong style={{ fontFamily: FONT_TITLE, fontStyle: "italic", fontWeight: "900", fontSize: "30px", lineHeight: "34px", color: "#ffe390" }}>再入金 HK${fmt(state.remaining)}</strong>
              <span style={{ fontSize: "13px", color: "#c3c8cd" }}>升級即獲 {state.nextTier.rewardName || "指定卡牌"}</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: "13px", color: "#c3c8cd" }}>最高級別</span>
              <strong style={{ fontFamily: FONT_TITLE, fontStyle: "italic", fontWeight: "900", fontSize: "30px", lineHeight: "34px", color: "#ffe390" }}>所有 VIP 等級已達成</strong>
              <span style={{ fontSize: "13px", color: "#c3c8cd" }}>多謝你一直支持直播抽卡。</span>
            </>
          )}
        </div>
      </div>
      {message.text && <p role={message.error ? "alert" : "status"} style={{ margin: "0", fontSize: "14px", color: message.error ? "#ffd7c1" : "#ffe390" }}>{message.text}</p>}

      <ol style={{ listStyle: "none", margin: "0", padding: "0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(170px, 100%), 1fr))", gap: "16px 12px" }}>
        {state.tiers.map((tier, index) => {
          const reward = byTier.get(tier.id);
          const rewardId = reward?.id || `vip_${profile.uid}_${tier.id}`;
          const claimed = claimedIds.has(rewardId) || Boolean(reward?.cardId || reward?.vipRewardStatus === "claimed");
          const claimable = Boolean(reward?.vipRewardStatus === "claimable" && !claimed);
          const locked = !tier.done && !tier.active;
          const leftRail = !tier.done && tier.active
            ? `linear-gradient(90deg, #fdc800 0%, #fdc800 ${Math.round(tier.progress)}%, #282d36 ${Math.round(tier.progress)}%, #282d36 100%)`
            : tier.done ? "#fdc800" : "#282d36";
          return (
            <li key={tier.id} style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: "12px" }}>
              <div aria-hidden="true" style={{ position: "relative", display: "flex", justifyContent: "center", height: "56px" }}>
                {index > 0 && <span style={{ position: "absolute", top: "26px", left: "-6px", right: "50%", height: "4px", background: leftRail }}></span>}
                {index < last && <span style={{ position: "absolute", top: "26px", left: "50%", right: "-6px", height: "4px", background: tier.done ? "#fdc800" : "#282d36" }}></span>}
                {tier.active && !tier.done ? (
                  <span style={{ position: "relative", display: "block", filter: "drop-shadow(0 0 10px rgba(244, 2, 43, 0.7))" }}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "50px", height: "56px", background: "#f4022b", color: "#ffffff", clipPath: SHIELD, fontFamily: FONT_NUM, fontStyle: "italic", fontWeight: "900", fontSize: "24px" }}>{index}</span>
                  </span>
                ) : (
                  <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "50px", height: "56px", background: tier.done ? "#ffffff" : "#21252d", color: tier.done ? "#05070a" : "#a0a5ad", clipPath: SHIELD, fontFamily: FONT_NUM, fontStyle: "italic", fontWeight: "900", fontSize: "24px" }}>{index}</span>
                )}
              </div>
              {claimed || claimable ? (
                <span style={{ alignSelf: "center", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "13px", fontWeight: "700", color: "#ffe390" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{CHECK}</svg>{claimed ? "已領取" : "可領取"}
                </span>
              ) : tier.done ? (
                <span style={{ alignSelf: "center", fontSize: "13px", fontWeight: "700", color: "#ffe390" }}>等待批准發放</span>
              ) : tier.active ? (
                <span style={{ alignSelf: "center", fontFamily: FONT_NUM, fontSize: "15px", fontWeight: "800", color: "#f4022b" }}>進度 {Math.round(tier.progress)}%</span>
              ) : (
                <span style={{ alignSelf: "center", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "13px", fontWeight: "700", color: "#a0a5ad" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{LOCK}</svg>未解鎖
                </span>
              )}
              <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", gap: "8px", padding: "14px", borderRadius: "6px", border: `1px solid ${tier.active && !tier.done ? "#f4022b" : "#282d36"}`, background: tier.active && !tier.done ? "#181015" : "#0b0e12", boxShadow: tier.active && !tier.done ? SEL : "none" }}>
                <span aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "96px", borderRadius: "4px", background: "#05070a" }}>
                  <TierArt index={index} tier={tier} dim={locked} />
                </span>
                <strong style={{ fontFamily: FONT_NUM, fontStyle: "italic", fontWeight: "800", fontSize: "20px", lineHeight: "22px", color: locked ? "#c3c8cd" : "#ffffff" }}>{tier.name}</strong>
                <span style={{ fontFamily: FONT_NUM, fontWeight: "800", fontSize: "22px", lineHeight: "24px", color: locked ? "#c3c8cd" : "#ffe390" }}>HK${fmt(tier.threshold)}</span>
                <span style={{ fontSize: "13px", lineHeight: "18px", color: locked ? "#a0a5ad" : "#c3c8cd" }}>{tier.rewardName || "待設定升級獎勵"}</span>
                {claimable && (
                  <button type="button" disabled={claimingId === rewardId} onClick={() => claim(reward)} style={{ marginTop: "auto", height: "40px", borderRadius: "4px", border: "0", background: "#f4022b", color: "#ffffff", fontSize: "15px", fontWeight: "700", cursor: "pointer" }}>{claimingId === rewardId ? "領取中…" : "領取"}</button>
                )}
                {claimed && <span style={{ marginTop: "auto", fontSize: "12px", lineHeight: "16px", color: "#a0a5ad" }}>已加入我的卡牌</span>}
                {tier.active && !tier.done && (
                  <span aria-hidden="true" style={{ marginTop: "auto", display: "block", height: "6px", borderRadius: "999px", background: "#282d36", overflow: "hidden" }}>
                    <span style={{ display: "block", width: `${Math.round(tier.progress)}%`, height: "100%", background: "#f4022b" }}></span>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
