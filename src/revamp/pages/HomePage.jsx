/* eslint-disable */
// Generated from the LiveDraw revamp design (index.html); logic kept as designed.
import React, { useEffect, useState } from "react";
import { collection, limit, limitToLast, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { toMillis } from "../../App.jsx";
import { DCLogic, route, asset } from "../runtime.jsx";
import { fmt } from "../ui.jsx";

const CSS = "\nbody{margin:0;background:#0b0e12}\n*{box-sizing:border-box}\na{color:#ffffff;text-decoration:none}a:hover{color:#ffe390}\nbutton,input,textarea{font-family:inherit}\n:focus-visible{outline:2px solid #f4022b;outline-offset:2px}\ninput::placeholder,textarea::placeholder{color:#6b767f}\n.ld-nav{transition:background-color 150ms,color 150ms}\n.ld-nav:hover{background-color:#13161b !important;color:#ffffff !important}\n.ld-lift{transition:border-color 150ms,box-shadow 150ms}\n.ld-lift:hover{border-color:#6b767f !important}\n.ld-link:hover{color:#ffffff !important}\n.ld-card{transition:transform 150ms,border-color 150ms,box-shadow 150ms}\n.ld-card:hover{transform:translateY(-4px);border-color:#fdc800 !important;box-shadow:0 0 24px rgba(253,200,0,.25)}\n.ld-card:hover .ld-shine{animation:ld-sweep 900ms ease-out}\n.ld-marquee{-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 48px,#000 calc(100% - 48px),transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 48px,#000 calc(100% - 48px),transparent 100%)}\n.ld-track{animation:ld-marquee 36s linear infinite}\n.ld-marquee:hover .ld-track,.ld-marquee:focus-within .ld-track{animation-play-state:paused}\n@keyframes ld-marquee{from{transform:translateX(0)}to{transform:translateX(calc(-50% - 7px))}}\n@media (prefers-reduced-motion:reduce){.ld-marquee{overflow-x:auto !important;-webkit-mask-image:none;mask-image:none}}\n.ld-ticker{-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 32px,#000 calc(100% - 32px),transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 32px,#000 calc(100% - 32px),transparent 100%)}\n.ld-ttrack{animation:ld-ticker 40s linear infinite}\n.ld-ticker:hover .ld-ttrack{animation-play-state:paused}\n@keyframes ld-ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}\n@media (prefers-reduced-motion:reduce){.ld-ticker{overflow-x:auto !important;-webkit-mask-image:none;mask-image:none}}\n@keyframes ld-sweep{from{transform:translateX(-160%) skewX(-20deg)}to{transform:translateX(330%) skewX(-20deg)}}\n@keyframes ld-blink{0%,100%{opacity:1}50%{opacity:.35}}\n@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none !important;transition:none !important}}\n\n.ld-menubtn,.ld-tabbar,.ld-drawer-close,.ld-backdrop{display:none}\n@media (max-width:760px){\n.ld-root{padding-bottom:68px}\n.ld-header{padding:8px 12px !important;gap:8px !important;flex-wrap:nowrap !important;position:sticky;top:0;z-index:40}\n.ld-search,.ld-hide-m,.ld-uname{display:none !important}\n.ld-logo{width:auto !important;flex:1 1 auto !important;min-width:0}\n.ld-logo img{width:104px !important;height:auto !important}\n.ld-tools{gap:6px !important;flex-wrap:nowrap !important}\n.ld-tools > a,.ld-tools > button,.ld-tools > span > button{height:38px !important}\n.ld-menubtn{display:flex !important}\n.ld-main h1{font-size:34px !important;line-height:40px !important}\n.ld-tools > a:first-child > span:last-child,.ld-tools > span > button > span{display:none !important}\n.ld-logo{min-width:96px !important}\n.ld-bleed{margin:-12px -12px 0 !important}\n.ld-sframe{width:84% !important}\n.ld-tools > span > button{padding:0 8px !important;gap:4px !important}\n.ld-tools > span > button > svg:last-child{display:none}\n.ld-tools > button{width:38px !important}\n.ld-tools > a:last-child{padding:0 3px !important;border:0 !important}\n.ld-tools > a:first-child{padding:0 4px 0 8px !important;gap:5px !important;font-size:17px !important}\n.ld-side{display:none !important}\n.ld-side.ld-side-open{display:flex !important;position:fixed;top:0;left:0;bottom:0;width:min(300px,84vw);z-index:80;overflow-y:auto;box-shadow:12px 0 40px rgba(0,0,0,.6)}\n.ld-side.ld-side-open .ld-drawer-close{display:flex !important}\n.ld-backdrop{display:block !important;position:fixed;top:0;right:0;bottom:0;left:0;z-index:79;border:0;background:rgba(0,0,0,.6)}\n.ld-main{padding:12px !important;gap:12px !important}\n.ld-footer{padding:24px 16px 20px !important;gap:16px !important}\n.ld-tabbar{display:flex !important;position:fixed;left:0;right:0;bottom:0;z-index:60;height:64px;background:#080b0e;border-top:1px solid #282d36}\n}\n";

class HomePage extends DCLogic {
  constructor(...args) {
    super(...args);
    this.state = Object.assign({}, this.state || {}, { slide: 0 });
    this._paused = false;
  }

  componentDidMount() {
    this._slideT = setInterval(() => { if (!this._paused) this.setState({ slide: ((this.state && this.state.slide) || 0) + 1 }); }, 4500);
  }

  componentWillUnmount() { if (this._slideT) clearInterval(this._slideT); }

  _slideVals() {
    const BANNERS = [
      { img: 'images/home-main-banner.png', href: 'LiveDraw.dc.html', alt: '$399 有機會挠走一張 M6 烈空坐 SAR？！每晚 8:30 直播抽盲盒', pos: '18% 50%' },
      { img: 'images/selfdraw-hero-banner.webp', href: 'SelfDraw.dc.html', alt: '天堂與地獄・自助抽卡：24小時隨時開抽・即時揭曉', pos: '50% 50%' },
      { img: 'images/home-banner-livedraw.png', href: 'LiveDraw.dc.html', alt: '直播抽卡：每晚 8:30 直播開抽，即時互動・真人開箱', pos: '50% 50%' },
      { img: 'images/home-banner-selfdraw.png', href: 'SelfDraw.dc.html', alt: '自助抽卡：24小時隨時開抽，多款熱門卡盒', pos: '50% 50%' }
    ];
    const n = BANNERS.length, total = n * 2;
    const raw = (this.state && this.state.slide) || 0;
    const cur = ((raw % total) + total) % total;
    const slides = [];
    for (let k = 0; k < total; k++) {
      let off = ((k - cur) % total + total) % total;
      if (off >= total / 2) off -= total;
      const b = BANNERS[k % n];
      const vis = Math.abs(off) <= 1;
      slides.push({
        img: b.img, href: b.href, alt: off === 0 ? b.alt : '', pos: b.pos, off: off,
        hidden: off === 0 ? undefined : 'true', tab: off === 0 ? '0' : '-1',
        scale: off === 0 ? 1 : 0.94, op: off === 0 ? 1 : (vis ? 0.55 : 0),
        tr: Math.abs(off) >= total / 2 - 1 ? 'none' : 'transform 520ms cubic-bezier(0.22, 0.8, 0.3, 1), opacity 520ms',
        shadow: off === 0 ? '0 10px 30px rgba(0, 0, 0, 0.6)' : 'none'
      });
    }
    const active = cur % n;
    const go = (d) => this.setState({ slide: ((this.state && this.state.slide) || 0) + d });
    return {
      slides: slides,
      dots: BANNERS.map((b, i) => ({
        label: '第 ' + (i + 1) + ' 張橫幅', cur: i === active ? 'true' : undefined,
        w: i === active ? '24px' : '8px', bg: i === active ? '#f4022b' : '#3a414b',
        go: () => { const st = (this.state && this.state.slide) || 0; const base = st - (((st % n) + n) % n); this.setState({ slide: base + i }); }
      })),
      prevSlide: () => go(-1), nextSlide: () => go(1),
      pauseSlides: () => { this._paused = true; }, resumeSlides: () => { this._paused = false; },
      touchStart: (e) => { this._paused = true; const t = e.touches && e.touches[0]; this._tx = t ? t.clientX : null; },
      touchEnd: (e) => { this._paused = false; const t = e.changedTouches && e.changedTouches[0]; if (t && this._tx != null) { const dx = t.clientX - this._tx; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); } this._tx = null; }
    };
  }

  _renderVals0() {
    const loggedIn = this.props.loggedIn ?? true;
    const packs = this.props.packs || [];
    const chat = this.props.chat || [];
    const feed = this.props.feed || [];
    const liveNow = Boolean(this.props.live);
    return { loggedIn: loggedIn, loggedOut: !loggedIn, packs: packs, chat: chat, feed: feed, hasFeed: feed.length > 0, noChat: chat.length === 0, liveNow: liveNow, offAir: !liveNow };
  }

  renderVals() {
    return Object.assign(this._renderVals0(), this._slideVals(), this._langVals(), this._menuVals());
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

HomePage.prototype.template = function template(v) {
  return (<>
<style>{CSS}</style>

<main className="ld-main" style={{flex: "999 1 560px", minWidth: "0", display: "flex", flexDirection: "column", gap: "16px", padding: "0 16px 20px"}}>{"\n\n  "}
  <section className="ld-bleed" aria-roledescription="carousel" aria-label="主橫幅" onMouseEnter={v.pauseSlides} onMouseLeave={v.resumeSlides} onTouchStart={v.touchStart} onTouchEnd={v.touchEnd} style={{margin: "0 -16px", padding: "16px 0 10px", overflow: "hidden", borderBottom: "1px solid #14181d", background: "#05070a"}}>{"\n    "}
    <div className="ld-sframe" style={{position: "relative", width: "min(760px, 50%)", margin: "0 auto", aspectRatio: "3 / 1"}}>{"\n      "}
      {(Array.isArray(v.slides) ? v.slides : []).map((b, $index) => (<React.Fragment key={$index}>{"\n        "}
        <a href={route(b?.href)} aria-hidden={b?.hidden} tabIndex={b?.tab} style={{position: "absolute", top: "0", left: "0", width: "100%", height: "100%", display: "block", overflow: "hidden", borderRadius: "10px", border: "1px solid #282d36", background: "#0b0e12", transform: `translateX(calc(${asset(b?.off) ?? ''} * (100% + 12px))) scale(${asset(b?.scale) ?? ''})`, opacity: `${asset(b?.op) ?? ''}`, transition: `${asset(b?.tr) ?? ''}`, boxShadow: `${asset(b?.shadow) ?? ''}`}}>
          <img src={asset(b?.img)} alt={b?.alt} style={{display: "block", width: "100%", height: "100%", objectFit: "cover", objectPosition: `${asset(b?.pos) ?? ''}`}} />
        </a>{"\n      "}
      </React.Fragment>))}{"\n      "}
      <button type="button" className="ld-hide-m" onClick={v.prevSlide} aria-label="上一張橫幅" style={{position: "absolute", top: "50%", zIndex: "3", width: "40px", height: "40px", marginTop: "-20px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", border: "1px solid rgba(255, 255, 255, 0.25)", background: "rgba(5, 7, 10, 0.7)", color: "#ffffff", cursor: "pointer", left: "-20px"}}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 6-6 6 6 6"></path>
        </svg>
      </button>{"\n      "}
      <button type="button" className="ld-hide-m" onClick={v.nextSlide} aria-label="下一張橫幅" style={{position: "absolute", top: "50%", zIndex: "3", width: "40px", height: "40px", marginTop: "-20px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", border: "1px solid rgba(255, 255, 255, 0.25)", background: "rgba(5, 7, 10, 0.7)", color: "#ffffff", cursor: "pointer", right: "-20px"}}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9 6 6 6-6 6"></path>
        </svg>
      </button>{"\n    "}
    </div>{"\n    "}
    <div role="group" aria-label="選擇橫幅" style={{display: "flex", justifyContent: "center", gap: "8px", paddingTop: "12px"}}>{"\n      "}
      {(Array.isArray(v.dots) ? v.dots : []).map((d, $index) => (<React.Fragment key={$index}>{"\n        "}
        <button type="button" onClick={d?.go} aria-label={d?.label} aria-current={d?.cur} style={{width: `${asset(d?.w) ?? ''}`, height: "8px", padding: "0", border: "0", borderRadius: "999px", background: `${asset(d?.bg) ?? ''}`, cursor: "pointer", transition: "width 250ms, background-color 250ms"}}></button>{"\n      "}
      </React.Fragment>))}{"\n    "}
    </div>{"\n  "}
  </section>{"\n\n  "}
  <section aria-labelledby="modes-title" style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(460px, 100%), 1fr))", gap: "16px"}}>{"\n    "}
    <h1 id="modes-title" style={{position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)", margin: "0"}}>{"兩種玩法：自助抽卡及直播抽卡"}</h1>{"\n    "}
    <a href="/beta/selfdraw" className="ld-lift" style={{display: "block", borderRadius: "6px", border: "1px solid #282d36", overflow: "hidden", background: "#05070a"}}>
      <img src="/revamp/images/home-banner-selfdraw.png" alt="自助抽卡：24小時隨時開抽，多款熱門卡盒・立即抽取・驚喜不斷。立即抽卡" style={{display: "block", width: "100%", aspectRatio: "750 / 234", objectFit: "cover"}} />
    </a>{"\n    "}
    <a href="/beta/live" className="ld-lift" style={{display: "block", borderRadius: "6px", border: "1px solid #282d36", overflow: "hidden", background: "#05070a"}}>
      <img src="/revamp/images/home-banner-livedraw.png" alt="直播抽卡：每晚 8:30 直播開抽，即時互動・真人開箱・見證稀有卡誕生。進入直播大廳" style={{display: "block", width: "100%", aspectRatio: "750 / 234", objectFit: "cover"}} />
    </a>{"\n  "}
  </section>{"\n\n  "}
  <section aria-labelledby="hot-title" style={{display: "flex", flexDirection: "column", gap: "10px"}}>{"\n    "}
    <div style={{display: "flex", alignItems: "center", gap: "8px"}}>{"\n      "}
      <svg width="24" height="24" viewBox="0 0 24 24" fill="#f4022b" aria-hidden="true">
        <path d="M12 22c-4.2 0-7.5-2.8-7.5-6.9 0-3.5 2.6-5.6 3.7-9.2 1.7 1.3 2.6 3 2.7 4.8 1.3-1 2.1-2.7 2.1-4.8 3.7 2.6 6.5 5.8 6.5 9.2 0 4.1-3.3 6.9-7.5 6.9z"></path>
      </svg>{"\n      "}
      <h2 id="hot-title" style={{margin: "0", fontSize: "20px", lineHeight: "28px", fontWeight: "900"}}>{"熱門卡牌推薦"}</h2>{"\n      "}
      <a href="/beta/live" className="ld-link" style={{marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "14px", color: "#c3c8cd"}}>{"查看更多"}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6"></path>
        </svg>
      </a>{"\n    "}
    </div>{"\n    "}
    <div className="ld-marquee" style={{overflow: "hidden", padding: "6px 0 10px"}}>{"\n      "}
      <div className="ld-track" style={{display: "flex", gap: "14px", width: "max-content"}}>{"\n        "}
        <ul style={{listStyle: "none", margin: "0", padding: "0", display: "flex", gap: "14px"}}>{"\n          "}
          {(Array.isArray(v.packs) ? v.packs : []).map((p, $index) => (<React.Fragment key={$index}>{"\n          "}
            <li style={{flex: "0 0 172px"}}>{"\n            "}
              <a href="/beta/live" className="ld-card" style={{display: "flex", flexDirection: "column", gap: "10px", padding: "12px", borderRadius: "6px", border: "1px solid #282d36", background: "radial-gradient(80% 50% at 50% 35%, rgba(244, 2, 43, 0.16) 0%, rgba(244, 2, 43, 0) 70%), #0b0e12", color: "#ffffff"}}>{"\n              "}
                <span style={{position: "relative", display: "block", aspectRatio: "63 / 88", borderRadius: "6px", overflow: "hidden", boxShadow: "0 0 0 2px #fdc800, 0 0 20px rgba(253, 200, 0, 0.35)"}}>{"\n                "}
                  <img src={asset(p?.img)} alt={p?.name} style={{display: "block", width: "100%", height: "100%", objectFit: "cover"}} />{"\n                "}
                  <span className="ld-shine" aria-hidden="true" style={{position: "absolute", top: "0", bottom: "0", left: "0", width: "45%", background: "linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 240, 190, 0.55) 50%, rgba(255, 255, 255, 0) 100%)", transform: "translateX(-160%) skewX(-20deg)"}}></span>{"\n              "}
                </span>{"\n              "}
                <strong style={{display: "block", height: "40px", overflow: "hidden", fontSize: "14px", lineHeight: "20px"}}>{p?.name}</strong>{"\n              "}
                <span style={{display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "700", fontSize: "20px", lineHeight: "22px"}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="10.5" fill="#fdc800" stroke="#f88f00" strokeWidth="2"></circle>
                    <path d="M13.4 5.2 7.9 13h3.9l-1.2 5.8 5.6-8h-4z" fill="#f88f00"></path>
                  </svg>{p?.price}
                </span>{"\n            "}
              </a>{"\n          "}
            </li>{"\n          "}
          </React.Fragment>))}{"\n        "}
        </ul>{"\n        "}
        <ul aria-hidden="true" style={{listStyle: "none", margin: "0", padding: "0", display: "flex", gap: "14px"}}>{"\n          "}
          {(Array.isArray(v.packs) ? v.packs : []).map((p, $index) => (<React.Fragment key={$index}>{"\n          "}
            <li style={{flex: "0 0 172px"}}>{"\n            "}
              <a href="/beta/live" className="ld-card" tabIndex="-1" style={{display: "flex", flexDirection: "column", gap: "10px", padding: "12px", borderRadius: "6px", border: "1px solid #282d36", background: "radial-gradient(80% 50% at 50% 35%, rgba(244, 2, 43, 0.16) 0%, rgba(244, 2, 43, 0) 70%), #0b0e12", color: "#ffffff"}}>{"\n              "}
                <span style={{position: "relative", display: "block", aspectRatio: "63 / 88", borderRadius: "6px", overflow: "hidden", boxShadow: "0 0 0 2px #fdc800, 0 0 20px rgba(253, 200, 0, 0.35)"}}>{"\n                "}
                  <img src={asset(p?.img)} alt={p?.name} style={{display: "block", width: "100%", height: "100%", objectFit: "cover"}} />{"\n                "}
                  <span className="ld-shine" aria-hidden="true" style={{position: "absolute", top: "0", bottom: "0", left: "0", width: "45%", background: "linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 240, 190, 0.55) 50%, rgba(255, 255, 255, 0) 100%)", transform: "translateX(-160%) skewX(-20deg)"}}></span>{"\n              "}
                </span>{"\n              "}
                <strong style={{display: "block", height: "40px", overflow: "hidden", fontSize: "14px", lineHeight: "20px"}}>{p?.name}</strong>{"\n              "}
                <span style={{display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "700", fontSize: "20px", lineHeight: "22px"}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="10.5" fill="#fdc800" stroke="#f88f00" strokeWidth="2"></circle>
                    <path d="M13.4 5.2 7.9 13h3.9l-1.2 5.8 5.6-8h-4z" fill="#f88f00"></path>
                  </svg>{p?.price}
                </span>{"\n            "}
              </a>{"\n          "}
            </li>{"\n          "}
          </React.Fragment>))}{"\n        "}
        </ul>{"\n      "}
      </div>{"\n    "}
    </div>{"\n  "}
  </section>{"\n\n  "}
  <section aria-labelledby="lobby-title" style={{display: "flex", flexWrap: "wrap", gap: "0", borderRadius: "6px", border: "1px solid #282d36", background: "#0b0e12", overflow: "hidden"}}>{"\n    "}
    <div style={{flex: "3 1 560px", minWidth: "0", display: "flex", flexDirection: "column", gap: "12px", padding: "14px 16px 16px"}}>{"\n      "}
      <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 10px"}}>{"\n        "}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#f4022b" aria-hidden="true">
          <path d="M3 7a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <path d="m16 10.5 5-3v9l-5-3z"></path>
        </svg>{"\n        "}
        <h2 id="lobby-title" style={{margin: "0", fontSize: "20px", lineHeight: "28px", fontWeight: "900"}}>{"直播抽卡大廳"}</h2>{"\n        "}
        {v.liveNow ? (<>
          <span style={{display: "inline-flex", alignItems: "center", gap: "4px", height: "22px", padding: "0 8px", borderRadius: "4px", background: "#f4022b", fontSize: "12px", fontWeight: "700"}}>
            <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 4.5v15l12.5-7.5z" fill="currentColor"></path>
            </svg>{"LIVE"}
          </span>
        </>) : null}{"\n        "}
        {v.offAir ? (<>
          <span style={{display: "inline-flex", alignItems: "center", height: "22px", padding: "0 8px", borderRadius: "4px", border: "1px solid #3a414b", background: "#13161b", color: "#c3c8cd", fontSize: "12px", fontWeight: "700"}}>{"今晚 20:30 開播"}</span>
        </>) : null}{"\n        "}
        <span style={{height: "24px", padding: "0 10px", borderRadius: "999px", background: "#13161b", border: "1px solid #282d36", fontSize: "12px", lineHeight: "22px", color: "#c3c8cd"}}>{"29/10（四）共 20 場"}</span>{"\n      "}
      </div>{"\n      "}
      <div style={{display: "flex", flexWrap: "wrap", gap: "16px 20px", alignItems: "stretch"}}>{"\n        "}
        <div style={{position: "relative", flex: "1 1 340px", minWidth: "0", minHeight: "190px", borderRadius: "6px", overflow: "hidden", border: "1px solid #282d36", background: "radial-gradient(70% 90% at 50% 45%, #2a0710 0%, #05070a 72%)"}}>{"\n          "}
          <img src="/revamp/images/logo.png" alt="" style={{position: "absolute", left: "24px", top: "20px", width: "130px", opacity: "0.6"}} />{"\n          "}
          <button type="button" aria-label="播放直播" style={{position: "absolute", left: "50%", top: "50%", width: "56px", height: "56px", margin: "-28px 0 0 -28px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", border: "2px solid rgba(255, 255, 255, 0.85)", background: "rgba(5, 7, 10, 0.6)", color: "#ffffff", cursor: "pointer"}}>
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5.5v13l10.5-6.5z" fill="currentColor"></path>
            </svg>
          </button>{"\n          "}
          {v.liveNow ? (<>
            <span style={{position: "absolute", left: "12px", bottom: "12px", display: "inline-flex", alignItems: "center", gap: "6px", height: "28px", padding: "0 10px", borderRadius: "4px", background: "rgba(5, 7, 10, 0.8)", fontSize: "14px", fontWeight: "700"}}>
              <span aria-hidden="true" style={{width: "8px", height: "8px", borderRadius: "999px", background: "#f4022b", animation: "ld-blink 1.2s ease-in-out infinite"}}></span>{"LIVE"}
            </span>
          </>) : null}{"\n        "}
        </div>{"\n        "}
        <div style={{flex: "1 1 260px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "10px", padding: "4px 0"}}>{"\n          "}
          <h3 style={{margin: "0", fontSize: "20px", lineHeight: "28px", fontWeight: "900"}}>{"第 5 場　|　盲盒機率二份之一"}</h3>{"\n          "}
          <p style={{margin: "0", fontSize: "15px", lineHeight: "24px", color: "#c3c8cd"}}>{"今晚 8:30 準時開抽！"}
            <br />{"多款熱門卡盒，與大家一起見證稀有卡誕生！"}
          </p>{"\n          "}
          <a href="/beta/live" style={{marginTop: "auto", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "180px", height: "44px", borderRadius: "4px", background: "#f4022b", color: "#ffffff", fontSize: "16px", fontWeight: "700"}}>{"進入直播大廳"}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6"></path>
            </svg>
          </a>{"\n        "}
        </div>{"\n      "}
      </div>{"\n    "}
    </div>{"\n    "}
    <div style={{flex: "1 1 300px", minWidth: "0", display: "flex", flexDirection: "column", gap: "12px", padding: "14px 18px 16px", borderLeft: "1px solid #14181d", background: "#05070a"}}>{"\n      "}
      <div style={{display: "flex", alignItems: "center", justifyContent: "space-between"}}>{"\n        "}
        <h2 style={{margin: "0", fontSize: "17px", lineHeight: "24px", fontWeight: "900"}}>{"即時聊天室"}</h2>{"\n        "}
        <a href="/beta/live" className="ld-link" style={{display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "13px", color: "#a0a5ad"}}>{"查看更多"}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6"></path>
          </svg>
        </a>{"\n      "}
      </div>{"\n      "}
      <ul style={{listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column", gap: "10px"}}>{"\n        "}
        {(Array.isArray(v.chat) ? v.chat : []).map((m, $index) => (<React.Fragment key={$index}>{"\n          "}
          <li style={{display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", lineHeight: "20px"}}>{"\n            "}
            <span aria-hidden="true" style={{flex: "0 0 auto", width: "26px", height: "26px", borderRadius: "999px", display: "flex", alignItems: "center", justifyContent: "center", background: `${asset(m?.bg) ?? ''}`, color: `${asset(m?.fg) ?? ''}`, fontSize: "12px", fontWeight: "700"}}>{m?.initial}</span>{"\n            "}
            <strong style={{flex: "0 0 64px", overflow: "hidden", textOverflow: "ellipsis"}}>{m?.name}</strong>{"\n            "}
            <span style={{flex: "0 0 auto", fontSize: "12px", color: "#6b767f"}}>{m?.time}</span>{"\n            "}
            <span style={{minWidth: "0", color: "#c3c8cd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{m?.text}</span>{"\n          "}
          </li>{"\n        "}
        </React.Fragment>))}
        {v.noChat ? <li style={{fontSize: "14px", lineHeight: "20px", color: "#a0a5ad"}}>{v.liveNow ? "暫時未有聊天訊息，進入直播間一起討論。" : "直播開始後，聊天室訊息會在這裡顯示。"}</li> : null}{"\n      "}
      </ul>{"\n    "}
    </div>{"\n  "}
  </section>{"\n\n  "}
  {v.hasFeed ? (<>
  <section aria-labelledby="feed-title" style={{display: "flex", alignItems: "stretch", minHeight: "60px", borderRadius: "6px", border: "1px solid #282d36", background: "#0b0e12", overflow: "hidden"}}>{"\n    "}
    <div style={{flex: "0 0 auto", display: "flex", alignItems: "center", gap: "8px", padding: "0 16px", background: "#4a0511", borderRight: "1px solid #ae031d"}}>{"\n      "}
      <svg width="24" height="24" viewBox="0 0 24 24" fill="#ff4d68" aria-hidden="true">
        <path d="M3 10v4a1 1 0 0 0 1 1h2l5 4V5L6 9H4a1 1 0 0 0-1 1z"></path>
        <path d="M15 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="#ff4d68" strokeWidth="1.8" strokeLinecap="round"></path>
      </svg>{"\n      "}
      <h2 id="feed-title" style={{margin: "0", fontSize: "18px", lineHeight: "24px", fontWeight: "900", whiteSpace: "nowrap"}}>{"最新動態"}</h2>{"\n    "}
    </div>{"\n    "}
    <div className="ld-ticker" style={{flex: "1 1 auto", minWidth: "0", display: "flex", alignItems: "center", overflow: "hidden"}}>{"\n      "}
      <div className="ld-ttrack" style={{display: "flex", alignItems: "center", width: "max-content"}}>{"\n        "}
        <ul style={{listStyle: "none", margin: "0", padding: "0", display: "flex", alignItems: "center"}}>{"\n          "}
          {(Array.isArray(v.feed) ? v.feed : []).map((f, $index) => (<React.Fragment key={$index}>{"\n          "}
            <li style={{flex: "0 0 auto", display: "flex", alignItems: "center", gap: "10px", padding: "0 22px", borderRight: "1px solid #282d36", whiteSpace: "nowrap", fontSize: "14px", lineHeight: "20px"}}>{"\n            "}
              <img src={asset(f?.img)} alt="" style={{flex: "0 0 auto", display: "block", width: "28px", height: "38px", objectFit: `${asset(f?.fit) ?? ''}`, borderRadius: "3px", boxShadow: `${asset(f?.glow) ?? ''}`}} />{"\n            "}
              <span style={{color: "#c3c8cd"}}>{f?.who}{" 抽中了"}</span>{"\n            "}
              <strong style={{color: "#ffffff"}}>{f?.card}</strong>{"\n            "}
              <span style={{fontSize: "12px", color: "#6b767f"}}>{f?.when}</span>{"\n          "}
            </li>{"\n          "}
          </React.Fragment>))}{"\n        "}
        </ul>{"\n        "}
        <ul aria-hidden="true" style={{listStyle: "none", margin: "0", padding: "0", display: "flex", alignItems: "center"}}>{"\n          "}
          {(Array.isArray(v.feed) ? v.feed : []).map((f, $index) => (<React.Fragment key={$index}>{"\n          "}
            <li style={{flex: "0 0 auto", display: "flex", alignItems: "center", gap: "10px", padding: "0 22px", borderRight: "1px solid #282d36", whiteSpace: "nowrap", fontSize: "14px", lineHeight: "20px"}}>{"\n            "}
              <img src={asset(f?.img)} alt="" style={{flex: "0 0 auto", display: "block", width: "28px", height: "38px", objectFit: `${asset(f?.fit) ?? ''}`, borderRadius: "3px", boxShadow: `${asset(f?.glow) ?? ''}`}} />{"\n            "}
              <span style={{color: "#c3c8cd"}}>{f?.who}{" 抽中了"}</span>{"\n            "}
              <strong style={{color: "#ffffff"}}>{f?.card}</strong>{"\n            "}
              <span style={{fontSize: "12px", color: "#6b767f"}}>{f?.when}</span>{"\n          "}
            </li>{"\n          "}
          </React.Fragment>))}{"\n        "}
        </ul>{"\n      "}
      </div>{"\n    "}
    </div>{"\n  "}
  </section>
  </>) : null}
</main>
</>);
};

const CHAT_COLORS = [["#4a0511", "#ffffff"], ["#21252d", "#ffffff"], ["#3a2a00", "#ffe390"], ["#13161b", "#ffffff"]];

function useLiveRoom() {
  const [room, setRoom] = useState(null);
  useEffect(() => onSnapshot(query(collection(db, "draws"), where("status", "==", "live")), (snapshot) => {
    const rooms = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    setRoom(rooms[0] || null);
  }, (error) => console.error("Live room listener failed.", error)), []);
  return room;
}

function useShowcase() {
  const [cards, setCards] = useState([]);
  useEffect(() => onSnapshot(
    query(collection(db, "publicCardShowcase"), where("active", "==", true), orderBy("tokenValue", "desc"), limit(6)),
    (snapshot) => setCards(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) => console.error("Showcase listener failed.", error),
  ), []);
  return cards;
}

function useLatestChat(drawId) {
  const [messages, setMessages] = useState([]);
  useEffect(() => {
    if (!drawId) { setMessages([]); return undefined; }
    return onSnapshot(query(collection(db, "draws", drawId, "messages"), orderBy("createdAt", "asc"), limitToLast(5)),
      (snapshot) => setMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      (error) => console.error("Home chat listener failed.", error));
  }, [drawId]);
  return messages;
}

const hkTime = (value) => {
  const ms = toMillis(value);
  return ms ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Hong_Kong", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms)) : "";
};

export default function HomeRoute({ session }) {
  const room = useLiveRoom();
  const showcase = useShowcase();
  const messages = useLatestChat(room?.id);
  const packs = showcase.map((card) => ({
    name: card.name || "", price: fmt(card.tokenValue), img: card.thumbUrl || card.imageUrl || "images/logo-mark.png",
  }));
  const chat = messages.map((m, index) => {
    const [bg, fg] = CHAT_COLORS[index % CHAT_COLORS.length];
    const name = m.username || "玩家";
    return { name, time: hkTime(m.createdAt), text: m.text || "", bg, fg, initial: name.charAt(0).toUpperCase() };
  });
  return <HomePage loggedIn={session.signedIn} live={Boolean(room)} packs={packs} chat={chat} feed={[]} />;
}
