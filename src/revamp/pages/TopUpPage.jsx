/* eslint-disable */
// Generated from the LiveDraw revamp design (TopUp.html); logic kept as designed.
import React from "react";
import { DCLogic, route, asset } from "../runtime.jsx";

export const CSS = "\nbody{margin:0;background:#0b0e12}\n*{box-sizing:border-box}\na{color:#ffffff;text-decoration:none}a:hover{color:#ffe390}\nbutton,input,textarea{font-family:inherit}\nbutton:disabled{cursor:not-allowed}\n:focus-visible{outline:2px solid #f4022b;outline-offset:2px}\ninput::placeholder,textarea::placeholder{color:#6b767f}\n.ld-nav{transition:background-color 150ms,color 150ms}\n.ld-nav:hover{background-color:#13161b !important;color:#ffffff !important}\n.ld-lift{transition:border-color 150ms,box-shadow 150ms}\n.ld-lift:hover{border-color:#6b767f !important}\n.ld-link:hover{color:#ffffff !important}\n@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none !important;transition:none !important}}\n\n.ld-menubtn,.ld-tabbar,.ld-drawer-close,.ld-backdrop{display:none}\n@media (max-width:760px){\n.ld-root{padding-bottom:68px}\n.ld-header{padding:8px 12px !important;gap:8px !important;flex-wrap:nowrap !important;position:sticky;top:0;z-index:40}\n.ld-search,.ld-hide-m,.ld-uname{display:none !important}\n.ld-logo{width:auto !important;flex:1 1 auto !important;min-width:0}\n.ld-logo img{width:104px !important;height:auto !important}\n.ld-tools{gap:6px !important;flex-wrap:nowrap !important}\n.ld-tools > a,.ld-tools > button,.ld-tools > span > button{height:38px !important}\n.ld-menubtn{display:flex !important}\n.ld-main h1{font-size:34px !important;line-height:40px !important}\n.ld-tools > a:first-child > span:last-child,.ld-tools > span > button > span{display:none !important}\n.ld-logo{min-width:96px !important}\n.ld-bleed{margin:-12px -12px 0 !important}\n.ld-tools > span > button{padding:0 8px !important;gap:4px !important}\n.ld-tools > span > button > svg:last-child{display:none}\n.ld-tools > button{width:38px !important}\n.ld-tools > a:last-child{padding:0 3px !important;border:0 !important}\n.ld-tools > a:first-child{padding:0 4px 0 8px !important;gap:5px !important;font-size:17px !important}\n.ld-side{display:none !important}\n.ld-side.ld-side-open{display:flex !important;position:fixed;top:0;left:0;bottom:0;width:min(300px,84vw);z-index:80;overflow-y:auto;box-shadow:12px 0 40px rgba(0,0,0,.6)}\n.ld-side.ld-side-open .ld-drawer-close{display:flex !important}\n.ld-backdrop{display:block !important;position:fixed;top:0;right:0;bottom:0;left:0;z-index:79;border:0;background:rgba(0,0,0,.6)}\n.ld-main{padding:12px !important;gap:12px !important}\n.ld-footer{padding:24px 16px 20px !important;gap:16px !important}\n.ld-tabbar{display:flex !important;position:fixed;left:0;right:0;bottom:0;z-index:60;height:64px;background:#080b0e;border-top:1px solid #282d36}\n}\n";

class TopUpPage extends DCLogic {
  constructor(...args) {
    super(...args);
    this.state = { sel: 500, custom: '', codeOpen: false, code: '', extra: [], submitted: false, payOpen: false, method: 'fps', payStep: 'form', file: '', copied: false, cardNo: '', cardExp: '', cardCvc: '', cardName: '', cardTried: false, paying: false, doneMethod: '' };
  }

  _renderVals0() {
    const st = this.state;
    const fmt = (n) => Number(n).toLocaleString('en-US');
    const SEL = '0 0 0 2px #f4022b, 0 0 24px rgba(244, 2, 43, 0.35)';
    const presets = [
      { id: 500, hkd: 500, coins: 515, bonus: '+3%' },
      { id: 1000, hkd: 1000, coins: 1030, bonus: '+3%' },
      { id: 3000, hkd: 3000, coins: 3100, bonus: '+3%' },
      { id: 10000, hkd: 10000, coins: 10600, bonus: '+6%' },
      { id: 30000, hkd: 30000, coins: 32400, bonus: '+8%' }
    ];
    const isCustom = st.sel === 'custom';
    const amounts = [{ id: 'custom', title: '自訂金額', sub: 'HK$100 起', preset: false }].concat(presets.map((p) => ({ id: p.id, title: 'HK$' + fmt(p.hkd), sub: '可得 ' + fmt(p.coins) + ' 代幣', preset: true, coinsText: fmt(p.coins), bonus: p.bonus })))
      .map((a) => {
        const on = st.sel === a.id;
        return Object.assign(a, {
          isCustom: a.id === 'custom', pressed: on,
          pick: () => this.setState({ sel: a.id, submitted: false }),
          border: on ? '#f4022b' : '#282d36', bg: on ? '#181015' : '#0b0e12', glow: on ? SEL : 'none', cls: on ? '' : 'ld-lift'
        });
      });

    let hkd = 0;
    let coins = 0;
    let bonusText = '';
    let invalid = false;
    let customHint = '最少 HK$100；HK$10,000 起 +6%、HK$30,000 起 +8% 額外代幣';
    if (isCustom) {
      const v = parseInt(String(st.custom).replace(/[^0-9]/g, ''), 10);
      hkd = isNaN(v) ? 0 : v;
      const rate = hkd >= 30000 ? 0.08 : (hkd >= 10000 ? 0.06 : 0.03);
      coins = Math.floor(hkd * (1 + rate));
      bonusText = '+' + Math.round(rate * 100) + '%';
      invalid = hkd < 100;
      if (st.custom !== '' && invalid) customHint = '入金金額最少 HK$100';
    } else {
      const p = presets.find((x) => x.id === st.sel) || presets[0];
      hkd = p.hkd; coins = p.coins; bonusText = p.bonus;
    }

    const base = [{ coins: 32400, hkd: 30000, time: '30/09/2026 19:22', status: 'approved' }];
    const requests = st.extra.concat(base).map((r) => ({
      coinsText: fmt(r.coins), hkdText: 'HK$' + fmt(r.hkd) + '・' + (r.method || 'FPS'), time: r.time,
      approved: r.status === 'approved' && r.method !== '信用卡', pending: r.status === 'pending',
      statusLabel: r.status === 'approved' ? (r.method === '信用卡' ? '已入賬' : '已批准') : '待審批',
      badgeBg: r.status === 'approved' ? '#3a2a00' : '#21252d',
      badgeBorder: r.status === 'approved' ? '#fdc800' : '#282d36',
      badgeColor: r.status === 'approved' ? '#ffe390' : '#ffffff'
    }));

    const cardProblem = (s) => {
      const no = String(s.cardNo || '').replace(/ /g, '');
      const exp = String(s.cardExp || '').replace(/[^0-9]/g, '');
      if (no.length < 15) return '請輸入完整卡號';
      if (exp.length !== 4 || +exp.slice(0, 2) < 1 || +exp.slice(0, 2) > 12) return '請輸入正確到期日（MM / YY）';
      if (String(s.cardCvc || '').length < 3) return '請輸入 3 或 4 位安全碼';
      if (!String(s.cardName || '').trim()) return '請輸入持卡人姓名';
      return '';
    };
    const cardErr = st.cardTried && !st.paying ? cardProblem(st) : '';
    const methods = [
      { id: 'fps', label: 'FPS 轉數快', sub: '上載付款證明・人工審核' },
      { id: 'card', label: '信用卡（Stripe）', sub: 'Visa / Mastercard / AMEX・即時入賬' }
    ].map((m) => {
      const on = st.method === m.id;
      return { label: m.label, sub: m.sub, on: on, pick: () => this.setState({ method: m.id, cardTried: false }),
        border: on ? '#f4022b' : '#282d36', bg: on ? '#181015' : '#05070a', glow: on ? '0 0 0 1px #f4022b' : 'none',
        dot: on ? '#f4022b' : 'transparent', dotBorder: on ? '#f4022b' : '#6b767f' };
    });

    return {
      amounts: amounts, isCustom: isCustom, custom: st.custom,
      onCustom: (e) => this.setState({ custom: e.target.value, submitted: false }),
      customBorder: isCustom && st.custom !== '' && invalid ? '#f4022b' : '#282d36',
      customHint: customHint, customHintColor: isCustom && st.custom !== '' && invalid ? '#ffd7c1' : '#a0a5ad',
      coinsText: fmt(coins), hkdText: 'HK$' + fmt(hkd), bonusText: bonusText, hasBonus: coins > 0,
      invalid: invalid,
      ctaBg: invalid ? '#21252d' : '#f4022b', ctaColor: invalid ? '#a0a5ad' : '#ffffff',
      ctaGlow: invalid ? 'none' : '0 6px 20px rgba(244, 2, 43, 0.35)',
      confirm: () => {
        if (invalid) return;
        this.setState({ payOpen: true, payStep: 'form', file: '', copied: false, cardTried: false, paying: false, submitted: false });
      },
      submitted: st.submitted,
      codeOpen: st.codeOpen, code: st.code,
      toggleCode: () => this.setState({ codeOpen: !this.state.codeOpen }),
      onCode: (e) => this.setState({ code: e.target.value }),
      requests: requests,
      payOpen: !!st.payOpen, payForm: st.payStep === 'form', payDone: st.payStep === 'done',
      closePay: () => { if (this._payT) clearTimeout(this._payT); this.setState({ payOpen: false, paying: false }); },
      methods: methods, isFps: st.method === 'fps', isCard: st.method === 'card',
      copyFps: () => { try { if (navigator.clipboard) navigator.clipboard.writeText('122833403'); } catch (e) {} this.setState({ copied: true }); },
      copyLabel: st.copied ? '已複製' : '複製 FPS 號碼', copyBorder: st.copied ? '#22c55e' : '#282d36', copyColor: st.copied ? '#86efac' : '#ffffff',
      onFile: (e) => { const f = e && e.target && e.target.files && e.target.files[0]; this.setState({ file: f ? f.name : '' }); },
      fileLabel: st.file || '未選擇圖片', fileColor: st.file ? '#ffffff' : '#a0a5ad', fileBorder: st.file ? '#22c55e' : '#3a404b',
      fpsDisabled: !st.file, fpsBtnBg: st.file ? '#f4022b' : '#21252d', fpsBtnColor: st.file ? '#ffffff' : '#a0a5ad',
      submitFps: () => {
        if (!this.state.file) return;
        this.setState({ payStep: 'done', doneMethod: 'FPS', extra: [{ coins: coins, hkd: hkd, time: '01/11/2026 21:20', status: 'pending', method: 'FPS' }].concat(this.state.extra) });
      },
      cardNo: st.cardNo, cardExp: st.cardExp, cardCvc: st.cardCvc, cardName: st.cardName,
      onCardNo: (e) => { const v = String(e.target.value).replace(/[^0-9]/g, '').slice(0, 16); this.setState({ cardNo: v.replace(/(.{4})(?=.)/g, '$1 ') }); },
      onCardExp: (e) => { const v = String(e.target.value).replace(/[^0-9]/g, '').slice(0, 4); this.setState({ cardExp: v.length > 2 ? v.slice(0, 2) + ' / ' + v.slice(2) : v }); },
      onCardCvc: (e) => this.setState({ cardCvc: String(e.target.value).replace(/[^0-9]/g, '').slice(0, 4) }),
      onCardName: (e) => this.setState({ cardName: e.target.value }),
      cardError: !!cardErr, cardErrorText: cardErr, cardBoxBorder: cardErr ? '#f4022b' : '#282d36',
      paying: !!st.paying, payBtnBg: st.paying ? '#8f0e25' : '#f4022b', payBtnLabel: st.paying ? '處理中…' : ('支付 ' + 'HK$' + fmt(hkd)),
      payCard: () => {
        if (this.state.paying) return;
        if (cardProblem(this.state)) { this.setState({ cardTried: true }); return; }
        this.setState({ paying: true, cardTried: true });
        this._payT = setTimeout(() => {
          this.setState({ paying: false, payStep: 'done', doneMethod: '信用卡', extra: [{ coins: coins, hkd: hkd, time: '01/11/2026 21:20', status: 'approved', method: '信用卡' }].concat(this.state.extra) });
        }, 1400);
      },
      doneTitle: st.doneMethod === '信用卡' ? '付款成功' : '申請已提交',
      doneText: st.doneMethod === '信用卡' ? (fmt(coins) + ' 代幣已存入你的帳戶，可以即刻開抽。') : '我哋會盡快核對你的付款證明，審核後代幣會存入你的帳戶，可喺「我的代幣申請」查看進度。',
      doneIconBg: st.doneMethod === '信用卡' ? '#16a34a' : '#f4022b', doneGlow: st.doneMethod === '信用卡' ? 'rgba(34, 197, 94, 0.5)' : 'rgba(244, 2, 43, 0.5)',
      doneMethod: st.doneMethod
    };
  }

  renderVals() {
    return Object.assign(this._renderVals0(), this._langVals(), this._menuVals());
  }

  _menuVals() {
    const open = !!(this.state && this.state.menuOpen);
    return {
      menuOpen: open, sideCls: open ? 'ld-side-open' : '',
      toggleMenu: () => this.setState({ menuOpen: !(this.state && this.state.menuOpen) }),
      closeMenu: () => this.setState({ menuOpen: false })
    };
  }

  _langVals() {
    const LANGS = [
      { id: 'zh-HK', name: '繁體中文', short: '繁' },
      { id: 'en', name: 'English', short: 'EN' },
      { id: 'zh-CN', name: '简体中文', short: '简' },
      { id: 'ja', name: '日本語', short: '日' }
    ];
    const st = this.state || {};
    let cur = st.lang;
    if (!cur) { try { cur = window.localStorage.getItem('ld-lang') || 'zh-HK'; } catch (e) { cur = 'zh-HK'; } }
    const lang = LANGS.find((l) => l.id === cur) || LANGS[0];
    const open = !!st.langOpen;
    return {
      langOpen: open, langName: lang.name, langShort: lang.short,
      langChevron: open ? 'rotate(180deg)' : 'none', langBtnBg: open ? '#13161b' : 'transparent',
      toggleLang: () => this.setState({ langOpen: !(this.state && this.state.langOpen) }),
      langs: LANGS.map((l) => {
        const on = l.id === lang.id;
        return {
          name: l.name, short: l.short, on: on, bg: on ? '#181015' : 'transparent', weight: on ? '700' : '500',
          pick: () => { try { window.localStorage.setItem('ld-lang', l.id); } catch (e) {} this.setState({ lang: l.id, langOpen: false }); }
        };
      })
    };
  }
}

TopUpPage.prototype.template = function template(v) {
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
              <input type="number" inputMode="numeric" min="100" step="100" value={v.custom} onChange={v.onCustom} placeholder="最少 100" style={{flex: "1 1 auto", minWidth: "0", height: "100%", background: "transparent", border: "0", outline: "none", color: "#ffffff", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "700", fontSize: "22px"}} />{"\n            "}
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
          </svg>{"已提交申請，請於右邊「我的代幣申請」上載付款證明。"}
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
            <button type="button" style={{flex: "0 0 auto", height: "48px", padding: "0 18px", borderRadius: "4px", border: "1px solid #282d36", background: "#21252d", color: "#ffffff", fontSize: "16px", fontWeight: "700", cursor: "pointer"}}>{"套用"}</button>{"\n          "}
          </div>{"\n        "}
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
      <ul style={{listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column", gap: "10px"}}>{"\n        "}
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
              {r?.approved ? (<>{"\n                "}
                <a href="#" style={{display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "14px", fontWeight: "700", color: "#f4022b"}}>{"付款證明"}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 4h6v6M20 4l-9 9"></path>
                    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"></path>
                  </svg>
                </a>{"\n              "}
              </>) : null}{"\n              "}
              {r?.pending ? (<>{"\n                "}
                <button type="button" style={{display: "inline-flex", alignItems: "center", gap: "6px", height: "32px", padding: "0 12px", borderRadius: "4px", border: "0", background: "#f4022b", color: "#ffffff", fontSize: "13px", fontWeight: "700", cursor: "pointer"}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 16V4M7 9l5-5 5 5"></path>
                    <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"></path>
                  </svg>{"上載付款證明"}
                </button>{"\n              "}
              </>) : null}{"\n            "}
            </span>{"\n          "}
          </li>{"\n        "}
        </React.Fragment>))}{"\n      "}
      </ul>{"\n    "}
    </section>{"\n\n  "}
  </div>{"\n\n  "}
  <section id="vip" aria-labelledby="vip-title" style={{display: "flex", flexDirection: "column", gap: "24px", padding: "28px", borderRadius: "10px", border: "1px solid #3a2a00", background: "radial-gradient(60% 120% at 0% 0%, rgba(253, 200, 0, 0.1) 0%, rgba(253, 200, 0, 0) 60%), #05070a"}}>{"\n    "}
    <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px 24px"}}>{"\n      "}
      <div style={{display: "flex", flexDirection: "column", gap: "6px"}}>{"\n        "}
        <div style={{display: "flex", alignItems: "center", gap: "12px"}}>{"\n          "}
          <h2 id="vip-title" style={{margin: "0", fontFamily: "'Barlow Condensed', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "40px", lineHeight: "46px"}}>{"VIP 等級"}</h2>{"\n          "}
          <span style={{display: "inline-flex", alignItems: "center", height: "30px", padding: "0 12px", borderRadius: "4px", background: "#fdc800", color: "#1a1300", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "20px"}}>{"VIP1"}</span>{"\n        "}
        </div>{"\n        "}
        <p style={{margin: "0", fontSize: "15px", color: "#c3c8cd"}}>{"累積入金 "}
          <strong style={{color: "#ffffff"}}>{"HK$30,000"}</strong>{"・每次升級即送指定實體卡"}
        </p>{"\n      "}
      </div>{"\n      "}
      <div style={{display: "flex", flexDirection: "column", gap: "4px", padding: "16px 20px", borderRadius: "6px", border: "1px solid #3a2a00", background: "#1a1300", maxWidth: "100%"}}>{"\n        "}
        <span style={{fontSize: "13px", color: "#c3c8cd"}}>{"距離 VIP2"}</span>{"\n        "}
        <strong style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "30px", lineHeight: "34px", color: "#ffe390"}}>{"再入金 HK$10,000"}</strong>{"\n        "}
        <span style={{fontSize: "13px", color: "#c3c8cd"}}>{"升級即獲 0th CELEBRATION Premium Deck Set Espeon,Umbreon"}</span>{"\n      "}
      </div>{"\n    "}
    </div>{"\n\n    "}
    <ol style={{listStyle: "none", margin: "0", padding: "0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(170px, 100%), 1fr))", gap: "16px 12px"}}>{"\n\n      "}
      <li style={{display: "flex", flexDirection: "column", alignItems: "stretch", gap: "12px"}}>{"\n        "}
        <div aria-hidden="true" style={{position: "relative", display: "flex", justifyContent: "center", height: "56px"}}>{"\n          "}
          <span style={{position: "absolute", top: "26px", left: "50%", right: "-6px", height: "4px", background: "#fdc800"}}></span>{"\n          "}
          <span style={{position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "50px", height: "56px", background: "#ffffff", color: "#05070a", clipPath: "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "24px"}}>{"0"}</span>{"\n        "}
        </div>{"\n        "}
        <span style={{alignSelf: "center", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "13px", fontWeight: "700", color: "#ffe390"}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7.5"></path>
          </svg>{"已領取"}
        </span>{"\n        "}
        <div style={{flex: "1 1 auto", display: "flex", flexDirection: "column", gap: "8px", padding: "14px", borderRadius: "6px", border: "1px solid #282d36", background: "#0b0e12"}}>{"\n          "}
          <span aria-hidden="true" style={{display: "flex", alignItems: "center", justifyContent: "center", height: "96px", borderRadius: "4px", background: "#05070a"}}>
            <span style={{position: "relative", display: "block", width: "46px", aspectRatio: "5 / 8", borderRadius: "5px", overflow: "hidden", border: "1px solid #5a1222", background: "linear-gradient(160deg, #7a0c20 0%, #3a0812 45%, #0b0e12 100%)"}}>
              <img src="/revamp/images/logo-mark.png" alt="" style={{position: "absolute", left: "50%", top: "50%", width: "46%", transform: "translate(-50%, -50%)"}} />
            </span>
          </span>{"\n          "}
          <strong style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "800", fontSize: "20px", lineHeight: "22px"}}>{"VIP0"}</strong>{"\n          "}
          <span style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "22px", lineHeight: "24px", color: "#ffe390"}}>{"HK$3,000"}</span>{"\n          "}
          <span style={{fontSize: "13px", lineHeight: "18px", color: "#c3c8cd"}}>{"[M2a] MEGAドリームex Pack"}</span>{"\n          "}
          <span style={{marginTop: "auto", fontSize: "12px", lineHeight: "16px", color: "#a0a5ad"}}>{"已加入我的卡牌"}</span>{"\n        "}
        </div>{"\n      "}
      </li>{"\n\n      "}
      <li style={{display: "flex", flexDirection: "column", alignItems: "stretch", gap: "12px"}}>{"\n        "}
        <div aria-hidden="true" style={{position: "relative", display: "flex", justifyContent: "center", height: "56px"}}>{"\n          "}
          <span style={{position: "absolute", top: "26px", left: "-6px", right: "50%", height: "4px", background: "#fdc800"}}></span>{"\n          "}
          <span style={{position: "absolute", top: "26px", left: "50%", right: "-6px", height: "4px", background: "#fdc800"}}></span>{"\n          "}
          <span style={{position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "50px", height: "56px", background: "#ffffff", color: "#05070a", clipPath: "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "24px"}}>{"1"}</span>{"\n        "}
        </div>{"\n        "}
        <span style={{alignSelf: "center", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "13px", fontWeight: "700", color: "#ffe390"}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7.5"></path>
          </svg>{"已領取"}
        </span>{"\n        "}
        <div style={{flex: "1 1 auto", display: "flex", flexDirection: "column", gap: "8px", padding: "14px", borderRadius: "6px", border: "1px solid #282d36", background: "#0b0e12"}}>{"\n          "}
          <span aria-hidden="true" style={{display: "flex", alignItems: "center", justifyContent: "center", height: "96px", borderRadius: "4px", background: "#05070a"}}>
            <span style={{position: "relative", display: "block", width: "72px", aspectRatio: "4 / 3", borderRadius: "5px", overflow: "hidden", border: "1px solid #5a1222", background: "linear-gradient(160deg, #7a0c20 0%, #3a0812 50%, #0b0e12 100%)"}}>
              <span style={{position: "absolute", left: "0", right: "0", top: "0", height: "22%", background: "rgba(0, 0, 0, 0.3)", borderBottom: "1px solid rgba(255, 255, 255, 0.12)"}}></span>
              <img src="/revamp/images/logo-mark.png" alt="" style={{position: "absolute", left: "50%", top: "58%", width: "30%", transform: "translate(-50%, -50%)"}} />
            </span>
          </span>{"\n          "}
          <strong style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "800", fontSize: "20px", lineHeight: "22px"}}>{"VIP1"}</strong>{"\n          "}
          <span style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "22px", lineHeight: "24px", color: "#ffe390"}}>{"HK$15,000"}</span>{"\n          "}
          <span style={{fontSize: "13px", lineHeight: "18px", color: "#c3c8cd"}}>{"[M2a] MEGAドリームex"}</span>{"\n          "}
          <span style={{marginTop: "auto", fontSize: "12px", lineHeight: "16px", color: "#a0a5ad"}}>{"已加入我的卡牌"}</span>{"\n        "}
        </div>{"\n      "}
      </li>{"\n\n      "}
      <li style={{display: "flex", flexDirection: "column", alignItems: "stretch", gap: "12px"}}>{"\n        "}
        <div aria-hidden="true" style={{position: "relative", display: "flex", justifyContent: "center", height: "56px"}}>{"\n          "}
          <span style={{position: "absolute", top: "26px", left: "-6px", right: "50%", height: "4px", background: "linear-gradient(90deg, #fdc800 0%, #fdc800 20%, #282d36 20%, #282d36 100%)"}}></span>{"\n          "}
          <span style={{position: "absolute", top: "26px", left: "50%", right: "-6px", height: "4px", background: "#282d36"}}></span>{"\n          "}
          <span style={{position: "relative", display: "block", filter: "drop-shadow(0 0 10px rgba(244, 2, 43, 0.7))"}}>
            <span style={{display: "flex", alignItems: "center", justifyContent: "center", width: "50px", height: "56px", background: "#f4022b", color: "#ffffff", clipPath: "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "24px"}}>{"2"}</span>
          </span>{"\n        "}
        </div>{"\n        "}
        <span style={{alignSelf: "center", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontSize: "15px", fontWeight: "800", color: "#f4022b"}}>{"進度 60%"}</span>{"\n        "}
        <div style={{flex: "1 1 auto", display: "flex", flexDirection: "column", gap: "8px", padding: "14px", borderRadius: "6px", border: "1px solid #f4022b", background: "#181015", boxShadow: "0 0 0 2px #f4022b, 0 0 24px rgba(244, 2, 43, 0.35)"}}>{"\n          "}
          <span aria-hidden="true" style={{display: "flex", alignItems: "center", justifyContent: "center", height: "96px", borderRadius: "4px", background: "#05070a"}}>
            <span style={{position: "relative", display: "block", width: "72px", aspectRatio: "4 / 3", borderRadius: "5px", overflow: "hidden", border: "1px solid #5a1222", background: "linear-gradient(160deg, #8f0e25 0%, #3a0812 50%, #0b0e12 100%)"}}>
              <span style={{position: "absolute", left: "0", right: "0", top: "0", height: "22%", background: "rgba(0, 0, 0, 0.3)", borderBottom: "1px solid rgba(255, 255, 255, 0.12)"}}></span>
              <img src="/revamp/images/logo-mark.png" alt="" style={{position: "absolute", left: "50%", top: "58%", width: "30%", transform: "translate(-50%, -50%)"}} />
            </span>
          </span>{"\n          "}
          <strong style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "800", fontSize: "20px", lineHeight: "22px"}}>{"VIP2"}</strong>{"\n          "}
          <span style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "22px", lineHeight: "24px", color: "#ffe390"}}>{"HK$40,000"}</span>{"\n          "}
          <span style={{fontSize: "13px", lineHeight: "18px", color: "#c3c8cd"}}>{"0th CELEBRATION Premium Deck Set Espeon,Umbreon"}</span>{"\n          "}
          <span aria-hidden="true" style={{marginTop: "auto", display: "block", height: "6px", borderRadius: "999px", background: "#282d36", overflow: "hidden"}}>
            <span style={{display: "block", width: "60%", height: "100%", background: "#f4022b"}}></span>
          </span>{"\n        "}
        </div>{"\n      "}
      </li>{"\n\n      "}
      <li style={{display: "flex", flexDirection: "column", alignItems: "stretch", gap: "12px"}}>{"\n        "}
        <div aria-hidden="true" style={{position: "relative", display: "flex", justifyContent: "center", height: "56px"}}>{"\n          "}
          <span style={{position: "absolute", top: "26px", left: "-6px", right: "50%", height: "4px", background: "#282d36"}}></span>{"\n          "}
          <span style={{position: "absolute", top: "26px", left: "50%", right: "-6px", height: "4px", background: "#282d36"}}></span>{"\n          "}
          <span style={{position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "50px", height: "56px", background: "#21252d", color: "#a0a5ad", clipPath: "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "24px"}}>{"3"}</span>{"\n        "}
        </div>{"\n        "}
        <span style={{alignSelf: "center", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "13px", fontWeight: "700", color: "#a0a5ad"}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4.5" y="10.5" width="15" height="10" rx="2"></rect>
            <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"></path>
          </svg>{"未解鎖"}
        </span>{"\n        "}
        <div style={{flex: "1 1 auto", display: "flex", flexDirection: "column", gap: "8px", padding: "14px", borderRadius: "6px", border: "1px solid #282d36", background: "#0b0e12"}}>{"\n          "}
          <span aria-hidden="true" style={{display: "flex", alignItems: "center", justifyContent: "center", height: "96px", borderRadius: "4px", background: "#05070a"}}>
            <span style={{position: "relative", display: "block", width: "52px", aspectRatio: "63 / 88", borderRadius: "4px", overflow: "hidden", border: "1px solid #3a1018", background: "linear-gradient(150deg, #4a0511 0%, #1d0a10 55%, #0b0e12 100%)"}}>
              <img src="/revamp/images/logo-mark.png" alt="" style={{position: "absolute", left: "50%", top: "50%", width: "40%", transform: "translate(-50%, -50%)", opacity: "0.7"}} />
            </span>
          </span>{"\n          "}
          <strong style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "800", fontSize: "20px", lineHeight: "22px", color: "#c3c8cd"}}>{"VIP3"}</strong>{"\n          "}
          <span style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "22px", lineHeight: "24px", color: "#c3c8cd"}}>{"HK$100,000"}</span>{"\n          "}
          <span style={{fontSize: "13px", lineHeight: "18px", color: "#a0a5ad"}}>{"ピカチュウex [M2a 234/193]"}</span>{"\n        "}
        </div>{"\n      "}
      </li>{"\n\n      "}
      <li style={{display: "flex", flexDirection: "column", alignItems: "stretch", gap: "12px"}}>{"\n        "}
        <div aria-hidden="true" style={{position: "relative", display: "flex", justifyContent: "center", height: "56px"}}>{"\n          "}
          <span style={{position: "absolute", top: "26px", left: "-6px", right: "50%", height: "4px", background: "#282d36"}}></span>{"\n          "}
          <span style={{position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "50px", height: "56px", background: "#21252d", color: "#a0a5ad", clipPath: "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "24px"}}>{"4"}</span>{"\n        "}
        </div>{"\n        "}
        <span style={{alignSelf: "center", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "13px", fontWeight: "700", color: "#a0a5ad"}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4.5" y="10.5" width="15" height="10" rx="2"></rect>
            <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"></path>
          </svg>{"未解鎖"}
        </span>{"\n        "}
        <div style={{flex: "1 1 auto", display: "flex", flexDirection: "column", gap: "8px", padding: "14px", borderRadius: "6px", border: "1px solid #3a2a00", background: "#0b0e12"}}>{"\n          "}
          <span aria-hidden="true" style={{display: "flex", alignItems: "center", justifyContent: "center", height: "96px", borderRadius: "4px", background: "radial-gradient(60% 60% at 50% 55%, #2a2000 0%, #05070a 80%)"}}>
            <span style={{display: "flex", flexDirection: "column", gap: "3px", width: "54px", padding: "4px", borderRadius: "5px", border: "1px solid #3a404b", background: "linear-gradient(180deg, #2a2f38 0%, #13161b 100%)", boxShadow: "0 0 0 2px #fdc800, 0 0 18px rgba(253, 200, 0, 0.35)"}}>
              <span style={{display: "flex", alignItems: "center", justifyContent: "space-between", height: "12px", padding: "0 3px", borderRadius: "2px", background: "#05070a", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "8px", color: "#ffe390"}}>
                <span>{"PSA"}</span>
                <span style={{color: "#fdc800"}}>{"10"}</span>
              </span>
              <span style={{position: "relative", display: "block", aspectRatio: "63 / 88", borderRadius: "2px", overflow: "hidden", background: "linear-gradient(150deg, #5a0a18 0%, #1d0a10 55%, #0b0e12 100%)"}}>
                <img src="/revamp/images/logo-mark.png" alt="" style={{position: "absolute", left: "50%", top: "50%", width: "40%", transform: "translate(-50%, -50%)", opacity: "0.85"}} />
              </span>
            </span>
          </span>{"\n          "}
          <strong style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "800", fontSize: "20px", lineHeight: "22px", color: "#c3c8cd"}}>{"VIP4"}</strong>{"\n          "}
          <span style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "22px", lineHeight: "24px", color: "#c3c8cd"}}>{"HK$300,000"}</span>{"\n          "}
          <span style={{fontSize: "13px", lineHeight: "18px", color: "#a0a5ad"}}>{"[PSA10]メガリザードンXex [M2 110/080]"}</span>{"\n        "}
        </div>{"\n      "}
      </li>{"\n\n    "}
    </ol>{"\n  "}
  </section>
  {v.payOpen ? (<>
    <div style={{position: "fixed", top: "0", right: "0", bottom: "0", left: "0", zIndex: "50", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "56px 16px 24px", overflowY: "auto", background: "rgba(0, 0, 0, 0.72)"}}>{"\n  "}
      <section role="dialog" aria-modal="true" aria-labelledby="pay-title" style={{position: "relative", width: "100%", maxWidth: "640px", display: "flex", flexDirection: "column", gap: "18px", padding: "28px", borderRadius: "10px", border: "1px solid #282d36", background: "#0b0e12", boxShadow: "0 24px 60px rgba(0, 0, 0, 0.6)"}}>{"\n    "}
        <button type="button" onClick={v.closePay} aria-label="關閉" style={{position: "absolute", top: "20px", right: "20px", width: "44px", height: "44px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", cursor: "pointer"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18"></path>
          </svg>
        </button>{"\n\n    "}
        {v.payForm ? (<>{"\n    "}
          <div style={{display: "flex", flexDirection: "column", gap: "6px", paddingRight: "56px"}}>{"\n      "}
            <h2 id="pay-title" style={{margin: "0", fontSize: "28px", lineHeight: "36px", fontWeight: "900"}}>{"入金資料及付款"}</h2>{"\n      "}
            <p style={{margin: "0", fontSize: "15px", lineHeight: "22px", color: "#c3c8cd"}}>{"揀選付款方式。FPS 須上載付款證明並經人工審核；信用卡付款成功後代幣即時入賬。"}</p>{"\n    "}
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
          <div role="radiogroup" aria-label="付款方式" style={{display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px"}}>{"\n      "}
            {(Array.isArray(v.methods) ? v.methods : []).map((m, $index) => (<React.Fragment key={$index}>{"\n        "}
              <button type="button" role="radio" aria-checked={m?.on} onClick={m?.pick} style={{display: "flex", alignItems: "center", gap: "12px", minHeight: "64px", padding: "10px 14px", textAlign: "left", borderRadius: "6px", border: `1px solid ${asset(m?.border) ?? ''}`, background: `${asset(m?.bg) ?? ''}`, boxShadow: `${asset(m?.glow) ?? ''}`, color: "#ffffff", cursor: "pointer"}}>{"\n          "}
                <span aria-hidden="true" style={{flex: "0 0 auto", width: "20px", height: "20px", borderRadius: "999px", border: `2px solid ${asset(m?.dotBorder) ?? ''}`, boxShadow: "inset 0 0 0 4px #0b0e12", background: `${asset(m?.dot) ?? ''}`}}></span>{"\n          "}
                <span style={{display: "flex", flexDirection: "column"}}>
                  <strong style={{fontSize: "16px", lineHeight: "22px"}}>{m?.label}</strong>
                  <span style={{fontSize: "12px", lineHeight: "16px", color: "#a0a5ad"}}>{m?.sub}</span>
                </span>{"\n        "}
              </button>{"\n      "}
            </React.Fragment>))}{"\n    "}
          </div>{"\n\n    "}
          {v.isFps ? (<>{"\n    "}
            <div style={{display: "flex", flexDirection: "column", gap: "16px"}}>{"\n      "}
              <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px 24px", padding: "18px 20px", borderRadius: "6px", border: "1px solid #282d36", background: "#05070a"}}>{"\n        "}
                <div style={{flex: "1 1 140px", display: "flex", flexDirection: "column", gap: "2px"}}>
                  <span style={{fontSize: "14px", color: "#c3c8cd"}}>{"平台 FPS 識別碼"}</span>
                  <strong style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "24px", lineHeight: "28px", letterSpacing: "0.04em"}}>{"122833403"}</strong>
                </div>{"\n        "}
                <div style={{flex: "1 1 140px", display: "flex", flexDirection: "column", gap: "2px"}}>
                  <span style={{fontSize: "14px", color: "#c3c8cd"}}>{"收款人姓名"}</span>
                  <strong style={{fontSize: "17px", lineHeight: "28px"}}>{"MARS C**** C****"}</strong>
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
              <button type="button" onClick={v.submitFps} disabled={v.fpsDisabled} style={{display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", height: "56px", borderRadius: "4px", border: "0", background: `${asset(v.fpsBtnBg) ?? ''}`, color: `${asset(v.fpsBtnColor) ?? ''}`, fontSize: "18px", fontWeight: "900", cursor: "pointer"}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 16V4M7 9l5-5 5 5"></path>
                  <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"></path>
                </svg>{"上載並提交申請"}
              </button>{"\n    "}
            </div>{"\n    "}
          </>) : null}{"\n\n    "}
          {v.isCard ? (<>{"\n    "}
            <div style={{display: "flex", flexDirection: "column", gap: "14px"}}>{"\n      "}
              <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "8px"}}>{"\n        "}
                <span style={{fontSize: "16px", fontWeight: "700"}}>{"信用卡資料"}</span>{"\n      "}
              </div>{"\n      "}
              <div style={{display: "flex", flexDirection: "column", borderRadius: "6px", border: `1px solid ${asset(v.cardBoxBorder) ?? ''}`, background: "#05070a", overflow: "hidden"}}>{"\n        "}
                <label style={{display: "flex", alignItems: "center", gap: "10px", height: "52px", padding: "0 14px", borderBottom: "1px solid #282d36"}}>{"\n          "}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a0a5ad" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="2.5" y="5" width="19" height="14" rx="2"></rect>
                    <path d="M2.5 10h19"></path>
                  </svg>{"\n          "}
                  <input type="text" inputMode="numeric" autoComplete="cc-number" aria-label="卡號" placeholder="1234 1234 1234 1234" value={v.cardNo} onChange={v.onCardNo} style={{flex: "1 1 auto", minWidth: "0", height: "100%", background: "transparent", border: "0", outline: "none", color: "#ffffff", fontSize: "16px", letterSpacing: "0.06em"}} />{"\n        "}
                </label>{"\n        "}
                <div style={{display: "flex"}}>{"\n          "}
                  <input type="text" inputMode="numeric" autoComplete="cc-exp" aria-label="到期日（月/年）" placeholder="MM / YY" value={v.cardExp} onChange={v.onCardExp} style={{flex: "1 1 50%", minWidth: "0", height: "52px", padding: "0 14px", background: "transparent", border: "0", borderRight: "1px solid #282d36", outline: "none", color: "#ffffff", fontSize: "16px"}} />{"\n          "}
                  <input type="text" inputMode="numeric" autoComplete="cc-csc" aria-label="安全碼 CVC" placeholder="CVC" value={v.cardCvc} onChange={v.onCardCvc} style={{flex: "1 1 50%", minWidth: "0", height: "52px", padding: "0 14px", background: "transparent", border: "0", outline: "none", color: "#ffffff", fontSize: "16px"}} />{"\n        "}
                </div>{"\n      "}
              </div>{"\n      "}
              <label style={{display: "flex", flexDirection: "column", gap: "6px"}}>{"\n        "}
                <span style={{fontSize: "14px", fontWeight: "700", color: "#c3c8cd"}}>{"持卡人姓名"}</span>{"\n        "}
                <input type="text" autoComplete="cc-name" placeholder="與信用卡上相同" value={v.cardName} onChange={v.onCardName} style={{height: "52px", padding: "0 14px", borderRadius: "6px", border: "1px solid #282d36", background: "#05070a", outline: "none", color: "#ffffff", fontSize: "16px"}} />{"\n      "}
              </label>{"\n      "}
              {v.cardError ? (<>
                <span role="alert" style={{fontSize: "14px", color: "#ffd7c1"}}>{v.cardErrorText}</span>
              </>) : null}{"\n      "}
              <span style={{fontSize: "12px", lineHeight: "18px", color: "#6b767f"}}>{"示範：可輸入 4242 4242 4242 4242、任何未來到期日及 3 位 CVC"}</span>{"\n      "}
              <button type="button" onClick={v.payCard} disabled={v.paying} style={{display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", height: "56px", borderRadius: "4px", border: "0", background: `${asset(v.payBtnBg) ?? ''}`, color: "#ffffff", fontSize: "18px", fontWeight: "900", cursor: "pointer"}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="5" y="11" width="14" height="9" rx="2"></rect>
                  <path d="M8 11V8a4 4 0 0 1 8 0v3"></path>
                </svg>{v.payBtnLabel}
              </button>{"\n      "}
              <span style={{display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "13px", lineHeight: "18px", color: "#a0a5ad", textAlign: "center"}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z"></path>
                </svg>{"付款由 Stripe 加密處理，LiveDraw 不會儲存你的信用卡資料"}
              </span>{"\n    "}
            </div>{"\n    "}
          </>) : null}{"\n    "}
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
</main>
</>);
};

export default TopUpPage;
