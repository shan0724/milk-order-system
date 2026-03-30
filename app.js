/**
 * ?õÂ•∂?´Ë≤®Á≥ªÁµ± ???∏Â??èËºØ (ES Module + Firebase)
 * ?Æ‰?ÔºöÁÆ±Ôº? ÁÆ?= 20 ?∂Ô?
 * ?®È?ÔºöÂ?Âπ≥Êó•ÔºàÈÄ±‰?ÔΩûÈÄ±‰?Ôº? ?áÊó•ÔºàÈÄ±ÂÖ≠?ÅÈÄ±Êó•Ôº?
 */

import { db, ref, push, onValue, remove, get, query, orderByChild, limitToLast }
    from './firebase-config.js';

'use strict';

// ---- Constants ----
const DAY_NAMES = ['?±Êó•', '?±‰?', '?±‰?', '?±‰?', '?±Â?', '?±‰?', '?±ÂÖ≠'];
const BOTTLES_PER_BOX = 20;
const MILK_DB_PATH = 'milk_history';

const CYCLES = [
    { orderDay: 1, deliverDay: 2, coverDays: 3 },  // ?±‰?Ë®????±‰???
    { orderDay: 3, deliverDay: 5, coverDays: 3 },  // ?±‰?Ë®????±‰???
];

// ---- DOM Refs ----
const $ = (sel) => document.querySelector(sel);
const form = $('#orderForm');
const resultsSection = $('#resultsSection');
const historySection = $('#historySection');
const historyList = $('#historyList');

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
    renderTodayLabel();
    updateStatusBanner();
    loadHistory();
    form.addEventListener('submit', handleSubmit);
    $('#btnClearHistory').addEventListener('click', clearHistory);

    // ---- Discount Tab Init ----
    initDiscountTab();

    // Tab switching
    document.querySelectorAll('.tab-card').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-card').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const target = document.getElementById('tab-' + btn.dataset.tab);
            if (target) target.classList.add('active');
        });
    });
});

// ---- Helpers ----
function today() { return new Date(); }
function dayOfWeek() { return today().getDay(); }

function renderTodayLabel() {
    const d = today();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    $('#todayLabel').textContent = `${d.getFullYear()}/${mm}/${dd} ${DAY_NAMES[d.getDay()]}`;
}

function daysUntil(targetDay) {
    return (targetDay - dayOfWeek() + 7) % 7;
}

// ---- Ë®àÁ?Âπ≥Êó•/?áÊó•Â§©Êï∏ ----
function countWeekdaysAndHolidays(fromDate, toDate) {
    let weekdays = 0, holidays = 0;
    const d = new Date(fromDate);
    d.setHours(0, 0, 0, 0);
    const end = new Date(toDate);
    end.setHours(0, 0, 0, 0);
    while (d < end) {
        const dow = d.getDay();
        if (dow === 0 || dow === 6) holidays++; else weekdays++;
        d.setDate(d.getDate() + 1);
    }
    return { weekdays, holidays };
}

// ---- ?∏Â?Ë®àÁ? ----
function calculate(currentStock, weekdayUsage, holidayUsage, safetyDays) {
    const ranked = CYCLES.map((c) => {
        let dOrder = daysUntil(c.orderDay);
        let dDeliver = daysUntil(c.deliverDay);
        if (dDeliver <= dOrder) dDeliver += 7;
        return { ...c, dOrder, dDeliver };
    }).sort((a, b) => a.dOrder - b.dOrder);

    const next = ranked[0];
    const otherCycle = ranked.length > 1 ? ranked[1] : ranked[0];
    let dNextNextDeliver = otherCycle.dDeliver;
    if (dNextNextDeliver <= next.dDeliver) dNextNextDeliver += 7;
    const actualCoverDays = dNextNextDeliver - next.dDeliver;

    // ?•Ê??©‰ª∂
    const todayDate = today();
    todayDate.setHours(0, 0, 0, 0);
    const deliverDate = new Date(todayDate);
    deliverDate.setDate(todayDate.getDate() + next.dDeliver);
    const nextNextDeliverDate = new Date(todayDate);
    nextNextDeliverDate.setDate(todayDate.getDate() + dNextNextDeliver);

    // ‰ªäÂ§©?íÂà∞Ë≤®Ô?Ë®àÁ??∞Ë≤®?ÇÂâ©È§òÂ∫´Â≠?
    const period1 = countWeekdaysAndHolidays(todayDate, deliverDate);
    const consumeToDeliver = period1.weekdays * weekdayUsage + period1.holidays * holidayUsage;
    const stockAtDelivery = Math.max(0, currentStock - consumeToDeliver);

    // ?∞Ë≤®?í‰?Ê¨°Âà∞Ë≤®Ô??ÄÊ∂µË??ÑÊ??óÈ?
    const period2 = countWeekdaysAndHolidays(deliverDate, nextNextDeliverDate);
    const consumeCoverPeriod = period2.weekdays * weekdayUsage + period2.holidays * holidayUsage;

    // ÂÆâÂÖ®Â∫´Â?ÔºöÂ?Ê¨äÂπ≥?áÊó•?®È? ? ÂÆâÂÖ®Â§©Êï∏
    const coverTotalDays = period2.weekdays + period2.holidays;
    const avgDailyUsage = coverTotalDays > 0 ? consumeCoverPeriod / coverTotalDays : weekdayUsage;
    const safetyStock = avgDailyUsage * safetyDays;

    const rawQty = consumeCoverPeriod + safetyStock - stockAtDelivery;
    const recommendedQty = Math.max(0, Math.ceil(rawQty));

    // Â∫´Â??ØÊ?ÂπæÂ§©ÔºàÂ?Ê¨äÂπ≥?áÔ?
    const overallAvg = (weekdayUsage * 5 + holidayUsage * 2) / 7;
    const stockDays = overallAvg > 0 ? currentStock / overallAvg : Infinity;

    let urgency = 'ok';
    if (stockDays < next.dDeliver) urgency = 'urgent';
    else if (stockDays < next.dDeliver + 1) urgency = 'warn';

    return {
        nextOrderDay: next.orderDay,
        nextDeliverDay: next.deliverDay,
        daysToOrder: next.dOrder,
        daysToDeliver: next.dDeliver,
        coverDays: actualCoverDays,
        stockAtDelivery,
        safetyStock,
        recommendedQty,
        recommendedBottles: recommendedQty * BOTTLES_PER_BOX,
        stockDays: Math.round(stockDays * 10) / 10,
        needOrder: recommendedQty > 0,
        urgency,
        weekdayUsage,
        holidayUsage,
        period2,
    };
}

// ---- Status Banner ----
function updateStatusBanner(result) {
    const banner = $('#statusBanner');
    const text = $('#statusText');

    if (!result) {
        const dOrder0 = daysUntil(CYCLES[0].orderDay);
        const dOrder1 = daysUntil(CYCLES[1].orderDay);
        const nearest = dOrder0 <= dOrder1 ? CYCLES[0] : CYCLES[1];
        const d = daysUntil(nearest.orderDay);
        if (d === 0) {
            text.textContent = `‰ªäÂ§©??${DAY_NAMES[nearest.orderDay]}ÔºåÊòØË®ÇË≤®?•Ô?Ë´ãË?Âæó‰?????`;
            banner.className = 'status-banner warn';
        } else {
            text.textContent = `Ë∑ùÈõ¢‰∏ãÊ¨°Ë®ÇË≤®Ôº?{DAY_NAMES[nearest.orderDay]}ÔºâÈ???${d} Â§©`;
            banner.className = 'status-banner';
        }
        return;
    }

    banner.className = 'status-banner' + (result.urgency === 'warn' ? ' warn' : result.urgency === 'urgent' ? ' urgent' : '');
    if (result.urgency === 'urgent') {
        text.textContent = `?†Ô? Â∫´Â??ÖÂâ© ${result.stockDays} Â§©Ô??ØËÉΩ?ê‰??∞Âà∞Ë≤®Êó•ÔºÅ`;
    } else if (!result.needOrder) {
        text.textContent = `??Â∫´Â??ÖË∂≥ÔºåÁõÆ?ç‰??Ä?´Ë≤®`;
    } else {
        text.textContent = `Âª∫Ë≠∞?´Ë≤® ${result.recommendedQty} ÁÆ±Ô?${result.recommendedBottles} ?∂Ô?Ôº?{DAY_NAMES[result.nextOrderDay]}Ë®ÇÔ?`;
    }
}

// ---- Render Results ----
function renderResults(result, inputs) {
    resultsSection.style.display = '';

    const tmpl = [];
    const dow = dayOfWeek();
    for (let i = 0; i < 7; i++) {
        const d = (dow + i) % 7;
        const isToday = i === 0;
        const isOrder = CYCLES.some((c) => c.orderDay === d);
        const isDeliver = CYCLES.some((c) => c.deliverDay === d);
        let cls = 'tl-item';
        if (isToday) cls += ' today';
        if (isOrder) cls += ' order-day';
        if (isDeliver) cls += ' deliver-day';
        let tag = '';
        if (isToday) tag = '‰ªäÂ§©';
        else if (isOrder && isDeliver) tag = 'Ë®???;
        else if (isOrder) tag = 'Ë®ÇË≤®';
        else if (isDeliver) tag = '?∞Ë≤®';
        tmpl.push(`<div class="${cls}"><div class="tl-dot"></div><div class="tl-day">${DAY_NAMES[d]}</div><div class="tl-tag">${tag}</div></div>`);
    }
    $('#timeline').innerHTML = tmpl.join('');

    const mainLabel = result.needOrder ? `${result.recommendedQty} ÁÆ±` : '‰∏çÈ??´Ë≤® ??;
    const mainSub = result.needOrder
        ? `${result.recommendedBottles} ??ÔΩ?${DAY_NAMES[result.nextOrderDay]}Ë®ÇË≤® ??${DAY_NAMES[result.nextDeliverDay]}?∞Ë≤®`
        : 'Â∫´Â??ÖË∂≥';

    const stockAtDeliveryRound = Math.round(result.stockAtDelivery * 10) / 10;
    const stockAtDeliveryBottles = Math.round(result.stockAtDelivery * BOTTLES_PER_BOX);

    $('#resultCards').innerHTML = `
      <div class="r-card highlight">
        <div class="r-card-label">Âª∫Ë≠∞?´Ë≤®??/div>
        <div class="r-card-value">${mainLabel}</div>
        <div class="r-card-sub">${mainSub}</div>
      </div>
      <div class="r-card">
        <div class="r-card-label">Â∫´Â??ØÊ?</div>
        <div class="r-card-value">${result.stockDays} Â§?/div>
      </div>
      <div class="r-card">
        <div class="r-card-label">?∞Ë≤®?ÇÂâ©È§?/div>
        <div class="r-card-value">${stockAtDeliveryRound} ÁÆ?/div>
        <div class="r-card-sub">${stockAtDeliveryBottles} ??/div>
      </div>
      <div class="r-card">
        <div class="r-card-label">Ë∑ù‰?Ê¨°Ë?Ë≤?/div>
        <div class="r-card-value">${result.daysToOrder === 0 ? '‰ªäÂ§©' : result.daysToOrder + ' Â§?}</div>
      </div>
      <div class="r-card">
        <div class="r-card-label">Ë∑ù‰?Ê¨°Âà∞Ë≤?/div>
        <div class="r-card-value">${result.daysToDeliver} Â§?/div>
      </div>`;

    const statusClass = result.urgency === 'urgent' ? 'danger' : result.urgency;
    const statusLabel = result.urgency === 'urgent' ? '?†Ô? Â∫´Â?‰∏çË∂≥' : result.urgency === 'warn' ? '??Â∫´Â??è‰?' : '??Ê≠?∏∏';
    const safetyBoxes = Math.round(result.safetyStock * 10) / 10;
    const safetyBottles = Math.round(result.safetyStock * BOTTLES_PER_BOX);

    $('#detailBox').innerHTML = `
      <div class="detail-row"><span class="detail-label">?ÆÂ?Â∫´Â?</span><span class="detail-value">${inputs.currentStock} ÁÆ±Ô?${inputs.currentStock * BOTTLES_PER_BOX} ?∂Ô?</span></div>
      <div class="detail-row"><span class="detail-label">Âπ≥Êó•?®È?</span><span class="detail-value">${inputs.weekdayUsage} ÁÆ?Â§©Ô?${inputs.weekdayUsage * BOTTLES_PER_BOX} ?∂Ô?</span></div>
      <div class="detail-row"><span class="detail-label">?áÊó•?®È?</span><span class="detail-value">${inputs.holidayUsage} ÁÆ?Â§©Ô?${inputs.holidayUsage * BOTTLES_PER_BOX} ?∂Ô?</span></div>
      <div class="detail-row"><span class="detail-label">Ê∂µË??üÈ?Â§©Êï∏</span><span class="detail-value">Âπ≥Êó• ${result.period2.weekdays} Â§?/ ?áÊó• ${result.period2.holidays} Â§?/span></div>
      <div class="detail-row"><span class="detail-label">ÂÆâÂÖ®Â∫´Â?</span><span class="detail-value">${safetyBoxes} ÁÆ±Ô?${safetyBottles} ??/ ${inputs.safetyDays} Â§©Ô?</span></div>
      <div class="detail-row"><span class="detail-label">?∞Ë≤®ÂæåÈ?Ê∂µË?</span><span class="detail-value">${result.coverDays} Â§?/span></div>
      <div class="detail-row"><span class="detail-label">Â∫´Â??Ä??/span><span class="detail-value ${statusClass}">${statusLabel}</span></div>`;

    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- History (Firebase Realtime Database) ----
function loadHistory() {
    const histRef = query(ref(db, MILK_DB_PATH), orderByChild('timestamp'), limitToLast(10));
    onValue(histRef, (snapshot) => {
        const entries = [];
        snapshot.forEach(child => entries.push(child.val()));
        entries.reverse();

        if (entries.length === 0) {
            historySection.style.display = 'none';
            return;
        }
        historySection.style.display = '';
        historyList.innerHTML = entries.map((e) => {
            // Support both old format (usage/multiplier) and new format (weekdayUsage/holidayUsage)
            const weekday = e.weekdayUsage ?? e.usage;
            const holiday = e.holidayUsage ?? (e.usage * (e.multiplier || 1));
            const holidayDisplay = e.weekdayUsage != null
                ? `?áÊó• ${holiday} ÁÆ±`
                : (e.multiplier > 1 ? ` ?${e.multiplier}` : '');
            return `
      <div class="history-item"
          data-weekday="${weekday}" data-holiday="${holiday}"
          data-safety="${e.safety}">
        <div>
          <span>Â∫´Â? ${e.stock} ÁÆ±Ô?Âπ≥Êó• ${weekday} ÁÆ?Â§©Ô?${e.weekdayUsage != null ? `?áÊó• ${holiday} ÁÆ?Â§©` : `?®È? ${weekday} ÁÆ?{holidayDisplay}`}</span>
        </div>
        <div>
          <span class="hi-result">${e.result} ÁÆ?/span>
          <span class="hi-date">${e.date}</span>
        </div>
      </div>`;
        }).join('');

        historyList.querySelectorAll('.history-item').forEach((el) => {
            el.addEventListener('click', () => {
                $('#currentStock').value = el.dataset.stock || '';
                $('#weekdayUsage').value = el.dataset.weekday;
                $('#holidayUsage').value = el.dataset.holiday;
                $('#safetyDays').value = el.dataset.safety;
                form.dispatchEvent(new Event('submit', { cancelable: true }));
            });
        });
    });
}

async function saveHistory(entry) {
    try {
        const histRef = ref(db, MILK_DB_PATH);
        await push(histRef, { ...entry, timestamp: Date.now() });

        const snapshot = await get(query(histRef, orderByChild('timestamp')));
        if (snapshot.exists()) {
            const keys = [];
            snapshot.forEach(child => keys.push(child.key));
            if (keys.length > 10) {
                for (const key of keys.slice(0, keys.length - 10)) {
                    await remove(ref(db, `${MILK_DB_PATH}/${key}`));
                }
            }
        }
    } catch (err) {
        console.error('Firebase save error:', err);
    }
}

function clearHistory() {
    remove(ref(db, MILK_DB_PATH)).catch(err => console.error('Firebase clear error:', err));
}

// ---- Submit ----
function handleSubmit(e) {
    e.preventDefault();

    const currentStock = parseFloat($('#currentStock').value);
    const weekdayUsage = parseFloat($('#weekdayUsage').value);
    const holidayUsage = parseFloat($('#holidayUsage').value);
    const safetyDays = parseFloat($('#safetyDays').value) || 1;

    if (isNaN(currentStock) || isNaN(weekdayUsage) || weekdayUsage <= 0 || isNaN(holidayUsage) || holidayUsage < 0) {
        alert('Ë´ãËº∏?•Ê??àÁ?Â∫´Â??áÁî®?èÔ?');
        return;
    }

    const result = calculate(currentStock, weekdayUsage, holidayUsage, safetyDays);
    renderResults(result, { currentStock, weekdayUsage, holidayUsage, safetyDays });
    updateStatusBanner(result);

    const now = today();
    const dateStr = `${now.getMonth() + 1}/${now.getDate()} ${DAY_NAMES[now.getDay()]}`;
    saveHistory({
        stock: currentStock,
        weekdayUsage,
        holidayUsage,
        safety: safetyDays,
        result: result.recommendedQty,
        date: dateStr,
    });
}

// ============================================================
// ==================== DISCOUNT TAB ==========================
// ============================================================

const DISC_RATE = 0.8; // 8??

const DISC_PRODUCTS = [
    { id: 'p01', name: '?ñÂï°?•È?‰π?,     price: 125, icon: '?ç™' },
    { id: 'p02', name: 'Êµ∑Ë??ÑÈ?',       price: 130, icon: '?åø' },
    { id: 'p03', name: '?öÂë≥?õÂ•∂Ê£?,     price: 130, icon: '??' },
    { id: 'p04', name: 'Ëµ∑Âè∏?°Ê?Ê£?,     price: 130, icon: '??' },
    { id: 'p05', name: 'Ê≥ïÂ?È¶ôË?È§Ö‰πæ',   price: 100, icon: '??' },
    { id: 'p06', name: 'È¶ôË??è‰?Â•áÊôÆ',   price: 130, icon: '?å∏' },
    { id: 'p07', name: 'Â∑ßÂ??õÊ?‰ªÅÂ???, price: 135, icon: '?ç´' },
    { id: 'p08', name: 'È¶ôË?Â∑ßÂ??õÈ?‰π?, price: 145, icon: '?ç¶' },
    { id: 'p09', name: '?ëÂ?ÂØ∂Á±≥??,     price:  30, icon: '??' },
    { id: 'p10', name: 'È≥≥Âá∞??,         price:  32, icon: '?ê¶' },
    { id: 'p11', name: '?ëÁ?È≥≥Ê¢®??,     price:  45, icon: '??' },
    { id: 'p12', name: '?úÈ?Â§èÂ?Â§∑Ë?Â°?, price:  50, icon: '?å∫' },
    { id: 'p13', name: '?âÈ??•È?',       price:  45, icon: '?? },
    { id: 'p14', name: 'QQÂ∏ÉÊ?Â∞?,       price:  35, icon: '?ç¨' },
    { id: 'p15', name: 'È¶ôË?Â•∂Ê≤πÈ§Ö‰πæ',   price:  65, icon: '??' },
    { id: 'p16', name: '?°Ê?Â∞èÂ???,     price:  60, icon: '??' },
];

// Ë≥ºÁâ©ËªäÔ?{ id -> qty }
const discCart = {};

// LocalStorage keys
const CUSTOM_PROD_KEY   = 'disc_custom_products';
const DISC_DELETED_KEY  = 'disc_deleted_ids';

function loadCustomProducts() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_PROD_KEY) || '[]'); }
    catch { return []; }
}
function saveCustomProducts(list) {
    localStorage.setItem(CUSTOM_PROD_KEY, JSON.stringify(list));
}
function loadDeletedIds() {
    try { return new Set(JSON.parse(localStorage.getItem(DISC_DELETED_KEY) || '[]')); }
    catch { return new Set(); }
}
function saveDeletedIds(set) {
    localStorage.setItem(DISC_DELETED_KEY, JSON.stringify([...set]));
}
function getAllProducts() {
    const deleted = loadDeletedIds();
    const defaults = DISC_PRODUCTS.filter(p => !deleted.has(p.id));
    return [...defaults, ...loadCustomProducts()];
}

function discPrice(p) { return Math.round(p.price * DISC_RATE); }
function discSaving(p) { return p.price - discPrice(p); }

function initDiscountTab() {
    renderDiscProducts();

    // Ê∏ÖÁ©∫Ë®àÁ?Ê©?
    $('#discClearCart').addEventListener('click', () => {
        Object.keys(discCart).forEach(k => delete discCart[k]);
        renderDiscCart();
    });

    // ----- Ë®≠Â? Modal ?ãÈ? -----
    $('#discOpenSettings').addEventListener('click', openDiscModal);
    $('#discModalClose').addEventListener('click', closeDiscModal);
    $('#discModalOverlay').addEventListener('click', (e) => {
        if (e.target === $('#discModalOverlay')) closeDiscModal();
    });

    // ?∞Â??ÜÂ?
    $('#discAddProduct').addEventListener('click', () => {
        const name  = $('#newProdName').value.trim();
        const price = parseInt($('#newProdPrice').value);

        if (!name)  { shakeInput($('#newProdName'));  return; }
        if (!price || price < 1) { shakeInput($('#newProdPrice')); return; }

        const customs = loadCustomProducts();
        const newId = 'c' + Date.now();
        customs.push({ id: newId, name, price, custom: true });
        saveCustomProducts(customs);

        $('#newProdName').value  = '';
        $('#newProdPrice').value = '';

        renderDiscProducts();
        renderAllProductsInModal();
        showToast('??Â∑≤Êñ∞Â¢ûÔ?' + name);
    });
}

function openDiscModal() {
    renderAllProductsInModal();
    $('#discModalOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeDiscModal() {
    $('#discModalOverlay').classList.remove('open');
    document.body.style.overflow = '';
}

// ---- È°ØÁ§∫?Ä?âÂ??ÅÔ??´È?Ë®?+ ?™Ë?ÔºâÂèØ?™Èô§ ----
function renderAllProductsInModal() {
    const all = getAllProducts();
    const container = $('#discCustomList');
    if (all.length === 0) {
        container.innerHTML = '<p class="disc-empty-hint">?Ä?âÂ??ÅÂ∑≤ÁßªÈô§</p>';
        return;
    }
    container.innerHTML = all.map(p => `
        <div class="disc-custom-item">
            <span class="dci-name">${p.name}</span>
            <span class="dci-price">$${p.price} ??$${discPrice(p)}</span>
            <button class="dci-del" onclick="discDeleteProduct('${p.id}', event)" title="ÁßªÈô§Ê≠§Â???>??Ô∏?/button>
        </div>
    `).join('');
}

// ---- ?™Èô§‰ªªÊ??ÜÂ?ÔºàÈ?Ë®≠Ê??™Ë?Ôº?---
window.discDeleteProduct = function(id, event) {
    if (event) event.stopPropagation();
    const all = getAllProducts();
    const prod = all.find(p => p.id === id);

    const isDefault = DISC_PRODUCTS.some(p => p.id === id);
    if (isDefault) {
        const deleted = loadDeletedIds();
        deleted.add(id);
        saveDeletedIds(deleted);
    } else {
        const customs = loadCustomProducts().filter(p => p.id !== id);
        saveCustomProducts(customs);
    }

    delete discCart[id];
    renderDiscProducts();
    renderAllProductsInModal();
    renderDiscCart();
    if (prod) showToast('?ñÔ? Â∑≤Áßª?§Ô?' + prod.name);
};

function shakeInput(el) {
    el.style.borderColor = '#f87171';
    el.style.animation = 'shake 0.4s ease';
    setTimeout(() => { el.style.borderColor = ''; el.style.animation = ''; }, 600);
    el.focus();
}

function showToast(msg) {
    let toast = document.getElementById('discToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'discToast';
        toast.style.cssText = `position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(80px);background:#1e293b;color:#f0f4fc;padding:12px 22px;border-radius:12px;font-size:0.88rem;font-weight:600;border:1px solid rgba(255,255,255,0.12);box-shadow:0 8px 32px rgba(0,0,0,0.4);z-index:9999;transition:transform 0.3s cubic-bezier(.34,1.56,.64,1),opacity 0.3s;opacity:0;pointer-events:none;`;
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    setTimeout(() => { toast.style.transform = 'translateX(-50%) translateY(0)'; toast.style.opacity = '1'; }, 10);
    setTimeout(() => { toast.style.transform = 'translateX(-50%) translateY(80px)'; toast.style.opacity = '0'; }, 2200);
}

// ---- Ê∏≤Ê??ÅÈ??°Á?ÔºàÁÑ°?ñÁ§∫ÔºåÊ??™Èô§?âÈ?Ôº?---
function renderDiscProducts() {
    const grid = $('#discProductGrid');
    const all = getAllProducts();
    if (all.length === 0) {
        grid.innerHTML = '<p class="disc-empty-hint" style="grid-column:1/-1;padding:24px 0;text-align:center;">?Ä?âÂ??ÅÂ∑≤ÁßªÈô§ÔºåË??≥„ÄåÁÆ°?ÜÂ??Å„ÄçÊñ∞Â¢?/p>';
        return;
    }
    grid.innerHTML = all.map(p => {
        const sale = discPrice(p);
        const save = discSaving(p);
        return `
        <div class="disc-prod-card" id="dpc-${p.id}" data-id="${p.id}">
            <button class="dpc-del-btn" onclick="discDeleteProduct('${p.id}', event)" title="ÁßªÈô§">??/button>
            <div class="dpc-click-area" onclick="discAddOne('${p.id}')">
                <div class="dpc-name">${p.name}</div>
                <div class="dpc-prices">
                    <span class="dpc-orig">$${p.price}</span>
                    <span class="dpc-sale">$${sale}</span>
                </div>
                <div class="dpc-saving">??$${save}</div>
            </div>
            <div class="dpc-qty-badge" id="dqb-${p.id}" style="display:none;">0</div>
        </div>`;
    }).join('');
    Object.keys(discCart).forEach(id => updateDiscBadge(id));
}

// ---- ?†‰?‰ª?----
window.discAddOne = function(id) {
    discCart[id] = (discCart[id] || 0) + 1;
    renderDiscCart();
    updateDiscBadge(id);
};

// ---- ?¥Êñ∞?°Á?‰∏äÁ??∏È?ÂæΩÁ? ----
function updateDiscBadge(id) {
    const badge = document.getElementById('dqb-' + id);
    const card  = document.getElementById('dpc-' + id);
    const qty = discCart[id] || 0;
    if (badge) {
        badge.textContent = qty;
        badge.style.display = qty > 0 ? 'flex' : 'none';
    }
    if (card) {
        card.classList.toggle('dpc-selected', qty > 0);
    }
}

// ---- Ê∏≤Ê?Ë®àÁ?Ê©üÊ??ÆÔ?Ê∞∏È?È°ØÁ§∫ÔºõÁ©∫?ÇÈ°ØÁ§∫Ê?Á§∫Ô?----
function renderDiscCart() {
    const keys = Object.keys(discCart).filter(k => discCart[k] > 0);
    const clearBtn = $('#discClearCart');

    if (keys.length === 0) {
        $('#discCartList').innerHTML = '<p class="disc-cart-empty">??ÈªûÊ?Â∑¶ÂÅ¥?ÅÈ??†ÂÖ•</p>';
        $('#discSummary').innerHTML  = '';
        if (clearBtn) clearBtn.style.display = 'none';
        return;
    }
    if (clearBtn) clearBtn.style.display = '';

    const allProds = getAllProducts();
    let totalOrig = 0, totalSale = 0;

    $('#discCartList').innerHTML = keys.map(id => {
        const p = allProds.find(x => x.id === id);
        if (!p) return '';
        const qty = discCart[id];
        const sale = discPrice(p);
        const rowOrig = p.price * qty;
        const rowSale = sale * qty;
        totalOrig += rowOrig;
        totalSale += rowSale;
        return `
        <div class="disc-cart-row">
            <div class="dcr-info">
                <span class="dcr-name">${p.name}</span>
                <span class="dcr-unit">$${p.price}??strong>$${sale}</strong></span>
            </div>
            <div class="dcr-ctrl">
                <button class="dcr-btn" onclick="discChangeQty('${id}', -1)">??/button>
                <span class="dcr-qty">${qty}</span>
                <button class="dcr-btn" onclick="discChangeQty('${id}', 1)">+</button>
                <span class="dcr-subtotal">$${rowSale}</span>
            </div>
        </div>`;
    }).join('');

    const totalSaving = totalOrig - totalSale;
    $('#discSummary').innerHTML = `
        <div class="disc-sum-row">
            <span>?üÂÉπ?àË?</span>
            <span class="disc-sum-orig">$${totalOrig}</span>
        </div>
        <div class="disc-sum-row">
            <span>8?òÂÑ™?†ÂÉπ</span>
            <span class="disc-sum-sale">$${totalSale}</span>
        </div>
        <div class="disc-sum-row disc-sum-saving-row">
            <span>?í∞ Á∏ΩÂÖ±?òÂÉπ</span>
            <span class="disc-sum-saving">??$${totalSaving}</span>
        </div>`;
}

// ---- Ë™øÊï¥?∏È? ----
window.discChangeQty = function(id, delta) {
    discCart[id] = Math.max(0, (discCart[id] || 0) + delta);
    if (discCart[id] === 0) delete discCart[id];
    updateDiscBadge(id);
    renderDiscCart();
};

function loadCustomProducts() {
    try {
        return JSON.parse(localStorage.getItem(CUSTOM_PROD_KEY) || '[]');
    } catch { return []; }
}