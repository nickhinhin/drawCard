/* eslint-disable */
// Generated from the LiveDraw revamp design (Account.html); logic kept as designed.
import React from "react";
import { DCLogic, route, asset } from "../runtime.jsx";

export const CSS = "\nbody{margin:0;background:#0b0e12}\n*{box-sizing:border-box}\na{color:#ffffff;text-decoration:none}a:hover{color:#ffe390}\nbutton,input,textarea{font-family:inherit}\nbutton:disabled{cursor:not-allowed}\n:focus-visible{outline:2px solid #f4022b;outline-offset:2px}\ninput::placeholder,textarea::placeholder{color:#6b767f}\n.ld-nav{transition:background-color 150ms,color 150ms}\n.ld-nav:hover{background-color:#13161b !important;color:#ffffff !important}\n.ld-field:focus{border-color:#f4022b !important;outline:none}\n.ld-link:hover{color:#ffffff !important}\n@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none !important;transition:none !important}}\n\n.ld-menubtn,.ld-tabbar,.ld-drawer-close,.ld-backdrop{display:none}\n@media (max-width:760px){\n.ld-root{padding-bottom:68px}\n.ld-header{padding:8px 12px !important;gap:8px !important;flex-wrap:nowrap !important;position:sticky;top:0;z-index:40}\n.ld-search,.ld-hide-m,.ld-uname{display:none !important}\n.ld-logo{width:auto !important;flex:1 1 auto !important;min-width:0}\n.ld-logo img{width:104px !important;height:auto !important}\n.ld-tools{gap:6px !important;flex-wrap:nowrap !important}\n.ld-tools > a,.ld-tools > button,.ld-tools > span > button{height:38px !important}\n.ld-menubtn{display:flex !important}\n.ld-main h1{font-size:34px !important;line-height:40px !important}\n.ld-tools > a:first-child > span:last-child,.ld-tools > span > button > span{display:none !important}\n.ld-logo{min-width:96px !important}\n.ld-bleed{margin:-12px -12px 0 !important}\n.ld-tools > span > button{padding:0 8px !important;gap:4px !important}\n.ld-tools > span > button > svg:last-child{display:none}\n.ld-tools > button{width:38px !important}\n.ld-tools > a:last-child{padding:0 3px !important;border:0 !important}\n.ld-tools > a:first-child{padding:0 4px 0 8px !important;gap:5px !important;font-size:17px !important}\n.ld-side{display:none !important}\n.ld-side.ld-side-open{display:flex !important;position:fixed;top:0;left:0;bottom:0;width:min(300px,84vw);z-index:80;overflow-y:auto;box-shadow:12px 0 40px rgba(0,0,0,.6)}\n.ld-side.ld-side-open .ld-drawer-close{display:flex !important}\n.ld-backdrop{display:block !important;position:fixed;top:0;right:0;bottom:0;left:0;z-index:79;border:0;background:rgba(0,0,0,.6)}\n.ld-main{padding:12px !important;gap:12px !important}\n.ld-footer{padding:24px 16px 20px !important;gap:16px !important}\n.ld-tabbar{display:flex !important;position:fixed;left:0;right:0;bottom:0;z-index:60;height:64px;background:#080b0e;border-top:1px solid #282d36}\n}\n";

class AccountPage extends DCLogic {
  constructor(...args) {
    super(...args);
    this.state = { name: 'Toothpick', saved: 'Toothpick', nameSaved: false, pwCur: '', pwNew: '', pwAgain: '', pwSaved: false, contact: '+852 XXXX XXXX', msg: '', affDone: false };
  }

  _renderVals0() {
    const st = this.state;
    const trimmed = (st.name || '').trim();
    const nameUnchanged = !trimmed || trimmed === st.saved;
    const pw = st.pwNew || '';
    const rules = [
      { label: '最少 8 個字元', ok: pw.length >= 8 },
      { label: '包含英文字母', ok: /[A-Za-z]/.test(pw) },
      { label: '包含數字', ok: /[0-9]/.test(pw) },
      { label: '兩次輸入一致', ok: pw.length > 0 && pw === st.pwAgain }
    ].map((r) => ({ label: r.label, ok: r.ok, notOk: !r.ok, color: r.ok ? '#ffffff' : '#a0a5ad' }));
    const pwInvalid = !st.pwCur || rules.some((r) => !r.ok);
    return {
      initial: (st.saved || 'T').charAt(0).toUpperCase(),
      savedName: st.saved,
      name: st.name,
      onName: (e) => this.setState({ name: e.target.value, nameSaved: false }),
      nameUnchanged: nameUnchanged,
      saveName: () => { const v = (this.state.name || '').trim(); if (v && v !== this.state.saved) this.setState({ saved: v, name: v, nameSaved: true }); },
      nameSaved: st.nameSaved,
      nameBtnBg: nameUnchanged ? '#13161b' : '#f4022b',
      nameBtnBorder: nameUnchanged ? '#282d36' : '#f4022b',
      nameBtnColor: nameUnchanged ? '#a0a5ad' : '#ffffff',
      pwCur: st.pwCur, pwNew: st.pwNew, pwAgain: st.pwAgain,
      onPwCur: (e) => this.setState({ pwCur: e.target.value, pwSaved: false }),
      onPwNew: (e) => this.setState({ pwNew: e.target.value, pwSaved: false }),
      onPwAgain: (e) => this.setState({ pwAgain: e.target.value, pwSaved: false }),
      rules: rules,
      pwInvalid: pwInvalid,
      pwBtnBg: pwInvalid ? '#21252d' : '#f4022b',
      pwBtnColor: pwInvalid ? '#a0a5ad' : '#ffffff',
      pwBtnGlow: pwInvalid ? 'none' : '0 6px 20px rgba(244, 2, 43, 0.35)',
      savePw: () => { this.setState({ pwCur: '', pwNew: '', pwAgain: '', pwSaved: true }); },
      pwSaved: st.pwSaved,
      contact: st.contact, onContact: (e) => this.setState({ contact: e.target.value }),
      msg: st.msg, onMsg: (e) => this.setState({ msg: e.target.value }),
      applyAff: () => this.setState({ affDone: true }),
      affDone: st.affDone,
      affLabel: st.affDone ? '已提交申請' : '申請邀請連結',
      affBg: st.affDone ? '#21252d' : '#f4022b',
      affColor: st.affDone ? '#a0a5ad' : '#ffffff'
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

AccountPage.prototype.template = function template(v) {
  return (<>
<style>{CSS}</style>

<main className="ld-main" style={{flex: "999 1 560px", minWidth: "0", display: "flex", flexDirection: "column", gap: "24px", padding: "24px"}}>{"\n\n  "}
  <section aria-labelledby="acc-title" style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "20px 28px", padding: "28px 32px", borderRadius: "10px", border: "1px solid #14181d", background: "radial-gradient(60% 140% at 100% 0%, rgba(244, 2, 43, 0.16) 0%, rgba(244, 2, 43, 0) 60%), #05070a"}}>{"\n    "}
    <span aria-hidden="true" style={{flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", width: "84px", height: "84px", borderRadius: "999px", background: "#4a0511", border: "2px solid #f4022b", boxShadow: "0 0 24px rgba(244, 2, 43, 0.35)", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "40px"}}>{v.initial}</span>{"\n    "}
    <div style={{flex: "1 1 280px", display: "flex", flexDirection: "column", gap: "4px"}}>{"\n      "}
      <span style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "800", fontSize: "15px", letterSpacing: "0.08em", color: "#f4022b"}}>{"ACCOUNT"}</span>{"\n      "}
      <h1 id="acc-title" style={{margin: "0", fontFamily: "'Barlow Condensed', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "40px", lineHeight: "46px"}}>{"帳戶設定"}</h1>{"\n      "}
      <span style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 14px", fontSize: "15px", color: "#c3c8cd"}}>
        <strong style={{color: "#ffffff"}}>{v.savedName}</strong>
        <span>{"+852 XXXX XXXX"}</span>
        <span style={{display: "inline-flex", alignItems: "center", height: "24px", padding: "0 8px", borderRadius: "4px", background: "#fdc800", color: "#1a1300", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "15px"}}>{"VIP1"}</span>
      </span>{"\n    "}
    </div>{"\n    "}
    <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px"}}>{"\n      "}
      <span style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "48px", padding: "0 16px", borderRadius: "4px", border: "1px solid #3a2a00", background: "#1a1300", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "22px", color: "#ffe390"}}>
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10.5" fill="#fdc800" stroke="#f88f00" strokeWidth="2"></circle>
          <path d="M13.4 5.2 7.9 13h3.9l-1.2 5.8 5.6-8h-4z" fill="#f88f00"></path>
        </svg>{"4,036"}
      </span>{"\n      "}
      <button type="button" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "48px", padding: "0 18px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "16px", fontWeight: "700", cursor: "pointer"}}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5"></path>
          <path d="M15 8l4 4-4 4M19 12H9"></path>
        </svg>{"登出"}
      </button>{"\n    "}
    </div>{"\n  "}
  </section>{"\n\n  "}
  <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(400px, 100%), 1fr))", gap: "24px", alignItems: "start"}}>{"\n\n    "}
    <section aria-labelledby="name-title" style={{display: "flex", flexDirection: "column", gap: "14px", padding: "24px", borderRadius: "10px", border: "1px solid #14181d", background: "#05070a"}}>{"\n      "}
      <h2 id="name-title" style={{margin: "0", fontSize: "20px", lineHeight: "28px", fontWeight: "700"}}>{"玩家名稱"}</h2>{"\n      "}
      <label style={{display: "flex", flexDirection: "column", gap: "8px"}}>{"\n        "}
        <span style={{fontSize: "14px", fontWeight: "700", color: "#c3c8cd"}}>{"名稱"}</span>{"\n        "}
        <input className="ld-field" type="text" value={v.name} onChange={v.onName} maxLength="20" style={{height: "52px", padding: "0 16px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "17px", fontWeight: "700"}} />{"\n      "}
      </label>{"\n      "}
      <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px"}}>{"\n        "}
        <button type="button" onClick={v.saveName} disabled={v.nameUnchanged} style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "48px", padding: "0 18px", borderRadius: "4px", border: `1px solid ${asset(v.nameBtnBorder) ?? ''}`, background: `${asset(v.nameBtnBg) ?? ''}`, color: `${asset(v.nameBtnColor) ?? ''}`, fontSize: "16px", fontWeight: "700"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 20h4L19 9l-4-4L4 16z"></path>
            <path d="m13.5 6.5 4 4"></path>
          </svg>{"更改名稱"}
        </button>{"\n        "}
        {v.nameSaved ? (<>
          <span role="status" style={{display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "14px", color: "#ffe390"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m5 12.5 4.5 4.5L19 7.5"></path>
            </svg>{"名稱已更新"}
          </span>
        </>) : null}{"\n      "}
      </div>{"\n    "}
    </section>{"\n\n    "}
    <section aria-labelledby="pw-title" style={{display: "flex", flexDirection: "column", gap: "14px", padding: "24px", borderRadius: "10px", border: "1px solid #14181d", background: "#05070a"}}>{"\n      "}
      <div style={{display: "flex", flexDirection: "column", gap: "4px"}}>{"\n        "}
        <h2 id="pw-title" style={{margin: "0", fontSize: "20px", lineHeight: "28px", fontWeight: "700"}}>{"更改登入密碼"}</h2>{"\n      "}
      </div>{"\n      "}
      <label style={{display: "flex", flexDirection: "column", gap: "8px"}}>{"\n        "}
        <span style={{fontSize: "14px", fontWeight: "700", color: "#c3c8cd"}}>{"現有密碼"}</span>{"\n        "}
        <input className="ld-field" type="password" autoComplete="current-password" value={v.pwCur} onChange={v.onPwCur} style={{height: "52px", padding: "0 16px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "17px"}} />{"\n      "}
      </label>{"\n      "}
      <label style={{display: "flex", flexDirection: "column", gap: "8px"}}>{"\n        "}
        <span style={{fontSize: "14px", fontWeight: "700", color: "#c3c8cd"}}>{"新密碼"}</span>{"\n        "}
        <input className="ld-field" type="password" autoComplete="new-password" value={v.pwNew} onChange={v.onPwNew} placeholder="最少 8 個字元，須包含英文字母及數字" style={{height: "52px", padding: "0 16px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "17px"}} />{"\n      "}
      </label>{"\n      "}
      <label style={{display: "flex", flexDirection: "column", gap: "8px"}}>{"\n        "}
        <span style={{fontSize: "14px", fontWeight: "700", color: "#c3c8cd"}}>{"再輸入一次新密碼"}</span>{"\n        "}
        <input className="ld-field" type="password" autoComplete="new-password" value={v.pwAgain} onChange={v.onPwAgain} style={{height: "52px", padding: "0 16px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "17px"}} />{"\n      "}
      </label>{"\n      "}
      <ul aria-label="密碼要求" style={{listStyle: "none", margin: "0", padding: "0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))", gap: "6px 12px", fontSize: "13px", lineHeight: "18px"}}>{"\n        "}
        {(Array.isArray(v.rules) ? v.rules : []).map((r, $index) => (<React.Fragment key={$index}>{"\n          "}
          <li style={{display: "flex", alignItems: "center", gap: "6px", color: `${asset(r?.color) ?? ''}`}}>{"\n            "}
            {r?.ok ? (<>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fdc800" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m5 12.5 4.5 4.5L19 7.5"></path>
              </svg>
            </>) : null}{"\n            "}
            {r?.notOk ? (<>
              <span aria-hidden="true" style={{width: "14px", height: "14px", display: "inline-flex", alignItems: "center", justifyContent: "center"}}>
                <span style={{width: "6px", height: "6px", borderRadius: "999px", background: "#6b767f"}}></span>
              </span>
            </>) : null}{"\n            "}{r?.label}{"\n          "}
          </li>{"\n        "}
        </React.Fragment>))}{"\n      "}
      </ul>{"\n      "}
      <button type="button" onClick={v.savePw} disabled={v.pwInvalid} style={{display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", height: "52px", borderRadius: "4px", border: "0", background: `${asset(v.pwBtnBg) ?? ''}`, color: `${asset(v.pwBtnColor) ?? ''}`, boxShadow: `${asset(v.pwBtnGlow) ?? ''}`, fontSize: "17px", fontWeight: "700"}}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4.5" y="10.5" width="15" height="10" rx="2"></rect>
          <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"></path>
        </svg>{"更新密碼"}
      </button>{"\n      "}
      {v.pwSaved ? (<>
        <span role="status" style={{display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "14px", color: "#ffe390"}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7.5"></path>
          </svg>{"密碼已更新，下次登入請使用新密碼。"}
        </span>
      </>) : null}{"\n    "}
    </section>{"\n\n  "}
  </div>{"\n\n  "}
  <section aria-labelledby="aff-title" style={{display: "flex", flexWrap: "wrap", gap: "24px", padding: "24px", borderRadius: "10px", border: "1px solid #3a2a00", background: "radial-gradient(60% 120% at 0% 0%, rgba(253, 200, 0, 0.08) 0%, rgba(253, 200, 0, 0) 60%), #05070a"}}>{"\n    "}
    <div style={{flex: "1 1 260px", display: "flex", flexDirection: "column", gap: "10px"}}>{"\n      "}
      <span aria-hidden="true" style={{display: "flex", alignItems: "center", justifyContent: "center", width: "48px", height: "48px", borderRadius: "10px", border: "1px solid #3a2a00", background: "#1a1300", color: "#fdc800"}}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"></path>
          <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"></path>
        </svg>
      </span>{"\n      "}
      <h2 id="aff-title" style={{margin: "0", fontFamily: "'Barlow Condensed', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "30px", lineHeight: "34px"}}>{"邀請朋友計劃"}</h2>{"\n      "}
      <p style={{margin: "0", fontSize: "14px", lineHeight: "22px", color: "#c3c8cd"}}>{"申請獲管理員批准後，系統先會發出及啟用你的專屬連結。"}</p>{"\n    "}
    </div>{"\n    "}
    <div style={{flex: "2 1 420px", display: "flex", flexDirection: "column", gap: "14px"}}>{"\n      "}
      <label style={{display: "flex", flexDirection: "column", gap: "8px"}}>{"\n        "}
        <span style={{fontSize: "14px", fontWeight: "700", color: "#c3c8cd"}}>{"聯絡資料"}</span>{"\n        "}
        <input className="ld-field" type="text" value={v.contact} onChange={v.onContact} style={{height: "52px", padding: "0 16px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "16px", fontWeight: "700"}} />{"\n      "}
      </label>{"\n      "}
      <label style={{display: "flex", flexDirection: "column", gap: "8px"}}>{"\n        "}
        <span style={{fontSize: "14px", fontWeight: "700", color: "#c3c8cd"}}>{"留言"}</span>{"\n        "}
        <textarea className="ld-field" rows="4" value={v.msg} onChange={v.onMsg} placeholder="簡單介紹自己、推廣渠道或合作方式" style={{minHeight: "112px", padding: "14px 16px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "16px", lineHeight: "24px", resize: "vertical"}} />{"\n      "}
      </label>{"\n      "}
      <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px"}}>{"\n        "}
        <button type="button" onClick={v.applyAff} disabled={v.affDone} style={{display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", flex: "1 1 240px", height: "52px", borderRadius: "4px", border: "0", background: `${asset(v.affBg) ?? ''}`, color: `${asset(v.affColor) ?? ''}`, fontSize: "17px", fontWeight: "700"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 3 10 14"></path>
            <path d="M21 3 14.5 21l-4.5-7-7-4.5z"></path>
          </svg>{v.affLabel}
        </button>{"\n        "}
        {v.affDone ? (<>
          <span role="status" style={{flex: "1 1 240px", fontSize: "14px", lineHeight: "22px", color: "#ffe390"}}>{"已提交申請，管理員批准後會發出你的專屬連結。"}</span>
        </>) : null}{"\n      "}
      </div>{"\n    "}
    </div>{"\n  "}
  </section>
</main>
</>);
};

export default AccountPage;
