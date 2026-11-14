/* eslint-disable */
// Generated from the LiveDraw revamp design (Results.html); logic kept as designed.
import React from "react";
import { DCLogic, route, asset } from "../runtime.jsx";

export const CSS = "\nbody{margin:0;background:#0b0e12}\n*{box-sizing:border-box}\na{color:#ffffff;text-decoration:none}a:hover{color:#ffe390}\nbutton,input,textarea{font-family:inherit}\n:focus-visible{outline:2px solid #f4022b;outline-offset:2px}\ninput::placeholder,textarea::placeholder{color:#6b767f}\n.ld-nav{transition:background-color 150ms,color 150ms}\n.ld-nav:hover{background-color:#13161b !important;color:#ffffff !important}\n.ld-lift{transition:border-color 150ms,box-shadow 150ms}\n.ld-lift:hover{border-color:#6b767f !important}\n.ld-link:hover{color:#ffffff !important}\n@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none !important;transition:none !important}}\n\n.ld-menubtn,.ld-tabbar,.ld-drawer-close,.ld-backdrop{display:none}\n@media (max-width:760px){\n.ld-root{padding-bottom:68px}\n.ld-header{padding:8px 12px !important;gap:8px !important;flex-wrap:nowrap !important;position:sticky;top:0;z-index:40}\n.ld-search,.ld-hide-m,.ld-uname{display:none !important}\n.ld-logo{width:auto !important;flex:1 1 auto !important;min-width:0}\n.ld-logo img{width:104px !important;height:auto !important}\n.ld-tools{gap:6px !important;flex-wrap:nowrap !important}\n.ld-tools > a,.ld-tools > button,.ld-tools > span > button{height:38px !important}\n.ld-menubtn{display:flex !important}\n.ld-main h1{font-size:34px !important;line-height:40px !important}\n.ld-tools > a:first-child > span:last-child,.ld-tools > span > button > span{display:none !important}\n.ld-logo{min-width:96px !important}\n.ld-bleed{margin:-12px -12px 0 !important}\n.ld-tools > span > button{padding:0 8px !important;gap:4px !important}\n.ld-tools > span > button > svg:last-child{display:none}\n.ld-tools > button{width:38px !important}\n.ld-tools > a:last-child{padding:0 3px !important;border:0 !important}\n.ld-tools > a:first-child{padding:0 4px 0 8px !important;gap:5px !important;font-size:17px !important}\n.ld-side{display:none !important}\n.ld-side.ld-side-open{display:flex !important;position:fixed;top:0;left:0;bottom:0;width:min(300px,84vw);z-index:80;overflow-y:auto;box-shadow:12px 0 40px rgba(0,0,0,.6)}\n.ld-side.ld-side-open .ld-drawer-close{display:flex !important}\n.ld-backdrop{display:block !important;position:fixed;top:0;right:0;bottom:0;left:0;z-index:79;border:0;background:rgba(0,0,0,.6)}\n.ld-main{padding:12px !important;gap:12px !important}\n.ld-footer{padding:24px 16px 20px !important;gap:16px !important}\n.ld-tabbar{display:flex !important;position:fixed;left:0;right:0;bottom:0;z-index:60;height:64px;background:#080b0e;border-top:1px solid #282d36}\n}\n";

class ResultsPage extends DCLogic {
  _renderVals0() {
    const latestSessions = [];
    for (let i = 0; i < 20; i++) {
      const n = i + 1;
      const t = 20 * 60 + 30 + i * 5;
      const mm = t % 60;
      const time = Math.floor(t / 60) + ':' + (mm < 10 ? '0' + mm : String(mm));
      const half = n % 2 === 1;
      latestSessions.push({
        n: n, time: time,
        aria: '第 ' + n + ' 場，' + time + '，盲盒機率' + (half ? '二份之一' : '十分之一'),
        border: half ? '#4fb3ff' : '#282d36', bg: half ? '#041737' : '#13161b', sub: half ? '#c2ebff' : '#a0a5ad'
      });
    }
    const rows = [
      ['27', '（二）', '27/10 LiveDraw 直播', 20, 20, '28/10 18:38'],
      ['26', '（一）', '26/10 LiveDraw 直播', 20, 20, '26/10 22:25'],
      ['25', '（日）', '25/10 LiveDraw 直播', 20, 20, '26/10 13:09'],
      ['24', '（六）', '24/10 LiveDraw 直播', 20, 20, '25/10 00:10'],
      ['23', '（五）', '23/10 LiveDraw 直播', 20, 20, '24/10 00:18'],
      ['22', '（四）', '22/10 LiveDraw 直播', 20, 20, '23/10 14:42'],
      ['22', '（四）', '22/10 LiveDraw 直播', 2, 2, '22/10 00:36'],
      ['21', '（三）', '21/10 LiveDraw 直播', 20, 20, '22/10 00:15'],
      ['20', '（二）', '20/10 LiveDraw 直播', 20, 20, '20/10 22:17'],
      ['19', '（一）', '19/10 LiveDraw 直播', 20, 20, '20/10 02:13'],
      ['18', '（日）', '18/10 LiveDraw 直播', 20, 20, '18/10 22:05'],
      ['17', '（六）', '17/10 LiveDraw 直播', 20, 20, '17/10 22:19'],
      ['16', '（五）', '16/10 LiveDraw 直播', 20, 20, '16/10 23:07'],
      ['15', '（四）', '15/10 LiveDraw 直播', 20, 20, '16/10 20:24'],
      ['14', '（三）', '14/10 LiveDraw 直播', 20, 19, '15/10 20:26'],
      ['13', '（二）', '13/10 LiveDraw 直播', 20, 20, '14/10 12:16'],
      ['12', '（一）', '12/10 LiveDraw 直播', 20, 20, '13/10 17:00'],
      ['11', '（日）', '11/10 LiveDraw 直播', 10, 10, '12/10 20:28'],
      ['10', '（六）', '10/10 LiveDraw 直播', 10, 10, '11/10 20:24']
    ];
    const archives = rows.map((r) => ({ day: r[0], wd: r[1], title: r[2], sessions: r[3], results: r[4], archived: r[5] }));
    return { latestSessions: latestSessions, archives: archives };
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

ResultsPage.prototype.template = function template(v) {
  return (<>
<style>{CSS}</style>

<main className="ld-main" style={{flex: "999 1 560px", minWidth: "0", display: "flex", flexDirection: "column", gap: "24px", padding: "24px"}}>{"\n\n  "}
  <section aria-labelledby="res-title" style={{display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "16px 24px", padding: "28px 32px", borderRadius: "10px", border: "1px solid #14181d", background: "radial-gradient(60% 140% at 100% 0%, rgba(244, 2, 43, 0.18) 0%, rgba(244, 2, 43, 0) 60%), #05070a"}}>{"\n    "}
    <div style={{flex: "1 1 360px", display: "flex", flexDirection: "column", gap: "6px"}}>{"\n      "}
      <span style={{fontSize: "13px", lineHeight: "18px", fontWeight: "700", color: "#f4022b"}}>{"直播紀錄"}</span>{"\n      "}
      <h1 id="res-title" style={{margin: "0", fontFamily: "'Barlow Condensed', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "48px", lineHeight: "54px"}}>{"過往直播及賽果"}</h1>{"\n    "}
    </div>{"\n  "}
  </section>{"\n\n  "}
  <section aria-labelledby="latest-title" style={{display: "flex", flexWrap: "wrap", gap: "24px", padding: "24px", borderRadius: "10px", border: "1px solid #4a0511", background: "#0b0e12"}}>{"\n    "}
    <div style={{flex: "1 1 300px", display: "flex", flexDirection: "column", gap: "10px"}}>{"\n      "}
      <span style={{display: "inline-flex", alignSelf: "flex-start", alignItems: "center", height: "24px", padding: "0 8px", borderRadius: "4px", background: "#ae031d", color: "#ffffff", fontSize: "12px", fontWeight: "700"}}>{"最新封存"}</span>{"\n      "}
      <h2 id="latest-title" style={{margin: "0", fontFamily: "'Barlow Condensed', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "36px", lineHeight: "40px"}}>{"28/10 LiveDraw 直播"}</h2>{"\n      "}
      <span style={{fontSize: "15px", color: "#c3c8cd"}}>{"28/10/2026（三）・20 場・18 個賽果"}</span>{"\n      "}
      <span style={{fontSize: "12px", color: "#6b767f"}}>{"封存於 29/10 13:22"}</span>{"\n      "}
      <a href="/beta/result" style={{marginTop: "6px", display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: "8px", height: "48px", padding: "0 22px", borderRadius: "4px", background: "#f4022b", color: "#ffffff", fontSize: "16px", fontWeight: "700", boxShadow: "0 6px 20px rgba(244, 2, 43, 0.35)"}}>{"查看賽果"}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6"></path>
        </svg>
      </a>{"\n    "}
    </div>{"\n    "}
    <div style={{flex: "2 1 420px", display: "flex", flexDirection: "column", gap: "10px"}}>{"\n      "}
      <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", fontSize: "13px", color: "#a0a5ad"}}>{"\n        "}
        <span>{"當晚 20 個場次"}</span>{"\n        "}
        <span style={{display: "flex", gap: "12px"}}>
          <span style={{display: "inline-flex", alignItems: "center", gap: "6px"}}>
            <span aria-hidden="true" style={{width: "12px", height: "12px", borderRadius: "3px", border: "1px solid #4fb3ff", background: "#041737"}}></span>{"二份之一"}
          </span>
          <span style={{display: "inline-flex", alignItems: "center", gap: "6px"}}>
            <span aria-hidden="true" style={{width: "12px", height: "12px", borderRadius: "3px", border: "1px solid #282d36", background: "#13161b"}}></span>{"十分之一"}
          </span>
        </span>{"\n      "}
      </div>{"\n      "}
      <ol style={{listStyle: "none", margin: "0", padding: "0", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(76px, 100%), 1fr))", gap: "8px"}}>{"\n        "}
        {(Array.isArray(v.latestSessions) ? v.latestSessions : []).map((s, $index) => (<React.Fragment key={$index}>{"\n          "}
          <li>{"\n            "}
            <a href="/beta/result" className="ld-lift" aria-label={s?.aria} style={{display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0", height: "56px", borderRadius: "6px", border: `1px solid ${asset(s?.border) ?? ''}`, background: `${asset(s?.bg) ?? ''}`, color: "#ffffff"}}>{"\n              "}
              <strong style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "800", fontSize: "20px", lineHeight: "22px"}}>{s?.n}</strong>{"\n              "}
              <span style={{fontSize: "11px", lineHeight: "14px", color: `${asset(s?.sub) ?? ''}`}}>{s?.time}</span>{"\n            "}
            </a>{"\n          "}
          </li>{"\n        "}
        </React.Fragment>))}{"\n      "}
      </ol>{"\n    "}
    </div>{"\n  "}
  </section>{"\n\n  "}
  <section aria-labelledby="month-title" style={{display: "flex", flexDirection: "column", gap: "12px"}}>{"\n    "}
    <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px"}}>{"\n      "}
      <h2 id="month-title" style={{margin: "0", fontSize: "20px", lineHeight: "28px", fontWeight: "700"}}>{"2026 年 10 月"}</h2>{"\n      "}
      <span style={{fontSize: "14px", color: "#a0a5ad"}}>{"顯示 20 個已封存直播"}</span>{"\n    "}
    </div>{"\n    "}
    <ul style={{listStyle: "none", margin: "0", padding: "0", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))", gap: "12px"}}>{"\n      "}
      {(Array.isArray(v.archives) ? v.archives : []).map((a, $index) => (<React.Fragment key={$index}>{"\n        "}
        <li>{"\n          "}
          <a href="/beta/result" className="ld-lift" style={{display: "flex", alignItems: "center", gap: "16px", padding: "16px", borderRadius: "6px", border: "1px solid #282d36", background: "#0b0e12", color: "#ffffff"}}>{"\n            "}
            <span aria-hidden="true" style={{flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "72px", height: "72px", borderRadius: "10px", border: "1px solid #4a0511", background: "#181015"}}>{"\n              "}
              <strong style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "32px", lineHeight: "32px"}}>{a?.day}</strong>{"\n              "}
              <span style={{fontSize: "12px", lineHeight: "16px", color: "#c3c8cd"}}>{"10 月"}{a?.wd}</span>{"\n            "}
            </span>{"\n            "}
            <span style={{flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px"}}>{"\n              "}
              <strong style={{fontSize: "16px", lineHeight: "22px"}}>{a?.title}</strong>{"\n              "}
              <span style={{fontSize: "13px", lineHeight: "18px", color: "#c3c8cd"}}>{a?.sessions}{" 場・"}{a?.results}{" 個賽果"}</span>{"\n              "}
              <span style={{fontSize: "12px", lineHeight: "16px", color: "#6b767f"}}>{"封存於 "}{a?.archived}</span>{"\n            "}
            </span>{"\n            "}
            <span style={{flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "2px", fontSize: "14px", fontWeight: "700", color: "#f4022b"}}>{"查看"}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m9 6 6 6-6 6"></path>
              </svg>
            </span>{"\n          "}
          </a>{"\n        "}
        </li>{"\n      "}
      </React.Fragment>))}{"\n    "}
    </ul>{"\n    "}
    <div style={{display: "flex", justifyContent: "center", paddingTop: "8px"}}>{"\n      "}
      <button type="button" style={{height: "48px", padding: "0 28px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "16px", fontWeight: "700", cursor: "pointer"}}>{"載入更多過往直播"}</button>{"\n    "}
    </div>{"\n  "}
  </section>
</main>
</>);
};

export default ResultsPage;
