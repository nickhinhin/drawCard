/* eslint-disable */
// Generated from the LiveDraw revamp design (LiveDraw.html); logic kept as designed.
import React from "react";
import { DCLogic, route, asset } from "../runtime.jsx";

export const CSS = "\nbody{margin:0;background:#0b0e12}\n*{box-sizing:border-box}\na{color:#ffffff;text-decoration:none}a:hover{color:#ffe390}\nbutton,input,textarea{font-family:inherit}\nbutton:disabled{cursor:not-allowed}\n:focus-visible{outline:2px solid #f4022b;outline-offset:2px}\ninput::placeholder,textarea::placeholder{color:#6b767f}\n.ld-nav{transition:background-color 150ms,color 150ms}\n.ld-nav:hover{background-color:#13161b !important;color:#ffffff !important}\n.ld-lift{transition:border-color 150ms,box-shadow 150ms}\n.ld-lift:hover{border-color:#6b767f !important}\n.ld-link:hover{color:#ffffff !important}\n@keyframes ld-shimmer{0%{transform:translateX(-160%) skewX(-20deg)}55%,100%{transform:translateX(420%) skewX(-20deg)}}\n@keyframes ld-blink{0%,100%{opacity:1}50%{opacity:.35}}\n@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none !important;transition:none !important}}\n\n.ld-menubtn,.ld-tabbar,.ld-drawer-close,.ld-backdrop{display:none}\n.ld-chat-bd{display:none}\n@keyframes ld-recin{from{transform:translateX(-100%)}to{transform:none}}\n.ld-ovl > span{animation:ld-rise 260ms ease-out both}\n@keyframes ld-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}\n@media (max-width:760px){\n.ld-root{padding-bottom:68px}\n.ld-header{padding:8px 12px !important;gap:8px !important;flex-wrap:nowrap !important;position:sticky;top:0;z-index:40}\n.ld-search,.ld-hide-m,.ld-uname{display:none !important}\n.ld-logo{width:auto !important;flex:1 1 auto !important;min-width:0}\n.ld-logo img{width:104px !important;height:auto !important}\n.ld-tools{gap:6px !important;flex-wrap:nowrap !important}\n.ld-tools > a,.ld-tools > button,.ld-tools > span > button{height:38px !important}\n.ld-menubtn{display:flex !important}\n.ld-helptxt{display:none}\n.ld-mini{left:12px !important;right:auto !important;bottom:76px !important;width:184px !important}\n.ld-mini > div:last-child{padding:6px !important}\n.ld-mini > div:last-child > span{display:none}\n.ld-mini > div:last-child > button{flex:1 1 auto;justify-content:center}\n.ld-arrow{display:none !important}\n.ld-steps{display:flex !important;gap:8px !important}\n.ld-steps > li{flex:0 0 36px}\n.ld-steps > li.ld-stepcur{flex:1 1 auto}\n.ld-steps > li:not(.ld-stepcur) .ld-slbl{display:none}\n.ld-wiz{padding:14px 12px 16px !important;gap:14px !important;margin:0 -4px}\n.ld-cgrid{grid-template-columns:repeat(4,minmax(0,1fr)) !important;gap:5px !important}\n.ld-ccard{padding:4px !important;gap:3px !important}\n.ld-ccard > span:first-of-type{padding:3px 0 !important}\n.ld-cname{font-size:10px !important;line-height:13px !important;height:26px !important}\n.ld-cprice{font-size:15px !important;line-height:18px !important}\n.ld-ccard svg[width=\"16\"]{width:12px;height:12px}\n.ld-fab{right:12px !important;bottom:76px !important;gap:8px !important}\n.ld-fab-more{display:none !important}\n.ld-fab-more.ld-dial-open{display:flex !important}\n.ld-fab-toggle{display:flex !important}\n.ld-fab a,.ld-fab button{height:44px !important}\n.ld-fab-toggle{width:44px !important}\n.ld-chat-bd{display:block !important}\n.ld-chat{top:auto !important;left:0 !important;right:0 !important;bottom:0 !important;width:auto !important;max-width:none !important;height:74vh;border-radius:16px 16px 0 0 !important;padding:16px !important}\n.ld-grab{display:block !important}\n.ld-nums{top:auto !important;bottom:0 !important;left:0 !important;transform:none !important;width:100% !important;max-width:none !important;border-radius:16px 16px 0 0 !important;padding:16px 16px 24px !important}\n.ld-ovl{display:none !important}\n.ld-ngrid{grid-template-columns:repeat(4,minmax(0,1fr)) !important;gap:8px !important}\n.ld-main h1{font-size:34px !important;line-height:40px !important}\n.ld-tools > a:first-child > span:last-child,.ld-tools > span > button > span{display:none !important}\n.ld-logo{min-width:96px !important}\n.ld-bleed{margin:-12px -12px 0 !important}\n.ld-tools > span > button{padding:0 8px !important;gap:4px !important}\n.ld-tools > span > button > svg:last-child{display:none}\n.ld-tools > button{width:38px !important}\n.ld-tools > a:last-child{padding:0 3px !important;border:0 !important}\n.ld-tools > a:first-child{padding:0 4px 0 8px !important;gap:5px !important;font-size:17px !important}\n.ld-side{display:none !important}\n.ld-side.ld-side-open{display:flex !important;position:fixed;top:0;left:0;bottom:0;width:min(300px,84vw);z-index:80;overflow-y:auto;box-shadow:12px 0 40px rgba(0,0,0,.6)}\n.ld-side.ld-side-open .ld-drawer-close{display:flex !important}\n.ld-backdrop{display:block !important;position:fixed;top:0;right:0;bottom:0;left:0;z-index:79;border:0;background:rgba(0,0,0,.6)}\n.ld-main{padding:12px !important;gap:12px !important}\n.ld-footer{padding:24px 16px 20px !important;gap:16px !important}\n.ld-tabbar{display:flex !important;position:fixed;left:0;right:0;bottom:0;z-index:60;height:64px;background:#080b0e;border-top:1px solid #282d36}\n}\n";

class LiveDrawPage extends DCLogic {
  constructor(...args) {
    super(...args);
    this.state = { step: 1, sessionId: 5, cardId: null, picks: [], done: false, flash: null, helpOpen: false, chat: '', msgs: null, spent: 0, bought: {}, playerVisible: true, miniClosed: false, cat: '全部', range: 'all', sort: 'high', chatOpen: false, unread: 3, dialOpen: false, numsOpen: false };
    this._setWiz = (el) => { this._wiz = el; };
    this._setSess = (el) => { this._sess = el; };
    this._setStrip = (el) => { this._strip = el; };
    this._setPlayer = (el) => {
      if (this._io) { this._io.disconnect(); this._io = null; }
      this._pl = el;
      if (el && typeof IntersectionObserver !== 'undefined') {
        this._io = new IntersectionObserver((entries) => {
          const vis = !!entries[0] && entries[0].intersectionRatio > 0.25;
          if (vis !== this.state.playerVisible) this.setState(vis ? { playerVisible: true, miniClosed: false } : { playerVisible: false });
        }, { threshold: [0, 0.25, 0.5, 1] });
        this._io.observe(el);
      }
    };
  }

  componentWillUnmount() {
    if (this._io) this._io.disconnect();
    if (this._advT) clearTimeout(this._advT);
  }

  data() {
    if (this._d) return this._d;
    const sessions = [];
    for (let i = 0; i < 20; i++) {
      const n = i + 1;
      const t = 20 * 60 + 30 + i * 5;
      const mm = t % 60;
      const time = Math.floor(t / 60) + ':' + (mm < 10 ? '0' + mm : String(mm));
      const half = n % 2 === 1;
      sessions.push({ id: n, label: '第 ' + n + ' 場', time: time, odds: half ? '二份之一' : '十分之一', heaven: half ? 10 : 2, status: n < 5 ? 'ended' : (n === 5 ? 'live' : 'open') });
    }
    const cards = [
      { id: 'c1', name: '[PSA10]ピカチュウex [M2a 234/193]', cat: '比卡超', price: 1900, kind: 'slab', img: 'images/card-pikachu-ex-M2a-234.webp' },
      { id: 'c2', name: '[PSA10]ロケット団のミュウツーex SAR [M2a 237/193]', cat: '其他', price: 1200, kind: 'slab', img: 'images/card-mewtwo-ex-M2a-237.webp' },
      { id: 'c3', name: '[PSA10]ブラッキーex [sv8a 217/187]', cat: '伊貝', price: 3800, kind: 'slab', img: 'images/card-umbreon-ex-sv8a-217.webp' },
      { id: 'c4', name: '[PSA10]フクオカのピカチュウ [289/SV-P]', cat: '比卡超', price: 1300, kind: 'slab', img: 'images/card-fukuoka-pikachu-289-SV-P.webp' },
      { id: 'c5', name: '[PSA10]ピカチュウ [323/S-P]', cat: '比卡超', price: 4700, kind: 'slab', img: 'images/card-pikachu-323-S-P.webp' },
      { id: 'c6', name: '[PSA10]リザードンVMAX [S4a 308/190]', cat: '噴火龍', price: 1900, kind: 'slab', img: 'images/card-charizard-vmax-S4a-308.webp' }
    ];
    cards.forEach((c) => { c.hell = '隨機 PSA10'; });
    const taken = {
      5: { 1: ['Kay', '[PSA10]ピカチュウ [323/S-P]'], 6: ['Chris', '[PSA10]ブラッキーex [sv8a 217/187]'], 11: ['Kay', '[PSA10]ピカチュウex [M2a 234/193]'], 14: ['Pokechu', '[PSA10]リザードンVMAX [S4a 308/190]'], 20: ['Kay', '[PSA10]ブラッキーex [sv8a 217/187]'] },
      6: { 3: ['VIP', '[PSA10]ロケット団のミュウツーex SAR [M2a 237/193]'], 9: ['Kay', '[PSA10]フクオカのピカチュウ [289/SV-P]'] },
      7: { 12: ['Chris', '[PSA10]ピカチュウ [323/S-P]'] },
      8: { 2: ['Pokechu', '[PSA10]ピカチュウex [M2a 234/193]'], 17: ['VIP', '[PSA10]リザードンVMAX [S4a 308/190]'] }
    };
    const msgs = [
      { name: 'Kay', time: '20:50', text: '第 5 場開始喇！', av: '#21252d', avColor: '#ffffff', avBorder: '#282d36' },
      { name: 'Chris', time: '20:50', text: '今晚揀咗 #6，求天堂', av: '#4a0511', avColor: '#ffffff', avBorder: '#4a0511' },
      { name: 'Pokechu', time: '20:51', text: '呢張 PSA10 好靚', av: '#3a2a00', avColor: '#ffe390', avBorder: '#3a2a00' },
      { name: 'VIP', time: '20:51', text: '等緊第 6 場', av: '#13161b', avColor: '#ffffff', avBorder: '#282d36' }
    ];
    const cats = ['全部', '比卡超', '噴火龍', '伊貝', '其他'];
    this._d = { sessions: sessions, cards: cards, taken: taken, msgs: msgs, cats: cats, balance: 4036 };
    return this._d;
  }

  _renderVals0() {
    const d = this.data();
    const st = this.state;
    const fmt = (n) => Number(n).toLocaleString('en-US');
    const SEL = '0 0 0 2px #f4022b, 0 0 24px rgba(244, 2, 43, 0.35)';
    const session = d.sessions.find((s) => s.id === st.sessionId) || d.sessions[4];
    const card = d.cards.find((c) => c.id === st.cardId) || null;
    const taken = Object.assign({}, d.taken[session.id] || {});
    (st.bought[session.id] || []).forEach((b) => { taken[b.n] = ['Toothpick', b.card]; });
    const picks = st.picks.slice().sort((a, b) => a - b);
    const balance = d.balance - st.spent;
    const unit = card ? card.price : 0;
    const total = unit * picks.length;
    const enough = total <= balance;
    const step = st.step;
    const finished = !!st.done;
    const half = session.heaven === 10;

    const goStep = (n) => {
      this.setState({ step: n });
      const el = this._wiz;
      if (el && el.getBoundingClientRect && typeof window !== 'undefined') {
        const top = el.getBoundingClientRect().top;
        if (top < 0 || top > window.innerHeight * 0.5) { try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
      }
    };
    const later = (fn) => { if (this._advT) clearTimeout(this._advT); this._advT = setTimeout(fn, 260); };

    const LABELS = ['選擇卡牌', '選擇號碼', '確認購買'];
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
      ['選擇卡牌', ''],
      ['選擇號碼', '按一個號碼，每個盲盒可選 1 個號碼；灰色號碼已被其他玩家購買。'],
      ['確認購買', '確認後號碼即時鎖定，於 ' + session.time + ' 直播開抽時揭曉天堂與地獄。']
    ];
    const summary = [];
    if (step >= 2 && card) summary.push({ k: '卡牌', v: card.name });

    const sessionList = d.sessions.filter((s) => s.status !== 'ended').map((s) => {
      const sel = s.id === session.id;
      return {
        label: s.label, time: s.time, isLive: s.status === 'live',
        statusLabel: s.status === 'live' ? '直播中・可預訂' : '可預訂',
        ratio: s.heaven === 10 ? '1/2' : '1/10', pctLabel: s.heaven === 10 ? '50%機率' : '10%機率', heaven: s.heaven,
        pressed: sel, notPressed: !sel, ratioColor: s.heaven === 10 ? '#fdc800' : '#c3c8cd',
        pick: () => {
          const cur = this.state;
          if (cur.sessionId === s.id && !cur.done) return;
          const hasCard = !!cur.cardId;
          const nextStep = cur.done ? (hasCard ? 2 : 1) : (cur.step >= 2 ? (hasCard ? 2 : 1) : cur.step);
          this.setState({ sessionId: s.id, picks: [], done: false, step: nextStep });
        },
        border: sel ? '#f4022b' : '#282d36', bg: sel ? '#181015' : '#0b0e12', glow: sel ? SEL : 'none', cls: sel ? '' : 'ld-lift'
      };
    });
    const pickSess = (s) => {
      const cur = this.state;
      if (cur.sessionId === s.id && !cur.done) { this.setState({ sessOpen: false }); return; }
      const hasCard = !!cur.cardId;
      const nextStep = cur.done ? (hasCard ? 2 : 1) : (cur.step >= 2 ? (hasCard ? 2 : 1) : cur.step);
      this.setState({ sessionId: s.id, picks: [], done: false, step: nextStep, sessOpen: false });
    };
    const openList = d.sessions.filter((s) => s.status !== 'ended');
    const sIdx = openList.findIndex((s) => s.id === session.id);
    const allSess = d.sessions.map((s) => {
      const sel = s.id === session.id; const ended = s.status === 'ended';
      return {
        label: s.label, time: s.time, ratio: s.heaven === 10 ? '1/2' : '1/10', pressed: sel, ended: ended,
        tag: ended ? '已結束' : (sel ? '已選擇' : (s.status === 'live' ? '● 直播中' : '可預訂')),
        tagColor: ended ? '#4a525c' : (sel ? '#ff4d68' : (s.status === 'live' ? '#ff4d68' : '#22c55e')),
        ratioColor: ended ? '#4a525c' : (s.heaven === 10 ? '#fdc800' : '#c3c8cd'),
        border: sel ? '#f4022b' : (ended ? '#14181d' : '#282d36'), bg: sel ? '#181015' : (ended ? '#05070a' : '#13161b'),
        color: ended ? '#4a525c' : '#ffffff', subColor: ended ? '#4a525c' : '#a0a5ad', cursor: ended ? 'not-allowed' : 'pointer',
        pick: () => { if (!ended) pickSess(s); }
      };
    });
    const stripBy = (dir) => { if (this._strip && this._strip.scrollBy) this._strip.scrollBy({ left: dir * 360, behavior: 'smooth' }); };

    const RANGES = [
      { id: 'all', name: '全部', ok: () => true },
      { id: 'lo', name: '2,000 以下', ok: (p) => p < 2000 },
      { id: 'mid', name: '2,000 – 4,000', ok: (p) => p >= 2000 && p <= 4000 },
      { id: 'hi', name: '4,000 以上', ok: (p) => p > 4000 }
    ];
    const curCat = st.cat || '全部';
    const curRange = RANGES.find((r) => r.id === st.range) || RANGES[0];
    const chipStyle = (on) => ({ on: on, line: on ? '#f4022b' : 'transparent', color: on ? '#ffffff' : '#a0a5ad', weight: on ? '700' : '500', countColor: on ? '#ff4d68' : '#6b767f' });
    const catChips = d.cats.map((k) => Object.assign({ name: k, count: k === '全部' ? d.cards.length : d.cards.filter((c) => c.cat === k).length, pick: () => this.setState({ cat: k }) }, chipStyle(k === curCat)));
    const rangeChips = RANGES.map((r) => ({ id: r.id, name: r.name }));
    const sortHigh = st.sort !== 'low';
    const shown = d.cards.filter((c) => (curCat === '全部' || c.cat === curCat) && curRange.ok(c.price)).sort((a, b) => sortHigh ? b.price - a.price : a.price - b.price);
    const cardList = shown.map((c) => {
      const sel = (!!card && card.id === c.id) || st.flash === c.id;
      return {
        name: c.name, priceText: fmt(c.price), img: c.img, pressed: sel,
        pick: () => { this.setState({ cardId: c.id, picks: [], flash: c.id }); later(() => goStep(2)); },
        border: sel ? '#f4022b' : '#282d36', bg: sel ? '#181015' : '#0b0e12', glow: sel ? SEL : 'none', cls: sel ? '' : 'ld-lift'
      };
    });

    const numbers = [];
    for (let n = 1; n <= 20; n++) {
      const tk = taken[n];
      const who = tk ? tk[0] : '';
      const boughtCard = tk ? tk[1] : '';
      const mine = picks.indexOf(n) !== -1;
      numbers.push({
        n: n, taken: !!who, notTaken: !who, who: who, card: boughtCard, mine: mine,
        sub: mine ? '我的號碼' : '可選',
        aria: who ? ('號碼 ' + n + '，已被 ' + who + ' 購買，卡牌：' + boughtCard) : ('號碼 ' + n + (mine ? '，已選' : '，可選')),
        toggle: () => {
          if (who) return;
          const at = this.state.picks.indexOf(n);
          this.setState({ picks: at === -1 ? [n] : [] });
        },
        bg: who ? '#05070a' : (mine ? 'linear-gradient(180deg, #d50125 0%, #ae031d 100%)' : 'linear-gradient(180deg, #21252d 0%, #13161b 100%)'),
        border: who ? '#14181d' : (mine ? '#f4022b' : '#282d36'),
        glow: mine ? SEL : (who ? 'none' : 'inset 0 1px 0 rgba(255, 255, 255, 0.08)'),
        color: who ? '#a0a5ad' : '#ffffff',
        subColor: mine ? '#ffffff' : '#a0a5ad',
        cursor: who ? 'not-allowed' : 'pointer',
        cls: mine || who ? '' : 'ld-lift'
      });
    }
    const picksText = picks.length ? picks.map((n) => '#' + n).join('、') : '尚未選擇';
    const hasPick = picks.length > 0;

    const confirm = () => {
      if (!enough || !picks.length) return;
      const bought = Object.assign({}, this.state.bought);
      bought[session.id] = (bought[session.id] || []).concat(picks.map((n) => ({ n: n, card: card ? card.name : '' })));
      this.setState({ done: true, spent: this.state.spent + total, bought: bought });
    };

    const baseMsgs = st.msgs || d.msgs;
    const msgs = baseMsgs.map((m) => ({ name: m.name, time: m.time, text: m.text, av: m.av, avColor: m.avColor, avBorder: m.avBorder, initial: m.name.charAt(0) }));
    const sendText = (raw) => {
      const text = (raw || '').trim();
      if (!text) return;
      const list = (this.state.msgs || d.msgs).concat([{ name: 'Toothpick', time: '20:52', text: text, av: '#4a0511', avColor: '#ffffff', avBorder: '#f4022b' }]);
      this.setState({ msgs: list, chat: '' });
    };
    const send = () => sendText(this.state.chat);

    return {
      balanceText: fmt(balance),
      wizRef: this._setWiz,
      stepBar: stepBar,
      stepCols: finished ? 'repeat(3, minmax(0, 1fr))' : LABELS.map((x, k) => (k + 1 === step ? '1.6fr' : '1fr')).join(' '),
      stepCounter: finished ? '已完成' : ('第 ' + step + ' 步／共 3 步'), headTitle: finished ? '購買成功' : TITLES[step - 1][0],
      canBack: !finished && step > 1,
      back: () => goStep(Math.max(1, this.state.step - 1)),
      helpOpen: !!st.helpOpen, toggleHelp: () => this.setState({ helpOpen: !this.state.helpOpen }),
      helpLines: [
        { k: '選擇場次', v: '在上方隨時轉換場次。每場 20 個號碼，1/2 即有 10 個天堂；1/10 即有 2 個天堂。' },
        { k: '選擇卡牌', v: '抽中天堂即可獲得所選卡牌。' },
        { k: '選擇號碼', v: '每個盲盒可選 1 個號碼；想再抽可再購買新盲盒。' },
        { k: '確認購買', v: '直播開抽時揭曉結果；抽中地獄可獲保底隨機 PSA10。' }
      ],
      hasSummary: !finished && step === 2, summary: summary,
      showStepTitle: !finished, stepNo: step, stepTitle: TITLES[step - 1][0], stepHint: TITLES[step - 1][1], hasHint: !!TITLES[step - 1][1],
      isCardStep: !finished && step === 1, isNumStep: !finished && step === 2, isConfirmStep: !finished && step === 3, isDone: finished,
      sessRef: this._setSess, stripRef: this._setStrip,
      allSess: allSess, sessOpen: !!st.sessOpen, openSess: () => this.setState({ sessOpen: true, dialOpen: false }), closeSess: () => this.setState({ sessOpen: false }),
      sessLive: session.status === 'live', sessRatioColor: half ? '#fdc800' : '#ffffff',
      prevOff: sIdx <= 0, nextOff: sIdx >= openList.length - 1,
      prevColor: sIdx <= 0 ? '#3a414b' : '#ffffff', nextColor: sIdx >= openList.length - 1 ? '#3a414b' : '#ffffff',
      sessPrev: () => { if (sIdx > 0) pickSess(openList[sIdx - 1]); },
      sessNext: () => { if (sIdx < openList.length - 1) pickSess(openList[sIdx + 1]); },
      stripLeft: () => stripBy(-1), stripRight: () => stripBy(1),
      sessionList: sessionList, cardList: cardList, numbers: numbers,
      catChips: catChips, rangeChips: rangeChips, range: curRange.id, rangeBorder: curRange.id === 'all' ? '#282d36' : '#f4022b', onRange: (e) => this.setState({ range: e.target.value }), cardCount: shown.length, noCards: shown.length === 0,
      sortLabel: sortHigh ? '高至低' : '低至高', sortAria: '排序：' + (sortHigh ? '價錢高至低' : '價錢低至高') + '，按一下切換',
      toggleSort: () => this.setState({ sort: this.state.sort === 'low' ? 'high' : 'low' }),
      pickLine: hasPick ? ('已選號碼 ' + picksText) : '請按一個號碼',
      barBorder: hasPick ? '#f4022b' : '#282d36',
      next: () => { if (this.state.picks.length) goStep(3); },
      nextDisabled: !hasPick,
      nextBg: hasPick ? '#f4022b' : '#21252d', nextColor: hasPick ? '#ffffff' : '#a0a5ad',
      nextGlow: hasPick ? '0 6px 20px rgba(244, 2, 43, 0.4)' : 'none',
      sessionLabel: session.label, sessionTime: session.time, sessionRatio: half ? '1/2' : '1/10', sessionPct: half ? '50%機率' : '10%機率',
      sessionHeaven: session.heaven, sessionHell: 20 - session.heaven,
      cardName: card ? card.name : '尚未選擇', cardImg: card && card.img ? card.img : '', unitText: fmt(unit),
      hellName: card ? card.hell : '隨機 PSA10',
      pickChips: picks.map((n) => ({ label: '#' + n })), picksText: picksText,
      totalText: fmt(total),
      enough: enough, notEnough: !enough,
      afterText: fmt(balance - total), shortText: fmt(Math.max(0, total - balance)),
      confirm: confirm,
      confirmBg: enough ? 'linear-gradient(180deg, #ffe390 0%, #fdc800 45%, #f88f00 100%)' : '#21252d',
      confirmColor: enough ? '#1a1300' : '#a0a5ad',
      confirmGlow: enough ? '0 0 0 2px #fdc800, 0 0 32px rgba(253, 200, 0, 0.45)' : 'none',
      reset: () => { this.setState({ done: false, picks: [], cardId: null, flash: null, step: 1 }); const el = this._sess; if (el && el.scrollIntoView) { try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} } },
      againSame: () => { this.setState({ done: false, picks: [], flash: null }); goStep(2); },
      msgs: msgs, chat: st.chat,
      overlayMsgs: msgs.slice(-3).map((m) => ({ name: m.name, text: m.text })),
      chatOpen: !!st.chatOpen, openChat: () => this.setState({ chatOpen: true, unread: 0, dialOpen: false }), closeChat: () => this.setState({ chatOpen: false }),
      hasUnread: !st.chatOpen && st.unread > 0, unread: st.unread, unreadAria: st.unread + ' 則未讀訊息',
      quick: ['恭喜！', '好運！', '🔥🔥🔥', '天堂嚟啦'].map((t) => ({ text: t, send: () => sendText(t) })),
      dialOpen: !!st.dialOpen, dialCls: st.dialOpen ? 'ld-dial-open' : '', dialRot: st.dialOpen ? 'rotate(45deg)' : 'none',
      toggleDial: () => this.setState({ dialOpen: !this.state.dialOpen }),
      recOpen: !!st.recOpen, openRec: () => this.setState({ recOpen: true, dialOpen: false }), closeRec: () => this.setState({ recOpen: false }),
      recList: (() => {
        const R = [['07/11', 3, 9, 4, 'hell', true], ['07/11', 2, 18, 1, 'hell', true], ['07/11', 2, 17, 1, 'heaven', true], ['07/11', 1, 9, 2, 'hell', true], ['02/11', 6, 2, 0, 'hell', false], ['01/11', 18, 17, 5, 'hell', false], ['01/11', 18, 9, 5, 'hell', false], ['01/11', 12, 12, 3, 'heaven', false]];
        return R.map((x) => { const c = d.cards[x[3] % d.cards.length]; return { title: x[0] + ' LiveDraw 直播', sub: '第 ' + x[1] + ' 場・#' + x[2], box: c.name, img: c.img, price: fmt(c.price), thisShow: x[5], res: x[4] === 'heaven' ? '天堂' : '地獄', resBg: x[4] === 'heaven' ? '#12924f' : '#d50125' }; });
      })(), recCount: 8,
      numsOpen: !!st.numsOpen, openNums: () => this.setState({ numsOpen: true, dialOpen: false }), closeNums: () => this.setState({ numsOpen: false }),
      soldCount: numbers.filter((x) => x.taken).length,
      usage: numbers.map((x) => ({ n: x.n, sub: x.taken ? '已售' : (x.mine ? '我的' : '可選'), bg: x.taken ? '#05070a' : (x.mine ? '#d50125' : '#21252d'), border: x.taken ? '#14181d' : (x.mine ? '#f4022b' : '#3a414b'), color: x.taken ? '#4a525c' : '#ffffff' })),
      numsGoText: finished ? '知道了' : (card ? '去選擇號碼' : '去選擇卡牌'),
      numsGo: () => { this.setState({ numsOpen: false }); if (!finished) goStep(card ? 2 : 1); },
      onChat: (e) => this.setState({ chat: e.target.value }),
      onChatKey: (e) => { if (e.key === 'Enter') send(); },
      send: send,
      playerRef: this._setPlayer,
      showMini: !st.playerVisible && !st.miniClosed,
      closeMini: () => this.setState({ miniClosed: true }),
      backToPlayer: () => { if (this._pl && this._pl.scrollIntoView) this._pl.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
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

LiveDrawPage.prototype.template = function template(v) {
  return (<>
<style>{CSS}</style>

<main className="ld-main" style={{flex: "999 1 560px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px", padding: "24px"}}>{"\n\n  "}
  <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px"}}>{"\n    "}
    <h1 style={{margin: "0", fontFamily: "'Barlow Condensed', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif", fontWeight: "900", fontSize: "34px", lineHeight: "40px"}}>{"直播抽卡"}</h1>{"\n  "}
  </div>{"\n\n  "}
  <div style={{display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: "16px"}}>{"\n  "}
    <section aria-label="直播畫面" style={{flex: "1 1 100%", minWidth: "0", display: "flex", flexDirection: "column", gap: "12px", padding: "16px", borderRadius: "10px", border: "1px solid #4a0511", background: "#05070a"}}>{"\n    "}
      <div ref={v.playerRef} className="ld-player" style={{position: "relative", width: "100%", aspectRatio: "16 / 9", maxHeight: "540px", borderRadius: "6px", overflow: "hidden", border: "1px solid #282d36", background: "radial-gradient(70% 90% at 50% 45%, #2a0710 0%, #05070a 72%)"}}>{"\n      "}
        <img src="/revamp/images/logo.png" alt="" style={{position: "absolute", left: "50%", top: "50%", width: "34%", transform: "translate(-50%, -50%)", opacity: "0.16"}} />{"\n      "}
        <span style={{position: "absolute", top: "14px", left: "14px"}}>
          <span style={{display: "inline-flex", alignItems: "center", gap: "6px", height: "26px", padding: "0 10px", borderRadius: "4px", background: "#f4022b", color: "#ffffff", fontSize: "13px", fontWeight: "700", letterSpacing: "0.04em"}}>
            <span aria-hidden="true" style={{width: "6px", height: "6px", borderRadius: "999px", background: "#ffffff", animation: "ld-blink 1.2s ease-in-out infinite"}}></span>{"LIVE"}
          </span>
        </span>{"\n      "}
        <button type="button" aria-label="播放直播" style={{position: "absolute", left: "50%", top: "50%", width: "84px", height: "84px", margin: "-42px 0 0 -42px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", border: "2px solid rgba(255, 255, 255, 0.85)", background: "rgba(5, 7, 10, 0.55)", color: "#ffffff", cursor: "pointer"}}>
          <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5.5v13l10.5-6.5z" fill="currentColor"></path>
          </svg>
        </button>{"\n      "}
        <button type="button" className="ld-ovl" onClick={v.openChat} aria-label="開啟大廳聊天" style={{position: "absolute", left: "14px", bottom: "70px", maxWidth: "60%", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "6px", padding: "0", border: "0", background: "none", cursor: "pointer", textAlign: "left"}}>{"\n        "}
          {(Array.isArray(v.overlayMsgs) ? v.overlayMsgs : []).map((m, $index) => (<React.Fragment key={$index}>{"\n          "}
            <span style={{maxWidth: "100%", padding: "4px 12px", borderRadius: "999px", background: "rgba(5, 7, 10, 0.66)", fontSize: "13px", lineHeight: "20px", color: "#ffffff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>
              <strong style={{color: "#fdc800"}}>{m?.name}</strong>{"　"}{m?.text}
            </span>{"\n        "}
          </React.Fragment>))}{"\n      "}
        </button>{"\n      "}
        <div style={{position: "absolute", left: "0", right: "0", bottom: "0", display: "flex", alignItems: "center", gap: "8px", padding: "12px 14px", background: "linear-gradient(0deg, rgba(5, 7, 10, 0.85), rgba(5, 7, 10, 0))"}}>{"\n        "}
          <span style={{fontSize: "14px", color: "#c3c8cd"}}>{"29/10 LiveDraw 直播"}</span>{"\n        "}
          <button type="button" aria-label="開啟聲音" style={{marginLeft: "auto", width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", border: "1px solid #282d36", background: "rgba(5, 7, 10, 0.7)", color: "#ffffff", cursor: "pointer"}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"></path>
              <path d="m16 9.5 5 5M21 9.5l-5 5"></path>
            </svg>
          </button>{"\n        "}
          <button type="button" aria-label="全螢幕" style={{width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", border: "1px solid #282d36", background: "rgba(5, 7, 10, 0.7)", color: "#ffffff", cursor: "pointer"}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"></path>
            </svg>
          </button>{"\n      "}
        </div>{"\n    "}
      </div>{"\n  "}
    </section>{"\n\n\n  "}
  </div>{"\n\n\n  "}
  <section ref={v.wizRef} className="ld-wiz" aria-labelledby="wiz-title" style={{display: "flex", flexDirection: "column", gap: "18px", padding: "18px 20px 20px", borderRadius: "10px", border: "1px solid #3a414b", background: "#080b0e", boxShadow: "inset 0 3px 0 #f4022b", scrollMarginTop: "84px"}}>{"\n    "}
    <div ref={v.sessRef} style={{display: "flex", alignItems: "stretch", gap: "8px", scrollMarginTop: "84px"}}>{"\n      "}
      <button type="button" onClick={v.sessPrev} aria-label="上一場" disabled={v.prevOff} style={{flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "56px", borderRadius: "6px", border: "1px solid #282d36", background: "#13161b", color: `${asset(v.prevColor) ?? ''}`, cursor: "pointer"}}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 6-6 6 6 6"></path>
        </svg>
      </button>{"\n      "}
      <button type="button" onClick={v.openSess} aria-haspopup="dialog" style={{flex: "1 1 auto", minWidth: "0", display: "flex", alignItems: "center", gap: "12px", height: "56px", padding: "0 14px", borderRadius: "6px", border: "1px solid #f4022b", background: "#181015", color: "#ffffff", textAlign: "left", cursor: "pointer"}}>{"\n        "}
        <span style={{flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column"}}>{"\n          "}
          <span id="sess-title" style={{display: "flex", alignItems: "center", gap: "8px", fontSize: "18px", lineHeight: "24px", fontWeight: "900", whiteSpace: "nowrap"}}>{v.sessionLabel}
            {v.sessLive ? (<>
              <span style={{display: "inline-flex", alignItems: "center", gap: "4px", height: "18px", padding: "0 6px", borderRadius: "3px", background: "#f4022b", fontSize: "11px", fontWeight: "700", letterSpacing: "0.04em"}}>
                <span aria-hidden="true" style={{width: "5px", height: "5px", borderRadius: "999px", background: "#ffffff", animation: "ld-blink 1.2s ease-in-out infinite"}}></span>{"LIVE"}
              </span>
            </>) : null}
          </span>{"\n          "}
          <span style={{fontSize: "13px", lineHeight: "18px", color: "#a0a5ad", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{v.sessionTime}{" 開抽・"}
            <strong style={{color: `${asset(v.sessRatioColor) ?? ''}`}}>{v.sessionRatio}</strong>{"・已售 "}{v.soldCount}{"/20"}
          </span>{"\n        "}
        </span>{"\n        "}
        <span style={{flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "13px", fontWeight: "700", color: "#ff4d68", whiteSpace: "nowrap"}}>
          <span className="ld-hide-m">{"轉場次"}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6"></path>
          </svg>
        </span>{"\n      "}
      </button>{"\n      "}
      <button type="button" onClick={v.sessNext} aria-label="下一場" disabled={v.nextOff} style={{flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "56px", borderRadius: "6px", border: "1px solid #282d36", background: "#13161b", color: `${asset(v.nextColor) ?? ''}`, cursor: "pointer"}}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9 6 6 6-6 6"></path>
        </svg>
      </button>{"\n    "}
    </div>{"\n    "}
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
    </>) : null}{"\n\n    "}
    {v.isCardStep ? (<>{"\n    "}
      <div style={{display: "flex", flexDirection: "column", gap: "16px"}}>{"\n      "}
        <div style={{display: "flex", flexDirection: "column", gap: "12px"}}>{"\n        "}
          <div role="group" aria-label="卡牌類別" style={{display: "flex", gap: "22px", overflowX: "auto", borderBottom: "1px solid #282d36", scrollbarWidth: "none"}}>{"\n          "}
            {(Array.isArray(v.catChips) ? v.catChips : []).map((k, $index) => (<React.Fragment key={$index}>{"\n            "}
              <button type="button" onClick={k?.pick} aria-pressed={k?.on} style={{flex: "0 0 auto", display: "inline-flex", alignItems: "baseline", gap: "4px", height: "40px", padding: "0 2px", marginBottom: "-1px", border: "0", borderBottom: `3px solid ${asset(k?.line) ?? ''}`, background: "transparent", color: `${asset(k?.color) ?? ''}`, fontSize: "15px", lineHeight: "37px", fontWeight: `${asset(k?.weight) ?? ''}`, cursor: "pointer", whiteSpace: "nowrap"}}>{k?.name}
                <span style={{fontSize: "12px", fontWeight: "500", color: `${asset(k?.countColor) ?? ''}`}}>{k?.count}</span>
              </button>{"\n          "}
            </React.Fragment>))}{"\n        "}
          </div>{"\n        "}
          <div style={{display: "flex", alignItems: "center", gap: "8px"}}>{"\n          "}
            <span style={{flex: "1 1 auto", fontSize: "13px", lineHeight: "18px", color: "#a0a5ad", whiteSpace: "nowrap"}}>{"共 "}{v.cardCount}{" 張"}</span>{"\n          "}
            <label style={{position: "relative", flex: "0 0 auto", display: "inline-flex", alignItems: "center"}}>{"\n            "}
              <span style={{position: "absolute", left: "10px", fontSize: "13px", color: "#a0a5ad", pointerEvents: "none"}}>{"價錢"}</span>{"\n            "}
              <select value={v.range} onChange={v.onRange} aria-label="價錢範圍" style={{appearance: "none", WebkitAppearance: "none", height: "34px", padding: "0 28px 0 46px", borderRadius: "4px", border: `1px solid ${asset(v.rangeBorder) ?? ''}`, background: "#13161b", color: "#ffffff", fontSize: "13px", fontWeight: "700", fontFamily: "inherit", cursor: "pointer"}}>{"\n              "}
                <option value={v.r?.id}>{v.r?.name}</option>{"\n            "}
              </select>{"\n            "}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a0a5ad" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{position: "absolute", right: "9px", pointerEvents: "none"}}>
                <path d="m6 9 6 6 6-6"></path>
              </svg>{"\n          "}
            </label>{"\n          "}
            <button type="button" onClick={v.toggleSort} aria-label={v.sortAria} style={{flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "4px", height: "34px", padding: "0 10px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "13px", fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap"}}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f4022b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5"></path>
              </svg>{v.sortLabel}
            </button>{"\n        "}
          </div>{"\n      "}
        </div>{"\n      "}
        {v.noCards ? (<>
          <div style={{padding: "32px 16px", textAlign: "center", borderRadius: "10px", border: "1px dashed #282d36", color: "#a0a5ad", fontSize: "14px"}}>{"沒有符合條件的卡牌，請更改類別或價錢範圍。"}</div>
        </>) : null}{"\n      "}
        <div className="ld-cgrid" style={{display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(128px, 100%), 1fr))", gap: "10px"}}>{"\n        "}
          {(Array.isArray(v.cardList) ? v.cardList : []).map((c, $index) => (<React.Fragment key={$index}>{"\n          "}
            <button type="button" onClick={c?.pick} aria-pressed={c?.pressed} className={`${c?.cls ?? ''} ld-ccard`} style={{position: "relative", display: "flex", flexDirection: "column", gap: "6px", padding: "8px", textAlign: "left", borderRadius: "10px", border: `1px solid ${asset(c?.border) ?? ''}`, background: `${asset(c?.bg) ?? ''}`, boxShadow: `${asset(c?.glow) ?? ''}`, color: "#ffffff", cursor: "pointer"}}>{"\n            "}
              {c?.pressed ? (<>
                <span aria-hidden="true" style={{position: "absolute", top: "8px", right: "8px", zIndex: "1", display: "flex", alignItems: "center", justifyContent: "center", width: "26px", height: "26px", borderRadius: "999px", background: "#f4022b", color: "#ffffff", boxShadow: "0 0 0 2px #05070a"}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m5 12.5 4.5 4.5L19 7.5"></path>
                  </svg>
                </span>
              </>) : null}{"\n            "}
              <span style={{display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 0", borderRadius: "6px", background: "radial-gradient(60% 60% at 50% 50%, #2a2000 0%, #05070a 80%)"}}>{"\n              "}
                <span style={{display: "flex", flexDirection: "column", gap: "4px", width: "82%", padding: "5px", borderRadius: "7px", border: "1px solid #3a404b", background: "linear-gradient(180deg, #2a2f38 0%, #13161b 100%)", boxShadow: "0 0 18px rgba(253, 200, 0, 0.18)"}}>
                  <span style={{display: "flex", alignItems: "center", justifyContent: "space-between", height: "16px", padding: "0 5px", borderRadius: "3px", background: "#05070a", border: "1px solid #3a2a00", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "10px", letterSpacing: "0.06em", color: "#ffe390"}}>
                    <span>{"PSA"}</span>
                    <span style={{color: "#fdc800"}}>{"10"}</span>
                  </span>
                  <span style={{position: "relative", display: "block", aspectRatio: "63 / 88", borderRadius: "3px", overflow: "hidden", background: "#0b0e12"}}>
                    <img src={asset(c?.img)} alt="" style={{position: "absolute", top: "0", left: "0", width: "100%", height: "100%", objectFit: "cover"}} />
                  </span>
                </span>{"\n            "}
              </span>{"\n            "}
              <span className="ld-cname" style={{display: "block", height: "36px", overflow: "hidden", fontSize: "12px", lineHeight: "18px", fontWeight: "700"}}>{c?.name}</span>{"\n            "}
              <span style={{display: "inline-flex", alignItems: "baseline", gap: "4px", whiteSpace: "nowrap"}}>
                <span style={{alignSelf: "center", display: "inline-flex"}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="10.5" fill="#fdc800" stroke="#f88f00" strokeWidth="2"></circle>
                    <path d="M13.4 5.2 7.9 13h3.9l-1.2 5.8 5.6-8h-4z" fill="#f88f00"></path>
                  </svg>
                </span>
                <strong className="ld-cprice" style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "20px", lineHeight: "22px"}}>{c?.priceText}</strong>
                <span className="ld-hide-m" style={{fontSize: "12px", color: "#a0a5ad"}}>{"／盲盒"}</span>
              </span>{"\n          "}
            </button>{"\n        "}
          </React.Fragment>))}{"\n      "}
        </div>{"\n      "}
        <div style={{display: "flex", flexWrap: "wrap", gap: "10px 24px", padding: "14px 16px", borderRadius: "10px", border: "1px solid #14181d", background: "#05070a", fontSize: "14px", lineHeight: "20px", color: "#c3c8cd"}}>{"\n        "}
          <span style={{display: "inline-flex", alignItems: "center", gap: "8px"}}>
            <span style={{height: "22px", padding: "0 8px", borderRadius: "4px", border: "1px solid #4fb3ff", background: "#041737", color: "#c2ebff", fontSize: "12px", lineHeight: "20px", fontWeight: "700"}}>{"中天堂"}</span>{"獲得你選擇的卡牌"}
          </span>{"\n        "}
          <span style={{display: "inline-flex", alignItems: "center", gap: "8px"}}>
            <span style={{height: "22px", padding: "0 8px", borderRadius: "4px", border: "1px solid #ae031d", background: "#4a0511", color: "#ffd7c1", fontSize: "12px", lineHeight: "20px", fontWeight: "700"}}>{"中地獄"}</span>
            <img src="/revamp/images/hell-card-mystery-psa10.webp" alt="" style={{display: "block", height: "32px", aspectRatio: "316 / 530", objectFit: "cover", borderRadius: "2px"}} />{"保底獲得隨機 PSA10"}
          </span>{"\n      "}
        </div>{"\n    "}
      </div>{"\n    "}
    </>) : null}{"\n\n    "}
    {v.isNumStep ? (<>{"\n    "}
      <div style={{display: "flex", flexDirection: "column", gap: "14px"}}>{"\n      "}
        <div style={{padding: "20px", borderRadius: "10px", border: "1px solid #282d36", background: "radial-gradient(80% 60% at 50% 0%, rgba(244, 2, 43, 0.12) 0%, rgba(244, 2, 43, 0) 70%), #05070a"}}>{"\n        "}
          <div className="ld-ngrid" style={{display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "10px"}}>{"\n          "}
            {(Array.isArray(v.numbers) ? v.numbers : []).map((t, $index) => (<React.Fragment key={$index}>{"\n            "}
              <button type="button" onClick={t?.toggle} disabled={t?.taken} aria-pressed={t?.mine} aria-label={t?.aria} className={t?.cls} style={{display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px", height: "84px", borderRadius: "10px", border: `1px solid ${asset(t?.border) ?? ''}`, background: `${asset(t?.bg) ?? ''}`, boxShadow: `${asset(t?.glow) ?? ''}`, color: `${asset(t?.color) ?? ''}`, cursor: `${asset(t?.cursor) ?? ''}`}}>{"\n              "}
                {t?.taken ? (<>{"\n                "}
                  <span style={{display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", lineHeight: "18px", color: "#a0a5ad"}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b767f" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6 6 18"></path>
                    </svg>
                    <span style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "800", fontSize: "17px", color: "#c3c8cd"}}>{t?.n}</span>{"・"}{t?.who}
                  </span>{"\n                "}
                  <span style={{display: "block", width: "100%", height: "30px", padding: "0 8px", overflow: "hidden", fontSize: "11px", lineHeight: "15px", color: "#c3c8cd", textAlign: "center", overflowWrap: "anywhere"}}>{t?.card}</span>{"\n              "}
                </>) : null}{"\n              "}
                {t?.notTaken ? (<>{"\n                "}
                  <span style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "800", fontSize: "32px", lineHeight: "34px"}}>{t?.n}</span>{"\n                "}
                  <span style={{fontSize: "12px", lineHeight: "16px", color: `${asset(t?.subColor) ?? ''}`}}>{t?.sub}</span>{"\n              "}
                </>) : null}{"\n            "}
              </button>{"\n          "}
            </React.Fragment>))}{"\n        "}
          </div>{"\n      "}
        </div>{"\n      "}
        <ul style={{listStyle: "none", margin: "0", padding: "0", display: "flex", flexWrap: "wrap", gap: "8px 20px", fontSize: "13px", lineHeight: "18px", color: "#c3c8cd"}}>{"\n        "}
          <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
            <span aria-hidden="true" style={{width: "16px", height: "16px", borderRadius: "4px", border: "1px solid #282d36", background: "#21252d"}}></span>{"可選"}
          </li>{"\n        "}
          <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
            <span aria-hidden="true" style={{display: "flex", alignItems: "center", justifyContent: "center", width: "16px", height: "16px", borderRadius: "4px", border: "1px solid #14181d", background: "#05070a"}}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#a0a5ad" strokeWidth="3" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18"></path>
              </svg>
            </span>{"已被購買"}
          </li>{"\n        "}
          <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
            <span aria-hidden="true" style={{width: "16px", height: "16px", borderRadius: "4px", border: "1px solid #f4022b", background: "#ae031d"}}></span>{"我的號碼"}
          </li>{"\n      "}
        </ul>{"\n      "}
        <div style={{display: "flex", flexDirection: "column", gap: "12px", padding: "14px 16px", borderRadius: "10px", border: `1px solid ${asset(v.barBorder) ?? ''}`, background: "#181015"}}>{"\n        "}
          <span style={{minWidth: "0", display: "flex", flexDirection: "column", gap: "2px"}}>
            <strong style={{fontSize: "17px", lineHeight: "24px"}}>{v.pickLine}</strong>
            <span style={{fontSize: "13px", lineHeight: "18px", color: "#a0a5ad"}}>{"每個盲盒 "}{v.unitText}{" 代幣（1 個號碼）"}</span>
          </span>{"\n        "}
          <button type="button" onClick={v.next} disabled={v.nextDisabled} style={{display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", minHeight: "52px", padding: "0 26px", borderRadius: "4px", border: "0", background: `${asset(v.nextBg) ?? ''}`, color: `${asset(v.nextColor) ?? ''}`, boxShadow: `${asset(v.nextGlow) ?? ''}`, fontSize: "18px", fontWeight: "900", cursor: "pointer"}}>{"下一步：確認購買"}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6"></path>
            </svg>
          </button>{"\n      "}
        </div>{"\n    "}
      </div>{"\n    "}
    </>) : null}{"\n\n    "}
    {v.isConfirmStep ? (<>{"\n    "}
      <div style={{display: "flex", flexDirection: "column", gap: "16px"}}>{"\n      "}
        <div style={{display: "flex", flexWrap: "wrap", gap: "24px", padding: "24px", borderRadius: "10px", border: "1px solid #282d36", background: "#05070a"}}>{"\n        "}
          <div style={{flex: "0 1 180px", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", borderRadius: "6px", background: "radial-gradient(60% 60% at 50% 50%, #2a2000 0%, #05070a 80%)"}}>{"\n          "}
            <span style={{display: "flex", flexDirection: "column", gap: "6px", width: "140px", padding: "7px", borderRadius: "8px", border: "1px solid #3a404b", background: "linear-gradient(180deg, #2a2f38 0%, #13161b 100%)", boxShadow: "0 0 0 2px #fdc800, 0 0 32px rgba(253, 200, 0, 0.45)"}}>
              <span style={{display: "flex", alignItems: "center", justifyContent: "space-between", height: "22px", padding: "0 8px", borderRadius: "3px", background: "#05070a", border: "1px solid #3a2a00", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "12px", letterSpacing: "0.06em", color: "#ffe390"}}>
                <span>{"PSA"}</span>
                <span style={{fontSize: "15px", color: "#fdc800"}}>{"10"}</span>
              </span>
              <span style={{position: "relative", display: "block", aspectRatio: "63 / 88", borderRadius: "4px", overflow: "hidden", background: "#0b0e12"}}>
                <img src={asset(v.cardImg)} alt="" style={{position: "absolute", top: "0", left: "0", width: "100%", height: "100%", objectFit: "cover"}} />
              </span>
            </span>{"\n        "}
          </div>{"\n        "}
          <dl style={{flex: "1 1 340px", margin: "0", display: "grid", gridTemplateColumns: "auto 1fr", gap: "12px 20px", alignContent: "start", fontSize: "15px", lineHeight: "22px"}}>{"\n          "}
            <dt style={{color: "#a0a5ad"}}>{"場次"}</dt>
            <dd style={{margin: "0", fontWeight: "700"}}>{v.sessionLabel}{"・29/10（四）"}{v.sessionTime}{" 開抽"}</dd>{"\n          "}
            <dt style={{color: "#a0a5ad"}}>{"盲盒機率"}</dt>
            <dd style={{margin: "0"}}>{v.sessionPct}{"（"}{v.sessionHeaven}{" 個天堂・"}{v.sessionHell}{" 個地獄）"}</dd>{"\n          "}
            <dt style={{color: "#a0a5ad"}}>{"天堂卡牌"}</dt>
            <dd style={{margin: "0", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", fontWeight: "700"}}>{v.cardName}</dd>{"\n          "}
            <dt style={{color: "#a0a5ad"}}>{"地獄卡牌"}</dt>
            <dd style={{margin: "0", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", fontWeight: "700"}}>
              <img src="/revamp/images/hell-card-mystery-psa10.webp" alt="" style={{display: "block", height: "44px", aspectRatio: "316 / 530", objectFit: "cover", borderRadius: "3px"}} />{v.hellName}
            </dd>{"\n          "}
            <dt style={{color: "#a0a5ad"}}>{"號碼"}</dt>{"\n          "}
            <dd style={{margin: "0", display: "flex", flexWrap: "wrap", gap: "6px"}}>{"\n            "}
              {(Array.isArray(v.pickChips) ? v.pickChips : []).map((p, $index) => (<React.Fragment key={$index}>{"\n              "}
                <span style={{display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "44px", height: "32px", padding: "0 10px", borderRadius: "4px", border: "1px solid #f4022b", background: "#ae031d", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontStyle: "italic", fontWeight: "800", fontSize: "18px"}}>{p?.label}</span>{"\n            "}
              </React.Fragment>))}{"\n          "}
            </dd>{"\n        "}
          </dl>{"\n        "}
          {v.notEnough ? (<>
            <span style={{flex: "1 1 100%", display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: "8px", color: "#ffd7c1"}}>
              <strong>{"代幣不足，尚欠 "}{v.shortText}{" 代幣"}</strong>
              <a href="/beta/topup" style={{color: "#ffffff", textDecoration: "underline"}}>{"前往充值"}</a>
            </span>
          </>) : null}{"\n      "}
        </div>{"\n      "}
        <button type="button" onClick={v.confirm} disabled={v.notEnough} style={{position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", minHeight: "60px", padding: "0 28px", borderRadius: "6px", border: "0", background: `${asset(v.confirmBg) ?? ''}`, color: `${asset(v.confirmColor) ?? ''}`, boxShadow: `${asset(v.confirmGlow) ?? ''}`, fontSize: "20px", fontWeight: "900", cursor: "pointer"}}>{"\n        "}
          {v.enough ? (<>
            <span aria-hidden="true" style={{position: "absolute", top: "0", bottom: "0", left: "0", width: "30%", background: "linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.55) 50%, rgba(255, 255, 255, 0) 100%)", animation: "ld-shimmer 2400ms ease-in-out infinite"}}></span>
          </>) : null}{"\n        "}
          <span style={{position: "relative"}}>{"確認購買"}</span>{"\n        "}
          <span style={{position: "relative", display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontSize: "24px"}}>
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="10.5" fill="#fdc800" stroke="#1a1300" strokeWidth="2"></circle>
              <path d="M13.4 5.2 7.9 13h3.9l-1.2 5.8 5.6-8h-4z" fill="#1a1300"></path>
            </svg>{v.totalText}
          </span>{"\n      "}
        </button>{"\n    "}
      </div>{"\n    "}
    </>) : null}{"\n\n    "}
    {v.isDone ? (<>{"\n    "}
      <div role="status" style={{display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", padding: "40px 24px", borderRadius: "10px", border: "1px solid #3a2a00", background: "radial-gradient(60% 80% at 50% 0%, rgba(253, 200, 0, 0.16) 0%, rgba(253, 200, 0, 0) 70%), #05070a", textAlign: "center"}}>{"\n      "}
        <span aria-hidden="true" style={{display: "flex", alignItems: "center", justifyContent: "center", width: "72px", height: "72px", borderRadius: "999px", background: "#fdc800", color: "#1a1300", boxShadow: "0 0 0 2px #fdc800, 0 0 32px rgba(253, 200, 0, 0.45)"}}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12.5 4.5 4.5L19 7.5"></path>
          </svg>
        </span>{"\n      "}
        <h2 id="done-title" style={{margin: "0", fontFamily: "'Barlow Condensed', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "40px", lineHeight: "44px"}}>{"購買成功！"}</h2>{"\n      "}
        <p style={{margin: "0", fontSize: "16px", lineHeight: "24px", color: "#c3c8cd"}}>{v.sessionLabel}{"・號碼 "}
          <strong style={{color: "#ffffff"}}>{v.picksText}</strong>{" 已鎖定，"}{v.sessionTime}{" 直播開抽，記得準時收看。"}
        </p>{"\n      "}
        <div style={{display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "12px", marginTop: "6px"}}>{"\n        "}
          <button type="button" onClick={v.againSame} style={{display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "52px", padding: "0 24px", borderRadius: "4px", border: "0", background: "#f4022b", color: "#ffffff", fontSize: "17px", fontWeight: "900", cursor: "pointer"}}>{"同一卡牌再買一個盲盒"}</button>{"\n        "}
          <button type="button" onClick={v.reset} style={{display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "52px", padding: "0 22px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "16px", fontWeight: "700", cursor: "pointer"}}>{"選購其他場次"}</button>{"\n      "}
        </div>{"\n      "}
        <a href="/beta/records" className="ld-link" style={{display: "inline-flex", alignItems: "center", gap: "6px", minHeight: "32px", fontSize: "14px", color: "#a0a5ad"}}>{"到「我的紀錄」查看已購買的號碼"}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 6 6 6-6 6"></path>
          </svg>
        </a>{"\n    "}
      </div>{"\n    "}
    </>) : null}{"\n  "}
  </section>{"\n\n  "}
  {v.showMini ? (<>{"\n  "}
    <aside className="ld-mini" aria-label="迷你直播播放器" style={{position: "fixed", left: "24px", bottom: "24px", zIndex: "50", width: "340px", maxWidth: "calc(100% - 32px)", borderRadius: "10px", overflow: "hidden", border: "1px solid #f4022b", background: "#05070a", boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5), 0 0 24px rgba(244, 2, 43, 0.35)"}}>{"\n    "}
      <div style={{position: "relative", aspectRatio: "16 / 9", background: "radial-gradient(70% 90% at 50% 45%, #2a0710 0%, #05070a 72%)"}}>{"\n      "}
        <img src="/revamp/images/logo.png" alt="" style={{position: "absolute", left: "50%", top: "50%", width: "40%", transform: "translate(-50%, -50%)", opacity: "0.16"}} />{"\n      "}
        <button type="button" aria-label="播放直播" style={{position: "absolute", left: "50%", top: "50%", width: "48px", height: "48px", margin: "-24px 0 0 -24px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", border: "2px solid rgba(255, 255, 255, 0.85)", background: "rgba(5, 7, 10, 0.55)", color: "#ffffff", cursor: "pointer"}}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5.5v13l10.5-6.5z" fill="currentColor"></path>
          </svg>
        </button>{"\n      "}
        <button type="button" onClick={v.closeMini} aria-label="關閉迷你播放器" style={{position: "absolute", top: "6px", right: "6px", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", border: "1px solid #282d36", background: "rgba(5, 7, 10, 0.7)", color: "#ffffff", cursor: "pointer"}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18"></path>
          </svg>
        </button>{"\n    "}
      </div>{"\n    "}
      <div style={{display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px"}}>{"\n      "}
        <span style={{flex: "1 1 auto", fontSize: "14px", fontWeight: "700"}}>{"第 5 場・直播中"}</span>{"\n      "}
        <button type="button" onClick={v.backToPlayer} style={{display: "inline-flex", alignItems: "center", gap: "6px", height: "36px", padding: "0 12px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "13px", fontWeight: "700", cursor: "pointer"}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"></path>
          </svg>{"返回大畫面"}
        </button>{"\n    "}
      </div>{"\n  "}
    </aside>{"\n  "}
  </>) : null}{"\n\n  "}
  <div className="ld-fab" style={{position: "fixed", right: "24px", bottom: "24px", zIndex: "55", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "10px"}}>{"\n    "}
    <div className={`ld-fab-more ${v.dialCls ?? ''}`} style={{display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "10px"}}>{"\n      "}
      <button type="button" onClick={v.openNums} style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "48px", padding: "0 16px", borderRadius: "6px", fontSize: "15px", fontWeight: "700", cursor: "pointer", boxShadow: "0 8px 24px rgba(0, 0, 0, 0.55)", border: "1px solid #282d36", background: "linear-gradient(180deg, #21252d 0%, #13161b 100%)", color: "#ffffff"}}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f4022b" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M9 4 7 20M17 4l-2 16M4 9h16M3.5 15h16"></path>
        </svg>{"天堂地獄號碼"}
      </button>{"\n      "}
      <button type="button" onClick={v.openRec} aria-haspopup="dialog" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "48px", padding: "0 16px", borderRadius: "6px", fontSize: "15px", fontWeight: "700", cursor: "pointer", boxShadow: "0 8px 24px rgba(0, 0, 0, 0.55)", border: "1px solid #282d36", background: "linear-gradient(180deg, #21252d 0%, #13161b 100%)", color: "#ffffff"}}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f4022b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 6h10M10 12h10M10 18h10"></path>
          <path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17"></path>
        </svg>{"我的紀錄"}
      </button>{"\n    "}
    </div>{"\n    "}
    <div style={{display: "flex", alignItems: "center", gap: "10px"}}>{"\n      "}
      <button type="button" className="ld-fab-toggle" onClick={v.toggleDial} aria-label="更多快捷功能" aria-expanded={v.dialOpen} style={{display: "none", alignItems: "center", justifyContent: "center", width: "48px", height: "48px", borderRadius: "6px", border: "1px solid #282d36", background: "linear-gradient(180deg, #21252d 0%, #13161b 100%)", color: "#ffffff", cursor: "pointer", boxShadow: "0 8px 24px rgba(0, 0, 0, 0.55)"}}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" style={{transform: `${asset(v.dialRot) ?? ''}`, transition: "transform 150ms"}}>
          <path d="M12 5v14M5 12h14"></path>
        </svg>
      </button>{"\n      "}
      <button type="button" onClick={v.openChat} style={{position: "relative", display: "inline-flex", alignItems: "center", gap: "8px", height: "48px", padding: "0 16px", borderRadius: "6px", fontSize: "15px", fontWeight: "700", cursor: "pointer", boxShadow: "0 8px 24px rgba(0, 0, 0, 0.55)", border: "1px solid #f4022b", background: "linear-gradient(180deg, #d50125 0%, #ae031d 100%)", color: "#ffffff", boxShadow: "0 0 0 1px rgba(244, 2, 43, 0.35), 0 8px 24px rgba(244, 2, 43, 0.4)"}}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12a8 7 0 1 1 3.4 5.7L4 19l1-3.6A6.6 6.6 0 0 1 4 12z"></path>
        </svg>{"大廳聊天\n        "}
        {v.hasUnread ? (<>
          <span aria-label={v.unreadAria} style={{position: "absolute", top: "-6px", right: "-4px", minWidth: "22px", height: "22px", padding: "0 6px", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", border: "2px solid #0b0e12", background: "#ffffff", color: "#d50125", fontSize: "12px", fontWeight: "900"}}>{v.unread}</span>
        </>) : null}{"\n      "}
      </button>{"\n    "}
    </div>{"\n  "}
  </div>{"\n\n  "}
  {v.chatOpen ? (<>{"\n  "}
    <button type="button" className="ld-chat-bd" onClick={v.closeChat} aria-label="關閉大廳聊天" style={{position: "fixed", top: "0", right: "0", bottom: "0", left: "0", zIndex: "89", border: "0", background: "rgba(0, 0, 0, 0.6)"}}></button>{"\n  "}
    <aside className="ld-chat" role="dialog" aria-labelledby="chat-title" style={{position: "fixed", top: "16px", right: "16px", bottom: "16px", zIndex: "90", width: "380px", maxWidth: "calc(100% - 32px)", display: "flex", flexDirection: "column", gap: "14px", padding: "20px", borderRadius: "10px", border: "1px solid #282d36", background: "#05070a", boxShadow: "-12px 0 40px rgba(0, 0, 0, 0.6)"}}>{"\n    "}
      <span className="ld-grab" aria-hidden="true" style={{display: "none", alignSelf: "center", width: "40px", height: "4px", margin: "-8px 0 -4px", borderRadius: "999px", background: "#3a414b"}}></span>{"\n    "}
      <div style={{display: "flex", alignItems: "flex-start", gap: "8px"}}>{"\n      "}
        <div style={{flex: "1 1 auto", display: "flex", flexDirection: "column"}}>{"\n        "}
          <span style={{fontSize: "12px", lineHeight: "16px", letterSpacing: "0.1em", color: "#a0a5ad"}}>{"LIVE CHAT"}</span>{"\n        "}
          <h2 id="chat-title" style={{margin: "0", fontSize: "20px", lineHeight: "28px", fontWeight: "700"}}>{"大廳聊天"}</h2>{"\n      "}
        </div>{"\n      "}
        <span style={{display: "inline-flex", alignItems: "center", gap: "6px", height: "28px", padding: "0 10px", borderRadius: "999px", background: "#13161b", fontSize: "13px", color: "#c3c8cd"}}>
          <span aria-hidden="true" style={{width: "8px", height: "8px", borderRadius: "999px", background: "#12b76a"}}></span>{"128 人在線"}
        </span>{"\n      "}
        <button type="button" onClick={v.closeChat} aria-label="關閉" style={{flex: "0 0 auto", width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", cursor: "pointer"}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18"></path>
          </svg>
        </button>{"\n    "}
      </div>{"\n    "}
      <ul style={{listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column", gap: "14px", flex: "1 1 auto", minHeight: "0", overflowY: "auto"}}>{"\n      "}
        {(Array.isArray(v.msgs) ? v.msgs : []).map((m, $index) => (<React.Fragment key={$index}>{"\n        "}
          <li style={{display: "flex", gap: "10px", alignItems: "flex-start"}}>
            <span aria-hidden="true" style={{flex: "0 0 auto", width: "30px", height: "30px", borderRadius: "999px", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${asset(m?.avBorder) ?? ''}`, background: `${asset(m?.av) ?? ''}`, color: `${asset(m?.avColor) ?? ''}`, fontSize: "13px", fontWeight: "700"}}>{m?.initial}</span>
            <span style={{display: "flex", flexDirection: "column", minWidth: "0"}}>
              <span style={{fontSize: "14px", lineHeight: "20px"}}>
                <strong>{m?.name}</strong>{" "}
                <span style={{fontSize: "12px", color: "#6b767f"}}>{m?.time}</span>
              </span>
              <span style={{fontSize: "14px", lineHeight: "20px", color: "#c3c8cd", overflowWrap: "anywhere"}}>{m?.text}</span>
            </span>
          </li>{"\n      "}
        </React.Fragment>))}{"\n    "}
      </ul>{"\n    "}
      <div style={{display: "flex", flexWrap: "wrap", gap: "8px"}}>{"\n      "}
        {(Array.isArray(v.quick) ? v.quick : []).map((q, $index) => (<React.Fragment key={$index}>{"\n        "}
          <button type="button" onClick={q?.send} style={{height: "34px", padding: "0 14px", borderRadius: "999px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "14px", cursor: "pointer"}}>{q?.text}</button>{"\n      "}
        </React.Fragment>))}{"\n    "}
      </div>{"\n    "}
      <div style={{display: "flex", gap: "8px"}}>{"\n      "}
        <input type="text" value={v.chat} onChange={v.onChat} onKeyDown={v.onChatKey} aria-label="輸入大廳訊息" placeholder="輸入大廳訊息…" style={{flex: "1 1 auto", minWidth: "0", height: "44px", padding: "0 12px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "16px", outline: "none"}} />{"\n      "}
        <button type="button" onClick={v.send} style={{flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "6px", height: "44px", padding: "0 16px", borderRadius: "4px", border: "0", background: "#f4022b", color: "#ffffff", fontSize: "16px", fontWeight: "700", cursor: "pointer"}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 3 10 14"></path>
            <path d="M21 3 14.5 21l-4.5-7-7-4.5z"></path>
          </svg>{"發送"}
        </button>{"\n    "}
      </div>{"\n  "}
    </aside>{"\n  "}
  </>) : null}{"\n\n  "}
  {v.numsOpen ? (<>{"\n  "}
    <button type="button" onClick={v.closeNums} aria-label="關閉天堂地獄號碼" style={{position: "fixed", top: "0", right: "0", bottom: "0", left: "0", zIndex: "89", border: "0", background: "rgba(0, 0, 0, 0.6)"}}></button>{"\n  "}
    <section className="ld-nums" role="dialog" aria-labelledby="nums-title" style={{position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", zIndex: "90", width: "460px", maxWidth: "calc(100% - 24px)", display: "flex", flexDirection: "column", gap: "16px", padding: "20px", borderRadius: "10px", border: "1px solid #282d36", background: "#05070a", boxShadow: "0 16px 48px rgba(0, 0, 0, 0.6)"}}>{"\n    "}
      <div style={{display: "flex", alignItems: "flex-start", gap: "8px"}}>{"\n      "}
        <div style={{flex: "1 1 auto", display: "flex", flexDirection: "column"}}>{"\n        "}
          <h2 id="nums-title" style={{margin: "0", fontSize: "20px", lineHeight: "28px", fontWeight: "700"}}>{"天堂地獄號碼"}</h2>{"\n        "}
          <span style={{fontSize: "14px", lineHeight: "20px", color: "#a0a5ad"}}>{v.sessionLabel}{"・即時更新・已售 "}{v.soldCount}{" / 20"}</span>{"\n      "}
        </div>{"\n      "}
        <button type="button" onClick={v.closeNums} aria-label="關閉" style={{flex: "0 0 auto", width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", cursor: "pointer"}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18"></path>
          </svg>
        </button>{"\n    "}
      </div>{"\n    "}
      <div style={{display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "8px"}}>{"\n      "}
        {(Array.isArray(v.usage) ? v.usage : []).map((u, $index) => (<React.Fragment key={$index}>{"\n        "}
          <div style={{display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "56px", borderRadius: "6px", border: `1px solid ${asset(u?.border) ?? ''}`, background: `${asset(u?.bg) ?? ''}`, color: `${asset(u?.color) ?? ''}`}}>
            <span style={{fontSize: "18px", lineHeight: "22px", fontWeight: "900"}}>{u?.n}</span>
            <span style={{fontSize: "11px", lineHeight: "14px"}}>{u?.sub}</span>
          </div>{"\n      "}
        </React.Fragment>))}{"\n    "}
      </div>{"\n    "}
      <div style={{display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: "13px", color: "#a0a5ad"}}>{"\n      "}
        <span style={{display: "inline-flex", alignItems: "center", gap: "6px"}}>
          <span aria-hidden="true" style={{width: "12px", height: "12px", borderRadius: "3px", background: "#21252d", border: "1px solid #3a414b"}}></span>{"可選"}
        </span>{"\n      "}
        <span style={{display: "inline-flex", alignItems: "center", gap: "6px"}}>
          <span aria-hidden="true" style={{width: "12px", height: "12px", borderRadius: "3px", background: "#05070a", border: "1px solid #14181d"}}></span>{"已被購買"}
        </span>{"\n      "}
        <span style={{display: "inline-flex", alignItems: "center", gap: "6px"}}>
          <span aria-hidden="true" style={{width: "12px", height: "12px", borderRadius: "3px", background: "#d50125"}}></span>{"我的號碼"}
        </span>{"\n    "}
      </div>{"\n    "}
      <button type="button" onClick={v.numsGo} style={{height: "48px", borderRadius: "4px", border: "0", background: "#f4022b", color: "#ffffff", fontSize: "16px", fontWeight: "700", cursor: "pointer"}}>{v.numsGoText}</button>{"\n  "}
    </section>{"\n  "}
  </>) : null}{"\n\n  "}
  {v.sessOpen ? (<>{"\n  "}
    <button type="button" onClick={v.closeSess} aria-label="關閉場次列表" style={{position: "fixed", top: "0", right: "0", bottom: "0", left: "0", zIndex: "89", border: "0", background: "rgba(0, 0, 0, 0.6)"}}></button>{"\n  "}
    <section className="ld-nums" role="dialog" aria-labelledby="sesslist-title" style={{position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", zIndex: "90", width: "560px", maxWidth: "calc(100% - 24px)", maxHeight: "86vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: "14px", padding: "20px", borderRadius: "10px", border: "1px solid #282d36", background: "#05070a", boxShadow: "0 16px 48px rgba(0, 0, 0, 0.6)"}}>{"\n    "}
      <div style={{display: "flex", alignItems: "flex-start", gap: "8px"}}>{"\n      "}
        <div style={{flex: "1 1 auto", display: "flex", flexDirection: "column"}}>{"\n        "}
          <h2 id="sesslist-title" style={{margin: "0", fontSize: "20px", lineHeight: "28px", fontWeight: "700"}}>{"選擇場次"}</h2>{"\n        "}
          <span style={{fontSize: "13px", lineHeight: "18px", color: "#a0a5ad"}}>{"今晚 29/10（四）共 20 場・每 5 分鐘一場"}</span>{"\n      "}
        </div>{"\n      "}
        <button type="button" onClick={v.closeSess} aria-label="關閉" style={{flex: "0 0 auto", width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", cursor: "pointer"}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18"></path>
          </svg>
        </button>{"\n    "}
      </div>{"\n    "}
      <div style={{display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px"}}>{"\n      "}
        {(Array.isArray(v.allSess) ? v.allSess : []).map((s, $index) => (<React.Fragment key={$index}>{"\n        "}
          <button type="button" onClick={s?.pick} aria-pressed={s?.pressed} disabled={s?.ended} style={{display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px", padding: "8px 10px", borderRadius: "6px", border: `1px solid ${asset(s?.border) ?? ''}`, background: `${asset(s?.bg) ?? ''}`, color: `${asset(s?.color) ?? ''}`, textAlign: "left", cursor: `${asset(s?.cursor) ?? ''}`}}>{"\n          "}
            <span style={{fontSize: "14px", lineHeight: "18px", fontWeight: "700", whiteSpace: "nowrap"}}>{s?.label}</span>{"\n          "}
            <span style={{fontSize: "12px", lineHeight: "16px", color: `${asset(s?.subColor) ?? ''}`, whiteSpace: "nowrap"}}>{s?.time}{"・"}
              <strong style={{color: `${asset(s?.ratioColor) ?? ''}`}}>{s?.ratio}</strong>
            </span>{"\n          "}
            <span style={{fontSize: "11px", lineHeight: "14px", fontWeight: "700", color: `${asset(s?.tagColor) ?? ''}`}}>{s?.tag}</span>{"\n        "}
          </button>{"\n      "}
        </React.Fragment>))}{"\n    "}
      </div>{"\n    "}
      <a href="/beta/results" className="ld-link" style={{alignSelf: "center", display: "inline-flex", alignItems: "center", gap: "6px", minHeight: "36px", fontSize: "14px", color: "#a0a5ad"}}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"></path>
          <path d="M3.5 4.5V8H7"></path>
          <path d="M12 7.5V12l3 2"></path>
        </svg>{"查看已結束場次賽果"}
      </a>{"\n  "}
    </section>{"\n  "}
  </>) : null}{"\n\n  "}
  {v.recOpen ? (<>{"\n  "}
    <button type="button" onClick={v.closeRec} aria-label="關閉我的紀錄" style={{position: "fixed", top: "0", right: "0", bottom: "0", left: "0", zIndex: "89", border: "0", background: "rgba(0, 0, 0, 0.6)"}}></button>{"\n  "}
    <aside className="ld-rec" role="dialog" aria-labelledby="rec-title" style={{position: "fixed", top: "0", bottom: "0", left: "0", zIndex: "90", width: "440px", maxWidth: "92vw", display: "flex", flexDirection: "column", borderRight: "1px solid #282d36", background: "#0b0e12", boxShadow: "12px 0 40px rgba(0, 0, 0, 0.6)", animation: "ld-recin 220ms ease-out both"}}>{"\n    "}
      <div style={{display: "flex", alignItems: "center", gap: "12px", padding: "20px 20px 16px", borderBottom: "1px solid #1d2128"}}>{"\n      "}
        <h2 id="rec-title" style={{flex: "1 1 auto", margin: "0", fontSize: "26px", lineHeight: "32px", fontWeight: "900"}}>{"我的紀錄"}</h2>{"\n      "}
        <button type="button" onClick={v.closeRec} aria-label="關閉" style={{flex: "0 0 auto", width: "44px", height: "44px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "6px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", cursor: "pointer"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 6-6 6 6 6"></path>
          </svg>
        </button>{"\n    "}
      </div>{"\n    "}
      <div style={{padding: "12px 20px", borderBottom: "1px solid #1d2128", fontSize: "13px", fontWeight: "700", color: "#a0a5ad"}}>{"最近 "}{v.recCount}{" 筆"}</div>{"\n    "}
      <ul style={{listStyle: "none", margin: "0", padding: "0", flex: "1 1 auto", minHeight: "0", overflowY: "auto"}}>{"\n      "}
        {(Array.isArray(v.recList) ? v.recList : []).map((r, $index) => (<React.Fragment key={$index}>{"\n        "}
          <li style={{display: "flex", flexDirection: "column", gap: "8px", padding: "14px 20px", borderBottom: "1px solid #1d2128"}}>{"\n          "}
            <div style={{display: "flex", gap: "14px", alignItems: "flex-start"}}>{"\n            "}
              <img src={asset(r?.img)} alt="" style={{flex: "0 0 auto", display: "block", width: "52px", aspectRatio: "63 / 88", objectFit: "cover", borderRadius: "4px", background: "#13161b"}} />{"\n            "}
              <span style={{minWidth: "0", display: "flex", flexDirection: "column", gap: "2px"}}>{"\n              "}
                <strong style={{fontSize: "15px", lineHeight: "22px"}}>{r?.title}</strong>{"\n              "}
                <span style={{fontSize: "13px", lineHeight: "18px", color: "#c3c8cd"}}>{r?.sub}</span>{"\n              "}
                <span style={{fontSize: "12px", lineHeight: "18px", color: "#a0a5ad", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{"所屬盲盒："}{r?.box}</span>{"\n            "}
              </span>{"\n          "}
            </div>{"\n          "}
            <div style={{display: "flex", alignItems: "center", gap: "8px"}}>{"\n            "}
              <span style={{display: "inline-flex", alignItems: "center", gap: "6px"}}>
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="10.5" fill="#fdc800" stroke="#f88f00" strokeWidth="2"></circle>
                  <path d="M13.4 5.2 7.9 13h3.9l-1.2 5.8 5.6-8h-4z" fill="#f88f00"></path>
                </svg>
                <strong style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "22px", lineHeight: "24px"}}>{r?.price}</strong>
              </span>{"\n            "}
              <span style={{marginLeft: "auto", display: "flex", gap: "6px"}}>{"\n              "}
                {r?.thisShow ? (<>
                  <span style={{height: "24px", padding: "0 8px", borderRadius: "3px", border: "1px solid #f4022b", color: "#ff6b82", fontSize: "12px", lineHeight: "22px", fontWeight: "700"}}>{"本直播"}</span>
                </>) : null}{"\n              "}
                <span style={{height: "24px", padding: "0 8px", borderRadius: "3px", background: `${asset(r?.resBg) ?? ''}`, color: "#ffffff", fontSize: "12px", lineHeight: "24px", fontWeight: "700"}}>{r?.res}</span>{"\n            "}
              </span>{"\n          "}
            </div>{"\n        "}
          </li>{"\n      "}
        </React.Fragment>))}{"\n    "}
      </ul>{"\n    "}
      <a href="/beta/records" className="ld-link" style={{display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", minHeight: "52px", borderTop: "1px solid #1d2128", fontSize: "14px", fontWeight: "700", color: "#c3c8cd"}}>{"查看全部紀錄"}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9 6 6 6-6 6"></path>
        </svg>
      </a>{"\n  "}
    </aside>{"\n  "}
  </>) : null}
</main>
</>);
};

export default LiveDrawPage;
