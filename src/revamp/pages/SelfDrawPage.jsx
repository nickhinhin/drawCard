/* eslint-disable */
// From the LiveDraw revamp design (SelfDraw.html). The wizard and animations are the
// design's; the card pool, prices, balance, daily limit and draw results are real
// (publicSiteSettings/instantDraw + the instantDraw function). Boost is not offered here yet.
import React from "react";
import { DCLogic, route, asset } from "../runtime.jsx";
import { formatTokenNumber, getInstantDrawMode, getSafeErrorMessage, hongKongDayKey, useInstantDrawSettings } from "../../App.jsx";
import { functions } from "../../firebase";
import { httpsCallable } from "firebase/functions";

const MODE_KEYS = { half: "1/2", tenth: "1/10" };
const EMPTY_PACK = { id: "", cat: "", name: "", half: 0, tenth: 0, img: "" };

const CSS = "\nbody{margin:0;background:#0b0e12}\n*{box-sizing:border-box}\na{color:#ffffff;text-decoration:none}a:hover{color:#ffe390}\nbutton,input,textarea{font-family:inherit}\nbutton:disabled{cursor:not-allowed}\n:focus-visible{outline:2px solid #f4022b;outline-offset:2px}\ninput::placeholder,textarea::placeholder{color:#6b767f}\n.ld-nav{transition:background-color 150ms,color 150ms}\n.ld-nav:hover{background-color:#13161b !important;color:#ffffff !important}\n.ld-lift{transition:border-color 150ms,box-shadow 150ms}\n.ld-lift:hover{border-color:#6b767f !important}\n.ld-tile{transition:transform 150ms,box-shadow 150ms,border-color 150ms}\n.ld-tile:hover{border-color:#f4022b !important;transform:translateY(-2px)}\n.ld-tile:active{transform:translateY(3px)}\n.ld-link:hover{color:#ffffff !important}\n@keyframes ld-shimmer{0%{transform:translateX(-160%) skewX(-20deg)}55%,100%{transform:translateX(420%) skewX(-20deg)}}\n@keyframes ld-bulb{0%,100%{background-color:#fff4c2;box-shadow:0 0 6px rgba(255,244,194,.9),0 0 12px rgba(253,200,0,.6)}50%{background-color:#5c4300;box-shadow:none}}\n@keyframes ld-flip{0%{transform:rotateY(90deg);opacity:.2}100%{transform:rotateY(0);opacity:1}}\n@keyframes ld-float{0%,100%{translate:0 0}50%{translate:0 -10px}}\n@keyframes ld-flicker{0%{opacity:.35}6%{opacity:.95}8%{opacity:.4}11%{opacity:1}30%{opacity:.75}33%{opacity:.3}36%{opacity:.9}55%{opacity:.6}58%{opacity:1}61%{opacity:.5}80%{opacity:.85}100%{opacity:.35}}\n@keyframes ld-cardA{0%,100%{translate:0 0;rotate:0deg}50%{translate:6px -18px;rotate:-6deg}}\n@keyframes ld-cardB{0%,100%{translate:0 0;rotate:0deg}50%{translate:-6px -14px;rotate:5deg}}\n@keyframes ld-breathe{0%,100%{opacity:.55}50%{opacity:1}}\n@keyframes ld-led{0%,100%{opacity:.25}50%{opacity:1}}\n@keyframes ld-pulse{0%,100%{filter:drop-shadow(0 0 6px rgba(244,2,43,.7))}50%{filter:drop-shadow(0 0 22px rgba(255,60,80,1))}}\n.ld-t3{transition:transform 160ms,filter 160ms}\n.ld-t3:hover{transform:translateY(-8px);filter:brightness(1.3) drop-shadow(0 10px 10px rgba(0,0,0,.6)) !important}\n.ld-t3:active{transform:translateY(4px)}\n.ld-t3sel{animation:ld-pulse 1600ms ease-in-out infinite}\n@keyframes ld-reveal{from{transform:scale(.86);opacity:0}to{transform:scale(1);opacity:1}}\n@keyframes ld-rvin{from{opacity:0;visibility:hidden}to{opacity:1;visibility:visible}}\n@keyframes ld-pop{from{opacity:0;transform:scale(.6) translateY(24px)}to{opacity:1;transform:none}}\n@keyframes ld-slabout{from{transform:rotateY(0);opacity:1}to{transform:rotateY(90deg);opacity:0}}\n@keyframes ld-cardin{from{transform:rotateY(-90deg);opacity:0}to{transform:rotateY(0);opacity:1}}\n@keyframes ld-goldpulse{0%,100%{box-shadow:0 0 0 2px #fdc800,0 0 24px rgba(253,200,0,.45)}50%{box-shadow:0 0 0 2px #ffe390,0 0 48px rgba(253,200,0,.85)}}\n@keyframes ld-skiphide{to{opacity:0;visibility:hidden}}\n@keyframes ld-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4%)}}\n@keyframes ld-twinkle{0%,100%{opacity:.25;transform:scale(.7)}50%{opacity:1;transform:scale(1.05)}}\n@keyframes ld-spinflat{from{transform:scaleY(.3) rotate(0deg)}to{transform:scaleY(.3) rotate(360deg)}}\n@keyframes ld-glow{0%,100%{filter:drop-shadow(0 0 4px rgba(255,220,140,.35))}50%{filter:drop-shadow(0 0 16px rgba(255,220,140,.75))}}\n@keyframes ld-btnpulse{0%,100%{filter:brightness(1)}50%{filter:brightness(1.18)}}\n@keyframes ld-tileout{from{transform:rotateY(0);opacity:1}to{transform:rotateY(90deg);opacity:0}}\n@keyframes ld-tilein{from{transform:rotateY(-90deg)}to{transform:rotateY(0)}}\n@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none !important;transition:none !important}}\n\n.ld-menubtn,.ld-tabbar,.ld-drawer-close,.ld-backdrop{display:none}\n.ld-g4 svg{flex-shrink:0}\n.ld-bhide{display:none !important}\n.ld-bwait .ld-stage{display:none !important}\n.ld-bwait .ld-prow{flex-wrap:wrap !important;justify-content:center !important;padding:20px 8px 28px !important;gap:18px 16px !important}\n.ld-bwait .ld-btitle{order:-1 !important;flex:1 1 100%}\n.ld-bwait .ld-hpanel{width:min(300px,calc(50% - 8px)) !important}\n.ld-bwait .ld-mpct{font-size:46px !important;line-height:46px !important}\n.ld-bwait .ld-mratio{font-size:16px !important}\n.ld-bwait .ld-mcount{font-size:16px !important;line-height:22px !important}\n.ld-bwait .ld-btitle > span:first-child{font-size:48px !important;line-height:52px !important}\n.ld-bwait .ld-btitle > span:last-child{font-size:16px !important}\n.ld-steps{display:flex !important;gap:8px !important}\n.ld-steps > li{flex:0 0 40px}\n.ld-steps > li.ld-stepcur{flex:1 1 auto}\n.ld-steps > li:not(.ld-stepcur) .ld-slbl{display:none}\n.ld-steps .ld-stepcur .ld-slbl{overflow:visible !important}\n@media (max-width:760px){\n.ld-root{padding-bottom:68px}\n.ld-header{padding:8px 12px !important;gap:8px !important;flex-wrap:nowrap !important;position:sticky;top:0;z-index:40}\n.ld-search,.ld-hide-m,.ld-uname{display:none !important}\n.ld-logo{width:auto !important;flex:1 1 auto !important;min-width:0}\n.ld-logo img{width:104px !important;height:auto !important}\n.ld-tools{gap:6px !important;flex-wrap:nowrap !important}\n.ld-tools > a,.ld-tools > button,.ld-tools > span > button{height:38px !important}\n.ld-menubtn{display:flex !important}\n.ld-boardcol{position:static !important}\n.ld-modehero{padding:20px 10px 16px !important;gap:8px !important;margin:0 -4px;background-image:url('/revamp/images/gm-bg-m.webp') !important;background-position:center top !important}\n.ld-mcards{gap:10px !important}\n.ld-g2{padding:16px 10px 4px !important;gap:12px !important;margin:0 -4px;background-image:url('/revamp/images/g2-bg-m.webp') !important}\n.ld-g2grid{grid-template-columns:repeat(3,minmax(0,1fr)) !important;gap:8px !important}\n.ld-g2card{padding:8px 6px !important;gap:5px !important;border-radius:10px !important}\n.ld-g2psa{font-size:12px !important;line-height:18px !important;padding:0 10px !important}\n.ld-g2img{width:78% !important}\n.ld-g2name{font-size:11px !important;line-height:15px !important;height:30px !important}\n.ld-g2price{font-size:18px !important;line-height:20px !important}\n.ld-g2coin{width:16px;height:16px}\n.ld-g2deco{width:46px !important;height:46px !important;opacity:.85}\n.ld-g2 > .ld-g2deco:nth-of-type(1){top:auto !important;bottom:30% !important;left:-2% !important}\n.ld-g2 > .ld-g2deco:nth-of-type(2){top:auto !important;bottom:44% !important;right:-2% !important}\n.ld-g2 [aria-label=\"卡牌類別\"] > button{padding:0 12px !important;font-size:14px !important;height:36px !important;line-height:34px !important}\n#g2-title{font-size:26px !important;line-height:32px !important}\n.ld-g4panel{padding:16px 12px 18px !important;gap:12px !important;border-radius:16px !important}\n.ld-g4title{font-size:38px !important;line-height:44px !important}\n.ld-g4body{flex-direction:column !important;align-items:stretch !important;gap:12px !important}\n.ld-g4body > div:last-child{width:100%}\n.ld-g4card{flex:0 0 auto !important;width:62% !important;align-self:center}\n.ld-g4total{font-size:44px !important;line-height:48px !important}\n.ld-g3title{font-size:26px !important;line-height:32px !important}\n.ld-gtitle{margin:4px 0 -18px !important}\n.ld-spark{width:44px !important;height:44px !important}\n.ld-mpct{font-size:26px !important;line-height:26px !important}\n.ld-mratio{font-size:11px !important}\n.ld-mcount{font-size:11px !important;line-height:15px !important}\n.ld-bwait .ld-hpanel{width:calc(50% - 4px) !important}\n.ld-bwait .ld-mpct{font-size:34px !important;line-height:34px !important}\n.ld-bwait .ld-mratio{font-size:12px !important}\n.ld-bwait .ld-mcount{font-size:12px !important}\n.ld-bwait .ld-prow{padding:6px 0 10px !important;gap:12px 8px !important}\n.ld-actbar{position:sticky;bottom:72px;z-index:30;box-shadow:0 -8px 24px rgba(0,0,0,.6)}\n.ld-rvcard{width:128px !important}\n.ld-helptxt{display:none}\n.ld-wiz{padding:14px 12px 16px !important;gap:14px !important}\n.ld-steps{gap:6px !important}\n.ld-steps > li{flex:0 0 26px}\n.ld-steps .ld-stepcur .ld-slbl{font-size:19px !important}\n.ld-cgrid{grid-template-columns:repeat(4,minmax(0,1fr)) !important;gap:5px !important}\n.ld-ccard{padding:4px !important;gap:3px !important}\n.ld-ccard > span:first-of-type{padding:3px 0 !important}\n.ld-cname{font-size:10px !important;line-height:13px !important;height:26px !important}\n.ld-cprice{font-size:15px !important;line-height:18px !important}\n.ld-ccard svg[width=\"16\"]{width:12px;height:12px}\n.ld-main h1{font-size:34px !important;line-height:40px !important}\n#packs{margin:8px 0 0 !important;border-radius:0 !important;border-left:0 !important;border-right:0 !important}\n.ld-prow{flex-wrap:wrap !important;padding:0 !important;gap:8px !important}\n.ld-btitle{order:-1 !important;flex:1 1 100%}\n.ld-hpanel{width:calc(50% - 4px) !important}\n.ld-tools > a:first-child > span:last-child,.ld-tools > span > button > span{display:none !important}\n.ld-logo{min-width:96px !important}\n.ld-bleed{margin:-12px -12px 0 !important}\n.ld-tools > span > button{padding:0 8px !important;gap:4px !important}\n.ld-tools > span > button > svg:last-child{display:none}\n.ld-tools > button{width:38px !important}\n.ld-tools > a:last-child{padding:0 3px !important;border:0 !important}\n.ld-tools > a:first-child{padding:0 4px 0 8px !important;gap:5px !important;font-size:17px !important}\n.ld-side{display:none !important}\n.ld-side.ld-side-open{display:flex !important;position:fixed;top:0;left:0;bottom:0;width:min(300px,84vw);z-index:80;overflow-y:auto;box-shadow:12px 0 40px rgba(0,0,0,.6)}\n.ld-side.ld-side-open .ld-drawer-close{display:flex !important}\n.ld-backdrop{display:block !important;position:fixed;top:0;right:0;bottom:0;left:0;z-index:79;border:0;background:rgba(0,0,0,.6)}\n.ld-main{padding:12px !important;gap:12px !important}\n.ld-footer{padding:24px 16px 20px !important;gap:16px !important}\n.ld-tabbar{display:flex !important;position:fixed;left:0;right:0;bottom:0;z-index:60;height:64px;background:#080b0e;border-top:1px solid #282d36}\n}\n";

class SelfDrawPage extends DCLogic {
  constructor(...args) {
    super(...args);
    this.state = { step: 1, packId: '', mode: 'half', picks: [], phase: 'pick', round: 0, drawing: false, helpOpen: false, result: null, flash: null, chosen: false, cat: '全部', range: 'all', sort: 'high', revealOpen: false, skip: false };
    this._setBoard = (el) => { if (el) this._board = el; };
    this._setWiz = (el) => { this._wiz = el; };
    this._scale = 0.5;
    this._setStage = (el) => {
      if (!el || typeof ResizeObserver === 'undefined') return;
      if (this._ro) { this._ro.disconnect(); this._ro = null; }
      const apply = () => { const w = el.clientWidth; if (w > 0) { const sc = w / 1232; if (Math.abs(sc - this._scale) > 0.001) { this._scale = sc; this.setState({ scaleTick: (this.state.scaleTick || 0) + 1 }); } } };
      this._ro = new ResizeObserver(apply); this._ro.observe(el); apply();
    };
  }

  componentWillUnmount() {
    if (this._ro) this._ro.disconnect();
    if (this._advT) clearTimeout(this._advT);
  }

  static staticData() {
    if (this._static) return this._static;
    const bulbs = [];
    for (let i = 0; i < 10; i++) bulbs.push({ delay: i % 2 ? '600ms' : '0ms' });
    const ledPts = [[491, 143], [519, 143], [547, 143], [576, 143], [604, 143], [1007, 143], [1036, 143], [1065, 143], [1094, 143], [245, 308], [231, 355], [215, 405], [197, 458], [178, 513], [1318, 305], [1332, 355], [1340, 405], [1365, 460], [1385, 515]];
    const leds = ledPts.map((p, i) => ({ x: p[0], y: p[1], delay: ((i % 5) * 180) + 'ms' }));
    this._static = { bulbs, leds };
    return this._static;
  }

  data() {
    const settings = this.props.settings;
    const session = this.props.session || {};
    const profile = session.profile;
    const price = (card, key) => Number(card?.modePrices?.[key] || 0);
    const allowed = (card, mode) => !Array.isArray(card?.allowedShareModes) || card.allowedShareModes.includes(mode);
    const packs = (Array.isArray(settings?.cards) ? settings.cards : []).map((card) => ({
      id: card.id, cat: card.category || '其他', name: card.name || '', type: card.category || '',
      half: allowed(card, '1/2') ? price(card, 'half') : 0,
      tenth: allowed(card, '1/10') ? price(card, 'tenth') : 0,
      img: card.thumbUrl || card.imageUrl || ''
    })).filter((p) => p.half > 0 || p.tenth > 0);
    const cats = ['全部'];
    packs.forEach((p) => { if (!cats.includes(p.cat)) cats.push(p.cat); });
    const limit = Number.isSafeInteger(Number(settings?.dailyTokenLimit)) ? Number(settings.dailyTokenLimit) : 500;
    const spent = profile?.instantDrawDay === hongKongDayKey() ? Number(profile.instantDrawSpent || 0) : 0;
    return Object.assign({}, SelfDrawPage.staticData(), {
      packs, cats, spent,
      cap: limit > 0 ? limit : Infinity,
      balance: Math.round(Number(profile?.tokens || 0)),
      signedIn: Boolean(session.signedIn)
    });
  }

  async drawNow(pack, mode, picks, unit) {
    const session = this.props.session || {};
    if (!session.signedIn) { session.openLogin && session.openLogin('請先登入或註冊，即可玩天堂與地獄自助抽卡。'); return; }
    if (!session.ready || this.state.drawing) return;
    this.setState({ drawing: true });
    try {
      const { data } = await httpsCallable(functions, 'instantDraw')({ cardId: pack.id, shareMode: MODE_KEYS[mode], numbers: picks, unitPrice: unit, boost: '' });
      const draws = Array.isArray(data?.draws) ? data.draws : [];
      // The server returns the player's numbers; a full board is shown only if it sends one.
      const board = Array.isArray(data?.board) && data.board.length === 20 ? data.board : null;
      const heaven = board
        ? board.map((side, i) => (side === 'heaven' ? i + 1 : 0)).filter(Boolean)
        : draws.filter((x) => x.resultSide === 'heaven').map((x) => x.number);
      this.setState({ drawing: false, phase: 'result', result: { heaven, draws, full: Boolean(board) }, revealOpen: true, skip: false });
      setTimeout(() => { const el = this._board;
      if (el && el.getBoundingClientRect && typeof window !== 'undefined') { const top = el.getBoundingClientRect().top; if (top < 0 || top > window.innerHeight * 0.4) { try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} } } }, 60);
    } catch (error) {
      this.setState({ drawing: false });
      window.alert(getSafeErrorMessage(error, '抽卡失敗，請稍後再試。'));
    }
  }

  _renderVals0() {
    const d = this.data();
    const st = this.state;
    const fmt = (n) => Number(n).toLocaleString('en-US');
    const SEL = '0 0 0 2px #f4022b, 0 0 24px rgba(244, 2, 43, 0.45)';
    const pack = d.packs.find((p) => p.id === st.packId) || EMPTY_PACK;
    const unit = st.mode === 'half' ? pack.half : pack.tenth;
    const picks = st.picks.slice().sort((a, b) => a - b);
    const total = unit * picks.length;
    const remaining = Math.max(0, d.cap - d.spent);
    const balance = d.balance;
    const isResult = st.phase === 'result' && !!st.result;
    const heaven = isResult ? st.result.heaven : [];
    const half = st.mode === 'half';
    const step = st.step;
    const finished = isResult;

    const goStep = (n, extra) => {
      this.setState(Object.assign({ step: n }, extra || {}));
      const el = this._wiz;
      if (el && el.getBoundingClientRect && typeof window !== 'undefined') {
        const top = el.getBoundingClientRect().top;
        if (top < 0 || top > window.innerHeight * 0.5) { try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
      }
    };
    const later = (fn) => { if (this._advT) clearTimeout(this._advT); this._advT = setTimeout(fn, 260); };

    const LABELS = ['選擇玩法', '選擇卡牌', '選擇號碼', '確認開卡'];
    const stepBar = LABELS.map((label, i) => {
      const n = i + 1;
      const cur = !finished && step === n;
      const done = finished || step > n;
      return {
        label: label, liCls: cur ? 'ld-stepcur' : '', current: cur ? 'step' : undefined, dot: done ? '✓' : String(n),
        numSize: cur ? '30px' : '16px', numColor: cur ? '#f4022b' : (done ? '#f4022b' : '#4a525c'),
        size: cur ? '22px' : '13px', lh: cur ? '28px' : '18px',
        bar: cur || done ? '#f4022b' : '#21252d', glow: cur ? '0 0 10px rgba(244, 2, 43, 0.7)' : 'none',
        color: cur ? '#ffffff' : (done ? '#c3c8cd' : '#6b767f'), weight: cur ? '900' : '500'
      };
    });

    const TITLES = [
      ['選擇玩法', ''],
      ['選擇卡牌', ''],
      ['選擇號碼', '在號碼盤上按號碼，可選多個；每個號碼 ' + fmt(unit) + ' 代幣。'],
      ['確認開卡', '確認後即時開卡，揭曉天堂與地獄。']
    ];
    const summary = [];
    if (step >= 2) summary.push({ k: '玩法', v: half ? '50%機率' : '10%機率' });
    if (step >= 3) summary.push({ k: '卡牌', v: pack.name });
    const priceOf = (x) => (half ? x.half : x.tenth);

    const RANGES = [
      { id: 'all', name: '全部', ok: () => true },
      { id: 'lo', name: '2,000 以下', ok: (v) => v < 2000 },
      { id: 'mid', name: '2,000 – 4,000', ok: (v) => v >= 2000 && v <= 4000 },
      { id: 'hi', name: '4,000 以上', ok: (v) => v > 4000 }
    ];
    const curCat = st.cat || '全部';
    const curRange = RANGES.find((r) => r.id === st.range) || RANGES[0];
    const chipStyle = (on) => ({ on: on, pillBg: on ? 'linear-gradient(180deg, #e0103a 0%, #a8001e 100%)' : 'transparent', pillBorder: on ? '#ff5a74' : 'transparent', pillGlow: on ? '0 0 14px rgba(244, 2, 43, 0.6)' : 'none', pillCount: on ? '#ffd0d8' : '#8a8f98', line: on ? '#f4022b' : 'transparent', color: on ? '#ffffff' : '#a0a5ad', weight: on ? '700' : '500', countColor: on ? '#ff4d68' : '#6b767f' });
    const catChips = d.cats.map((k) => Object.assign({ name: k, count: d.packs.filter((x) => priceOf(x) > 0 && (k === '全部' || x.cat === k)).length, pick: () => this.setState({ cat: k }) }, chipStyle(k === curCat)));
    const rangeChips = RANGES.map((r) => ({ id: r.id, name: r.name }));
    const sortHigh = st.sort !== 'low';
    const shown = d.packs.filter((x) => priceOf(x) > 0 && (curCat === '全部' || x.cat === curCat) && curRange.ok(priceOf(x))).sort((a, b) => sortHigh ? priceOf(b) - priceOf(a) : priceOf(a) - priceOf(b));
    const packsList = shown.map((p) => {
      const sel = p.id === pack.id && !!st.chosen;
      return {
        name: p.name, priceText: fmt(priceOf(p)), img: p.img || '', pressed: sel,
        pick: () => this.setState({ packId: p.id, picks: [], flash: null, chosen: true }),
        gBorder: sel ? '#ff3355' : '#2a2d36', gGlow: sel ? '0 0 0 1px #ff3355, 0 0 24px rgba(244, 2, 43, 0.65), inset 0 0 24px rgba(244, 2, 43, 0.25)' : '0 6px 16px rgba(0, 0, 0, 0.5)', gLift: sel ? 'translateY(-2px)' : 'none',
        border: sel ? '#f4022b' : '#282d36', bg: sel ? '#181015' : '#0b0e12', glow: sel ? SEL : 'none', cls: sel ? '' : 'ld-lift'
      };
    });

    const modes = [
      { id: 'half', ratio: '50%機率', pct: '1/2', heaven: 10, hell: 10, hot: true, tag: '', foot: '', frame: 'images/gm-frame-blue.webp', icon: 'images/gm-wings.webp', plat: 'images/gm-plat-blue.webp', circle: 'images/gm-circle-blue.webp', edge: 'linear-gradient(180deg, #9fd4ff 0%, #2f7bff 50%, #e8b84a 100%)', inner: 'radial-gradient(80% 50% at 50% 30%, rgba(60, 140, 255, 0.45) 0%, rgba(60, 140, 255, 0) 70%), linear-gradient(180deg, #0a1f4d 0%, #061230 60%, #040a1c 100%)', bigGrad: 'linear-gradient(180deg, #ffffff 35%, #8ec9ff 100%)', ring: 'rgba(110, 180, 255, 0.55)', price: pack.half, img: 'images/selfdraw-panel-heaven.webp', col: '#c2ebff', glow: 'rgba(79, 179, 255, 0.9)', order: 0 },
      { id: 'tenth', ratio: '10%機率', pct: '1/10', heaven: 2, hell: 18, hot: false, tag: '', foot: '', frame: 'images/gm-frame-red.webp', icon: 'images/gm-crown.webp', plat: 'images/gm-plat-red.webp', circle: 'images/gm-circle-red.webp', edge: 'linear-gradient(180deg, #ff8a9c 0%, #e0103a 50%, #e8b84a 100%)', inner: 'radial-gradient(80% 50% at 50% 30%, rgba(255, 40, 80, 0.45) 0%, rgba(255, 40, 80, 0) 70%), linear-gradient(180deg, #4a0618 0%, #2a030e 60%, #160208 100%)', bigGrad: 'linear-gradient(180deg, #ffffff 35%, #ff9aab 100%)', ring: 'rgba(255, 77, 104, 0.55)', price: pack.tenth, img: 'images/selfdraw-panel-hell.webp', col: '#ff8a9c', glow: 'rgba(244, 2, 43, 0.9)', order: 2 }
    ].map((m) => {
      const sel = st.mode === m.id;
      return {
        ratio: m.ratio, pct: m.pct, heaven: m.heaven, hell: m.hell, hot: m.hot, on: sel, panelImg: m.img, order: m.order,
        tag: m.tag, foot: m.foot, edge: m.edge, inner: m.inner, bigGrad: m.bigGrad, ring: m.ring, isHalf: m.id === 'half', isTenth: m.id !== 'half', frameImg: m.frame, iconImg: m.icon, platImg: m.plat, circleImg: m.circle, platOp: sel ? 1 : 0.6, aria: m.pct + '・' + m.ratio + '・' + m.heaven + ' 天堂 ' + m.hell + ' 地獄',
        cardFilter: sel ? ('drop-shadow(0 0 22px ' + m.glow + ')') : 'grayscale(0.5) brightness(0.5)', cardScale: sel ? 'scale(1)' : 'scale(0.94)',
        textGlow: '0 0 12px ' + m.glow, filter: sel ? ('drop-shadow(0 0 14px ' + m.glow + ')') : 'grayscale(0.7) brightness(0.55)', scale: sel ? 'scale(1)' : 'scale(0.94)',
        pick: () => { if (this.state.phase === 'result' || this.state.step === 4) return; if (this.state.mode !== m.id) this.setState({ mode: m.id, picks: [] }); },
        border: sel ? '#f4022b' : '#282d36', bg: sel ? '#181015' : '#0b0e12', glow: sel ? SEL : 'none',
        pctColor: m.col, cls: ''
      };
    });

    const canPick = !isResult && step === 3;
    const togglePick = (n) => {
      if (this.state.phase === 'result' || this.state.step !== 3) return;
      const cur = this.state.picks.slice();
      const at = cur.indexOf(n);
      if (at === -1) cur.push(n); else cur.splice(at, 1);
      this.setState({ picks: cur });
    };

    const skip = !!st.skip;
    const others = []; if (!isResult || st.result.full) for (let n = 1; n <= 20; n++) if (picks.indexOf(n) === -1) others.push(n);
    const flipStart = (n) => {
      if (skip) return 0;
      const mi = picks.indexOf(n);
      return mi !== -1 ? 300 + mi * 450 : 300 + picks.length * 450 + 200 + others.indexOf(n) * 35;
    };
    const rvDelayMs = skip ? 0 : 300 + picks.length * 450 + 200 + others.length * 35 + 500;
    const numbers = [];
    for (let n = 1; n <= 20; n++) {
      const mine = picks.indexOf(n) !== -1;
      const isH = heaven.indexOf(n) !== -1;
      const IMG = { normal: 'images/g3-t-normal.webp', sel: 'images/g3-t-sel.webp', heaven: 'images/g3-t-heaven.webp', hell: 'images/g3-t-hell.webp' };
      let t;
      // Without the full board only the player's own numbers are revealed.
      const known = mine || (isResult && st.result.full);
      if (!isResult || !known) {
        t = {
          img: mine ? IMG.sel : IMG.normal, numTop: '30%', sub: '', subColor: '#ffffff', cursor: canPick && !isResult ? 'pointer' : 'default', imgAnim: 'none', subAnim: 'none', hasCover: false, coverImg: '', coverDelay: '0ms',
          cls: canPick && !isResult ? 'ld-t3' : '', anim: mine && !isResult ? 'ld-pulse 1600ms ease-in-out infinite' : 'none', filter: isResult ? 'brightness(0.5)' : 'drop-shadow(0 6px 6px rgba(0, 0, 0, 0.55))'
        };
      } else {
        t = {
          img: isH ? IMG.heaven : IMG.hell, numTop: '18%', sub: isH ? '天堂' : '地獄', subColor: isH ? '#c2ebff' : '#ffd7c1', cursor: 'default', cls: '',
          anim: 'none', hasCover: !skip, coverImg: mine ? IMG.sel : IMG.normal, coverDelay: flipStart(n) + 'ms',
          imgAnim: skip ? 'none' : ('ld-tilein 320ms ease-out ' + (flipStart(n) + 240) + 'ms both'),
          subAnim: skip ? 'none' : ('ld-rvin 200ms ease-out ' + (flipStart(n) + 420) + 'ms both'),
          filter: mine ? (isH ? 'drop-shadow(0 0 16px rgba(79, 179, 255, 1))' : 'drop-shadow(0 0 14px rgba(244, 2, 43, 0.9))') : 'brightness(0.82)'
        };
      }
      numbers.push(Object.assign(t, {
        n: n, mine: mine, mineTag: isResult && mine, hasSub: !!t.sub,
        aria: isResult ? ('號碼 ' + n + '：' + t.sub + (mine ? '（我的號碼）' : '')) : ('號碼 ' + n + (mine ? '，已選' : (canPick ? '，未選' : '，請先完成上一步'))),
        toggle: () => togglePick(n)
      }));
    }

    let warnText = '';
    if (!d.signedIn) warnText = '';
    else if (picks.length && total > remaining) warnText = '超出今日上限：今日尚可使用 ' + fmt(remaining) + ' 代幣。';
    else if (picks.length && total > balance) warnText = '代幣不足，請先充值或減少號碼。';
    const canNext = picks.length > 0 && !warnText;

    const confirm = () => {
      const s = this.state;
      if (s.phase === 'result' || !s.picks.length || s.drawing || !pack.id) return;
      if (d.signedIn && (total > remaining || total > balance)) return;
      this.drawNow(pack, s.mode, picks, unit);
    };

    const resultItems = isResult ? picks.map((n) => {
      const win = heaven.indexOf(n) !== -1;
      const got = (st.result.draws || []).find((x) => x.number === n) || {};
      return {
        n: n, outcome: win ? '天堂' : '地獄', win: win, img: got.cardImageUrl || (win ? pack.img : ''),
        prize: got.cardName || (win ? pack.name : ''),
        note: win ? '天堂：獲得所選卡牌' : '地獄：獲得保底卡牌',
        tileBg: win ? '#041737' : '#4a0511', tileBorder: win ? '#4fb3ff' : '#ae031d', tileColor: win ? '#c2ebff' : '#ffd7c1'
      };
    }) : [];
    const wins = resultItems.filter((r) => r.win).length;
    const revealItems = resultItems.map((r, k) => {
      const dl = skip ? k * 120 : rvDelayMs + 250 + k * 320;
      const slab = dl + 650;
      return {
        n: r.n, outcome: r.outcome, prize: r.prize, img: r.img, isHell: !r.win,
        tileBg: r.tileBg, tileBorder: r.tileBorder, tileColor: r.tileColor,
        delay: dl + 'ms', slabDelay: slab + 'ms',
        cardAnim: r.win ? ('ld-goldpulse 1800ms ease-in-out ' + (dl + 500) + 'ms infinite') : ('ld-cardin 480ms ease-out ' + (slab + 380) + 'ms both')
      };
    });

    return {
      balanceText: fmt(balance),
      wizRef: this._setWiz,
      stepBar: stepBar,
      stepCounter: finished ? '開卡完成' : ('第 ' + step + ' 步／共 4 步'), headTitle: finished ? '開卡結果' : TITLES[step - 1][0],
      stepCols: finished ? 'repeat(4, minmax(0, 1fr))' : LABELS.map((x, k) => (k + 1 === step ? '1.8fr' : '1fr')).join(' '),
      hasHint: !finished && !!TITLES[step - 1][1],
      catChips: catChips, rangeChips: rangeChips, range: curRange.id, rangeBorder: curRange.id === 'all' ? '#282d36' : '#f4022b', onRange: (e) => this.setState({ range: e.target.value }),
      cardCount: shown.length, noCards: shown.length === 0,
      sortLabel: sortHigh ? '高至低' : '低至高', sortAria: '排序：' + (sortHigh ? '價錢高至低' : '價錢低至高') + '，按一下切換',
      toggleSort: () => this.setState({ sort: this.state.sort === 'low' ? 'high' : 'low' }),
      canBack: !finished && step > 1,
      back: () => goStep(Math.max(1, this.state.step - 1)),
      helpOpen: !!st.helpOpen, toggleHelp: () => this.setState({ helpOpen: !this.state.helpOpen }),
      helpLines: [
        { k: '選擇玩法', v: '1/2 即 20 個號碼中有 10 個天堂；1/10 即有 2 個天堂，但每個號碼代幣較少。' },
        { k: '選擇卡牌', v: '抽中天堂即可獲得所選卡牌；抽中地獄可獲該卡的保底卡牌。卡牌會存入「我的卡牌」。' },
        { k: '選擇號碼', v: '在號碼盤選擇號碼，每個號碼分開計算代幣。' },
        { k: '確認開卡', v: '核對資料後確認，即時揭曉天堂與地獄。' }
      ],
      hasSummary: !finished && (step === 2 || step === 3), summary: summary,
      showStepTitle: !finished, stepNo: step, stepTitle: TITLES[step - 1][0], stepHint: TITLES[step - 1][1],
      isStep1: !finished && step === 1, isStep2: !finished && step === 2, isStep3: !finished && step === 3, isStep4: !finished && step === 4,
      showMain: finished || step > 4,
      rowTint: half ? 'rgba(20, 50, 110, 0.75)' : 'rgba(90, 10, 30, 0.75)', g4Cursor: warnText ? 'not-allowed' : 'pointer', g4Filter: warnText ? 'grayscale(0.85) brightness(0.6)' : 'none', g4Anim: warnText ? 'none' : 'ld-btnpulse 2.4s ease-in-out infinite',
      toCardsBack: () => goStep(2, { picks: [] }), clearPicks: () => this.setState({ picks: [] }),
      infoEdge: half ? '#4fb3ff' : '#ff3355', infoBg: half ? 'linear-gradient(90deg, rgba(6, 20, 52, 0.92) 0%, rgba(10, 34, 82, 0.85) 100%)' : 'linear-gradient(90deg, rgba(40, 4, 12, 0.92) 0%, rgba(74, 6, 24, 0.85) 100%)', infoGlow: half ? 'rgba(79, 179, 255, 0.35)' : 'rgba(244, 2, 43, 0.35)',
      g3Text: canNext ? '下一步：確認開卡' : (picks.length ? '代幣不足' : '請先選擇號碼'), g3Cursor: canNext ? 'pointer' : 'not-allowed', g3Filter: canNext ? 'none' : 'grayscale(0.85) brightness(0.6)', g3Anim: canNext ? 'ld-btnpulse 2.4s ease-in-out infinite' : 'none', toCards: () => goStep(2),
      badgeImg: half ? 'images/g2-badge-blue.webp' : 'images/g2-badge-red.webp', badgeIcon: half ? 'images/gm-wings.webp' : 'images/gm-crown.webp',
      badgePct: half ? '1/2' : '1/10', badgeTag: half ? '50%機率' : '10%機率', badgeGlow: half ? 'rgba(79, 179, 255, 0.9)' : 'rgba(244, 2, 43, 0.9)',
      g2Steps: LABELS.map((label, k) => {
        const n = k + 1, cur = step === n, done = step > n, last = n === LABELS.length;
        return {
          label: label, current: cur ? 'step' : undefined, dot: done ? '✓' : String(n), locked: !done,
          aria: done ? ('返回' + label) : (label + (cur ? '（目前步驟）' : '')),
          go: () => { if (done) goStep(n); },
          ring: cur ? '#ff3355' : (done ? '#ff3355' : '#4a4f5a'), bg: done ? 'linear-gradient(180deg, #ff2a4a, #b0001f)' : (cur ? '#1a060b' : '#14161c'),
          glow: (cur || done) ? '0 0 14px rgba(244, 2, 43, 0.7)' : 'none', cursor: done ? 'pointer' : 'default',
          color: cur ? '#ffffff' : (done ? '#e6e9ee' : '#8a8f98'), weight: cur ? '900' : '500',
          line: done ? '#f4022b' : '#3a3f4a', lineDisplay: last ? 'none' : 'block'
        };
      }),
      toNums: () => { if (this.state.chosen) goStep(3); }, numsOff: !st.chosen,
      numsText: st.chosen ? '下一步：選擇號碼' : '請先選擇卡牌', numsCursor: st.chosen ? 'pointer' : 'not-allowed',
      numsFilter: st.chosen ? 'none' : 'grayscale(0.85) brightness(0.6)', numsAnim: st.chosen ? 'ld-btnpulse 2.4s ease-in-out infinite' : 'none',
      modeLocked: isResult || step === 4, modeCursor: (isResult || step === 4) ? 'default' : 'pointer', subRevealAnim: (isResult && !skip) ? ('ld-rvin 300ms ease-out ' + rvDelayMs + 'ms both') : 'none', boardRef: this._setBoard, boardColCls: (!finished && step <= 2) ? 'ld-bhide' : '', boardLocked: false,
      showSkip: isResult && !!st.revealOpen && !skip, skipAnim: () => this.setState({ skip: true }), rvDelay: rvDelayMs + 'ms',
      revealOpen: isResult && !!st.revealOpen, closeReveal: () => this.setState({ revealOpen: false, skip: true }), revealItems: revealItems,
      rvTitle: wins > 0 ? '恭喜抽中天堂！' : '保底獎賞', rvTitleSize: wins > 0 ? '44px' : '34px',
      rvTitleGlow: wins > 0 ? '0 0 24px rgba(253, 200, 0, 0.6)' : '0 0 18px rgba(244, 2, 43, 0.5)',
      rvBg: wins > 0 ? 'radial-gradient(70% 60% at 50% 0%, rgba(253, 200, 0, 0.22) 0%, rgba(253, 200, 0, 0) 70%), #0b0e12' : 'radial-gradient(70% 60% at 50% 0%, rgba(244, 2, 43, 0.22) 0%, rgba(244, 2, 43, 0) 70%), #0b0e12',
      showBoard: true,
      packsList: packsList, modes: modes, numbers: numbers, leds: d.leds,
      stageRef: this._setStage, stageScale: this._scale,
      screenGlow: isResult ? (wins > 0 ? 'rgba(79, 179, 255, 0.28)' : 'rgba(244, 2, 43, 0.22)') : 'rgba(244, 2, 43, 0.1)',
      boardSubColor: isResult ? (wins > 0 ? '#c2ebff' : '#ffd7c1') : '#c3c8cd',
      boardTitle: isResult ? '開卡結果' : (step === 3 ? '選擇號碼' : (step === 4 ? '確認號碼' : '天堂與地獄')),
      boardSub: isResult ? (heaven.length ? ((st.result.full ? '天堂號碼：' : '你的天堂號碼：') + heaven.map((n) => '#' + n).join(' ')) : '你的號碼全部為地獄') : (step === 3 ? ('已選 ' + picks.length + ' / 20') : (step === 4 ? ('已選 ' + picks.length + ' 個號碼') : '先揀玩法，再揀卡牌')),
      heavenCount: half ? 10 : 2, hellCount: half ? 10 : 18,
      pickCount: picks.length, noPicks: picks.length === 0,
      pickChips: picks.map((n) => ({ n: n, aria: '移除號碼 ' + n, remove: () => togglePick(n) })), canNext: canNext,
      totalText: fmt(total), packValueText: fmt(Math.round(pack.half * 2.1)),
      hasWarn: !!warnText, warnText: warnText,
      barBorder: canNext ? '#f4022b' : '#282d36',
      nextDisabled: !canNext, next: () => { if (canNext) goStep(4); },
      enough: !warnText, notEnough: !!warnText || !!st.drawing,
      confirmText: st.drawing ? '開卡中…' : (d.signedIn ? '確認開卡' : '登入後開卡'),
      confirmBg: !warnText ? 'linear-gradient(180deg, #ffe390 0%, #fdc800 45%, #f88f00 100%)' : '#21252d', confirmColor: !warnText ? '#1a1300' : '#a0a5ad', confirmGlow: !warnText ? '0 0 0 2px #fdc800, 0 0 32px rgba(253, 200, 0, 0.45)' : 'none',
      nextBg: canNext ? '#f4022b' : '#21252d', nextColor: canNext ? '#ffffff' : '#a0a5ad',
      nextGlow: canNext ? '0 6px 20px rgba(244, 2, 43, 0.4)' : 'none',
      packName: pack.name, packImg: pack.img || '', unitText: fmt(unit),
      modeLine: (half ? '50%機率' : '10%機率') + '（' + (half ? '10 張天堂卡・10 張地獄卡' : '2 張天堂卡・18 張地獄卡') + '）',
      afterText: fmt(balance - total), capText: d.cap === Infinity ? '不設上限' : fmt(d.cap), remainingText: d.cap === Infinity ? '不設上限' : fmt(remaining),
      confirm: confirm,
      isResult: isResult, resultItems: resultItems,
      resultTitle: wins > 0 ? '天堂！' : '今局未有天堂號碼',
      resultSub: wins > 0 ? ('抽中 ' + wins + ' 個天堂號碼・' + (picks.length - wins) + ' 個地獄') : ('全部 ' + picks.length + ' 個號碼為地獄，已獲保底獎賞'),
      resultTitleSize: wins > 0 ? '52px' : '30px',
      resultTitleColor: wins > 0 ? '#ffe390' : '#ffffff',
      resultBorder: wins > 0 ? '#fdc800' : '#282d36',
      resultBg: wins > 0 ? 'radial-gradient(70% 90% at 0% 0%, rgba(253, 200, 0, 0.16) 0%, rgba(253, 200, 0, 0) 70%), #1a1300' : '#05070a',
      resultGlow: wins > 0 ? '0 0 0 2px #fdc800, 0 0 32px rgba(253, 200, 0, 0.45)' : 'none',
      again: () => goStep(3, { phase: 'pick', picks: [], result: null, round: this.state.round + 1, flash: null, revealOpen: false, skip: false }),
      changeCard: () => goStep(2, { phase: 'pick', picks: [], result: null, round: this.state.round + 1, flash: null, revealOpen: false, skip: false })
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

SelfDrawPage.prototype.template = function template(v) {
  return (<>
<style>{CSS}</style>

<main className="ld-main" style={{flex: "999 1 560px", minWidth: "0", display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "20px", padding: "20px"}}>
  <section ref={v.wizRef} aria-labelledby="sd-title" style={{flex: "1 1 100%", width: "100%", maxWidth: "1240px", minWidth: "0", margin: "0 auto", display: "flex", flexDirection: "column", gap: "18px", scrollMarginTop: "84px"}}>{"\n  "}
    <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px"}}>{"\n    "}
      <h1 id="sd-title" style={{margin: "0", fontFamily: "'Barlow Condensed', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif", fontWeight: "900", fontSize: "34px", lineHeight: "40px"}}>{"自助抽卡"}</h1>{"\n    "}
      <span style={{display: "inline-flex", alignItems: "center", gap: "6px", height: "26px", padding: "0 10px", borderRadius: "4px", background: "#f4022b", color: "#ffffff", fontSize: "13px", fontWeight: "700", letterSpacing: "0.04em"}}>
        <span aria-hidden="true" style={{width: "6px", height: "6px", borderRadius: "999px", background: "#ffffff", animation: "ld-blink 1.2s ease-in-out infinite"}}></span>{"24H"}
      </span>{"\n  "}
    </div>{"\n\n  "}
    {v.isStep1 ? (<>{"\n  "}
      <section className="ld-modehero" aria-labelledby="mode-title" style={{position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "26px 16px 22px", borderRadius: "14px", border: "1px solid #1d2230", textAlign: "center", background: "#04060c url('/revamp/images/gm-bg-d.webp') center 20% / cover no-repeat"}}>{"\n    "}
        <img src="/revamp/images/gm-p-blue.webp" alt="" aria-hidden="true" className="ld-spark" style={{position: "absolute", left: "8%", top: "30%", width: "70px", height: "70px", pointerEvents: "none", mixBlendMode: "screen", animation: "ld-twinkle 3.2s ease-in-out 0s infinite"}} />{"\n    "}
        <img src="/revamp/images/gm-p-gold.webp" alt="" aria-hidden="true" className="ld-spark" style={{position: "absolute", left: "47%", top: "24%", width: "56px", height: "56px", pointerEvents: "none", mixBlendMode: "screen", animation: "ld-twinkle 2.6s ease-in-out -1s infinite"}} />{"\n    "}
        <img src="/revamp/images/gm-p-red.webp" alt="" aria-hidden="true" className="ld-spark" style={{position: "absolute", left: "86%", top: "34%", width: "74px", height: "74px", pointerEvents: "none", mixBlendMode: "screen", animation: "ld-twinkle 3.6s ease-in-out -0.6s infinite"}} />{"\n    "}
        <img src="/revamp/images/gm-p-orb.webp" alt="" aria-hidden="true" className="ld-spark" style={{position: "absolute", left: "4%", top: "70%", width: "90px", height: "90px", pointerEvents: "none", mixBlendMode: "screen", animation: "ld-twinkle 4.2s ease-in-out -2s infinite"}} />{"\n    "}
        <img src="/revamp/images/gm-p-burst.webp" alt="" aria-hidden="true" className="ld-spark" style={{position: "absolute", left: "88%", top: "72%", width: "96px", height: "96px", pointerEvents: "none", mixBlendMode: "screen", animation: "ld-twinkle 3.8s ease-in-out -1.4s infinite"}} />{"\n    "}
        <img src="/revamp/images/gm-p-gold.webp" alt="" aria-hidden="true" className="ld-spark" style={{position: "absolute", left: "20%", top: "12%", width: "40px", height: "40px", pointerEvents: "none", mixBlendMode: "screen", animation: "ld-twinkle 2.8s ease-in-out -1.8s infinite"}} />{"\n    "}
        <img src="/revamp/images/gm-p-gold.webp" alt="" aria-hidden="true" className="ld-spark" style={{position: "absolute", left: "76%", top: "14%", width: "44px", height: "44px", pointerEvents: "none", mixBlendMode: "screen", animation: "ld-twinkle 3s ease-in-out -0.4s infinite"}} />{"\n    "}
        <h2 id="mode-title" style={{position: "absolute", width: "1px", height: "1px", margin: "-1px", padding: "0", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: "0"}}>{"第 1 步／共 4 步：選擇玩法"}</h2>{"\n    "}
        <ol aria-label="步驟" style={{position: "relative", listStyle: "none", margin: "0", padding: "0", display: "flex", alignItems: "flex-start", width: "min(560px, 100%)"}}>{"\n      "}
          {(Array.isArray(v.g2Steps) ? v.g2Steps : []).map((g, $index) => (<React.Fragment key={$index}>{"\n        "}
            <li aria-current={g?.current} style={{position: "relative", flex: "1 1 0", minWidth: "0", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px"}}>{"\n          "}
              <span aria-hidden="true" style={{position: "absolute", top: "19px", left: "50%", width: "100%", height: "3px", background: `${asset(g?.line) ?? ''}`, display: `${asset(g?.lineDisplay) ?? ''}`}}></span>{"\n          "}
              <button type="button" onClick={g?.go} disabled={g?.locked} aria-label={g?.aria} style={{position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", padding: "0", borderRadius: "999px", border: `2px solid ${asset(g?.ring) ?? ''}`, background: `${asset(g?.bg) ?? ''}`, boxShadow: `${asset(g?.glow) ?? ''}`, color: "#ffffff", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontSize: "20px", fontWeight: "900", cursor: `${asset(g?.cursor) ?? ''}`}}>{g?.dot}</button>{"\n          "}
              <span style={{fontSize: "14px", lineHeight: "18px", fontWeight: `${asset(g?.weight) ?? ''}`, color: `${asset(g?.color) ?? ''}`, whiteSpace: "nowrap", textShadow: "0 1px 4px rgba(0, 0, 0, 0.95), 0 0 8px rgba(0, 0, 0, 0.8)"}}>{g?.label}</span>{"\n        "}
            </li>{"\n      "}
          </React.Fragment>))}{"\n    "}
        </ol>{"\n    "}
        <img src="/revamp/images/gm-logo.webp" alt="天堂與地獄" className="ld-glogo" style={{position: "relative", display: "block", width: "min(560px, 92%)", aspectRatio: "1200 / 360", margin: "2px 0 -10px", animation: "ld-glow 3.6s ease-in-out infinite"}} />{"\n    "}
        <span style={{position: "relative", display: "flex", alignItems: "center", gap: "10px", fontSize: "15px", fontWeight: "900", letterSpacing: "0.12em", color: "#f5c451", textShadow: "0 2px 6px rgba(0, 0, 0, 0.9)"}}>
          <span aria-hidden="true" style={{width: "26px", height: "1px", background: "#f5c451"}}></span>{"選擇你的命運玩法"}
          <span aria-hidden="true" style={{width: "26px", height: "1px", background: "#f5c451"}}></span>
        </span>{"\n    "}
        <div role="radiogroup" aria-labelledby="mode-title" className="ld-mcards" style={{position: "relative", display: "flex", justifyContent: "center", gap: "22px", width: "min(660px, 100%)", marginTop: "8px"}}>{"\n      "}
          {(Array.isArray(v.modes) ? v.modes : []).map((m, $index) => (<React.Fragment key={$index}>{"\n      "}
            <button type="button" role="radio" aria-checked={m?.on} aria-label={m?.aria} onClick={m?.pick} className="ld-gcard" style={{position: "relative", flex: "1 1 0", minWidth: "0", maxWidth: "310px", aspectRatio: "760 / 1168", padding: "0", border: "0", background: "transparent", color: "#ffffff", cursor: "pointer", containerType: "inline-size", filter: `${asset(m?.cardFilter) ?? ''}`, transform: `${asset(m?.cardScale) ?? ''}`, transition: "transform 220ms, filter 220ms"}}>{"\n        "}
              <img src={asset(m?.frameImg)} alt="" style={{position: "absolute", top: "0", left: "0", width: "100%", height: "100%", pointerEvents: "none"}} />{"\n        "}
              {m?.on ? (<>
                <img src={asset(m?.circleImg)} alt="" style={{position: "absolute", left: "16%", top: "61%", width: "68%", aspectRatio: "1", transform: "scaleY(0.3)", transformOrigin: "50% 50%", mixBlendMode: "screen", pointerEvents: "none", opacity: "0.9"}} />
                <img src={asset(m?.circleImg)} alt="" style={{position: "absolute", left: "16%", top: "61%", width: "68%", aspectRatio: "1", mixBlendMode: "screen", pointerEvents: "none", opacity: "0.85", animation: "ld-spinflat 9s linear infinite"}} />
              </>) : null}{"\n        "}
              <img src={asset(m?.iconImg)} alt="" style={{position: "absolute", left: "6%", top: "4%", width: "88%", aspectRatio: "700 / 450", pointerEvents: "none", animation: "ld-bob 4s ease-in-out infinite"}} />{"\n        "}
              <span style={{position: "absolute", left: "6%", right: "6%", top: "36%", display: "flex", flexDirection: "column", alignItems: "center", gap: "1.6cqw"}}>{"\n          "}
                <strong style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "25cqw", lineHeight: "1", letterSpacing: "-0.02em", background: `${asset(m?.bigGrad) ?? ''}`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: `drop-shadow(0 0 3cqw ${asset(m?.glow) ?? ''}) drop-shadow(0 1cqw 0 rgba(0, 0, 0, 0.6))`}}>{m?.pct}</strong>{"\n          "}
                <span style={{display: "flex", alignItems: "center", gap: "2cqw", fontSize: "8cqw", lineHeight: "1.2", fontWeight: "900", color: "#ffffff", textShadow: "0 1cqw 2cqw rgba(0, 0, 0, 0.8)"}}>
                  <span aria-hidden="true" style={{color: "#e8b84a"}}>{"❦"}</span>{m?.ratio}
                  <span aria-hidden="true" style={{color: "#e8b84a", transform: "scaleX(-1)"}}>{"❦"}</span>
                </span>{"\n          "}
                <span style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontSize: "7cqw", lineHeight: "1.3", fontWeight: "800", color: "#ffffff", whiteSpace: "nowrap", textShadow: "0 1cqw 2cqw rgba(0, 0, 0, 0.8)"}}>{m?.heaven}{" 天堂・"}{m?.hell}{" 地獄"}</span>{"\n        "}
              </span>{"\n        "}
              {m?.on ? (<>
                <span aria-hidden="true" style={{position: "absolute", top: "3%", right: "5%", display: "flex", alignItems: "center", justifyContent: "center", width: "10cqw", height: "10cqw", minWidth: "24px", minHeight: "24px", borderRadius: "999px", background: "#f4022b", boxShadow: "0 0 0 2px #05070a, 0 0 14px rgba(244, 2, 43, 0.9)"}}>
                  <svg width="60%" height="60%" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12.5 4.5 4.5L19 7.5"></path>
                  </svg>
                </span>
              </>) : null}{"\n      "}
            </button>{"\n      "}
          </React.Fragment>))}{"\n    "}
        </div>{"\n    "}
        <button type="button" onClick={v.toCards} className="ld-gbtn" style={{position: "relative", display: "block", width: "min(620px, 100%)", aspectRatio: "1400 / 467", margin: "-4% 0 -6%", padding: "0", border: "0", background: "url('/revamp/images/gm-btn.webp') center / 100% 100% no-repeat", cursor: "pointer", animation: "ld-btnpulse 2.4s ease-in-out infinite"}}>
          <span style={{position: "absolute", left: "12%", right: "12%", top: "34%", bottom: "36%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "clamp(20px, 4.4vw, 30px)", color: "#ffffff", letterSpacing: "0.04em", textShadow: "0 2px 6px rgba(0, 0, 0, 0.6)"}}>
            <span aria-hidden="true" style={{position: "absolute", top: "0", bottom: "0", left: "0", width: "30%", background: "linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.35) 50%, rgba(255, 255, 255, 0) 100%)", animation: "ld-shimmer 2400ms ease-in-out infinite"}}></span>
            <span style={{position: "relative"}}>{"下一步：選擇卡牌"}</span>
          </span>
        </button>{"\n  "}
      </section>{"\n  "}
    </>) : null}{"\n\n  "}
    {v.isStep2 ? (<>{"\n  "}
      <section className="ld-g2" aria-labelledby="g2-title" style={{position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "22px 20px 8px", borderRadius: "14px", border: "1px solid #1d2230", background: "#04050a url('/revamp/images/g2-bg-d.webp') center top / cover no-repeat"}}>{"\n    "}
        <img src="/revamp/images/g2-gem-blue.webp" alt="" aria-hidden="true" className="ld-g2deco" style={{position: "absolute", left: "2%", top: "7%", width: "110px", height: "110px", pointerEvents: "none", animation: "ld-bob 4.4s ease-in-out infinite"}} />{"\n    "}
        <img src="/revamp/images/g2-coin.webp" alt="" aria-hidden="true" className="ld-g2deco" style={{position: "absolute", right: "2%", top: "6%", width: "104px", height: "104px", pointerEvents: "none", animation: "ld-bob 5s ease-in-out -1.5s infinite"}} />{"\n    "}
        <img src="/revamp/images/g2-gem-red.webp" alt="" aria-hidden="true" className="ld-g2deco" style={{position: "absolute", right: "-1%", bottom: "20%", width: "96px", height: "96px", pointerEvents: "none", animation: "ld-bob 4.8s ease-in-out -2.4s infinite"}} />{"\n    "}
        <img src="/revamp/images/gm-p-gold.webp" alt="" aria-hidden="true" className="ld-g2deco" style={{position: "absolute", left: "1%", bottom: "26%", width: "60px", height: "60px", pointerEvents: "none", animation: "ld-twinkle 3s ease-in-out infinite"}} />{"\n    "}
        <h2 id="wiz-title" style={{position: "absolute", width: "1px", height: "1px", margin: "-1px", padding: "0", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: "0"}}>{"第 2 步／共 4 步：選擇卡牌"}</h2>{"\n    "}
        <div className="ld-g2badge" style={{position: "relative", width: "min(460px, 86%)", aspectRatio: "1000 / 333", background: `url('${asset(v.badgeImg) ?? ''}') center / 100% 100% no-repeat`}}>{"\n      "}
          <img src={asset(v.badgeIcon)} alt="" style={{position: "absolute", left: "9.5%", top: "22%", width: "18%", height: "56%", objectFit: "contain", animation: "ld-bob 3.6s ease-in-out infinite"}} />{"\n      "}
          <span style={{position: "absolute", left: "30%", right: "8%", top: "0", bottom: "0", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4em", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "clamp(22px, 5.6vw, 34px)", color: "#ffffff", whiteSpace: "nowrap", textShadow: `0 0 12px ${asset(v.badgeGlow) ?? ''}`}}>
            <span>{v.badgeTag}</span>
          </span>{"\n    "}
        </div>{"\n    "}
        <ol aria-label="步驟" style={{position: "relative", listStyle: "none", margin: "0", padding: "0", display: "flex", alignItems: "flex-start", width: "min(560px, 100%)"}}>{"\n      "}
          {(Array.isArray(v.g2Steps) ? v.g2Steps : []).map((g, $index) => (<React.Fragment key={$index}>{"\n        "}
            <li aria-current={g?.current} style={{position: "relative", flex: "1 1 0", minWidth: "0", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px"}}>{"\n          "}
              <span aria-hidden="true" style={{position: "absolute", top: "19px", left: "50%", width: "100%", height: "3px", background: `${asset(g?.line) ?? ''}`, display: `${asset(g?.lineDisplay) ?? ''}`}}></span>{"\n          "}
              <button type="button" onClick={g?.go} disabled={g?.locked} aria-label={g?.aria} style={{position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", padding: "0", borderRadius: "999px", border: `2px solid ${asset(g?.ring) ?? ''}`, background: `${asset(g?.bg) ?? ''}`, boxShadow: `${asset(g?.glow) ?? ''}`, color: "#ffffff", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontSize: "20px", fontWeight: "900", cursor: `${asset(g?.cursor) ?? ''}`}}>{g?.dot}</button>{"\n          "}
              <span style={{fontSize: "14px", lineHeight: "18px", fontWeight: `${asset(g?.weight) ?? ''}`, color: `${asset(g?.color) ?? ''}`, whiteSpace: "nowrap", textShadow: "0 1px 4px rgba(0, 0, 0, 0.95), 0 0 8px rgba(0, 0, 0, 0.8)"}}>{g?.label}</span>{"\n        "}
            </li>{"\n      "}
          </React.Fragment>))}{"\n    "}
        </ol>{"\n    "}
        <div style={{position: "relative", width: "100%", maxWidth: "1080px", display: "flex", flexDirection: "column", gap: "12px"}}>{"\n      "}
          <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "6px 16px"}}>{"\n        "}
            <span style={{display: "flex", alignItems: "center", gap: "12px"}}>
              <span aria-hidden="true" style={{width: "10px", height: "34px", background: "linear-gradient(180deg, #ff2a4a, #ae031d)", transform: "skewX(-18deg)", boxShadow: "0 0 12px rgba(244, 2, 43, 0.8)"}}></span>
              <span id="g2-title" style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "32px", lineHeight: "38px", color: "#ffffff", textShadow: "0 0 14px rgba(244, 2, 43, 0.55)"}}>{"選擇卡牌"}</span>
            </span>{"\n        "}
            <span style={{fontSize: "14px", lineHeight: "20px", color: "#c3c8cd"}}>{"請選擇 1 張卡牌進行抽卡"}</span>{"\n      "}
          </div>{"\n      "}
          <div role="group" aria-label="卡牌類別" style={{display: "flex", gap: "4px", padding: "4px", overflowX: "auto", borderRadius: "999px", border: "1px solid #3a2228", background: "rgba(10, 6, 10, 0.75)", scrollbarWidth: "none"}}>{"\n        "}
            {(Array.isArray(v.catChips) ? v.catChips : []).map((k, $index) => (<React.Fragment key={$index}>{"\n          "}
              <button type="button" onClick={k?.pick} aria-pressed={k?.on} style={{flex: "1 0 auto", display: "inline-flex", alignItems: "baseline", justifyContent: "center", gap: "6px", height: "40px", padding: "0 16px", borderRadius: "999px", border: `1px solid ${asset(k?.pillBorder) ?? ''}`, background: `${asset(k?.pillBg) ?? ''}`, boxShadow: `${asset(k?.pillGlow) ?? ''}`, color: `${asset(k?.color) ?? ''}`, fontSize: "16px", lineHeight: "38px", fontWeight: `${asset(k?.weight) ?? ''}`, cursor: "pointer", whiteSpace: "nowrap"}}>{k?.name}
                <span style={{fontSize: "13px", fontWeight: "500", color: `${asset(k?.pillCount) ?? ''}`}}>{k?.count}</span>
              </button>{"\n        "}
            </React.Fragment>))}{"\n      "}
          </div>{"\n      "}
          <div style={{display: "flex", alignItems: "center", gap: "8px"}}>{"\n        "}
            <span style={{flex: "1 1 auto", fontSize: "13px", color: "#a0a5ad", whiteSpace: "nowrap"}}>{"共 "}{v.cardCount}{" 張"}</span>{"\n        "}
            <label style={{position: "relative", flex: "0 0 auto", display: "inline-flex", alignItems: "center"}}>{"\n          "}
              <span style={{position: "absolute", left: "10px", fontSize: "13px", color: "#a0a5ad", pointerEvents: "none"}}>{"價錢"}</span>{"\n          "}
              <select value={v.range} onChange={v.onRange} aria-label="價錢範圍" style={{appearance: "none", WebkitAppearance: "none", height: "34px", padding: "0 28px 0 46px", borderRadius: "999px", border: `1px solid ${asset(v.rangeBorder) ?? ''}`, background: "rgba(19, 22, 27, 0.85)", color: "#ffffff", fontSize: "13px", fontWeight: "700", fontFamily: "inherit", cursor: "pointer"}}>{"\n            "}
                <option value={v.r?.id}>{v.r?.name}</option>{"\n          "}
              </select>{"\n          "}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a0a5ad" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{position: "absolute", right: "10px", pointerEvents: "none"}}>
                <path d="m6 9 6 6 6-6"></path>
              </svg>{"\n        "}
            </label>{"\n        "}
            <button type="button" onClick={v.toggleSort} aria-label={v.sortAria} style={{flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "4px", height: "34px", padding: "0 12px", borderRadius: "999px", border: "1px solid #282d36", background: "rgba(19, 22, 27, 0.85)", color: "#ffffff", fontSize: "13px", fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap"}}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f4022b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5"></path>
              </svg>{v.sortLabel}
            </button>{"\n      "}
          </div>{"\n      "}
          {v.noCards ? (<>
            <div style={{padding: "32px 16px", textAlign: "center", borderRadius: "12px", border: "1px dashed #3a2228", background: "rgba(10, 6, 10, 0.7)", color: "#a0a5ad", fontSize: "14px"}}>{"沒有符合條件的卡牌，請更改類別或價錢範圍。"}</div>
          </>) : null}{"\n      "}
          <div className="ld-g2grid" style={{display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(156px, 100%), 1fr))", gap: "12px"}}>{"\n        "}
            {(Array.isArray(v.packsList) ? v.packsList : []).map((p, $index) => (<React.Fragment key={$index}>{"\n          "}
              <button type="button" onClick={p?.pick} aria-pressed={p?.pressed} className="ld-g2card" style={{position: "relative", display: "flex", flexDirection: "column", alignItems: "stretch", gap: "8px", padding: "12px 12px 12px", textAlign: "left", borderRadius: "14px", border: `1.5px solid ${asset(p?.gBorder) ?? ''}`, background: "linear-gradient(180deg, rgba(30, 32, 40, 0.92) 0%, rgba(12, 13, 18, 0.95) 100%)", boxShadow: `${asset(p?.gGlow) ?? ''}`, color: "#ffffff", cursor: "pointer", transition: "box-shadow 200ms, border-color 200ms, transform 200ms", transform: `${asset(p?.gLift) ?? ''}`}}>{"\n            "}
                {p?.pressed ? (<>
                  <span aria-hidden="true" style={{position: "absolute", top: "-10px", right: "-8px", zIndex: "2", display: "flex", alignItems: "center", justifyContent: "center", width: "34px", height: "34px", borderRadius: "999px", background: "#f4022b", boxShadow: "0 0 0 2px #ffffff, 0 0 16px rgba(244, 2, 43, 0.9)"}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 12.5 4.5 4.5L19 7.5"></path>
                    </svg>
                  </span>
                </>) : null}{"\n            "}
                <span className="ld-g2psa" style={{alignSelf: "center", padding: "1px 14px", borderRadius: "999px", border: "1px solid #c88a1c", background: "linear-gradient(180deg, #2a1d00, #120c00)", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "15px", lineHeight: "22px", letterSpacing: "0.04em", color: "#ffd36b"}}>{"PSA10"}</span>{"\n            "}
                <span className="ld-g2img" style={{alignSelf: "center", display: "block", width: "66%", aspectRatio: "63 / 88", borderRadius: "6px", overflow: "hidden", background: "#0b0e12", boxShadow: "0 6px 16px rgba(0, 0, 0, 0.6)"}}>
                  <img src={asset(p?.img)} alt="" style={{display: "block", width: "100%", height: "100%", objectFit: "cover"}} />
                </span>{"\n            "}
                <span className="ld-g2name" style={{display: "block", height: "40px", overflow: "hidden", fontSize: "14px", lineHeight: "20px", fontWeight: "700"}}>{p?.name}</span>{"\n            "}
                <span style={{display: "inline-flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap"}}>
                  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className="ld-g2coin">
                    <circle cx="12" cy="12" r="10.5" fill="#fdc800" stroke="#f88f00" strokeWidth="2"></circle>
                    <path d="M13.4 5.2 7.9 13h3.9l-1.2 5.8 5.6-8h-4z" fill="#f88f00"></path>
                  </svg>
                  <strong className="ld-g2price" style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "24px", lineHeight: "26px"}}>{p?.priceText}</strong>
                </span>{"\n          "}
              </button>{"\n        "}
            </React.Fragment>))}{"\n      "}
          </div>{"\n    "}
        </div>{"\n    "}
        <div className="ld-g2foot" style={{position: "relative", width: "min(760px, 108%)", aspectRatio: "1400 / 330", margin: "-2% 0 -2%"}}>{"\n      "}
          <button type="button" onClick={v.toNums} disabled={v.numsOff} style={{position: "absolute", left: "10%", right: "10%", top: "0", aspectRatio: "1400 / 467", padding: "0", border: "0", background: "url('/revamp/images/gm-btn.webp') center / 100% 100% no-repeat", cursor: `${asset(v.numsCursor) ?? ''}`, filter: `${asset(v.numsFilter) ?? ''}`, animation: `${asset(v.numsAnim) ?? ''}`}}>
            <span style={{position: "absolute", left: "12%", right: "12%", top: "34%", bottom: "36%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5em", overflow: "hidden", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "clamp(18px, 4.6vw, 30px)", color: "#ffffff", letterSpacing: "0.04em", textShadow: "0 2px 6px rgba(0, 0, 0, 0.6)", whiteSpace: "nowrap"}}>{v.numsText}
              <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6"></path>
              </svg>
            </span>
          </button>{"\n    "}
        </div>{"\n  "}
      </section>{"\n  "}
    </>) : null}{"\n  "}
    {v.isStep3 ? (<>{"\n  "}
      <section ref={v.boardRef} className="ld-g2 ld-g3" aria-labelledby="g3-title" style={{position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", padding: "22px 20px 10px", borderRadius: "14px", border: "1px solid #1d2230", background: "#04050a url('/revamp/images/g2-bg-d.webp') center top / cover no-repeat", scrollMarginTop: "76px"}}>{"\n    "}
        <img src="/revamp/images/g2-gem-blue.webp" alt="" aria-hidden="true" className="ld-g2deco" style={{position: "absolute", left: "2%", top: "7%", width: "100px", height: "100px", pointerEvents: "none", animation: "ld-bob 4.4s ease-in-out infinite"}} />{"\n    "}
        <img src="/revamp/images/g2-coin.webp" alt="" aria-hidden="true" className="ld-g2deco" style={{position: "absolute", right: "2%", top: "6%", width: "96px", height: "96px", pointerEvents: "none", animation: "ld-bob 5s ease-in-out -1.5s infinite"}} />{"\n    "}
        <img src="/revamp/images/g2-gem-red.webp" alt="" aria-hidden="true" className="ld-g2deco" style={{position: "absolute", right: "1%", top: "46%", width: "80px", height: "80px", pointerEvents: "none", animation: "ld-bob 4.8s ease-in-out -2.4s infinite"}} />{"\n    "}
        <h2 id="wiz-title" style={{position: "absolute", width: "1px", height: "1px", margin: "-1px", padding: "0", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: "0"}}>{"第 3 步／共 4 步：選擇號碼"}</h2>{"\n    "}
        <div className="ld-g2badge" style={{position: "relative", width: "min(460px, 86%)", aspectRatio: "1000 / 333", background: `url('${asset(v.badgeImg) ?? ''}') center / 100% 100% no-repeat`}}>{"\n      "}
          <img src={asset(v.badgeIcon)} alt="" style={{position: "absolute", left: "9.5%", top: "22%", width: "18%", height: "56%", objectFit: "contain", animation: "ld-bob 3.6s ease-in-out infinite"}} />{"\n      "}
          <span style={{position: "absolute", left: "30%", right: "8%", top: "0", bottom: "0", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4em", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "clamp(22px, 5.6vw, 34px)", color: "#ffffff", whiteSpace: "nowrap", textShadow: `0 0 12px ${asset(v.badgeGlow) ?? ''}`}}>
            <span>{v.badgeTag}</span>
          </span>{"\n    "}
        </div>{"\n    "}
        <ol aria-label="步驟" style={{position: "relative", listStyle: "none", margin: "0", padding: "0", display: "flex", alignItems: "flex-start", width: "min(560px, 100%)"}}>{"\n      "}
          {(Array.isArray(v.g2Steps) ? v.g2Steps : []).map((g, $index) => (<React.Fragment key={$index}>{"\n        "}
            <li aria-current={g?.current} style={{position: "relative", flex: "1 1 0", minWidth: "0", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px"}}>{"\n          "}
              <span aria-hidden="true" style={{position: "absolute", top: "19px", left: "50%", width: "100%", height: "3px", background: `${asset(g?.line) ?? ''}`, display: `${asset(g?.lineDisplay) ?? ''}`}}></span>{"\n          "}
              <button type="button" onClick={g?.go} disabled={g?.locked} aria-label={g?.aria} style={{position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", padding: "0", borderRadius: "999px", border: `2px solid ${asset(g?.ring) ?? ''}`, background: `${asset(g?.bg) ?? ''}`, boxShadow: `${asset(g?.glow) ?? ''}`, color: "#ffffff", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontSize: "20px", fontWeight: "900", cursor: `${asset(g?.cursor) ?? ''}`}}>{g?.dot}</button>{"\n          "}
              <span style={{fontSize: "14px", lineHeight: "18px", fontWeight: `${asset(g?.weight) ?? ''}`, color: `${asset(g?.color) ?? ''}`, whiteSpace: "nowrap", textShadow: "0 1px 4px rgba(0, 0, 0, 0.95), 0 0 8px rgba(0, 0, 0, 0.8)"}}>{g?.label}</span>{"\n        "}
            </li>{"\n      "}
          </React.Fragment>))}{"\n    "}
        </ol>{"\n    "}
        <div style={{position: "relative", width: "100%", maxWidth: "920px", display: "flex", flexDirection: "column", gap: "14px"}}>{"\n      "}
          <div className="ld-g3info" style={{position: "relative", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", alignItems: "center", padding: "12px 14px", borderRadius: "16px", border: "1px solid transparent", background: "linear-gradient(90deg, rgba(10, 30, 70, 0.92) 0%, rgba(10, 10, 16, 0.94) 42%, rgba(10, 10, 16, 0.94) 58%, rgba(70, 8, 22, 0.92) 100%) padding-box, linear-gradient(90deg, #4fb3ff 0%, #c9a24a 50%, #ff3355 100%) border-box", boxShadow: "-8px 0 24px rgba(79, 179, 255, 0.18), 8px 0 24px rgba(244, 2, 43, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.06)"}}>{"\n        "}
            <div style={{minWidth: "0", display: "flex", alignItems: "center", gap: "10px"}}>{"\n          "}
              <img src={asset(v.packImg)} alt="" style={{flex: "0 0 auto", display: "block", width: "44px", aspectRatio: "63 / 88", objectFit: "cover", borderRadius: "4px", boxShadow: "0 0 0 1px rgba(142, 201, 255, 0.7), 0 0 14px rgba(79, 179, 255, 0.55)"}} />{"\n          "}
              <span style={{minWidth: "0", display: "flex", flexDirection: "column", gap: "2px"}}>{"\n            "}
                <span style={{fontSize: "11px", lineHeight: "14px", fontWeight: "800", letterSpacing: "0.14em", color: "#8ec9ff"}}>{"天堂"}</span>{"\n            "}
                <strong style={{display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: "13px", lineHeight: "17px", fontWeight: "700"}}>{v.packName}</strong>{"\n          "}
              </span>{"\n        "}
            </div>{"\n        "}
            <div aria-hidden="true" style={{display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "0 12px", alignSelf: "stretch", justifyContent: "center"}}>{"\n          "}
              <span style={{width: "1px", flex: "1 1 auto", background: "linear-gradient(180deg, rgba(201, 162, 74, 0), #c9a24a)"}}></span>{"\n          "}
              <span style={{width: "8px", height: "8px", transform: "rotate(45deg)", background: "#e8c46a", boxShadow: "0 0 8px rgba(232, 196, 106, 0.8)"}}></span>{"\n          "}
              <span style={{width: "1px", flex: "1 1 auto", background: "linear-gradient(180deg, #c9a24a, rgba(201, 162, 74, 0))"}}></span>{"\n        "}
            </div>{"\n        "}
            <div style={{minWidth: "0", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px", textAlign: "right"}}>{"\n          "}
              <span style={{minWidth: "0", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px"}}>{"\n            "}
                <span style={{fontSize: "11px", lineHeight: "14px", fontWeight: "800", letterSpacing: "0.14em", color: "#ff8a9c"}}>{"地獄"}</span>{"\n            "}
                <strong style={{fontSize: "13px", lineHeight: "17px", fontWeight: "700", whiteSpace: "nowrap"}}>{"隨機 PSA10"}</strong>{"\n          "}
              </span>{"\n          "}
              <img src="/revamp/images/hell-card-mystery-psa10.webp" alt="" style={{flex: "0 0 auto", display: "block", width: "30px", aspectRatio: "316 / 530", objectFit: "cover", borderRadius: "3px", boxShadow: "0 0 0 1px rgba(255, 90, 116, 0.7), 0 0 14px rgba(244, 2, 43, 0.55)"}} />{"\n        "}
            </div>{"\n        "}
            <button type="button" onClick={v.toCardsBack} aria-label="更換卡牌" title="更換卡牌" style={{position: "absolute", top: "-11px", left: "50%", transform: "translateX(-50%)", display: "inline-flex", alignItems: "center", gap: "4px", height: "22px", padding: "0 10px", borderRadius: "999px", border: "1px solid #c9a24a", background: "#0b0b10", color: "#e8c46a", fontSize: "11px", fontWeight: "800", letterSpacing: "0.08em", cursor: "pointer", whiteSpace: "nowrap"}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 9h13l-3-3M20 15H7l3 3"></path>
              </svg>{"更換卡牌"}
            </button>{"\n      "}
          </div>{"\n      "}
          <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "6px 16px"}}>{"\n        "}
            <span style={{display: "flex", alignItems: "center", gap: "12px"}}>
              <span aria-hidden="true" style={{width: "10px", height: "34px", background: "linear-gradient(180deg, #ff2a4a, #ae031d)", transform: "skewX(-18deg)", boxShadow: "0 0 12px rgba(244, 2, 43, 0.8)"}}></span>
              <span id="g3-title" className="ld-g3title" style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "32px", lineHeight: "38px", color: "#ffffff", textShadow: "0 0 14px rgba(244, 2, 43, 0.55)"}}>{"選擇號碼"}</span>
            </span>{"\n        "}
            <span style={{fontSize: "14px", lineHeight: "20px", color: "#c3c8cd"}}>{"請選擇 1–20 個號碼"}</span>{"\n      "}
          </div>{"\n      "}
          <div style={{position: "relative", width: "100%", maxWidth: "600px", alignSelf: "center"}}>{"\n        "}
            <img src="/revamp/images/g2-stage.webp" alt="" aria-hidden="true" style={{position: "absolute", left: "-6%", right: "-6%", bottom: "-12%", width: "112%", aspectRatio: "1400 / 467", pointerEvents: "none"}} />{"\n        "}
            <div ref={v.stageRef} className="ld-stage3" style={{position: "relative", width: "100%", aspectRatio: "1232 / 1270", overflow: "hidden"}}>{"\n    "}
              <div style={{position: "absolute", left: "0", top: "0", width: "1232px", height: "1270px", transform: `scale(${asset(v.stageScale) ?? ''})`, transformOrigin: "0 0"}}>{"\n      "}
                <img src="/revamp/images/g3-board.webp" alt="" style={{position: "absolute", left: "100px", top: "0", width: "1032px", height: "1270px", pointerEvents: "none"}} />{"\n      "}
                <img src="/revamp/images/sd-card-L1.webp" alt="" style={{position: "absolute", left: "0px", top: "170px", width: "138px", height: "141px", pointerEvents: "none", filter: "drop-shadow(0 10px 14px rgba(0, 0, 0, 0.6))", animation: "ld-cardA 6s ease-in-out infinite", animationDelay: "0s"}} />{"\n      "}
                <img src="/revamp/images/sd-card-L2.webp" alt="" style={{position: "absolute", left: "10px", top: "600px", width: "152px", height: "176px", pointerEvents: "none", filter: "drop-shadow(0 10px 14px rgba(0, 0, 0, 0.6))", animation: "ld-cardB 7s ease-in-out infinite", animationDelay: "-2s"}} />{"\n      "}
                <img src="/revamp/images/sd-card-R1.webp" alt="" style={{position: "absolute", left: "1082px", top: "230px", width: "139px", height: "164px", pointerEvents: "none", filter: "drop-shadow(0 10px 14px rgba(0, 0, 0, 0.6))", animation: "ld-cardB 6.5s ease-in-out infinite", animationDelay: "-1s"}} />{"\n      "}
                <img src="/revamp/images/sd-card-R2.webp" alt="" style={{position: "absolute", left: "1080px", top: "660px", width: "137px", height: "164px", pointerEvents: "none", filter: "drop-shadow(0 10px 14px rgba(0, 0, 0, 0.6))", animation: "ld-cardA 7.5s ease-in-out infinite", animationDelay: "-3s"}} />{"\n      "}
                <div style={{position: "absolute", left: "232px", top: "183px", width: "765px", height: "902px", display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gridTemplateRows: "repeat(5, minmax(0, 1fr))", gap: "18px 15px"}}>{"\n        "}
                  {(Array.isArray(v.numbers) ? v.numbers : []).map((t, $index) => (<React.Fragment key={$index}>{"\n                "}
                    <button type="button" onClick={t?.toggle} aria-pressed={t?.mine} aria-label={t?.aria} className={t?.cls} style={{position: "relative", display: "block", padding: "0", border: "0", background: "transparent", cursor: `${asset(t?.cursor) ?? ''}`, animation: `${asset(t?.anim) ?? ''}`, filter: `${asset(t?.filter) ?? ''}`}}>{"\n                  "}
                      <img src={asset(t?.img)} alt="" style={{position: "absolute", left: "0", top: "0", width: "100%", height: "100%", pointerEvents: "none", animation: `${asset(t?.imgAnim) ?? ''}`}} />{"\n                  "}
                      {t?.hasCover ? (<>
                        <img src={asset(t?.coverImg)} alt="" style={{position: "absolute", left: "0", top: "0", width: "100%", height: "100%", pointerEvents: "none", animation: `ld-tileout 260ms ease-in ${asset(t?.coverDelay) ?? ''} both`}} />
                      </>) : null}{"\n                  "}
                      <span style={{position: "absolute", left: "0", right: "0", top: `${asset(t?.numTop) ?? ''}`, textAlign: "center", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "64px", lineHeight: "64px", color: "#ffffff", textShadow: "0 3px 0 rgba(0, 0, 0, 0.65), 0 0 14px rgba(0, 0, 0, 0.6)"}}>{t?.n}</span>{"\n                  "}
                      {t?.mineTag ? (<>
                        <span style={{animation: `${asset(t?.subAnim) ?? ''}`, position: "absolute", top: "10%", left: "14%", padding: "0 8px", borderRadius: "4px", background: "#ffffff", color: "#05070a", fontSize: "20px", lineHeight: "28px", fontWeight: "900", boxShadow: "0 2px 6px rgba(0, 0, 0, 0.6)"}}>{"我的"}</span>
                      </>) : null}{"\n                  "}
                      {t?.hasSub ? (<>
                        <span style={{animation: `${asset(t?.subAnim) ?? ''}`, position: "absolute", left: "0", right: "0", bottom: "15%", textAlign: "center", fontSize: "24px", lineHeight: "28px", fontWeight: "900", letterSpacing: "0.1em", color: `${asset(t?.subColor) ?? ''}`, textShadow: "0 2px 0 rgba(0, 0, 0, 0.8)"}}>{t?.sub}</span>
                      </>) : null}{"\n                "}
                    </button>{"\n              "}
                  </React.Fragment>))}{"\n      "}
                </div>{"\n    "}
              </div>{"\n  "}
            </div>{"\n        "}
          </div>{"\n      "}
          <div style={{display: "flex", flexDirection: "column", gap: "10px", padding: "12px 16px", borderRadius: "14px", border: "1.5px solid #4a1520", background: "rgba(12, 4, 8, 0.85)", boxShadow: "inset 0 0 20px rgba(244, 2, 43, 0.12)"}}>{"\n        "}
            <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 12px"}}>{"\n          "}
              <span style={{fontSize: "17px", fontWeight: "800", whiteSpace: "nowrap"}}>{"已選號碼 "}
                <span style={{color: "#ff3355"}}>{"("}{v.pickCount}{"/20)"}</span>
              </span>{"\n          "}
              {(Array.isArray(v.pickChips) ? v.pickChips : []).map((c, $index) => (<React.Fragment key={$index}>{"\n            "}
                <span style={{position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "48px", height: "36px", padding: "0 12px", borderRadius: "6px", border: "1px solid #ff5a74", background: "linear-gradient(180deg, #d50125 0%, #8e0018 100%)", boxShadow: "0 0 12px rgba(244, 2, 43, 0.5)", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "20px"}}>{c?.n}
                  <button type="button" onClick={c?.remove} aria-label={c?.aria} style={{position: "absolute", top: "-9px", right: "-9px", width: "22px", height: "22px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0", borderRadius: "999px", border: "1.5px solid #ffffff", background: "#8e0018", color: "#ffffff", cursor: "pointer"}}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6 6 18"></path>
                    </svg>
                  </button>
                </span>{"\n          "}
              </React.Fragment>))}{"\n          "}
              {v.noPicks ? (<>
                <span style={{fontSize: "14px", color: "#a0a5ad"}}>{"在號碼盤上按號碼"}</span>
              </>) : null}{"\n          "}
              <button type="button" onClick={v.clearPicks} disabled={v.noPicks} style={{marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 12px", borderRadius: "6px", border: "1px solid #3a3f4a", background: "rgba(19, 22, 27, 0.9)", color: "#ffffff", fontSize: "13px", fontWeight: "700", cursor: "pointer"}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path>
                </svg>{"清除全部"}
              </button>{"\n        "}
            </div>{"\n        "}
            <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "6px 18px", paddingTop: "8px", borderTop: "1px solid #2a1a20"}}>{"\n          "}
              <span style={{fontSize: "15px", color: "#c3c8cd"}}>{"每個號碼 "}{v.unitText}{" 代幣"}</span>{"\n          "}
              <span aria-hidden="true" style={{width: "1px", height: "22px", background: "#3a3f4a"}}></span>{"\n          "}
              <span style={{display: "inline-flex", alignItems: "center", gap: "8px"}}>
                <span style={{fontSize: "15px", color: "#c3c8cd"}}>{"合共"}</span>
                <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="10.5" fill="#fdc800" stroke="#f88f00" strokeWidth="2"></circle>
                  <path d="M13.4 5.2 7.9 13h3.9l-1.2 5.8 5.6-8h-4z" fill="#f88f00"></path>
                </svg>
                <strong style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "36px", lineHeight: "40px", color: "#ffd36b", textShadow: "0 0 12px rgba(253, 200, 0, 0.5)"}}>{v.totalText}</strong>
              </span>{"\n        "}
            </div>{"\n        "}
            {v.hasWarn ? (<>
              <span role="alert" style={{textAlign: "center", fontSize: "14px", color: "#ffd7c1"}}>{v.warnText}</span>
            </>) : null}{"\n      "}
          </div>{"\n    "}
        </div>{"\n    "}
        <button type="button" onClick={v.next} disabled={v.nextDisabled} className="ld-g3btn" style={{position: "relative", display: "block", width: "min(640px, 104%)", aspectRatio: "1400 / 467", margin: "-3% 0 -5%", padding: "0", border: "0", background: "url('/revamp/images/gm-btn.webp') center / 100% 100% no-repeat", cursor: `${asset(v.g3Cursor) ?? ''}`, filter: `${asset(v.g3Filter) ?? ''}`, animation: `${asset(v.g3Anim) ?? ''}`}}>
          <span style={{position: "absolute", left: "12%", right: "12%", top: "34%", bottom: "36%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5em", overflow: "hidden", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "clamp(18px, 4.6vw, 30px)", color: "#ffffff", letterSpacing: "0.04em", textShadow: "0 2px 6px rgba(0, 0, 0, 0.6)", whiteSpace: "nowrap"}}>{v.g3Text}
            <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6"></path>
            </svg>
          </span>
        </button>{"\n  "}
      </section>{"\n  "}
    </>) : null}{"\n  "}
    {v.isStep4 ? (<>{"\n  "}
      <section className="ld-g2 ld-g4" aria-labelledby="g4-title" style={{position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", padding: "22px 20px 10px", borderRadius: "14px", border: "1px solid #1d2230", background: "#04050a url('/revamp/images/g2-bg-d.webp') center top / cover no-repeat"}}>{"\n    "}
        <img src="/revamp/images/g2-gem-blue.webp" alt="" aria-hidden="true" className="ld-g2deco" style={{position: "absolute", left: "2%", top: "7%", width: "100px", height: "100px", pointerEvents: "none", animation: "ld-bob 4.4s ease-in-out infinite"}} />{"\n    "}
        <img src="/revamp/images/g2-coin.webp" alt="" aria-hidden="true" className="ld-g2deco" style={{position: "absolute", right: "2%", top: "6%", width: "96px", height: "96px", pointerEvents: "none", animation: "ld-bob 5s ease-in-out -1.5s infinite"}} />{"\n    "}
        <img src="/revamp/images/g2-gem-red.webp" alt="" aria-hidden="true" className="ld-g2deco" style={{position: "absolute", right: "1%", top: "60%", width: "76px", height: "76px", pointerEvents: "none", animation: "ld-bob 4.8s ease-in-out -2.4s infinite"}} />{"\n    "}
        <img src="/revamp/images/gm-p-gold.webp" alt="" aria-hidden="true" className="ld-g2deco" style={{position: "absolute", left: "3%", top: "64%", width: "56px", height: "56px", pointerEvents: "none", animation: "ld-twinkle 3s ease-in-out infinite"}} />{"\n    "}
        <h2 id="wiz-title" style={{position: "absolute", width: "1px", height: "1px", margin: "-1px", padding: "0", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: "0"}}>{"第 4 步／共 4 步：確認開卡"}</h2>{"\n    "}
        <div className="ld-g2badge" style={{position: "relative", width: "min(460px, 86%)", aspectRatio: "1000 / 333", background: `url('${asset(v.badgeImg) ?? ''}') center / 100% 100% no-repeat`}}>{"\n      "}
          <img src={asset(v.badgeIcon)} alt="" style={{position: "absolute", left: "9.5%", top: "22%", width: "18%", height: "56%", objectFit: "contain", animation: "ld-bob 3.6s ease-in-out infinite"}} />{"\n      "}
          <span style={{position: "absolute", left: "30%", right: "8%", top: "0", bottom: "0", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4em", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "clamp(22px, 5.6vw, 34px)", color: "#ffffff", whiteSpace: "nowrap", textShadow: `0 0 12px ${asset(v.badgeGlow) ?? ''}`}}>
            <span>{v.badgeTag}</span>
          </span>{"\n    "}
        </div>{"\n    "}
        <ol aria-label="步驟" style={{position: "relative", listStyle: "none", margin: "0", padding: "0", display: "flex", alignItems: "flex-start", width: "min(560px, 100%)"}}>{"\n      "}
          {(Array.isArray(v.g2Steps) ? v.g2Steps : []).map((g, $index) => (<React.Fragment key={$index}>{"\n        "}
            <li aria-current={g?.current} style={{position: "relative", flex: "1 1 0", minWidth: "0", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px"}}>{"\n          "}
              <span aria-hidden="true" style={{position: "absolute", top: "19px", left: "50%", width: "100%", height: "3px", background: `${asset(g?.line) ?? ''}`, display: `${asset(g?.lineDisplay) ?? ''}`}}></span>{"\n          "}
              <button type="button" onClick={g?.go} disabled={g?.locked} aria-label={g?.aria} style={{position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", padding: "0", borderRadius: "999px", border: `2px solid ${asset(g?.ring) ?? ''}`, background: `${asset(g?.bg) ?? ''}`, boxShadow: `${asset(g?.glow) ?? ''}`, color: "#ffffff", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontSize: "20px", fontWeight: "900", cursor: `${asset(g?.cursor) ?? ''}`}}>{g?.dot}</button>{"\n          "}
              <span style={{fontSize: "14px", lineHeight: "18px", fontWeight: `${asset(g?.weight) ?? ''}`, color: `${asset(g?.color) ?? ''}`, whiteSpace: "nowrap", textShadow: "0 1px 4px rgba(0, 0, 0, 0.95), 0 0 8px rgba(0, 0, 0, 0.8)"}}>{g?.label}</span>{"\n        "}
            </li>{"\n      "}
          </React.Fragment>))}{"\n    "}
        </ol>{"\n    "}
        <div className="ld-g4panel" style={{position: "relative", width: "100%", maxWidth: "920px", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "22px 24px 24px", borderRadius: "22px", border: "1.5px solid transparent", background: "linear-gradient(rgba(10, 10, 16, 0.88), rgba(10, 10, 16, 0.88)) padding-box, linear-gradient(110deg, #ff2a4a 0%, rgba(120, 30, 60, 0.6) 45%, rgba(40, 90, 200, 0.6) 60%, #3a8bff 100%) border-box", boxShadow: "0 0 30px rgba(244, 2, 43, 0.25), 0 0 30px rgba(58, 139, 255, 0.15)"}}>{"\n      "}
          <div style={{display: "flex", flexDirection: "column", alignItems: "center", gap: "4px"}}>{"\n        "}
            <div style={{display: "flex", alignItems: "center", gap: "18px"}}>
              <span aria-hidden="true" className="ld-hide-m" style={{display: "flex", gap: "5px"}}>
                <span style={{width: "8px", height: "28px", background: "#f4022b", transform: "skewX(-24deg)"}}></span>
                <span style={{width: "8px", height: "28px", background: "#f4022b", transform: "skewX(-24deg)"}}></span>
                <span style={{width: "8px", height: "28px", background: "rgba(244, 2, 43, 0.5)", transform: "skewX(-24deg)"}}></span>
              </span>
              <span id="g4-title" className="ld-g4title" style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "54px", lineHeight: "60px", background: "linear-gradient(180deg, #ffffff 40%, #ffc2cc 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: "drop-shadow(0 0 12px rgba(244, 2, 43, 0.6))"}}>{"確認開卡"}</span>
              <span aria-hidden="true" className="ld-hide-m" style={{display: "flex", gap: "5px"}}>
                <span style={{width: "8px", height: "28px", background: "#f4022b", transform: "skewX(-24deg)"}}></span>
                <span style={{width: "8px", height: "28px", background: "#f4022b", transform: "skewX(-24deg)"}}></span>
                <span style={{width: "8px", height: "28px", background: "rgba(244, 2, 43, 0.5)", transform: "skewX(-24deg)"}}></span>
              </span>
            </div>{"\n        "}
            <span style={{fontSize: "16px", lineHeight: "24px", color: "#e6e9ee"}}>{"請確認以下資料，開啟抽卡"}</span>{"\n      "}
          </div>{"\n      "}
          <div className="ld-g4body" style={{display: "flex", alignItems: "center", gap: "28px", width: "100%"}}>{"\n        "}
            <div className="ld-g4card" style={{position: "relative", flex: "0 0 260px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", paddingBottom: "40px"}}>{"\n          "}
              <span style={{position: "relative", zIndex: "1", display: "flex", alignItems: "center", gap: "4px"}}>
                <span aria-hidden="true" style={{color: "#e8b84a", fontSize: "30px", lineHeight: "1"}}>{"❦"}</span>
                <span style={{padding: "2px 22px", borderRadius: "999px", border: "2px solid #e8b84a", background: "linear-gradient(180deg, #2a1d00, #0f0a00)", boxShadow: "0 0 14px rgba(253, 200, 0, 0.45)", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "900", fontSize: "26px", lineHeight: "36px", letterSpacing: "0.04em", color: "#ffd36b"}}>{"PSA10"}</span>
                <span aria-hidden="true" style={{color: "#e8b84a", fontSize: "30px", lineHeight: "1", transform: "scaleX(-1)"}}>{"❦"}</span>
              </span>{"\n          "}
              <img src={asset(v.packImg)} alt={v.packName} style={{position: "relative", zIndex: "1", display: "block", width: "78%", aspectRatio: "63 / 88", objectFit: "cover", borderRadius: "10px", border: "3px solid #ffd36b", boxShadow: "0 0 0 1px #7a4a00, 0 0 28px rgba(253, 200, 0, 0.6), 0 0 60px rgba(244, 120, 0, 0.35)", animation: "ld-bob 4s ease-in-out infinite"}} />{"\n          "}
              <img src="/revamp/images/g2-stage.webp" alt="" aria-hidden="true" style={{position: "absolute", left: "-8%", bottom: "-10px", width: "116%", aspectRatio: "1400 / 467", pointerEvents: "none"}} />{"\n        "}
            </div>{"\n        "}
            <div style={{flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column", gap: "10px"}}>{"\n          "}
              <div style={{display: "flex", alignItems: "center", gap: "12px", minHeight: "58px", padding: "8px 14px", borderRadius: "12px", border: `1px solid ${asset(v.infoEdge) ?? ''}`, background: `linear-gradient(90deg, rgba(14, 16, 24, 0.9) 0%, ${asset(v.rowTint) ?? ''} 100%)`}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e6e9ee" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2.8 20.5 7.5v9L12 21.2 3.5 16.5v-9z"></path>
                  <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9.2"></path>
                </svg>
                <span style={{flex: "0 0 auto", minWidth: "72px", fontSize: "16px", fontWeight: "700", color: "#e6e9ee"}}>{"玩法"}</span>
                <span style={{marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px", minWidth: "0"}}>
                  <img src={asset(v.badgeIcon)} alt="" style={{width: "56px", height: "34px", objectFit: "contain"}} />
                  <strong style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontSize: "26px", lineHeight: "30px", whiteSpace: "nowrap", textShadow: `0 0 10px ${asset(v.badgeGlow) ?? ''}`}}>{v.badgeTag}</strong>
                </span>
              </div>{"\n          "}
              <div style={{display: "flex", alignItems: "center", gap: "12px", minHeight: "58px", padding: "8px 14px", borderRadius: "12px", border: "1px solid #2a2d36", background: "rgba(14, 15, 20, 0.85)"}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e6e9ee" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="8" y="3" width="12" height="16" rx="2"></rect>
                  <path d="M5 6.5V19a2 2 0 0 0 2 2h9"></path>
                </svg>
                <span style={{flex: "0 0 auto", minWidth: "72px", fontSize: "16px", fontWeight: "700", color: "#e6e9ee"}}>{"卡牌"}</span>
                <span style={{marginLeft: "auto", minWidth: "0", textAlign: "right", fontSize: "16px", lineHeight: "22px", fontWeight: "700"}}>{v.packName}</span>
              </div>{"\n          "}
              <div style={{display: "flex", alignItems: "center", gap: "12px", minHeight: "58px", padding: "8px 14px", borderRadius: "12px", border: "1px solid #2a2d36", background: "rgba(14, 15, 20, 0.85)"}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e6e9ee" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="7.5"></circle>
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path>
                </svg>
                <span style={{flex: "0 0 auto", minWidth: "72px", fontSize: "16px", fontWeight: "700", color: "#e6e9ee"}}>{"已選號碼"}</span>
                <span style={{marginLeft: "auto", display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "8px"}}>
                  {(Array.isArray(v.pickChips) ? v.pickChips : []).map((c, $index) => (<React.Fragment key={$index}>
                    <span style={{display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "52px", height: "40px", padding: "0 12px", borderRadius: "8px", border: "1px solid #ff5a74", background: "linear-gradient(180deg, #d50125 0%, #8e0018 100%)", boxShadow: "0 0 12px rgba(244, 2, 43, 0.5)", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "22px"}}>{c?.n}</span>
                  </React.Fragment>))}
                </span>
              </div>{"\n          "}
              <div style={{display: "flex", alignItems: "center", gap: "12px", minHeight: "58px", padding: "8px 14px", borderRadius: "12px", border: "1px solid #2a2d36", background: "rgba(14, 15, 20, 0.85)"}}>
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="10.5" fill="#fdc800" stroke="#f88f00" strokeWidth="2"></circle>
                  <path d="M13.4 5.2 7.9 13h3.9l-1.2 5.8 5.6-8h-4z" fill="#f88f00"></path>
                </svg>
                <span style={{flex: "0 0 auto", minWidth: "72px", fontSize: "16px", fontWeight: "700", color: "#e6e9ee"}}>{"每個號碼"}</span>
                <span style={{marginLeft: "auto", fontSize: "20px", fontWeight: "800"}}>{v.unitText}{" 代幣"}</span>
              </div>{"\n          "}
              <div style={{display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "14px", marginTop: "6px", padding: "8px 26px 8px 18px", borderTop: "1px solid rgba(255, 211, 107, 0.25)", clipPath: "polygon(0 0, 100% 0, 94% 100%, 0 100%)", background: "linear-gradient(90deg, rgba(0, 0, 0, 0) 0%, rgba(80, 56, 0, 0.55) 60%, rgba(140, 100, 10, 0.75) 100%)"}}>
                <span style={{fontSize: "26px", fontWeight: "900"}}>{"合共"}</span>
                <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="10.5" fill="#fdc800" stroke="#f88f00" strokeWidth="2"></circle>
                  <path d="M13.4 5.2 7.9 13h3.9l-1.2 5.8 5.6-8h-4z" fill="#f88f00"></path>
                </svg>
                <strong className="ld-g4total" style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "64px", lineHeight: "66px", background: "linear-gradient(180deg, #fff6c8 0%, #ffd36b 50%, #e89a10 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: "drop-shadow(0 0 10px rgba(253, 200, 0, 0.5))"}}>{v.totalText}</strong>
              </div>{"\n          "}
              <span style={{textAlign: "right", fontSize: "13px", color: "#a0a5ad"}}>{"現有代幣 "}{v.balanceText}{"・今日尚可使用 "}{v.remainingText}</span>{"\n          "}
              {v.notEnough ? (<>
                <span role="alert" style={{display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "8px", fontSize: "14px", fontWeight: "700", color: "#ffd7c1"}}>{v.warnText}
                  <a href="/beta/topup" style={{color: "#ffffff", textDecoration: "underline"}}>{"前往充值"}</a>
                </span>
              </>) : null}{"\n        "}
            </div>{"\n      "}
          </div>{"\n    "}
        </div>{"\n    "}
        <div className="ld-g2foot" style={{position: "relative", width: "min(760px, 108%)", aspectRatio: "1400 / 467", marginTop: "-1%"}}>{"\n      "}
          <img src="/revamp/images/g2-stage.webp" alt="" aria-hidden="true" style={{position: "absolute", left: "0", top: "18%", width: "100%", height: "100%", pointerEvents: "none"}} />{"\n      "}
          <button type="button" onClick={v.confirm} disabled={v.notEnough} className="ld-g4btn" style={{position: "absolute", left: "10%", right: "10%", top: "0", aspectRatio: "1400 / 467", padding: "0", border: "0", background: "url('/revamp/images/gm-btn.webp') center / 100% 100% no-repeat", cursor: `${asset(v.g4Cursor) ?? ''}`, filter: `${asset(v.g4Filter) ?? ''}`, animation: `${asset(v.g4Anim) ?? ''}`}}>
            <span style={{position: "absolute", left: "12%", right: "12%", top: "34%", bottom: "36%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5em", overflow: "hidden", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "clamp(20px, 5vw, 34px)", color: "#ffffff", letterSpacing: "0.06em", textShadow: "0 2px 6px rgba(0, 0, 0, 0.6)", whiteSpace: "nowrap"}}>
              <span aria-hidden="true" style={{position: "absolute", top: "0", bottom: "0", left: "0", width: "30%", background: "linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.35) 50%, rgba(255, 255, 255, 0) 100%)", animation: "ld-shimmer 2400ms ease-in-out infinite"}}></span>
              <span style={{position: "relative"}}>{v.confirmText}</span>
              <svg style={{position: "relative"}} width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6"></path>
              </svg>
            </span>
          </button>{"\n    "}
        </div>{"\n  "}
      </section>{"\n  "}
    </>) : null}{"\n  "}
    {v.showMain ? (<>{"\n  "}
      <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "20px"}}>{"\n  "}
        <div ref={v.boardRef} className={`ld-boardcol ${v.boardColCls ?? ''}`} style={{flex: "3 1 520px", minWidth: "0", position: "sticky", top: "16px", scrollMarginTop: "76px"}}>{"\n    "}
          <section aria-labelledby="board-title" style={{position: "relative", display: "flex", flexDirection: "column", gap: "4px", padding: "16px 12px 12px", borderRadius: "12px", border: "1px solid #282d36", background: "radial-gradient(60% 40% at 50% 62%, rgba(244, 2, 43, 0.22) 0%, rgba(244, 2, 43, 0) 70%), #05070a"}}>{"\n      "}
            <h2 id="board-title" style={{position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)", margin: "0"}}>{v.boardTitle}{"："}{v.boardSub}</h2>{"\n      "}
            <div className="ld-prow" style={{display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "0 8px"}}>{"\n        "}
              <div className="ld-btitle" style={{order: "1", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", textAlign: "center"}}>{"\n          "}
                <span aria-hidden="true" style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "34px", lineHeight: "36px", textShadow: "0 0 16px rgba(244, 2, 43, 0.7), 0 3px 0 rgba(0, 0, 0, 0.7)"}}>{v.boardTitle}</span>{"\n          "}
                <span aria-hidden="true" style={{position: "relative", fontSize: "14px", lineHeight: "20px", fontWeight: "700"}}>
                  <span style={{color: `${asset(v.boardSubColor) ?? ''}`, animation: `${asset(v.subRevealAnim) ?? ''}`}}>{v.boardSub}</span>
                  {v.showSkip ? (<>
                    <span style={{position: "absolute", left: "0", right: "0", top: "0", color: "#c3c8cd", whiteSpace: "nowrap", animation: `ld-skiphide 1ms linear ${asset(v.rvDelay) ?? ''} both`}}>{"揭曉中⋯"}</span>
                  </>) : null}
                </span>{"\n        "}
              </div>{"\n        "}
              {(Array.isArray(v.modes) ? v.modes : []).map((m, $index) => (<React.Fragment key={$index}>{"\n        "}
                <button type="button" className="ld-hpanel" onClick={m?.pick} aria-pressed={m?.on} disabled={v.modeLocked} style={{position: "relative", order: `${asset(m?.order) ?? ''}`, flex: "0 0 auto", width: "210px", aspectRatio: "400 / 260", padding: "0", border: "0", background: "transparent", color: "#ffffff", cursor: `${asset(v.modeCursor) ?? ''}`, filter: `${asset(m?.filter) ?? ''}`, transform: `${asset(m?.scale) ?? ''}`, transition: "filter 200ms, transform 200ms"}}>{"\n          "}
                  <img src={asset(m?.panelImg)} alt="" style={{position: "absolute", top: "0", left: "0", width: "100%", height: "100%"}} />{"\n          "}
                  {m?.hot ? (<>
                    <span style={{position: "absolute", top: "20%", right: "4%", height: "18px", padding: "0 6px", borderRadius: "3px", background: "#f88f00", color: "#1a1300", fontSize: "11px", lineHeight: "18px", fontWeight: "900"}}>{"熱門"}</span>
                  </>) : null}{"\n          "}
                  <span style={{position: "absolute", left: "12%", right: "12%", top: "33%", bottom: "13%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center"}}>{"\n            "}
                    <span style={{display: "flex", alignItems: "baseline", gap: "6px"}}>
                      <strong className="ld-mpct" style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "32px", lineHeight: "32px", color: `${asset(m?.pctColor) ?? ''}`, textShadow: `${asset(m?.textGlow) ?? ''}`}}>{m?.pct}</strong>
                      <span className="ld-mratio" style={{fontSize: "13px", fontWeight: "700", color: "#ffffff"}}>{m?.ratio}</span>
                    </span>{"\n            "}
                    <span className="ld-mcount" style={{fontSize: "13px", lineHeight: "18px", fontWeight: "700", whiteSpace: "nowrap"}}>
                      <span style={{color: "#c2ebff"}}>{m?.heaven}{" 天堂"}</span>{"・"}
                      <span style={{color: "#ffd7c1"}}>{m?.hell}{" 地獄"}</span>
                    </span>{"\n          "}
                  </span>{"\n          "}
                  {m?.on ? (<>
                    <span aria-hidden="true" style={{position: "absolute", left: "50%", bottom: "-4px", transform: "translateX(-50%)", display: "inline-flex", alignItems: "center", gap: "4px", height: "20px", padding: "0 8px", borderRadius: "999px", background: "#f4022b", fontSize: "11px", fontWeight: "900", boxShadow: "0 0 10px rgba(244, 2, 43, 0.7)"}}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m5 12.5 4.5 4.5L19 7.5"></path>
                      </svg>{"已選"}
                    </span>
                  </>) : null}{"\n        "}
                </button>{"\n        "}
              </React.Fragment>))}{"\n      "}
            </div>{"\n\n      "}
            <div ref={v.stageRef} className="ld-stage" style={{position: "relative", width: "100%", aspectRatio: "1232 / 1270", overflow: "hidden"}}>{"\n    "}
              <div style={{position: "absolute", left: "0", top: "0", width: "1232px", height: "1270px", transform: `scale(${asset(v.stageScale) ?? ''})`, transformOrigin: "0 0"}}>{"\n      "}
                <img src="/revamp/images/g3-board.webp" alt="" style={{position: "absolute", left: "100px", top: "0", width: "1032px", height: "1270px", pointerEvents: "none"}} />{"\n      "}
                <img src="/revamp/images/sd-card-L1.webp" alt="" style={{position: "absolute", left: "0px", top: "170px", width: "138px", height: "141px", pointerEvents: "none", filter: "drop-shadow(0 10px 14px rgba(0, 0, 0, 0.6))", animation: "ld-cardA 6s ease-in-out infinite", animationDelay: "0s"}} />{"\n      "}
                <img src="/revamp/images/sd-card-L2.webp" alt="" style={{position: "absolute", left: "10px", top: "600px", width: "152px", height: "176px", pointerEvents: "none", filter: "drop-shadow(0 10px 14px rgba(0, 0, 0, 0.6))", animation: "ld-cardB 7s ease-in-out infinite", animationDelay: "-2s"}} />{"\n      "}
                <img src="/revamp/images/sd-card-R1.webp" alt="" style={{position: "absolute", left: "1082px", top: "230px", width: "139px", height: "164px", pointerEvents: "none", filter: "drop-shadow(0 10px 14px rgba(0, 0, 0, 0.6))", animation: "ld-cardB 6.5s ease-in-out infinite", animationDelay: "-1s"}} />{"\n      "}
                <img src="/revamp/images/sd-card-R2.webp" alt="" style={{position: "absolute", left: "1080px", top: "660px", width: "137px", height: "164px", pointerEvents: "none", filter: "drop-shadow(0 10px 14px rgba(0, 0, 0, 0.6))", animation: "ld-cardA 7.5s ease-in-out infinite", animationDelay: "-3s"}} />{"\n      "}
                <div style={{position: "absolute", left: "232px", top: "183px", width: "765px", height: "902px", display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gridTemplateRows: "repeat(5, minmax(0, 1fr))", gap: "18px 15px"}}>{"\n        "}
                  {(Array.isArray(v.numbers) ? v.numbers : []).map((t, $index) => (<React.Fragment key={$index}>{"\n              "}
                    <button type="button" onClick={t?.toggle} aria-pressed={t?.mine} aria-label={t?.aria} className={t?.cls} style={{position: "relative", display: "block", padding: "0", border: "0", background: "transparent", cursor: `${asset(t?.cursor) ?? ''}`, animation: `${asset(t?.anim) ?? ''}`, filter: `${asset(t?.filter) ?? ''}`}}>{"\n                "}
                      <img src={asset(t?.img)} alt="" style={{position: "absolute", left: "0", top: "0", width: "100%", height: "100%", pointerEvents: "none", animation: `${asset(t?.imgAnim) ?? ''}`}} />{"\n                "}
                      {t?.hasCover ? (<>
                        <img src={asset(t?.coverImg)} alt="" style={{position: "absolute", left: "0", top: "0", width: "100%", height: "100%", pointerEvents: "none", animation: `ld-tileout 260ms ease-in ${asset(t?.coverDelay) ?? ''} both`}} />
                      </>) : null}{"\n                "}
                      <span style={{position: "absolute", left: "0", right: "0", top: `${asset(t?.numTop) ?? ''}`, textAlign: "center", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "64px", lineHeight: "64px", color: "#ffffff", textShadow: "0 3px 0 rgba(0, 0, 0, 0.65), 0 0 14px rgba(0, 0, 0, 0.6)"}}>{t?.n}</span>{"\n                "}
                      {t?.mineTag ? (<>
                        <span style={{animation: `${asset(t?.subAnim) ?? ''}`, position: "absolute", top: "10%", left: "14%", padding: "0 8px", borderRadius: "4px", background: "#ffffff", color: "#05070a", fontSize: "20px", lineHeight: "28px", fontWeight: "900", boxShadow: "0 2px 6px rgba(0, 0, 0, 0.6)"}}>{"我的"}</span>
                      </>) : null}{"\n                "}
                      {t?.hasSub ? (<>
                        <span style={{animation: `${asset(t?.subAnim) ?? ''}`, position: "absolute", left: "0", right: "0", bottom: "15%", textAlign: "center", fontSize: "24px", lineHeight: "28px", fontWeight: "900", letterSpacing: "0.1em", color: `${asset(t?.subColor) ?? ''}`, textShadow: "0 2px 0 rgba(0, 0, 0, 0.8)"}}>{t?.sub}</span>
                      </>) : null}{"\n              "}
                    </button>{"\n            "}
                  </React.Fragment>))}{"\n      "}
                </div>{"\n    "}
              </div>{"\n  "}
            </div>{"\n    "}
          </section>{"\n  "}
        </div>{"\n  "}
        <div className="ld-wiz" style={{flex: "2 1 360px", minWidth: "0", display: "flex", flexDirection: "column", gap: "18px", padding: "18px 20px 20px", borderRadius: "10px", border: "1px solid #3a414b", background: "#080b0e", boxShadow: "inset 0 3px 0 #f4022b"}}>{"\n\n    "}
          <div style={{display: "flex", flexDirection: "column", gap: "10px", padding: "0 0 14px", borderBottom: "1px solid #282d36"}}>{"\n      "}
            <h2 id="wiz-title" style={{position: "absolute", width: "1px", height: "1px", margin: "-1px", padding: "0", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: "0"}}>{v.stepCounter}{"："}{v.headTitle}</h2>{"\n      "}
            <div style={{display: "flex", alignItems: "flex-end", gap: "10px"}}>{"\n        "}
              {v.canBack ? (<>{"\n          "}
                <button type="button" onClick={v.back} aria-label="上一步" title="上一步" style={{flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", cursor: "pointer"}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m15 6-6 6 6 6"></path>
                  </svg>
                </button>{"\n        "}
              </>) : null}{"\n        "}
              <ol aria-label="步驟" className="ld-steps" style={{flex: "1 1 auto", minWidth: "0", listStyle: "none", margin: "0", padding: "0", display: "grid", gridTemplateColumns: `${asset(v.stepCols) ?? ''}`, gap: "8px", alignItems: "end"}}>{"\n          "}
                {(Array.isArray(v.stepBar) ? v.stepBar : []).map((b, $index) => (<React.Fragment key={$index}>{"\n            "}
                  <li aria-current={b?.current} className={b?.liCls} style={{minWidth: "0", display: "flex", flexDirection: "column", gap: "8px"}}>{"\n              "}
                    <span style={{display: "flex", alignItems: "baseline", gap: "6px", minWidth: "0", whiteSpace: "nowrap"}}>{"\n                "}
                      <span style={{flex: "0 0 auto", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: `${asset(b?.numSize) ?? ''}`, lineHeight: "1", color: `${asset(b?.numColor) ?? ''}`}}>{b?.dot}</span>{"\n                "}
                      <span className="ld-slbl" style={{minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", fontSize: `${asset(b?.size) ?? ''}`, lineHeight: `${asset(b?.lh) ?? ''}`, fontWeight: `${asset(b?.weight) ?? ''}`, color: `${asset(b?.color) ?? ''}`}}>{b?.label}</span>{"\n              "}
                    </span>{"\n              "}
                    <span aria-hidden="true" style={{display: "block", height: "4px", borderRadius: "999px", background: `${asset(b?.bar) ?? ''}`, boxShadow: `${asset(b?.glow) ?? ''}`}}></span>{"\n            "}
                  </li>{"\n          "}
                </React.Fragment>))}{"\n        "}
              </ol>{"\n        "}
              <button type="button" onClick={v.toggleHelp} aria-expanded={v.helpOpen} aria-label="玩法說明" title="玩法說明" style={{flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", borderRadius: "4px", border: "0", background: "transparent", color: "#a0a5ad", cursor: "pointer"}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9"></circle>
                  <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6"></path>
                  <path d="M12 17v.4"></path>
                </svg>
              </button>{"\n      "}
            </div>{"\n      "}
            {v.hasHint ? (<>
              <p style={{margin: "0", fontSize: "14px", lineHeight: "20px", color: "#c3c8cd"}}>{v.stepHint}</p>
            </>) : null}{"\n      "}
            {v.helpOpen ? (<>{"\n        "}
              <ol style={{margin: "0", padding: "14px 16px 14px 36px", display: "flex", flexDirection: "column", gap: "6px", borderRadius: "6px", background: "#0b0e12", fontSize: "14px", lineHeight: "22px", color: "#c3c8cd"}}>{"\n          "}
                {(Array.isArray(v.helpLines) ? v.helpLines : []).map((h, $index) => (<React.Fragment key={$index}>
                  <li>
                    <strong style={{color: "#ffffff"}}>{h?.k}</strong>{"："}{h?.v}
                  </li>
                </React.Fragment>))}{"\n        "}
              </ol>{"\n      "}
            </>) : null}{"\n    "}
          </div>{"\n\n    "}
          {v.hasSummary ? (<>{"\n    "}
            <ul aria-label="你的選擇" style={{listStyle: "none", margin: "0", padding: "0", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px"}}>{"\n      "}
              {(Array.isArray(v.summary) ? v.summary : []).map((x, $index) => (<React.Fragment key={$index}>{"\n        "}
                <li style={{display: "inline-flex", alignItems: "center", gap: "8px", maxWidth: "100%", minHeight: "34px", padding: "4px 12px", borderRadius: "999px", border: "1px solid #282d36", background: "#13161b", fontSize: "14px", lineHeight: "20px", fontWeight: "700"}}>
                  <span style={{flex: "0 0 auto", color: "#f4022b"}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m5 12.5 4.5 4.5L19 7.5"></path>
                    </svg>
                  </span>
                  <span style={{flex: "0 0 auto", fontWeight: "500", color: "#a0a5ad"}}>{x?.k}</span>
                  <span style={{minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{x?.v}</span>
                </li>{"\n      "}
              </React.Fragment>))}{"\n    "}
            </ul>{"\n    "}
          </>) : null}{"\n\n\n\n\n  "}
          {v.isStep4 ? (<>{"\n  "}
            <div style={{display: "flex", flexDirection: "column", gap: "16px"}}>{"\n    "}
              <div style={{display: "flex", flexWrap: "wrap", gap: "24px", padding: "24px", borderRadius: "10px", border: "1px solid #282d36", background: "#05070a"}}>{"\n      "}
                <div style={{flex: "0 1 180px", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", borderRadius: "6px", background: "radial-gradient(60% 60% at 50% 50%, #2a2000 0%, #05070a 80%)"}}>{"\n        "}
                  <span style={{display: "flex", flexDirection: "column", gap: "6px", width: "140px", padding: "7px", borderRadius: "8px", border: "1px solid #3a404b", background: "linear-gradient(180deg, #2a2f38 0%, #13161b 100%)", boxShadow: "0 0 0 2px #fdc800, 0 0 32px rgba(253, 200, 0, 0.45)"}}>
                    <span style={{display: "flex", alignItems: "center", justifyContent: "space-between", height: "22px", padding: "0 8px", borderRadius: "3px", background: "#05070a", border: "1px solid #3a2a00", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "12px", letterSpacing: "0.06em", color: "#ffe390"}}>
                      <span>{"PSA"}</span>
                      <span style={{fontSize: "15px", color: "#fdc800"}}>{"10"}</span>
                    </span>
                    <span style={{position: "relative", display: "block", aspectRatio: "63 / 88", borderRadius: "4px", overflow: "hidden", background: "#0b0e12"}}>
                      <img src={asset(v.packImg)} alt="" style={{position: "absolute", top: "0", left: "0", width: "100%", height: "100%", objectFit: "cover"}} />
                    </span>
                  </span>{"\n      "}
                </div>{"\n      "}
                <dl style={{flex: "1 1 340px", margin: "0", display: "grid", gridTemplateColumns: "auto 1fr", gap: "12px 20px", alignContent: "start", fontSize: "15px", lineHeight: "22px"}}>{"\n                  "}
                  <dt style={{color: "#a0a5ad"}}>{"玩法"}</dt>
                  <dd style={{margin: "0", fontWeight: "700"}}>{v.modeLine}</dd>{"\n        "}
                  <dt style={{color: "#a0a5ad"}}>{"天堂卡牌"}</dt>
                  <dd style={{margin: "0", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", fontWeight: "700"}}>
                    <span style={{height: "22px", padding: "0 8px", borderRadius: "4px", border: "1px solid #4fb3ff", background: "#041737", color: "#c2ebff", fontSize: "12px", lineHeight: "20px"}}>{"中天堂"}</span>{v.packName}
                  </dd>{"\n        "}
                  <dt style={{color: "#a0a5ad"}}>{"地獄卡牌"}</dt>
                  <dd style={{margin: "0", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", fontWeight: "700"}}>
                    <span style={{height: "22px", padding: "0 8px", borderRadius: "4px", border: "1px solid #ae031d", background: "#4a0511", color: "#ffd7c1", fontSize: "12px", lineHeight: "20px"}}>{"中地獄"}</span>
                    <img src="/revamp/images/hell-card-mystery-psa10.webp" alt="" style={{display: "block", height: "44px", aspectRatio: "316 / 530", objectFit: "cover", borderRadius: "3px"}} />{"隨機 PSA10"}
                  </dd>{"\n        "}
                  <dt style={{color: "#a0a5ad"}}>{"號碼"}</dt>{"\n        "}
                  <dd style={{margin: "0", display: "flex", flexWrap: "wrap", gap: "6px"}}>{"\n          "}
                    {(Array.isArray(v.pickChips) ? v.pickChips : []).map((p, $index) => (<React.Fragment key={$index}>{"\n            "}
                      <span style={{display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "44px", height: "32px", padding: "0 10px", borderRadius: "4px", border: "1px solid #f4022b", background: "#ae031d", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "800", fontSize: "18px"}}>{p?.n}</span>{"\n          "}
                    </React.Fragment>))}{"\n        "}
                  </dd>{"\n        "}
                  <dt style={{color: "#a0a5ad"}}>{"每個號碼"}</dt>
                  <dd style={{margin: "0"}}>{v.unitText}{" 代幣"}</dd>{"\n      "}
                </dl>{"\n      "}
                <div style={{flex: "1 1 100%", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px 24px", paddingTop: "20px", borderTop: "1px solid #14181d"}}>{"\n        "}
                  <div style={{display: "flex", flexDirection: "column", gap: "4px"}}>{"\n          "}
                    <span style={{fontSize: "14px", color: "#a0a5ad"}}>{"合共"}</span>{"\n          "}
                    <span style={{display: "inline-flex", alignItems: "center", gap: "10px", padding: "6px 14px", borderRadius: "6px", background: "#1a1300", border: "1px solid #3a2a00"}}>
                      <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="12" r="10.5" fill="#fdc800" stroke="#f88f00" strokeWidth="2"></circle>
                        <path d="M13.4 5.2 7.9 13h3.9l-1.2 5.8 5.6-8h-4z" fill="#f88f00"></path>
                      </svg>
                      <strong style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "44px", lineHeight: "48px", color: "#ffe390", fontVariantNumeric: "tabular-nums"}}>{v.totalText}</strong>
                    </span>{"\n        "}
                  </div>{"\n        "}
                  <div style={{flex: "1 1 220px", display: "flex", flexDirection: "column", gap: "4px", fontSize: "14px", color: "#c3c8cd"}}>{"\n          "}
                    <span>{"現有代幣："}
                      <strong style={{color: "#ffffff"}}>{v.balanceText}</strong>
                    </span>{"\n          "}
                    <span>{"今日上限 "}{v.capText}{"・尚可使用 "}
                      <strong style={{color: "#ffe390"}}>{v.remainingText}</strong>
                    </span>{"\n          "}
                    {v.notEnough ? (<>
                      <span style={{display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: "8px", color: "#ffd7c1"}}>
                        <strong>{v.warnText}</strong>
                        <a href="/beta/topup" style={{color: "#ffffff", textDecoration: "underline"}}>{"前往充值"}</a>
                      </span>
                    </>) : null}{"\n        "}
                  </div>{"\n      "}
                </div>{"\n    "}
              </div>{"\n    "}
              <button type="button" onClick={v.confirm} disabled={v.notEnough} style={{position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", minHeight: "60px", padding: "0 28px", borderRadius: "6px", border: "0", background: `${asset(v.confirmBg) ?? ''}`, color: `${asset(v.confirmColor) ?? ''}`, boxShadow: `${asset(v.confirmGlow) ?? ''}`, fontSize: "20px", fontWeight: "900", cursor: "pointer"}}>{"\n      "}
                {v.enough ? (<>
                  <span aria-hidden="true" style={{position: "absolute", top: "0", bottom: "0", left: "0", width: "30%", background: "linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.55) 50%, rgba(255, 255, 255, 0) 100%)", animation: "ld-shimmer 2400ms ease-in-out infinite"}}></span>
                </>) : null}{"\n      "}
                <span style={{position: "relative"}}>{v.confirmText}</span>{"\n      "}
                <span style={{position: "relative", display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontSize: "24px"}}>
                  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="10.5" fill="#fdc800" stroke="#1a1300" strokeWidth="2"></circle>
                    <path d="M13.4 5.2 7.9 13h3.9l-1.2 5.8 5.6-8h-4z" fill="#1a1300"></path>
                  </svg>{v.totalText}
                </span>{"\n    "}
              </button>{"\n  "}
            </div>{"\n  "}
          </>) : null}{"\n\n\n  "}
          {v.showSkip ? (<>
            <p style={{margin: "0", padding: "24px 8px", textAlign: "center", fontSize: "16px", fontWeight: "700", color: "#c3c8cd", animation: `ld-skiphide 1ms linear ${asset(v.rvDelay) ?? ''} both`}}>{"開卡中，請留意號碼盤⋯"}</p>
          </>) : null}{"\n  "}
          {v.isResult ? (<>{"\n  "}
            <section aria-live="polite" aria-labelledby="result-title" style={{display: "flex", flexDirection: "column", gap: "16px", padding: "24px", borderRadius: "10px", border: `1px solid ${asset(v.resultBorder) ?? ''}`, background: `${asset(v.resultBg) ?? ''}`, boxShadow: `${asset(v.resultGlow) ?? ''}`, animation: `ld-reveal 500ms ease-out ${asset(v.rvDelay) ?? ''} both`}}>{"\n    "}
              <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "8px 20px"}}>{"\n      "}
                <h2 id="result-title" style={{margin: "0", fontFamily: "'Barlow Condensed', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: `${asset(v.resultTitleSize) ?? ''}`, lineHeight: "1.05", color: `${asset(v.resultTitleColor) ?? ''}`}}>{v.resultTitle}</h2>{"\n      "}
                <span style={{fontSize: "16px", color: "#c3c8cd"}}>{v.resultSub}</span>{"\n    "}
              </div>{"\n    "}
              <ul style={{listStyle: "none", margin: "0", padding: "0", display: "flex", flexWrap: "wrap", gap: "10px"}}>{"\n      "}
                {(Array.isArray(v.resultItems) ? v.resultItems : []).map((r, $index) => (<React.Fragment key={$index}>{"\n        "}
                  <li style={{display: "flex"}}>{"\n          "}
                    <span aria-label={`號碼 ${r?.n ?? ''}`} style={{flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "64px", height: "64px", borderRadius: "10px", border: `1px solid ${asset(r?.tileBorder) ?? ''}`, background: `${asset(r?.tileBg) ?? ''}`, color: `${asset(r?.tileColor) ?? ''}`}}>
                      <strong style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "800", fontSize: "22px", lineHeight: "22px"}}>{r?.n}</strong>
                      <span style={{fontSize: "11px", lineHeight: "14px", fontWeight: "700"}}>{r?.outcome}</span>
                    </span>{"\n        "}
                  </li>{"\n      "}
                </React.Fragment>))}{"\n    "}
              </ul>{"\n    "}
              <p style={{margin: "0", fontSize: "14px", color: "#a0a5ad"}}>{"獎賞已加入「我的卡牌」，可於 14 日內申請配送或轉回代幣。"}</p>{"\n    "}
              <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px"}}>{"\n      "}
                <button type="button" onClick={v.again} style={{position: "relative", overflow: "hidden", display: "inline-flex", alignItems: "center", gap: "10px", minHeight: "56px", padding: "0 30px", borderRadius: "6px", border: "0", background: "linear-gradient(180deg, #ff2a4a 0%, #d50125 55%, #ae031d 100%)", color: "#ffffff", fontSize: "18px", fontWeight: "900", boxShadow: "0 0 0 1px #ff4d68, 0 8px 28px rgba(244, 2, 43, 0.55)", cursor: "pointer"}}>
                  <span aria-hidden="true" style={{position: "absolute", top: "0", bottom: "0", left: "0", width: "30%", background: "linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.4) 50%, rgba(255, 255, 255, 0) 100%)", animation: "ld-shimmer 2400ms ease-in-out infinite"}}></span>
                  <span style={{position: "relative"}}>{"再抽一次"}</span>
                </button>{"\n      "}
                <a href="/beta/cards" style={{display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "56px", padding: "0 22px", borderRadius: "6px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "16px", fontWeight: "700"}}>{"查看我的卡牌"}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6"></path>
                  </svg>
                </a>{"\n      "}
                <button type="button" onClick={v.changeCard} className="ld-link" style={{minHeight: "44px", padding: "0 8px", border: "0", background: "transparent", color: "#a0a5ad", fontSize: "15px", fontWeight: "700", textDecoration: "underline", cursor: "pointer"}}>{"換另一張卡牌"}</button>{"\n    "}
              </div>{"\n  "}
            </section>{"\n  "}
          </>) : null}{"\n  "}
        </div>{"\n  "}
      </div>{"\n  "}
    </>) : null}
  </section>
  {v.revealOpen ? (<>
    <div role="dialog" aria-modal="true" aria-labelledby="rv-title" style={{position: "fixed", top: "0", right: "0", bottom: "0", left: "0", zIndex: "95", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", background: "rgba(5, 7, 10, 0.88)", animation: `ld-rvin 300ms ease-out ${asset(v.rvDelay) ?? ''} both`}}>{"\n  "}
      <div style={{position: "relative", width: "680px", maxWidth: "100%", maxHeight: "calc(100vh - 32px)", overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "28px 20px 22px", borderRadius: "14px", border: `1px solid ${asset(v.resultBorder) ?? ''}`, background: `${asset(v.rvBg) ?? ''}`, boxShadow: "0 24px 64px rgba(0, 0, 0, 0.7)", textAlign: "center"}}>{"\n    "}
        <button type="button" onClick={v.closeReveal} aria-label="關閉" style={{position: "absolute", top: "10px", right: "10px", width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", cursor: "pointer"}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18"></path>
          </svg>
        </button>{"\n    "}
        <span style={{fontSize: "12px", lineHeight: "16px", fontWeight: "700", letterSpacing: "0.12em", color: "#a0a5ad"}}>{"開卡結果"}</span>{"\n    "}
        <h2 id="rv-title" style={{margin: "0", fontFamily: "'Barlow Condensed', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: `${asset(v.rvTitleSize) ?? ''}`, lineHeight: "1.05", color: `${asset(v.resultTitleColor) ?? ''}`, textShadow: `${asset(v.rvTitleGlow) ?? ''}`}}>{v.rvTitle}</h2>{"\n    "}
        <span style={{fontSize: "15px", lineHeight: "22px", color: "#c3c8cd"}}>{v.resultSub}</span>{"\n    "}
        <ul style={{listStyle: "none", margin: "4px 0 0", padding: "0", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "18px"}}>{"\n      "}
          {(Array.isArray(v.revealItems) ? v.revealItems : []).map((r, $index) => (<React.Fragment key={$index}>{"\n        "}
            <li className="ld-rvcard" style={{width: "168px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", animation: `ld-pop 520ms cubic-bezier(0.2, 1.4, 0.4, 1) ${asset(r?.delay) ?? ''} both`}}>{"\n          "}
              <span style={{position: "relative", display: "block", width: "100%", aspectRatio: "63 / 88", perspective: "900px"}}>{"\n            "}
                <img src={asset(r?.img)} alt="" style={{position: "absolute", top: "0", left: "0", width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px", animation: `${asset(r?.cardAnim) ?? ''}`}} />{"\n            "}
                {r?.isHell ? (<>
                  <img src="/revamp/images/hell-card-mystery-psa10.webp" alt="" style={{position: "absolute", top: "0", left: "0", width: "100%", height: "100%", objectFit: "contain", animation: `ld-slabout 420ms ease-in ${asset(r?.slabDelay) ?? ''} both`}} />
                </>) : null}{"\n          "}
              </span>{"\n          "}
              <span style={{display: "inline-flex", alignItems: "center", gap: "6px", height: "24px", padding: "0 10px", borderRadius: "4px", border: `1px solid ${asset(r?.tileBorder) ?? ''}`, background: `${asset(r?.tileBg) ?? ''}`, color: `${asset(r?.tileColor) ?? ''}`, fontSize: "13px", fontWeight: "900"}}>{"#"}{r?.n}{"・"}{r?.outcome}</span>{"\n          "}
              <strong style={{fontSize: "13px", lineHeight: "18px"}}>{r?.prize}</strong>{"\n        "}
            </li>{"\n      "}
          </React.Fragment>))}{"\n    "}
        </ul>{"\n    "}
        <p style={{margin: "0", fontSize: "13px", color: "#a0a5ad"}}>{"獎賞已加入「我的卡牌」，可於 14 日內申請配送或轉回代幣。"}</p>{"\n    "}
        <div style={{display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "10px"}}>{"\n      "}
          <button type="button" onClick={v.again} style={{display: "inline-flex", alignItems: "center", minHeight: "52px", padding: "0 28px", borderRadius: "6px", border: "0", background: "linear-gradient(180deg, #ff2a4a 0%, #d50125 55%, #ae031d 100%)", color: "#ffffff", fontSize: "17px", fontWeight: "900", boxShadow: "0 0 0 1px #ff4d68, 0 8px 28px rgba(244, 2, 43, 0.55)", cursor: "pointer"}}>{"再抽一次"}</button>{"\n      "}
          <a href="/beta/cards" style={{display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "52px", padding: "0 20px", borderRadius: "6px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "16px", fontWeight: "700"}}>{"查看我的卡牌"}</a>{"\n    "}
        </div>{"\n  "}
      </div>
    </div>
  </>) : null}
</main>
</>);
};

const SAMPLE_SETTINGS = import.meta.env.DEV ? {
  mode: "all", dailyTokenLimit: 20000,
  cards: [
    ["s1", "比卡超", "[PSA10]ピカチュウex [M2a 234/193]", 1900, 860, "card-pikachu-ex-M2a-234.webp"],
    ["s2", "其他", "[PSA10]ロケット団のミュウツーex SAR [M2a 237/193]", 1200, 540, "card-mewtwo-ex-M2a-237.webp"],
    ["s3", "伊貝", "[PSA10]ブラッキーex [sv8a 217/187]", 3800, 1710, "card-umbreon-ex-sv8a-217.webp"],
    ["s4", "噴火龍", "[PSA10]リザードンVMAX [S4a 308/190]", 1900, 860, "card-charizard-vmax-S4a-308.webp"],
  ].map(([id, category, name, half, tenth, img]) => ({ id, category, name, modePrices: { half, fifth: half, tenth }, thumbUrl: "/revamp/images/" + img })),
} : null;

// Loads the live card pool and shows a notice while 自助抽卡 is closed.
function Notice({ title, text }) {
  return (
    <main className="ld-main" style={{ flex: "999 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: "16px", padding: "0 16px 20px" }}>
      <style>{CSS}</style>
      <h1 style={{ margin: "16px 0 0", fontSize: "40px", lineHeight: "48px", fontWeight: 900 }}>自助抽卡</h1>
      <section style={{ padding: "32px 24px", borderRadius: "12px", border: "1px solid #282d36", background: "#05070a", textAlign: "center" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "24px", lineHeight: "32px" }}>{title}</h2>
        <p style={{ margin: 0, color: "#a0a5ad", fontSize: "15px", lineHeight: "24px" }}>{text}</p>
      </section>
    </main>
  );
}

export default function SelfDrawRoute({ session }) {
  const liveSettings = useInstantDrawSettings();
  // Local development only: ?samplePool=1 previews the wizard with the design's sample cards.
  const settings = import.meta.env.DEV && new URLSearchParams(window.location.search).has("samplePool") ? SAMPLE_SETTINGS : liveSettings;
  if (settings === undefined) return <Notice title="載入中…" text="正在載入自助抽卡卡池。" />;
  const mode = getInstantDrawMode(settings);
  const isAdmin = Boolean(session?.isAdmin);
  if (mode === "off" || (mode === "admin" && !isAdmin)) return <Notice title="自助抽卡暫未開放" text="請稍後再來，或先參加每晚 8:30 的直播抽卡。" />;
  if (settings?.pausedForLive === true && !isAdmin) return <Notice title="直播進行中，自助抽卡暫停" text="直播結束後會重新開放。" />;
  return <SelfDrawPage session={session} settings={settings} />;
}
