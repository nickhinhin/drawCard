/* eslint-disable */
// Generated from the LiveDraw revamp design (ResultDetail.html); logic kept as designed.
import React from "react";
import { DCLogic, route, asset } from "../runtime.jsx";

export const CSS = "\nbody{margin:0;background:#0b0e12}\n*{box-sizing:border-box}\na{color:#ffffff;text-decoration:none}a:hover{color:#ffe390}\nbutton,input,textarea{font-family:inherit}\n:focus-visible{outline:2px solid #f4022b;outline-offset:2px}\ninput::placeholder,textarea::placeholder{color:#6b767f}\n.ld-nav{transition:background-color 150ms,color 150ms}\n.ld-nav:hover{background-color:#13161b !important;color:#ffffff !important}\n.ld-lift{transition:border-color 150ms,box-shadow 150ms}\n.ld-lift:hover{border-color:#6b767f !important}\n.ld-link:hover{color:#ffffff !important}\n@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none !important;transition:none !important}}\n\n.ld-menubtn,.ld-tabbar,.ld-drawer-close,.ld-backdrop{display:none}\n@media (max-width:760px){\n.ld-root{padding-bottom:68px}\n.ld-header{padding:8px 12px !important;gap:8px !important;flex-wrap:nowrap !important;position:sticky;top:0;z-index:40}\n.ld-search,.ld-hide-m,.ld-uname{display:none !important}\n.ld-logo{width:auto !important;flex:1 1 auto !important;min-width:0}\n.ld-logo img{width:104px !important;height:auto !important}\n.ld-tools{gap:6px !important;flex-wrap:nowrap !important}\n.ld-tools > a,.ld-tools > button,.ld-tools > span > button{height:38px !important}\n.ld-menubtn{display:flex !important}\n.ld-main h1{font-size:34px !important;line-height:40px !important}\n.ld-rgrid{grid-template-columns:repeat(4,minmax(0,1fr)) !important;gap:8px !important}\n.ld-tools > a:first-child > span:last-child,.ld-tools > span > button > span{display:none !important}\n.ld-logo{min-width:96px !important}\n.ld-bleed{margin:-12px -12px 0 !important}\n.ld-tools > span > button{padding:0 8px !important;gap:4px !important}\n.ld-tools > span > button > svg:last-child{display:none}\n.ld-tools > button{width:38px !important}\n.ld-tools > a:last-child{padding:0 3px !important;border:0 !important}\n.ld-tools > a:first-child{padding:0 4px 0 8px !important;gap:5px !important;font-size:17px !important}\n.ld-side{display:none !important}\n.ld-side.ld-side-open{display:flex !important;position:fixed;top:0;left:0;bottom:0;width:min(300px,84vw);z-index:80;overflow-y:auto;box-shadow:12px 0 40px rgba(0,0,0,.6)}\n.ld-side.ld-side-open .ld-drawer-close{display:flex !important}\n.ld-backdrop{display:block !important;position:fixed;top:0;right:0;bottom:0;left:0;z-index:79;border:0;background:rgba(0,0,0,.6)}\n.ld-main{padding:12px !important;gap:12px !important}\n.ld-footer{padding:24px 16px 20px !important;gap:16px !important}\n.ld-tabbar{display:flex !important;position:fixed;left:0;right:0;bottom:0;z-index:60;height:64px;background:#080b0e;border-top:1px solid #282d36}\n}\n";

class ResultDetailPage extends DCLogic {
  constructor(...args) {
    super(...args);
    this.state = { sel: 1 };
  }

  data() {
    if (this._d) return this._d;
    const names = ['Kay', 'Chris', 'Pokechu', 'VIP', 'Lok', 'Amy', 'Cheng'];
    const shuffle = (arr, next) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
      }
      return a;
    };
    const all = [];
    for (let n = 1; n <= 20; n++) all.push(n);
    const sessions = [];
    for (let i = 0; i < 20; i++) {
      const n = i + 1;
      const t = 20 * 60 + 30 + i * 5;
      const mm = t % 60;
      const time = Math.floor(t / 60) + ':' + (mm < 10 ? '0' + mm : String(mm));
      const half = n % 2 === 1;
      const k = half ? 10 : 2;
      let picks = {};
      if (n === 1) {
        picks = { 3: ['VIP', false], 5: ['Pokechu', true], 8: ['Kay', true], 10: ['Chris', true], 11: ['Kay', false], 12: ['VIP', false], 15: ['VIP', true], 18: ['Pokechu', false] };
      } else if (n < 19) {
        let s = 1000 + n * 97;
        const next = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
        const heaven = shuffle(all, next).slice(0, k);
        const count = 4 + Math.floor(next() * 6);
        shuffle(all, next).slice(0, count).forEach((num) => {
          picks[num] = [names[Math.floor(next() * names.length)], heaven.indexOf(num) !== -1];
        });
        if (n === 17) picks[17] = ['Toothpick', true];
        if (n === 12) picks[12] = ['Toothpick', false];
        if (n === 11) picks[6] = ['Toothpick', false];
      }
      sessions.push({ n: n, label: '第 ' + n + ' 場', time: time, odds: half ? '二份之一' : '十分之一', k: k, picks: picks });
    }
    this._d = { sessions: sessions };
    return this._d;
  }

  _renderVals0() {
    const d = this.data();
    const cur = d.sessions[this.state.sel - 1] || d.sessions[0];
    const sessionCards = d.sessions.map((s) => {
      const on = s.n === cur.n;
      const cnt = Object.keys(s.picks).length;
      return {
        label: s.label, time: s.time, odds: s.odds, pressed: on,
        pickedText: cnt ? (cnt + ' / 20 已被購買') : '未有選號',
        pick: () => this.setState({ sel: s.n }),
        border: on ? '#f4022b' : '#282d36', bg: on ? '#181015' : '#0b0e12',
        glow: on ? '0 0 0 2px #f4022b, 0 0 24px rgba(244, 2, 43, 0.35)' : 'none', cls: on ? '' : 'ld-lift'
      };
    });
    const tiles = [];
    const heavenL = [];
    const hellL = [];
    for (let n = 1; n <= 20; n++) {
      const p = cur.picks[n];
      if (p) {
        const h = p[1];
        (h ? heavenL : hellL).push('#' + n + ' ' + p[0]);
        tiles.push({
          n: n, picked: true, notPicked: false, who: p[0], outcome: h ? '天堂' : '地獄',
          aria: '號碼 ' + n + '：' + (h ? '天堂' : '地獄') + '，' + p[0],
          bg: h ? '#041737' : '#2a0710', border: h ? '#4fb3ff' : '#ae031d',
          glow: h ? '0 0 16px rgba(79, 179, 255, 0.25)' : 'none',
          color: h ? '#c2ebff' : '#ffd7c1', subColor: h ? '#c2ebff' : '#ffd7c1', dot: h ? '#4fb3ff' : '#f4022b'
        });
      } else {
        tiles.push({ n: n, picked: false, notPicked: true, who: '', outcome: '', aria: '號碼 ' + n + '：未選', bg: '#0b0e12', border: '#282d36', glow: 'none', color: '#ffffff', subColor: '#a0a5ad', dot: 'transparent' });
      }
    }
    const pickedCount = heavenL.length + hellL.length;
    return {
      sessionCards: sessionCards, tiles: tiles,
      sessionLabel: cur.label, sessionTime: cur.time, sessionOdds: cur.odds, sessionHeaven: cur.k,
      pickedCount: pickedCount, hasResult: pickedCount > 0, noResult: pickedCount === 0,
      heavenCount: heavenL.length, hellCount: hellL.length,
      heavenList: heavenL.length ? heavenL.join('、') : (pickedCount ? '本場未有天堂號碼被選中' : '本場未有玩家選號'),
      hellList: hellL.length ? hellL.join('、') : (pickedCount ? '本場未有地獄號碼被選中' : '本場未有玩家選號')
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

ResultDetailPage.prototype.template = function template(v) {
  return (<>
<style>{CSS}</style>

<main className="ld-main" style={{flex: "999 1 560px", minWidth: "0", display: "flex", flexDirection: "column", gap: "24px", padding: "24px"}}>{"\n\n  "}
  <a href="/beta/results" style={{alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 16px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "15px", fontWeight: "700"}}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 6-6 6 6 6"></path>
    </svg>{"返回過往直播及賽果"}
  </a>{"\n\n  "}
  <section aria-labelledby="detail-title" style={{display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "16px 24px", padding: "28px 32px", borderRadius: "10px", border: "1px solid #14181d", background: "radial-gradient(60% 140% at 100% 0%, rgba(244, 2, 43, 0.18) 0%, rgba(244, 2, 43, 0) 60%), #05070a"}}>{"\n    "}
    <div style={{flex: "1 1 360px", display: "flex", flexDirection: "column", gap: "8px"}}>{"\n      "}
      <span style={{display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: "6px", height: "24px", padding: "0 8px", borderRadius: "4px", background: "#21252d", color: "#ffffff", fontSize: "12px", fontWeight: "700"}}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4.5" y="10.5" width="15" height="10" rx="2"></rect>
          <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"></path>
        </svg>{"已封存直播"}
      </span>{"\n      "}
      <h1 id="detail-title" style={{margin: "0", fontFamily: "'Barlow Condensed', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "52px", lineHeight: "56px"}}>{"28/10 LiveDraw 直播"}</h1>{"\n    "}
    </div>{"\n    "}
    <span style={{display: "inline-flex", flexDirection: "column", alignItems: "center", padding: "8px 18px", borderRadius: "999px", background: "#ffffff", color: "#05070a", lineHeight: "20px"}}>
      <strong style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontSize: "17px"}}>{"28/10/2026 抽卡場次"}</strong>
      <span style={{fontSize: "12px", fontWeight: "700", color: "#ae031d"}}>{"已結束"}</span>
    </span>{"\n  "}
  </section>{"\n\n  "}
  <section aria-label="場次" style={{display: "flex", gap: "12px", overflowX: "auto", padding: "4px 4px 12px"}}>{"\n    "}
    {(Array.isArray(v.sessionCards) ? v.sessionCards : []).map((s, $index) => (<React.Fragment key={$index}>{"\n      "}
      <button type="button" onClick={s?.pick} aria-pressed={s?.pressed} className={s?.cls} style={{flex: "0 0 216px", display: "flex", flexDirection: "column", gap: "8px", padding: "14px 16px", textAlign: "left", borderRadius: "6px", border: `1px solid ${asset(s?.border) ?? ''}`, background: `${asset(s?.bg) ?? ''}`, boxShadow: `${asset(s?.glow) ?? ''}`, color: "#ffffff", cursor: "pointer"}}>{"\n        "}
        <span style={{display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px"}}>
          <span style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "800", fontSize: "24px", lineHeight: "28px"}}>{s?.label}</span>
          <span style={{height: "22px", padding: "0 8px", borderRadius: "4px", background: "#21252d", color: "#c3c8cd", fontSize: "12px", lineHeight: "22px", fontWeight: "700"}}>{"已結束"}</span>
        </span>{"\n        "}
        <span style={{fontSize: "13px", lineHeight: "18px", color: "#c3c8cd"}}>{"盲盒機率："}
          <strong style={{color: "#ffffff"}}>{s?.odds}</strong>
        </span>{"\n        "}
        <span style={{display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", fontSize: "13px", lineHeight: "18px", color: "#a0a5ad", whiteSpace: "nowrap"}}>
          <span>{"28/10 "}{s?.time}</span>
          <span>{s?.pickedText}</span>
        </span>{"\n      "}
      </button>{"\n    "}
    </React.Fragment>))}{"\n  "}
  </section>{"\n\n  "}
  <div style={{display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "flex-start"}}>{"\n\n    "}
    <section aria-labelledby="photo-title" style={{flex: "1 1 320px", minWidth: "0", display: "flex", flexDirection: "column", gap: "12px", padding: "20px", borderRadius: "10px", border: "1px solid #14181d", background: "#05070a"}}>{"\n      "}
      <div style={{display: "flex", alignItems: "center", gap: "10px"}}>{"\n        "}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f4022b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3.5" y="4.5" width="17" height="15" rx="2"></rect>
          <circle cx="9" cy="10" r="1.8"></circle>
          <path d="m20.5 16-5-5-9 8.5"></path>
        </svg>{"\n        "}
        <h2 id="photo-title" style={{margin: "0", fontSize: "20px", lineHeight: "28px", fontWeight: "700"}}>{v.sessionLabel}{"賽果"}</h2>{"\n        "}
        <span style={{fontSize: "13px", color: "#a0a5ad"}}>{"28/10/2026 抽卡場次"}</span>{"\n      "}
      </div>{"\n      "}
      {v.hasResult ? (<>{"\n        "}
        <button type="button" aria-label={`放大查看${v.sessionLabel ?? ''}賽果圖片`} style={{position: "relative", display: "block", width: "100%", aspectRatio: "4 / 3", padding: "0", borderRadius: "6px", border: "1px solid #282d36", overflow: "hidden", background: "repeating-linear-gradient(45deg, #13161b 0px, #13161b 12px, #0b0e12 12px, #0b0e12 24px)", cursor: "zoom-in"}}>{"\n          "}
          <span style={{position: "absolute", top: "0", right: "0", bottom: "0", left: "0", display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px", padding: "18px"}}>{"\n            "}
            <span style={{borderRadius: "4px", background: "linear-gradient(160deg, #4a0511 0%, #1d0a10 60%, #0b0e12 100%)", border: "1px solid #3a1018"}}></span>
            <span style={{borderRadius: "4px", background: "linear-gradient(160deg, #4a0511 0%, #1d0a10 60%, #0b0e12 100%)", border: "1px solid #3a1018"}}></span>
            <span style={{borderRadius: "4px", background: "linear-gradient(160deg, #4a0511 0%, #1d0a10 60%, #0b0e12 100%)", border: "1px solid #3a1018"}}></span>
            <span style={{borderRadius: "4px", background: "linear-gradient(160deg, #4a0511 0%, #1d0a10 60%, #0b0e12 100%)", border: "1px solid #3a1018"}}></span>{"\n            "}
            <span style={{borderRadius: "4px", background: "linear-gradient(160deg, #4a0511 0%, #1d0a10 60%, #0b0e12 100%)", border: "1px solid #3a1018"}}></span>
            <span style={{borderRadius: "4px", background: "linear-gradient(160deg, #4a0511 0%, #1d0a10 60%, #0b0e12 100%)", border: "1px solid #3a1018"}}></span>
            <span style={{borderRadius: "4px", background: "linear-gradient(160deg, #4a0511 0%, #1d0a10 60%, #0b0e12 100%)", border: "1px solid #3a1018"}}></span>
            <span style={{borderRadius: "4px", background: "linear-gradient(160deg, #4a0511 0%, #1d0a10 60%, #0b0e12 100%)", border: "1px solid #3a1018"}}></span>{"\n          "}
          </span>{"\n          "}
          <span style={{position: "absolute", left: "12px", bottom: "12px", display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 12px", borderRadius: "4px", background: "rgba(5, 7, 10, 0.82)", color: "#ffffff", fontSize: "13px", fontWeight: "700"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"></path>
            </svg>{"按圖放大查看"}
          </span>{"\n        "}
        </button>{"\n        "}
        <p style={{margin: "0", fontSize: "13px", color: "#a0a5ad"}}>{"賽果圖片於直播開抽後上載，與號碼紀錄一併封存。"}</p>{"\n      "}
      </>) : null}{"\n      "}
      {v.noResult ? (<>{"\n        "}
        <div style={{display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px", aspectRatio: "4 / 3", borderRadius: "6px", border: "1px dashed #282d36", textAlign: "center", padding: "16px"}}>{"\n          "}
          <strong style={{fontSize: "16px"}}>{"本場未有賽果"}</strong>{"\n          "}
          <span style={{fontSize: "14px", color: "#a0a5ad"}}>{"本場未有玩家選號。"}</span>{"\n        "}
        </div>{"\n      "}
      </>) : null}{"\n    "}
    </section>{"\n\n    "}
    <section aria-labelledby="board-title" style={{flex: "2 1 480px", minWidth: "0", display: "flex", flexDirection: "column", gap: "14px", padding: "20px", borderRadius: "10px", border: "1px solid #14181d", background: "#05070a"}}>{"\n      "}
      <div style={{display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "6px 14px"}}>{"\n        "}
        <h2 id="board-title" style={{margin: "0", fontSize: "20px", lineHeight: "28px", fontWeight: "700"}}>{v.sessionLabel}{"號碼紀錄"}</h2>{"\n        "}
        <span style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "700", fontSize: "17px", color: "#c3c8cd"}}>{v.pickedCount}{" / 20 已被購買"}</span>{"\n        "}
        <span style={{marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "700", color: "#a0a5ad"}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4.5" y="10.5" width="15" height="10" rx="2"></rect>
            <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"></path>
          </svg>{"唯讀"}
        </span>{"\n      "}
      </div>{"\n      "}
      <ol className="ld-rgrid" style={{listStyle: "none", margin: "0", padding: "0", display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "10px"}}>{"\n        "}
        {(Array.isArray(v.tiles) ? v.tiles : []).map((t, $index) => (<React.Fragment key={$index}>{"\n          "}
          <li aria-label={t?.aria} style={{display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px", height: "84px", borderRadius: "10px", border: `1px solid ${asset(t?.border) ?? ''}`, background: `${asset(t?.bg) ?? ''}`, boxShadow: `${asset(t?.glow) ?? ''}`}}>{"\n            "}
            {t?.picked ? (<>{"\n              "}
              <span style={{display: "inline-flex", alignItems: "center", gap: "5px", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "22px", lineHeight: "26px", color: `${asset(t?.color) ?? ''}`}}>
                <span aria-hidden="true" style={{width: "8px", height: "8px", borderRadius: "999px", background: `${asset(t?.dot) ?? ''}`}}></span>{t?.outcome}
              </span>{"\n              "}
              <span style={{fontSize: "12px", lineHeight: "16px", color: `${asset(t?.subColor) ?? ''}`}}>{"#"}{t?.n}{"・"}{t?.who}</span>{"\n            "}
            </>) : null}{"\n            "}
            {t?.notPicked ? (<>{"\n              "}
              <span style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "800", fontSize: "26px", lineHeight: "28px", color: "#ffffff"}}>{t?.n}</span>{"\n              "}
              <span style={{fontSize: "12px", lineHeight: "16px", color: "#a0a5ad"}}>{"未選"}</span>{"\n            "}
            </>) : null}{"\n          "}
          </li>{"\n        "}
        </React.Fragment>))}{"\n      "}
      </ol>{"\n      "}
      <ul style={{listStyle: "none", margin: "0", padding: "0", display: "flex", flexWrap: "wrap", gap: "8px 20px", fontSize: "13px", lineHeight: "18px", color: "#c3c8cd"}}>{"\n        "}
        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
          <span aria-hidden="true" style={{width: "16px", height: "16px", borderRadius: "4px", border: "1px solid #4fb3ff", background: "#041737"}}></span>{"天堂"}
        </li>{"\n        "}
        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
          <span aria-hidden="true" style={{width: "16px", height: "16px", borderRadius: "4px", border: "1px solid #ae031d", background: "#4a0511"}}></span>{"地獄"}
        </li>{"\n        "}
        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
          <span aria-hidden="true" style={{width: "16px", height: "16px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b"}}></span>{"未選"}
        </li>{"\n      "}
      </ul>{"\n    "}
    </section>{"\n\n  "}
  </div>{"\n\n  "}
  <section aria-labelledby="sum-title" style={{display: "flex", flexWrap: "wrap", gap: "16px 24px", padding: "20px 24px", borderRadius: "10px", border: "1px solid #14181d", background: "#05070a"}}>{"\n    "}
    <div style={{flex: "1 1 220px", display: "flex", flexDirection: "column", gap: "4px"}}>{"\n      "}
      <h2 id="sum-title" style={{margin: "0", fontSize: "17px", lineHeight: "24px", fontWeight: "700"}}>{v.sessionLabel}{"摘要"}</h2>{"\n      "}
      <span style={{fontSize: "14px", color: "#c3c8cd"}}>{"盲盒機率："}{v.sessionOdds}{"（20 個號碼中 "}{v.sessionHeaven}{" 個天堂）"}</span>{"\n      "}
      <span style={{fontSize: "14px", color: "#a0a5ad"}}>{"28/10（三）"}{v.sessionTime}{" 開抽"}</span>{"\n    "}
    </div>{"\n    "}
    <div style={{flex: "2 1 280px", display: "flex", flexDirection: "column", gap: "6px"}}>{"\n      "}
      <span style={{display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: "700", color: "#c2ebff"}}>
        <span aria-hidden="true" style={{width: "10px", height: "10px", borderRadius: "999px", background: "#4fb3ff"}}></span>{"天堂 "}{v.heavenCount}{" 個"}
      </span>{"\n      "}
      <span style={{fontSize: "14px", lineHeight: "22px", color: "#c3c8cd"}}>{v.heavenList}</span>{"\n    "}
    </div>{"\n    "}
    <div style={{flex: "2 1 280px", display: "flex", flexDirection: "column", gap: "6px"}}>{"\n      "}
      <span style={{display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: "700", color: "#ffd7c1"}}>
        <span aria-hidden="true" style={{width: "10px", height: "10px", borderRadius: "999px", background: "#f4022b"}}></span>{"地獄 "}{v.hellCount}{" 個"}
      </span>{"\n      "}
      <span style={{fontSize: "14px", lineHeight: "22px", color: "#c3c8cd"}}>{v.hellList}</span>{"\n    "}
    </div>{"\n  "}
  </section>
</main>
</>);
};

export default ResultDetailPage;
