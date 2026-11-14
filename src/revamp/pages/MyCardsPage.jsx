/* eslint-disable */
// Generated from the LiveDraw revamp design (MyCards.html); logic kept as designed.
import React, { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, runTransaction, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { db } from "../../firebase";
import {
  FIRESTORE_SAFE_BATCH_SIZE, SHIPPING_DEADLINE_WARN_MS, SHIPPING_REGIONS, formatRoundLabel, formatShippingDeadline,
  formatShippingTimeLeft, getBetaCollectionRecordStatus, getCardConversionRefund, getDeliveryStage, getRecordAcquiredAt,
  getSafeErrorMessage, getShippingDeadlineMs, isPurchaseRecord, isShippingCancelled, toMillis,
} from "../../App.jsx";
import { DCLogic, route, asset } from "../runtime.jsx";
import { MembersOnly, Pager, fmt, fmtTime, paginate } from "../ui.jsx";

const CSS = "\nbody{margin:0;background:#0b0e12}\n*{box-sizing:border-box}\na{color:#ffffff;text-decoration:none}a:hover{color:#ffe390}\nbutton,input,textarea{font-family:inherit}\nbutton:disabled{cursor:not-allowed}\n:focus-visible{outline:2px solid #f4022b;outline-offset:2px}\ninput::placeholder,textarea::placeholder{color:#6b767f}\ninput[type=checkbox]{accent-color:#f4022b}\n.ld-nav{transition:background-color 150ms,color 150ms}\n.ld-nav:hover{background-color:#13161b !important;color:#ffffff !important}\n.ld-lift{transition:border-color 150ms,box-shadow 150ms}\n.ld-lift:hover{border-color:#6b767f !important}\n.ld-link:hover{color:#ffffff !important}\n@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none !important;transition:none !important}}\n\n.ld-menubtn,.ld-tabbar,.ld-drawer-close,.ld-backdrop{display:none}\n@media (max-width:760px){\n.ld-root{padding-bottom:68px}\n.ld-header{padding:8px 12px !important;gap:8px !important;flex-wrap:nowrap !important;position:sticky;top:0;z-index:40}\n.ld-search,.ld-hide-m,.ld-uname{display:none !important}\n.ld-logo{width:auto !important;flex:1 1 auto !important;min-width:0}\n.ld-logo img{width:104px !important;height:auto !important}\n.ld-tools{gap:6px !important;flex-wrap:nowrap !important}\n.ld-tools > a,.ld-tools > button,.ld-tools > span > button{height:38px !important}\n.ld-menubtn{display:flex !important}\n.ld-main h1{font-size:34px !important;line-height:40px !important}\n.ld-tools > a:first-child > span:last-child,.ld-tools > span > button > span{display:none !important}\n.ld-logo{min-width:96px !important}\n.ld-bleed{margin:-12px -12px 0 !important}\n.ld-tools > span > button{padding:0 8px !important;gap:4px !important}\n.ld-tools > span > button > svg:last-child{display:none}\n.ld-tools > button{width:38px !important}\n.ld-tools > a:last-child{padding:0 3px !important;border:0 !important}\n.ld-tools > a:first-child{padding:0 4px 0 8px !important;gap:5px !important;font-size:17px !important}\n.ld-side{display:none !important}\n.ld-side.ld-side-open{display:flex !important;position:fixed;top:0;left:0;bottom:0;width:min(300px,84vw);z-index:80;overflow-y:auto;box-shadow:12px 0 40px rgba(0,0,0,.6)}\n.ld-side.ld-side-open .ld-drawer-close{display:flex !important}\n.ld-backdrop{display:block !important;position:fixed;top:0;right:0;bottom:0;left:0;z-index:79;border:0;background:rgba(0,0,0,.6)}\n.ld-main{padding:12px !important;gap:12px !important}\n.ld-footer{padding:24px 16px 20px !important;gap:16px !important}\n.ld-tabbar{display:flex !important;position:fixed;left:0;right:0;bottom:0;z-index:60;height:64px;background:#080b0e;border-top:1px solid #282d36}\n}\n";

const PAGE_SIZE = 12;
const DIAL = { "hong-kong": "+852", macau: "+853", "mainland-china": "+86", taiwan: "+886" };
const ADDRESS_KEY = "ld-beta-ship-address";

function readSavedAddress() {
  try { return JSON.parse(window.localStorage.getItem(ADDRESS_KEY) || "{}") || {}; } catch { return {}; }
}
function saveAddress(value) {
  try {
    if (value) window.localStorage.setItem(ADDRESS_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(ADDRESS_KEY);
  } catch { /* storage unavailable */ }
}

// Same transaction and checks as 我的卡牌 on the current site (firestore.rules enforce them too).
async function convertCardToTokens(uid, record) {
  const refund = getCardConversionRefund(record);
  if (!refund || record.convertedToTokens) throw new Error("這張卡牌不能轉回代幣。");
  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, "users", uid);
    const recordRef = doc(db, "drawRecords", record.id);
    const userSnap = await transaction.get(userRef);
    const recordSnap = await transaction.get(recordRef);
    if (!recordSnap.exists() || recordSnap.data().uid !== uid) throw new Error("找不到這張卡牌紀錄。");
    const latest = recordSnap.data();
    if (latest.convertedToTokens || (latest.collectionStatus || "pending") !== "pending"
      || (!isShippingCancelled(latest) && (latest.shippingRequested || latest.shippingRequestedAt || latest.shippedAt))) {
      throw new Error("只有未申請配送或已取消配送的待處理卡牌可以轉回代幣。");
    }
    if (getCardConversionRefund(latest) !== refund) throw new Error("卡牌代幣價值已更新，請重新整理後再試。");
    transaction.update(recordRef, {
      collectionStatus: "converted", convertedToTokens: true, convertedAt: serverTimestamp(),
      tokenRefund: refund, updatedAt: serverTimestamp(),
    });
    transaction.update(userRef, {
      tokens: Number(userSnap.data()?.tokens || 0) + refund,
      lastConversionRecordId: record.id, lastConversionAmount: refund, updatedAt: serverTimestamp(),
    });
  });
}

class MyCardsPage extends DCLogic {
  constructor(...args) {
    super(...args);
    const saved = readSavedAddress();
    const profile = this.props.profile || {};
    this.state = {
      tab: 'pending', sel: [], page: 1, notice: '', busy: false, shipOpen: false, shipIds: [], shipStep: 'form',
      region: saved.region || 'hong-kong', method: saved.method || 'sf-door',
      shipName: saved.name || profile.displayName || profile.username || '',
      shipPhone: saved.phone || profile.phoneNumber || '',
      shipAddr: saved.method === 'sf-pickup' ? '' : (saved.address || ''),
      shipStation: saved.method === 'sf-pickup' ? (saved.address || '') : '',
      shipNote: '', remember: Boolean(saved.address), agree: false, shipTried: false,
    };
  }

  async convertIds(ids) {
    const { records, profile } = this.props;
    const chosen = records.filter((r) => ids.includes(r.id) && getBetaCollectionRecordStatus(r) === 'pending');
    if (!chosen.length) return;
    const total = chosen.reduce((sum, r) => sum + getCardConversionRefund(r), 0);
    if (!window.confirm(chosen.length === 1
      ? `將「${chosen[0].cardName}」轉回 ${fmt(total)} 代幣？`
      : `將已選的 ${chosen.length} 張卡牌按管理員設定價值轉回 ${fmt(total)} 代幣？`)) return;
    this.setState({ busy: true, notice: '' });
    let done = 0;
    let gained = 0;
    for (const [index, record] of chosen.entries()) {
      if (chosen.length > 1) this.setState({ notice: `正在轉換 ${index + 1} / ${chosen.length} 張卡牌…` });
      try {
        // One card at a time, so wallet updates never clash (same as the current site).
        await convertCardToTokens(profile.uid, record);
        done += 1;
        gained += getCardConversionRefund(record);
      } catch (error) {
        alert(getSafeErrorMessage(error, '未能轉回代幣，請稍後再試。'));
        break;
      }
    }
    this.setState({
      busy: false,
      sel: this.state.sel.filter((id) => !ids.includes(id)),
      notice: done ? `已將 ${done} 張卡牌轉回 ${fmt(gained)} 代幣。` : '',
    });
  }

  openShip(ids) {
    const { records } = this.props;
    const now = Date.now();
    const usable = ids.filter((id) => {
      const record = records.find((r) => r.id === id);
      return record && now < getShippingDeadlineMs(record);
    });
    if (!usable.length) { alert('所選卡牌已過配送申請期限（取得卡牌後 14 日內），只可轉回代幣。'); return; }
    if (usable.length < ids.length) alert(`所選卡牌中有 ${ids.length - usable.length} 張已過配送申請期限，只可轉回代幣；其餘 ${usable.length} 張可以繼續申請配送。`);
    this.setState({ shipOpen: true, shipIds: usable, shipStep: 'form', shipTried: false, agree: false });
  }

  async submitShip(problem, address) {
    if (problem) { this.setState({ shipTried: true }); return; }
    const st = this.state;
    const ids = st.shipIds;
    const expired = ids.filter((id) => {
      const record = this.props.records.find((r) => r.id === id);
      return !record || Date.now() >= getShippingDeadlineMs(record);
    });
    if (expired.length) {
      this.setState({ shipIds: ids.filter((id) => !expired.includes(id)) });
      alert(`有 ${expired.length} 張卡牌剛過配送申請期限，已從申請中移除，只可轉回代幣。請再確認後提交。`);
      return;
    }
    const region = SHIPPING_REGIONS.find((r) => r.id === st.region) || SHIPPING_REGIONS[0];
    const method = region.sfAvailable ? st.method : 'address-delivery';
    this.setState({ busy: true });
    try {
      for (let start = 0; start < ids.length; start += FIRESTORE_SAFE_BATCH_SIZE) {
        const batch = writeBatch(db);
        ids.slice(start, start + FIRESTORE_SAFE_BATCH_SIZE).forEach((id) => {
          batch.update(doc(db, 'drawRecords', id), {
            collectionStatus: 'shipping',
            shippingRequested: true,
            shippingRecipient: st.shipName.trim(),
            shippingPhone: st.shipPhone.trim(),
            shippingRegion: region.id,
            shippingMethod: method,
            shippingAddress: address,
            shippingNote: st.shipNote.trim(),
            shippingRequestedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
      saveAddress(st.remember ? { name: st.shipName.trim(), phone: st.shipPhone.trim(), region: region.id, method, address } : null);
      this.setState({ busy: false, shipStep: 'done', sel: st.sel.filter((id) => !ids.includes(id)), notice: `已提交 ${ids.length} 張卡牌的配送申請，可於「配送中」查看。` });
    } catch (error) {
      this.setState({ busy: false });
      alert(getSafeErrorMessage(error, '未能提交配送申請，請稍後再試。'));
    }
  }

  _renderVals0() {
    const st = this.state;
    const { records, clockMs, loading } = this.props;
    const by = { pending: [], shipping: [], shipped: [], converted: [] };
    records.forEach((r) => { const status = getBetaCollectionRecordStatus(r); if (by[status]) by[status].push(r); });
    const pending = by.pending;
    const tabs = [
      { id: 'pending', label: '待處理' }, { id: 'shipping', label: '配送中' },
      { id: 'shipped', label: '已配送' }, { id: 'converted', label: '已轉代幣次數' }
    ].map((t) => {
      const on = st.tab === t.id;
      return { label: t.label, count: by[t.id].length, on, pick: () => this.setState({ tab: t.id, page: 1, notice: '' }), line: on ? '#f4022b' : 'transparent', color: on ? '#ffffff' : '#a0a5ad' };
    });
    const list = by[st.tab] || [];
    const shown = paginate(list, st.page, PAGE_SIZE);
    const sel = st.sel.filter((id) => pending.some((c) => c.id === id));
    const toggle = (id) => {
      const cur = this.state.sel.slice();
      const at = cur.indexOf(id);
      if (at === -1) cur.push(id); else cur.splice(at, 1);
      this.setState({ sel: cur });
    };
    const region = SHIPPING_REGIONS.find((r) => r.id === st.region) || SHIPPING_REGIONS[0];
    const METH = region.sfAvailable ? [
      { id: 'sf-door', label: '順豐上門', sub: '送到指定地址' },
      { id: 'sf-pickup', label: '順豐站／智能櫃自取', sub: '自行到站點取件' }
    ] : [{ id: 'address-delivery', label: '地址配送', sub: `寄往${region.label}收件地址` }];
    const meth = METH.find((m) => m.id === st.method) || METH[0];
    const isStation = meth.id === 'sf-pickup';
    const phoneOk = String(st.shipPhone || '').replace(/[^0-9]/g, '').length >= (region.id === 'hong-kong' ? 8 : 6);
    const addrVal = (isStation ? String(st.shipStation || '') : String(st.shipAddr || '')).trim();
    const shipProblem = !String(st.shipName || '').trim() ? '請填寫收件人姓名'
      : (!phoneOk ? '請填寫正確的聯絡電話'
      : (!addrVal ? (isStation ? '請填寫順豐站／智能櫃編號或地址' : '請填寫配送地址')
      : (addrVal.length > 500 ? '地址不可超過 500 字'
      : (!st.agree ? '請先確認運費到付' : ''))));
    const showErr = st.shipTried ? shipProblem : '';
    const RED = '#f4022b';
    const shipCardsSrc = records.filter((c) => st.shipIds.indexOf(c.id) !== -1);
    const cards = shown.items.map((c) => {
      const status = getBetaCollectionRecordStatus(c);
      const isPending = status === 'pending';
      const checked = sel.indexOf(c.id) !== -1;
      const deadline = getShippingDeadlineMs(c);
      const left = deadline - clockMs;
      const expired = left <= 0;
      const cancelled = isPending && getDeliveryStage(c) === 'cancelled';
      const img = c.cardImageUrl || '';
      const src = c.source === 'instant' ? '自助抽卡' : [c.drawTitle || '直播抽卡', isPurchaseRecord(c) && c.round ? formatRoundLabel(c.round) : ''].filter(Boolean).join('・');
      const tracking = c.trackingNumber ? (
        <a href={`https://htm.sf-express.com/hk/tc/dynamic_function/waybill/#search/bill-number/${encodeURIComponent(c.trackingNumber)}`} target="_blank" rel="noreferrer" style={{ fontSize: '13px', color: '#ffe390', fontWeight: 700 }}>順豐單號：{c.trackingNumber}</a>
      ) : null;
      return {
        name: c.cardName || '未命名卡牌', src, time: fmtTime(getRecordAcquiredAt(c)),
        heavenCard: c.targetCardName || (c.resultSide === 'heaven' ? c.cardName : '—'),
        img, isPack: false, isSlab: false, isRandom: !img, isLegend: false,
        convertText: fmt(status === 'converted' ? (c.tokenRefund ?? getCardConversionRefund(c)) : getCardConversionRefund(c)),
        selectable: isPending, isShipping: !isPending, checked,
        busy: st.busy,
        deadlineText: expired
          ? <>已過配送申請期限（{formatShippingDeadline(deadline)}），只可轉回代幣</>
          : <>配送申請尚餘 <strong style={{ color: '#ffffff' }}>{formatShippingTimeLeft(left)}</strong>（{formatShippingDeadline(deadline)} 前）</>,
        deadlineColor: expired ? '#ffd7c1' : (left <= SHIPPING_DEADLINE_WARN_MS ? '#ffe390' : '#c3c8cd'),
        cancelNote: cancelled ? `配送已取消${c.shippingCancelReason ? `：${c.shippingCancelReason}` : ''}，可重新申請配送或轉回代幣。` : '',
        shipDisabled: expired || st.busy, shipLabel: expired ? '配送期限已過' : '申請配送',
        shipBg: expired ? '#21252d' : '#f4022b',
        toggle: () => toggle(c.id),
        ship: () => this.openShip([c.id]), convert: () => this.convertIds([c.id]),
        statusLabel: { pending: cancelled ? '已取消配送' : '待處理', shipping: '配送中', shipped: '已配送', converted: '已轉代幣' }[status],
        shipText: { shipping: '已提交配送申請，安排寄出後會通知你。', shipped: '卡牌已送達。', converted: '已轉回代幣。' }[status] || '',
        tracking,
        tagBg: isPending ? '#ae031d' : '#21252d', tagBorder: isPending ? '#ae031d' : '#282d36',
        border: checked ? '#f4022b' : '#282d36',
        glow: checked ? '0 0 0 2px #f4022b, 0 0 24px rgba(244, 2, 43, 0.35)' : 'none',
        wellBg: 'radial-gradient(60% 70% at 50% 55%, #2a0710 0%, #05070a 80%)'
      };
    });
    const empty = loading ? ['載入中…', ''] : {
      pending: ['暫時沒有待處理的卡牌', '抽中的卡牌會在這裡出現，可申請配送或轉回代幣。'],
      shipping: ['暫時沒有配送中的卡牌', '申請配送後，卡牌會移到這裡。'],
      shipped: ['暫時沒有已配送的卡牌', '已寄出的卡牌會在這裡保留紀錄。'],
      converted: ['暫時沒有已轉代幣的卡牌', '轉回代幣的卡牌會保留在這裡，方便核對。']
    }[st.tab];
    const has = sel.length > 0 && !st.busy;
    return {
      pendingCount: pending.length,
      tabs, isPending: st.tab === 'pending',
      cards, hasCards: cards.length > 0, noCards: cards.length === 0,
      emptyTitle: empty[0], emptyBody: empty[1],
      pager: <Pager page={shown.page} totalPages={shown.totalPages} onChange={(p) => { this.setState({ page: p }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />,
      selCount: sel.length, noSel: !has,
      selectAll: () => this.setState({ sel: [...new Set([...sel, ...shown.items.map((c) => c.id)])] }),
      clearSel: () => this.setState({ sel: [] }),
      batchShip: () => this.openShip(sel), batchConvert: () => this.convertIds(sel),
      secColor: has ? '#ffffff' : '#a0a5ad',
      primBg: has ? '#f4022b' : '#21252d', primColor: has ? '#ffffff' : '#a0a5ad',
      primGlow: has ? '0 6px 20px rgba(244, 2, 43, 0.35)' : 'none',
      notice: st.notice, hasNotice: !!st.notice,
      shipOpen: !!st.shipOpen, shipForm: st.shipStep === 'form', shipDone: st.shipStep === 'done',
      shipTitle: st.shipStep === 'done' ? '已提交配送申請' : '申請配送',
      shipSub: st.shipStep === 'done' ? ('共 ' + st.shipIds.length + ' 張卡牌') : ('共 ' + st.shipIds.length + ' 張卡牌，請填寫收件資料並選擇配送方式'),
      shipCards: shipCardsSrc.map((c) => ({ name: c.cardName })),
      shipCount: st.shipIds.length,
      closeShip: () => this.setState({ shipOpen: false }),
      shipName: st.shipName, shipPhone: st.shipPhone, shipAddr: st.shipAddr, shipStation: st.shipStation, shipNote: st.shipNote,
      onShipName: (e) => this.setState({ shipName: e.target.value }),
      onShipPhone: (e) => this.setState({ shipPhone: e.target.value }),
      onShipAddr: (e) => this.setState({ shipAddr: e.target.value }),
      onShipStation: (e) => this.setState({ shipStation: e.target.value }),
      onShipNote: (e) => this.setState({ shipNote: e.target.value }),
      dialCode: DIAL[region.id] || '',
      regions: SHIPPING_REGIONS.map((r) => { const on = r.id === region.id; return { label: r.label, on, pick: () => this.setState({ region: r.id, method: r.sfAvailable ? 'sf-door' : 'address-delivery' }), border: on ? RED : '#282d36', bg: on ? '#4a0511' : '#13161b', color: on ? '#ffffff' : '#c3c8cd' }; }),
      shipMethods: METH.map((m) => { const on = m.id === meth.id; return { label: m.label, sub: m.sub, on, pick: () => this.setState({ method: m.id }), border: on ? RED : '#282d36', bg: on ? '#181015' : '#05070a', glow: on ? '0 0 0 1px ' + RED : 'none', dot: on ? RED : 'transparent', dotBorder: on ? RED : '#6b767f' }; }),
      isDoor: !isStation, isStation,
      addrPlaceholder: '請輸入' + region.label + '完整地址（地區、街道、大廈、樓層及室號）',
      remember: !!st.remember, toggleRemember: () => this.setState({ remember: !this.state.remember }),
      agree: !!st.agree, toggleAgree: () => this.setState({ agree: !this.state.agree }),
      nameBorder: st.shipTried && !String(st.shipName || '').trim() ? RED : '#282d36',
      phoneBorder: st.shipTried && !phoneOk ? RED : '#282d36',
      addrBorder: st.shipTried && !addrVal ? RED : '#282d36',
      agreeBorder: st.shipTried && !st.agree ? RED : '#3a2a00',
      shipError: !!showErr, shipErrorText: showErr,
      submitBg: shipProblem || st.busy ? '#8f0e25' : RED,
      submitBusy: st.busy,
      submitShip: () => { if (!this.state.busy) this.submitShip(shipProblem, addrVal); },
      doneWho: String(st.shipName || '') + '・' + (DIAL[region.id] ? DIAL[region.id] + ' ' : '') + String(st.shipPhone || ''),
      doneMethod: region.label + '・' + meth.label,
      doneAddr: addrVal
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

MyCardsPage.prototype.template = function template(v) {
  return (<>
<style>{CSS}</style>

<main className="ld-main" style={{flex: "999 1 560px", minWidth: "0", display: "flex", flexDirection: "column", gap: "20px", padding: "24px"}}>{"\n\n  "}
  <section aria-labelledby="cards-title" style={{display: "flex", alignItems: "flex-start", gap: "14px", padding: "28px 32px", borderRadius: "10px", border: "1px solid #14181d", background: "#05070a"}}>{"\n    "}
    <span aria-hidden="true" style={{flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", width: "48px", height: "48px", borderRadius: "10px", border: "1px solid #4a0511", background: "#181015", color: "#f4022b"}}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="8" y="3" width="12" height="16" rx="2"></rect>
        <path d="M5 6.5V19a2 2 0 0 0 2 2h9"></path>
      </svg>
    </span>{"\n    "}
    <div style={{display: "flex", flexDirection: "column", gap: "2px"}}>{"\n      "}
      <h1 id="cards-title" style={{margin: "0", fontFamily: "'Barlow Condensed', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif", fontStyle: "italic", fontWeight: "900", fontSize: "40px", lineHeight: "46px"}}>{"我的卡牌"}</h1>{"\n    "}
    </div>{"\n  "}
  </section>{"\n\n  "}
  <div aria-label="卡牌狀態" style={{display: "flex", flexWrap: "wrap", gap: "4px", borderBottom: "1px solid #14181d"}}>{"\n    "}
    {(Array.isArray(v.tabs) ? v.tabs : []).map((t, $index) => (<React.Fragment key={$index}>{"\n      "}
      <button type="button" aria-pressed={t?.on} onClick={t?.pick} style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "52px", padding: "0 18px", marginBottom: "-1px", border: "0", borderBottom: `3px solid ${asset(t?.line) ?? ''}`, background: "transparent", color: `${asset(t?.color) ?? ''}`, fontSize: "17px", fontWeight: "700", cursor: "pointer"}}>{t?.label}
        <span style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontSize: "19px"}}>{t?.count}</span>
      </button>{"\n    "}
    </React.Fragment>))}{"\n  "}
  </div>{"\n\n  "}
  {v.isPending ? (<>{"\n  "}
    <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", padding: "12px 14px", borderRadius: "6px", border: "1px solid #14181d", background: "#05070a"}}>{"\n    "}
      <span style={{flex: "1 1 140px", fontSize: "15px", fontWeight: "700"}}>{"已選 "}
        <span style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontSize: "20px", color: "#f4022b"}}>{v.selCount}</span>{" 張"}
      </span>{"\n    "}
      <button type="button" onClick={v.selectAll} style={{height: "44px", padding: "0 14px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "14px", fontWeight: "700", cursor: "pointer"}}>{"選取本頁"}</button>{"\n    "}
      <button type="button" onClick={v.clearSel} disabled={v.noSel} style={{height: "44px", padding: "0 14px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: `${asset(v.secColor) ?? ''}`, fontSize: "14px", fontWeight: "700"}}>{"清除選取"}</button>{"\n    "}
      <button type="button" onClick={v.batchConvert} disabled={v.noSel} style={{display: "inline-flex", alignItems: "center", gap: "6px", height: "44px", padding: "0 14px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: `${asset(v.secColor) ?? ''}`, fontSize: "14px", fontWeight: "700"}}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"></path>
          <path d="M4 4v4h4"></path>
          <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"></path>
          <path d="M20 20v-4h-4"></path>
        </svg>{"批量申請轉換代幣"}
      </button>{"\n    "}
      <button type="button" onClick={v.batchShip} disabled={v.noSel} style={{display: "inline-flex", alignItems: "center", gap: "6px", height: "44px", padding: "0 18px", borderRadius: "4px", border: "0", background: `${asset(v.primBg) ?? ''}`, color: `${asset(v.primColor) ?? ''}`, boxShadow: `${asset(v.primGlow) ?? ''}`, fontSize: "16px", fontWeight: "700"}}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 6h11v10H3zM14 9.5h4l3 3.5v3h-7"></path>
          <circle cx="7" cy="17.5" r="1.8"></circle>
          <circle cx="17.5" cy="17.5" r="1.8"></circle>
        </svg>{"批次申請配送"}
      </button>{"\n  "}
    </div>{"\n  "}
  </>) : null}{"\n\n  "}
  {v.hasNotice ? (<>{"\n    "}
    <div role="status" style={{display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderRadius: "6px", border: "1px solid #3a2a00", background: "#1a1300", fontSize: "14px", color: "#ffe390"}}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m5 12.5 4.5 4.5L19 7.5"></path>
      </svg>{v.notice}
    </div>{"\n  "}
  </>) : null}{"\n\n  "}
  <div style={{display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderRadius: "6px", border: "1px solid #282d36", background: "#13161b", fontSize: "14px", color: "#c3c8cd"}}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f4022b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "0 0 auto"}}>
      <circle cx="12" cy="12" r="9"></circle>
      <path d="M12 11v5.5M12 7.5v.5"></path>
    </svg>{"卡牌須於取得後 14 日內申請配送，逾期只可轉回代幣。"}
  </div>{"\n\n  "}
  {v.hasCards ? (<>{"\n  "}
    <ul style={{listStyle: "none", margin: "0", padding: "0", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(250px, 100%), 1fr))", gap: "16px"}}>{"\n    "}
      {(Array.isArray(v.cards) ? v.cards : []).map((c, $index) => (<React.Fragment key={$index}>{"\n      "}
        <li style={{display: "flex", flexDirection: "column", borderRadius: "6px", border: `1px solid ${asset(c?.border) ?? ''}`, background: "#0b0e12", boxShadow: `${asset(c?.glow) ?? ''}`, overflow: "hidden"}}>{"\n        "}
          <div style={{position: "relative", display: "flex", alignItems: "center", justifyContent: "center", aspectRatio: "4 / 3", background: `${asset(c?.wellBg) ?? ''}`}}>{"\n          "}
            {c?.selectable ? (<>{"\n            "}
              <label style={{position: "absolute", top: "10px", left: "10px", zIndex: "1", display: "inline-flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 12px 0 10px", borderRadius: "4px", background: "rgba(5, 7, 10, 0.85)", border: "1px solid #282d36", fontSize: "14px", fontWeight: "700", cursor: "pointer"}}>
                <input type="checkbox" checked={c?.checked} onChange={c?.toggle} style={{width: "18px", height: "18px", margin: "0"}} />{"選擇卡牌"}
              </label>{"\n          "}
            </>) : null}{"\n          "}
            {c?.isLegend ? (<>{"\n            "}
              <span style={{position: "absolute", top: "12px", right: "12px", zIndex: "1", display: "inline-flex", alignItems: "center", height: "24px", padding: "0 8px", borderRadius: "4px", border: "1px solid #fdc800", background: "#3a2a00", color: "#ffe390", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "14px", letterSpacing: "0.04em"}}>{"PSA10"}</span>{"\n          "}
            </>) : null}{"\n          "}
            {c?.img ? (<img src={c.img} alt="" loading="lazy" style={{maxWidth: "62%", maxHeight: "88%", objectFit: "contain", borderRadius: "6px", boxShadow: "0 8px 28px rgba(0, 0, 0, 0.55)"}} />) : null}
            {c?.isPack ? (<>{"\n            "}
              <span aria-hidden="true" style={{position: "relative", display: "block", width: "30%", aspectRatio: "5 / 8", borderRadius: "6px", overflow: "hidden", border: "1px solid #5a1222", background: "linear-gradient(160deg, #8f0e25 0%, #3a0812 45%, #0b0e12 100%)", boxShadow: "0 0 24px rgba(244, 2, 43, 0.4)"}}>
                <span style={{position: "absolute", left: "0", right: "0", top: "0", height: "11%", background: "repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.16) 0px, rgba(255, 255, 255, 0.16) 2px, rgba(0, 0, 0, 0.2) 2px, rgba(0, 0, 0, 0.2) 6px)"}}></span>
                <span style={{position: "absolute", left: "0", right: "0", bottom: "0", height: "11%", background: "repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.16) 0px, rgba(255, 255, 255, 0.16) 2px, rgba(0, 0, 0, 0.2) 2px, rgba(0, 0, 0, 0.2) 6px)"}}></span>
                <img src="/revamp/images/logo-mark.png" alt="" style={{position: "absolute", left: "50%", top: "50%", width: "42%", transform: "translate(-50%, -50%)"}} />
              </span>{"\n          "}
            </>) : null}{"\n          "}
            {c?.isSlab ? (<>{"\n            "}
              <span aria-hidden="true" style={{display: "flex", flexDirection: "column", gap: "5px", width: "34%", padding: "6px", borderRadius: "7px", border: "1px solid #3a404b", background: "linear-gradient(180deg, #2a2f38 0%, #13161b 100%)", boxShadow: "0 0 0 2px #fdc800, 0 0 32px rgba(253, 200, 0, 0.45)"}}>
                <span style={{display: "flex", alignItems: "center", justifyContent: "space-between", height: "18px", padding: "0 6px", borderRadius: "3px", background: "#05070a", border: "1px solid #3a2a00", fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontWeight: "800", fontSize: "11px", letterSpacing: "0.06em", color: "#ffe390"}}>
                  <span>{"PSA"}</span>
                  <span style={{color: "#fdc800"}}>{"10"}</span>
                </span>
                <span style={{position: "relative", display: "block", aspectRatio: "63 / 88", borderRadius: "3px", overflow: "hidden", background: "linear-gradient(150deg, #5a0a18 0%, #1d0a10 55%, #0b0e12 100%)"}}>
                  <span style={{position: "absolute", top: "0", right: "0", bottom: "0", left: "0", background: "linear-gradient(115deg, rgba(255, 255, 255, 0) 30%, rgba(255, 227, 144, 0.24) 48%, rgba(255, 255, 255, 0) 66%)"}}></span>
                  <img src="/revamp/images/logo-mark.png" alt="" style={{position: "absolute", left: "50%", top: "50%", width: "38%", transform: "translate(-50%, -50%)", opacity: "0.85"}} />
                </span>
              </span>{"\n          "}
            </>) : null}{"\n          "}
            {c?.isRandom ? (<>{"\n            "}
              <span aria-hidden="true" style={{display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "6px", width: "62%"}}>{"\n              "}
                <span style={{position: "relative", display: "block", aspectRatio: "63 / 88", borderRadius: "3px", border: "1px solid #3a1018", background: "linear-gradient(160deg, #4a0511 0%, #1d0a10 60%, #0b0e12 100%)"}}>
                  <img src="/revamp/images/logo-mark.png" alt="" style={{position: "absolute", left: "50%", top: "50%", width: "46%", transform: "translate(-50%, -50%)", opacity: "0.55"}} />
                </span>{"\n              "}
                <span style={{position: "relative", display: "block", aspectRatio: "63 / 88", borderRadius: "3px", border: "1px solid #3a1018", background: "linear-gradient(160deg, #4a0511 0%, #1d0a10 60%, #0b0e12 100%)"}}>
                  <img src="/revamp/images/logo-mark.png" alt="" style={{position: "absolute", left: "50%", top: "50%", width: "46%", transform: "translate(-50%, -50%)", opacity: "0.55"}} />
                </span>{"\n              "}
                <span style={{position: "relative", display: "block", aspectRatio: "63 / 88", borderRadius: "3px", border: "1px solid #3a1018", background: "linear-gradient(160deg, #4a0511 0%, #1d0a10 60%, #0b0e12 100%)"}}>
                  <img src="/revamp/images/logo-mark.png" alt="" style={{position: "absolute", left: "50%", top: "50%", width: "46%", transform: "translate(-50%, -50%)", opacity: "0.55"}} />
                </span>{"\n              "}
                <span style={{position: "relative", display: "block", aspectRatio: "63 / 88", borderRadius: "3px", border: "1px solid #3a1018", background: "linear-gradient(160deg, #4a0511 0%, #1d0a10 60%, #0b0e12 100%)"}}>
                  <img src="/revamp/images/logo-mark.png" alt="" style={{position: "absolute", left: "50%", top: "50%", width: "46%", transform: "translate(-50%, -50%)", opacity: "0.55"}} />
                </span>{"\n              "}
                <span style={{position: "relative", display: "block", aspectRatio: "63 / 88", borderRadius: "3px", border: "1px solid #3a1018", background: "linear-gradient(160deg, #4a0511 0%, #1d0a10 60%, #0b0e12 100%)"}}>
                  <img src="/revamp/images/logo-mark.png" alt="" style={{position: "absolute", left: "50%", top: "50%", width: "46%", transform: "translate(-50%, -50%)", opacity: "0.55"}} />
                </span>{"\n              "}
                <span style={{position: "relative", display: "block", aspectRatio: "63 / 88", borderRadius: "3px", border: "1px solid #3a1018", background: "linear-gradient(160deg, #4a0511 0%, #1d0a10 60%, #0b0e12 100%)"}}>
                  <img src="/revamp/images/logo-mark.png" alt="" style={{position: "absolute", left: "50%", top: "50%", width: "46%", transform: "translate(-50%, -50%)", opacity: "0.55"}} />
                </span>{"\n            "}
              </span>{"\n          "}
            </>) : null}{"\n        "}
          </div>{"\n        "}
          <div style={{flex: "1 1 auto", display: "flex", flexDirection: "column", gap: "10px", padding: "14px"}}>{"\n          "}
            <div style={{display: "flex", flexDirection: "column", gap: "2px"}}>{"\n            "}
              <strong style={{fontSize: "16px", lineHeight: "22px"}}>{c?.name}</strong>{"\n            "}
              <span style={{fontSize: "13px", lineHeight: "18px", color: "#c3c8cd"}}>{c?.src}</span>{"\n            "}
              <span style={{fontSize: "12px", lineHeight: "16px", color: "#6b767f"}}>{"取得時間："}{c?.time}</span>{"\n            "}
              <span style={{fontSize: "12px", lineHeight: "16px", color: "#6b767f"}}>{"所屬盲盒："}{c?.heavenCard}</span>{"\n          "}
            </div>{"\n          "}
            <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px"}}>{"\n            "}
              <span style={{height: "24px", padding: "0 8px", borderRadius: "4px", border: `1px solid ${asset(c?.tagBorder) ?? ''}`, background: `${asset(c?.tagBg) ?? ''}`, color: "#ffffff", fontSize: "12px", lineHeight: "22px", fontWeight: "700"}}>{c?.statusLabel}</span>{"\n            "}
              <span style={{display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "13px", color: "#a0a5ad"}}>{"可轉回"}
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="10.5" fill="#fdc800" stroke="#f88f00" strokeWidth="2"></circle>
                  <path d="M13.4 5.2 7.9 13h3.9l-1.2 5.8 5.6-8h-4z" fill="#f88f00"></path>
                </svg>
                <strong style={{fontFamily: "'Barlow Condensed', 'Noto Sans TC', sans-serif", fontSize: "17px", color: "#ffffff"}}>{c?.convertText}</strong>
              </span>{"\n          "}
            </div>{"\n          "}
            {c?.selectable ? (<>{"\n            "}
              <span style={{fontSize: "12px", lineHeight: "18px", color: c?.deadlineColor}}>{c?.deadlineText}</span>
              {c?.cancelNote ? <span style={{fontSize: "12px", lineHeight: "18px", color: "#ffe390"}}>{c.cancelNote}</span> : null}{"\n            "}
              <div style={{marginTop: "auto", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px"}}>{"\n              "}
                <button type="button" onClick={c?.convert} disabled={c?.busy} style={{height: "44px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "14px", fontWeight: "700", cursor: "pointer"}}>{"轉回代幣"}</button>{"\n              "}
                <button type="button" onClick={c?.ship} disabled={c?.shipDisabled} style={{height: "44px", borderRadius: "4px", border: "0", background: c?.shipBg, color: "#ffffff", fontSize: c?.shipDisabled ? "14px" : "16px", fontWeight: "700", cursor: c?.shipDisabled ? "not-allowed" : "pointer"}}>{c?.shipLabel}</button>{"\n            "}
              </div>{"\n          "}
            </>) : null}{"\n          "}
            {c?.isShipping ? (<>{"\n            "}
              <span style={{marginTop: "auto", display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#c3c8cd"}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h11v10H3zM14 9.5h4l3 3.5v3h-7"></path>
                  <circle cx="7" cy="17.5" r="1.8"></circle>
                  <circle cx="17.5" cy="17.5" r="1.8"></circle>
                </svg>{c?.shipText}
              </span>
              {c?.tracking}{"\n          "}
            </>) : null}{"\n        "}
          </div>{"\n      "}
        </li>{"\n    "}
      </React.Fragment>))}{"\n  "}
    </ul>{"\n  "}
    {v.pager}
  </>) : null}{"\n\n  "}
  {v.noCards ? (<>{"\n    "}
    <div style={{display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "56px 16px", borderRadius: "10px", border: "1px dashed #282d36", textAlign: "center"}}>{"\n      "}
      <strong style={{fontSize: "18px"}}>{v.emptyTitle}</strong>{"\n      "}
      {v.emptyBody ? <span style={{fontSize: "14px", color: "#a0a5ad"}}>{v.emptyBody}</span> : null}{"\n      "}
      <div style={{display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "10px", marginTop: "6px"}}>{"\n        "}
        <a href="/beta/live" style={{display: "inline-flex", alignItems: "center", height: "44px", padding: "0 16px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "15px", fontWeight: "700"}}>{"直播抽卡"}</a>{"\n        "}
        <a href="/beta/selfdraw" style={{display: "inline-flex", alignItems: "center", height: "44px", padding: "0 16px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "15px", fontWeight: "700"}}>{"自助抽卡"}</a>{"\n      "}
      </div>{"\n    "}
    </div>{"\n  "}
  </>) : null}
  {v.shipOpen ? (<>
    <div style={{position: "fixed", top: "0", right: "0", bottom: "0", left: "0", zIndex: "90", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px 24px", background: "rgba(0, 0, 0, 0.72)"}}>{"\n  "}
      <section role="dialog" aria-modal="true" aria-labelledby="ship-title" style={{position: "relative", width: "100%", maxWidth: "620px", maxHeight: "calc(100vh - 64px)", display: "flex", flexDirection: "column", borderRadius: "10px", border: "1px solid #282d36", background: "#0b0e12", boxShadow: "0 24px 60px rgba(0, 0, 0, 0.6)", overflow: "hidden"}}>{"\n\n    "}
        <div style={{flex: "0 0 auto", display: "flex", alignItems: "flex-start", gap: "16px", padding: "22px 24px 16px", borderBottom: "1px solid #14181d"}}>{"\n      "}
          <span aria-hidden="true" style={{flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", width: "44px", height: "44px", borderRadius: "8px", background: "#4a0511", color: "#ff4d68"}}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"></path>
              <path d="M3 7.5 12 12l9-4.5M12 12v9"></path>
            </svg>
          </span>{"\n      "}
          <div style={{flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px"}}>{"\n        "}
            <h2 id="ship-title" style={{margin: "0", fontSize: "24px", lineHeight: "32px", fontWeight: "900"}}>{v.shipTitle}</h2>{"\n        "}
            <span style={{fontSize: "14px", lineHeight: "20px", color: "#c3c8cd"}}>{v.shipSub}</span>{"\n      "}
          </div>{"\n      "}
          <button type="button" onClick={v.closeShip} aria-label="關閉" style={{flex: "0 0 auto", width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", cursor: "pointer"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18"></path>
            </svg>
          </button>{"\n    "}
        </div>{"\n\n    "}
        {v.shipForm ? (<>{"\n    "}
          <div style={{flex: "1 1 auto", minHeight: "0", overflowY: "auto", display: "flex", flexDirection: "column", gap: "20px", padding: "20px 24px"}}>{"\n\n      "}
            <div style={{display: "flex", flexDirection: "column", gap: "8px"}}>{"\n        "}
              <span style={{fontSize: "13px", lineHeight: "18px", fontWeight: "700", color: "#a0a5ad", letterSpacing: "0.04em"}}>{"配送卡牌"}</span>{"\n        "}
              <ul style={{listStyle: "none", margin: "0", padding: "0", display: "flex", flexWrap: "wrap", gap: "8px"}}>{"\n          "}
                {(Array.isArray(v.shipCards) ? v.shipCards : []).map((s, $index) => (<React.Fragment key={$index}>{"\n            "}
                  <li style={{display: "inline-flex", alignItems: "center", gap: "8px", maxWidth: "100%", height: "34px", padding: "0 12px 0 6px", borderRadius: "999px", border: "1px solid #282d36", background: "#13161b", fontSize: "13px", fontWeight: "700"}}>
                    <span aria-hidden="true" style={{flex: "0 0 auto", width: "16px", height: "22px", borderRadius: "2px", background: "linear-gradient(160deg, #7a0c20 0%, #3a0812 60%, #0b0e12 100%)", border: "1px solid #5a1222"}}></span>
                    <span style={{minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{s?.name}</span>
                  </li>{"\n          "}
                </React.Fragment>))}{"\n        "}
              </ul>{"\n      "}
            </div>{"\n\n      "}
            <fieldset style={{margin: "0", padding: "0", border: "0", display: "flex", flexDirection: "column", gap: "12px"}}>{"\n        "}
              <legend style={{padding: "0", marginBottom: "12px", fontSize: "16px", lineHeight: "22px", fontWeight: "900"}}>{"收件人"}</legend>{"\n        "}
              <div style={{display: "flex", flexWrap: "wrap", gap: "12px"}}>{"\n          "}
                <label style={{flex: "1 1 200px", minWidth: "0", display: "flex", flexDirection: "column", gap: "6px"}}>{"\n            "}
                  <span style={{fontSize: "14px", fontWeight: "700", color: "#c3c8cd"}}>{"收件人姓名"}</span>{"\n            "}
                  <input type="text" autoComplete="name" value={v.shipName} onChange={v.onShipName} style={{width: "100%", minWidth: "0", height: "48px", padding: "0 14px", borderRadius: "6px", border: `1px solid ${asset(v.nameBorder) ?? ''}`, background: "#05070a", outline: "none", color: "#ffffff", fontSize: "16px"}} />{"\n          "}
                </label>{"\n          "}
                <label style={{flex: "1 1 200px", minWidth: "0", display: "flex", flexDirection: "column", gap: "6px"}}>{"\n            "}
                  <span style={{fontSize: "14px", fontWeight: "700", color: "#c3c8cd"}}>{"聯絡電話"}</span>{"\n            "}
                  <span style={{display: "flex", alignItems: "center", height: "48px", borderRadius: "6px", border: `1px solid ${asset(v.phoneBorder) ?? ''}`, background: "#05070a", overflow: "hidden"}}>{"\n              "}
                    <span style={{flex: "0 0 auto", display: "flex", alignItems: "center", height: "100%", padding: "0 12px", borderRight: "1px solid #282d36", background: "#13161b", fontSize: "15px", fontWeight: "700", color: "#c3c8cd"}}>{v.dialCode}</span>{"\n              "}
                    <input type="tel" autoComplete="tel-national" inputMode="numeric" value={v.shipPhone} onChange={v.onShipPhone} placeholder="8 位電話號碼" style={{flex: "1 1 auto", minWidth: "0", height: "100%", padding: "0 12px", background: "transparent", border: "0", outline: "none", color: "#ffffff", fontSize: "16px", letterSpacing: "0.04em"}} />{"\n            "}
                  </span>{"\n          "}
                </label>{"\n        "}
              </div>{"\n      "}
            </fieldset>{"\n\n      "}
            <fieldset style={{margin: "0", padding: "0", border: "0", display: "flex", flexDirection: "column", gap: "10px"}}>{"\n        "}
              <legend style={{padding: "0", marginBottom: "10px", fontSize: "16px", lineHeight: "22px", fontWeight: "900"}}>{"配送地區"}</legend>{"\n        "}
              <div role="radiogroup" aria-label="配送地區" style={{display: "flex", flexWrap: "wrap", gap: "8px"}}>{"\n          "}
                {(Array.isArray(v.regions) ? v.regions : []).map((r, $index) => (<React.Fragment key={$index}>{"\n            "}
                  <button type="button" role="radio" aria-checked={r?.on} onClick={r?.pick} style={{height: "40px", padding: "0 18px", borderRadius: "999px", border: `1px solid ${asset(r?.border) ?? ''}`, background: `${asset(r?.bg) ?? ''}`, color: `${asset(r?.color) ?? ''}`, fontSize: "15px", fontWeight: "700", cursor: "pointer"}}>{r?.label}</button>{"\n          "}
                </React.Fragment>))}{"\n        "}
              </div>{"\n      "}
            </fieldset>{"\n\n      "}
            <fieldset style={{margin: "0", padding: "0", border: "0", display: "flex", flexDirection: "column", gap: "10px"}}>{"\n        "}
              <legend style={{padding: "0", marginBottom: "10px", fontSize: "16px", lineHeight: "22px", fontWeight: "900"}}>{"配送方式"}</legend>{"\n        "}
              <div role="radiogroup" aria-label="配送方式" style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: "10px"}}>{"\n          "}
                {(Array.isArray(v.shipMethods) ? v.shipMethods : []).map((m, $index) => (<React.Fragment key={$index}>{"\n            "}
                  <button type="button" role="radio" aria-checked={m?.on} onClick={m?.pick} style={{display: "flex", alignItems: "center", gap: "12px", minHeight: "64px", padding: "10px 14px", textAlign: "left", borderRadius: "6px", border: `1px solid ${asset(m?.border) ?? ''}`, background: `${asset(m?.bg) ?? ''}`, boxShadow: `${asset(m?.glow) ?? ''}`, color: "#ffffff", cursor: "pointer"}}>{"\n              "}
                    <span aria-hidden="true" style={{flex: "0 0 auto", width: "20px", height: "20px", borderRadius: "999px", border: `2px solid ${asset(m?.dotBorder) ?? ''}`, boxShadow: "inset 0 0 0 4px #0b0e12", background: `${asset(m?.dot) ?? ''}`}}></span>{"\n              "}
                    <span style={{display: "flex", flexDirection: "column"}}>
                      <strong style={{fontSize: "15px", lineHeight: "22px"}}>{m?.label}</strong>
                      <span style={{fontSize: "12px", lineHeight: "16px", color: "#a0a5ad"}}>{m?.sub}</span>
                    </span>{"\n            "}
                  </button>{"\n          "}
                </React.Fragment>))}{"\n        "}
              </div>{"\n        "}
              {v.isDoor ? (<>{"\n          "}
                <label style={{display: "flex", flexDirection: "column", gap: "6px"}}>{"\n            "}
                  <span style={{fontSize: "14px", fontWeight: "700", color: "#c3c8cd"}}>{"配送地址"}</span>{"\n            "}
                  <textarea rows="3" autoComplete="street-address" value={v.shipAddr} onChange={v.onShipAddr} placeholder={v.addrPlaceholder} style={{resize: "vertical", minHeight: "88px", padding: "12px 14px", borderRadius: "6px", border: `1px solid ${asset(v.addrBorder) ?? ''}`, background: "#05070a", outline: "none", color: "#ffffff", fontSize: "16px", lineHeight: "24px", fontFamily: "inherit"}} />{"\n          "}
                </label>{"\n        "}
              </>) : null}{"\n        "}
              {v.isStation ? (<>{"\n          "}
                <label style={{display: "flex", flexDirection: "column", gap: "6px"}}>{"\n            "}
                  <span style={{fontSize: "14px", fontWeight: "700", color: "#c3c8cd"}}>{"順豐站／智能櫃編號或地址"}</span>{"\n            "}
                  <input type="text" value={v.shipStation} onChange={v.onShipStation} placeholder="輸入站點編號或站點地址" style={{height: "48px", padding: "0 14px", borderRadius: "6px", border: `1px solid ${asset(v.addrBorder) ?? ''}`, background: "#05070a", outline: "none", color: "#ffffff", fontSize: "16px"}} />{"\n            "}
                  <span style={{fontSize: "12px", lineHeight: "16px", color: "#a0a5ad"}}>{"可於順豐官網或 App 查詢就近站點編號"}</span>{"\n          "}
                </label>{"\n        "}
              </>) : null}{"\n        "}
              <label style={{display: "inline-flex", alignItems: "center", gap: "10px", minHeight: "32px", fontSize: "14px", color: "#c3c8cd", cursor: "pointer"}}>{"\n          "}
                <input type="checkbox" checked={v.remember} onChange={v.toggleRemember} style={{width: "18px", height: "18px", accentColor: "#f4022b"}} />{"\n          記住此地址，下次自動填寫\n        "}
              </label>{"\n      "}
            </fieldset>{"\n\n      "}
            <label style={{display: "flex", flexDirection: "column", gap: "6px"}}>{"\n        "}
              <span style={{fontSize: "14px", fontWeight: "700", color: "#c3c8cd"}}>{"備註"}
                <span style={{fontWeight: "400", color: "#6b767f"}}>{"（選填）"}</span>
              </span>{"\n        "}
              <input type="text" value={v.shipNote} onChange={v.onShipNote} placeholder="例如：平日 7pm 後收件" style={{height: "48px", padding: "0 14px", borderRadius: "6px", border: "1px solid #282d36", background: "#05070a", outline: "none", color: "#ffffff", fontSize: "16px"}} />{"\n      "}
            </label>{"\n\n      "}
            <div style={{display: "flex", flexDirection: "column", gap: "10px", padding: "14px 16px", borderRadius: "6px", border: `1px solid ${asset(v.agreeBorder) ?? ''}`, background: "#1a1300"}}>{"\n        "}
              <span style={{display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "14px", lineHeight: "20px", color: "#ffe390"}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "0 0 auto", marginTop: "1px"}}>
                  <circle cx="12" cy="12" r="9"></circle>
                  <path d="M12 11v5.5M12 7.5v.5"></path>
                </svg>{"運費到付：由順豐於收件時直接收取，LiveDraw 不會預先扣除代幣。"}
              </span>{"\n        "}
              <label style={{display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "14px", lineHeight: "20px", color: "#ffffff", cursor: "pointer"}}>{"\n          "}
                <input type="checkbox" checked={v.agree} onChange={v.toggleAgree} style={{flex: "0 0 auto", width: "18px", height: "18px", margin: "1px 0 0", accentColor: "#f4022b"}} />{"\n          我確認運費到付，並同意於收件時支付運費\n        "}
              </label>{"\n      "}
            </div>{"\n    "}
          </div>{"\n\n    "}
          <div style={{flex: "0 0 auto", display: "flex", flexDirection: "column", gap: "8px", padding: "14px 24px 20px", borderTop: "1px solid #14181d", background: "#0b0e12"}}>{"\n      "}
            {v.shipError ? (<>
              <span role="alert" style={{fontSize: "14px", lineHeight: "20px", color: "#ffd7c1"}}>{v.shipErrorText}</span>
            </>) : null}{"\n      "}
            <div style={{display: "flex", gap: "10px"}}>{"\n        "}
              <button type="button" onClick={v.closeShip} style={{flex: "0 0 auto", height: "52px", padding: "0 20px", borderRadius: "4px", border: "1px solid #282d36", background: "#13161b", color: "#ffffff", fontSize: "16px", fontWeight: "700", cursor: "pointer"}}>{"取消"}</button>{"\n        "}
              <button type="button" onClick={v.submitShip} style={{flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", height: "52px", borderRadius: "4px", border: "0", background: `${asset(v.submitBg) ?? ''}`, color: "#ffffff", fontSize: "17px", fontWeight: "900", cursor: "pointer"}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"></path>
                  <path d="M3 7.5 12 12l9-4.5M12 12v9"></path>
                </svg>{v.submitBusy ? "提交中…" : <>{"確認申請配送（"}{v.shipCount}{" 張）"}</>}
              </button>{"\n      "}
            </div>{"\n    "}
          </div>{"\n    "}
        </>) : null}{"\n\n    "}
        {v.shipDone ? (<>{"\n    "}
          <div role="status" style={{display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", padding: "28px 24px 24px", textAlign: "center"}}>{"\n      "}
            <span aria-hidden="true" style={{display: "flex", alignItems: "center", justifyContent: "center", width: "72px", height: "72px", borderRadius: "999px", background: "#16a34a", boxShadow: "0 0 32px rgba(34, 197, 94, 0.5)"}}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12.5 4.5 4.5L19 7.5"></path>
              </svg>
            </span>{"\n      "}
            <p style={{margin: "0", maxWidth: "440px", fontSize: "15px", lineHeight: "24px", color: "#c3c8cd"}}>{"我們將盡快安排寄出，寄出後會更新順豐運單號碼。卡牌已移至「配送中」。"}</p>{"\n      "}
            <dl style={{width: "100%", margin: "0", display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", padding: "14px 18px", borderRadius: "6px", border: "1px solid #282d36", background: "#05070a", fontSize: "14px", lineHeight: "20px", textAlign: "left"}}>{"\n        "}
              <dt style={{color: "#a0a5ad"}}>{"收件人"}</dt>
              <dd style={{margin: "0", fontWeight: "700"}}>{v.doneWho}</dd>{"\n        "}
              <dt style={{color: "#a0a5ad"}}>{"配送方式"}</dt>
              <dd style={{margin: "0", fontWeight: "700"}}>{v.doneMethod}</dd>{"\n        "}
              <dt style={{color: "#a0a5ad"}}>{"地址"}</dt>
              <dd style={{margin: "0", fontWeight: "700"}}>{v.doneAddr}</dd>{"\n      "}
            </dl>{"\n      "}
            <button type="button" onClick={v.closeShip} style={{width: "100%", height: "52px", borderRadius: "4px", border: "0", background: "#f4022b", color: "#ffffff", fontSize: "17px", fontWeight: "900", cursor: "pointer"}}>{"完成"}</button>{"\n    "}
          </div>{"\n    "}
        </>) : null}{"\n  "}
      </section>
    </div>
  </>) : null}
</main>
</>);
};

function useCollection(uid) {
  const [state, setState] = useState({ records: [], loading: true });
  useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(query(collection(db, "drawRecords"), where("uid", "==", uid)), (snapshot) => {
      setState({
        loading: false,
        records: snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((r) => r.cardId && r.collectionStatus !== "void")
          .sort((a, b) => toMillis(getRecordAcquiredAt(b)) - toMillis(getRecordAcquiredAt(a))),
      });
    }, (error) => {
      console.error("Collection listener failed.", error);
      alert(getSafeErrorMessage(error, "未能載入我的卡牌。"));
      setState({ records: [], loading: false });
    });
  }, [uid]);
  return state;
}

function MyCards({ profile }) {
  const { records, loading } = useCollection(profile.uid);
  // Ticks every minute for the shipping deadline countdowns.
  const [clockMs, setClockMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClockMs(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <MyCardsPage profile={profile} records={records} loading={loading} clockMs={clockMs} />;
}

const ICON = <><rect x="8" y="3" width="12" height="16" rx="2"></rect><path d="M5 6.5V19a2 2 0 0 0 2 2h9"></path></>;

// Dev-only preview of the page with made-up cards (/beta/cards?sampleCards=1); not in production builds.
const SAMPLE_CARDS = import.meta.env.DEV ? [
  { id: "s1", cardId: "c1", cardName: "[PSA10]ピカチュウ [001/S-P]", drawTitle: "28/10 LiveDraw 直播", round: "round-17", targetCardName: "[PSA10]ピカチュウ [001/S-P]", resultSide: "heaven", cardConversionValue: 9800, assignedAt: Date.now() - 2 * 864e5 },
  { id: "s2", cardId: "c2", cardName: "隨機 PSA10", source: "instant", targetCardName: "[M2] インフェルノX Pack", resultSide: "hell", cardConversionValue: 1, assignedAt: Date.now() - 12 * 864e5 },
  { id: "s3", cardId: "c3", cardName: "隨機 PSA10", source: "instant", targetCardName: "[M2] インフェルノX Pack", resultSide: "hell", cardConversionValue: 1, assignedAt: Date.now() - 20 * 864e5 },
  { id: "s4", cardId: "c4", cardName: "[S6a] ナイトワンダラー Pack", drawTitle: "27/10 LiveDraw 直播", round: "round-3", targetCardName: "[S6a] ナイトワンダラー Pack", resultSide: "heaven", cardConversionValue: 320, collectionStatus: "shipping", shippingRequested: true, trackingNumber: "SF1234567890", assignedAt: Date.now() - 5 * 864e5 },
] : null;

export default function MyCardsRoute({ session }) {
  if (SAMPLE_CARDS && new URLSearchParams(window.location.search).has("sampleCards")) {
    return <MyCardsPage profile={{ uid: "sample" }} records={SAMPLE_CARDS} loading={false} clockMs={Date.now()} />;
  }
  if (!session.ready) return <MembersOnly css={CSS} title="我的卡牌" icon={ICON} />;
  return <MyCards profile={session.profile} />;
}
