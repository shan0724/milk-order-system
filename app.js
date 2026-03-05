/**
 * 牛奶叫貨系統 – 核心邏輯 (ES Module + Firebase)
 * 單位：箱（1 箱 = 20 瓶）
 */

import { db, ref, push, onValue, remove, get, query, orderByChild, limitToLast }
    from './firebase-config.js';

'use strict';

// ---- Constants ----
const DAY_NAMES = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const BOTTLES_PER_BOX = 20;
const MILK_DB_PATH = 'milk_history';

const CYCLES = [
    { orderDay: 1, deliverDay: 2, coverDays: 3 },
    { orderDay: 3, deliverDay: 5, coverDays: 3 },
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
    loadHistory();   // real-time Firebase listener
    form.addEventListener('submit', handleSubmit);
    $('#btnClearHistory').addEventListener('click', clearHistory);

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

// ---- 核心計算 ----
function calculate(currentStock, dailyUsage, safetyDays, holidayMultiplier) {
    const effectiveUsage = dailyUsage * holidayMultiplier;

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
    const stockAtDelivery = Math.max(0, currentStock - effectiveUsage * next.dDeliver);
    const safetyStock = effectiveUsage * safetyDays;
    const rawQty = (actualCoverDays * effectiveUsage) + safetyStock - stockAtDelivery;
    const recommendedQty = Math.max(0, Math.ceil(rawQty));
    const stockDays = effectiveUsage > 0 ? currentStock / effectiveUsage : Infinity;

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
        effectiveUsage,
        holidayMultiplier,
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
            text.textContent = `今天是 ${DAY_NAMES[nearest.orderDay]}，是訂貨日！請記得下單 🔔`;
            banner.className = 'status-banner warn';
        } else {
            text.textContent = `距離下次訂貨（${DAY_NAMES[nearest.orderDay]}）還有 ${d} 天`;
            banner.className = 'status-banner';
        }
        return;
    }

    banner.className = 'status-banner' + (result.urgency === 'warn' ? ' warn' : result.urgency === 'urgent' ? ' urgent' : '');
    if (result.urgency === 'urgent') {
        text.textContent = `⚠️ 庫存僅剩 ${result.stockDays} 天，可能撐不到到貨日！`;
    } else if (!result.needOrder) {
        text.textContent = `✅ 庫存充足，目前不需叫貨`;
    } else {
        text.textContent = `建議叫貨 ${result.recommendedQty} 箱（${result.recommendedBottles} 瓶）（${DAY_NAMES[result.nextOrderDay]}訂）`;
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
        if (isToday) tag = '今天';
        else if (isOrder && isDeliver) tag = '訂/到';
        else if (isOrder) tag = '訂貨';
        else if (isDeliver) tag = '到貨';
        tmpl.push(`<div class="${cls}"><div class="tl-dot"></div><div class="tl-day">${DAY_NAMES[d]}</div><div class="tl-tag">${tag}</div></div>`);
    }
    $('#timeline').innerHTML = tmpl.join('');

    const mainLabel = result.needOrder ? `${result.recommendedQty} 箱` : '不需叫貨 ✅';
    const mainSub = result.needOrder
        ? `${result.recommendedBottles} 瓶 ｜ ${DAY_NAMES[result.nextOrderDay]}訂貨 → ${DAY_NAMES[result.nextDeliverDay]}到貨`
        : '庫存充足';

    const stockAtDeliveryRound = Math.round(result.stockAtDelivery * 10) / 10;
    const stockAtDeliveryBottles = Math.round(result.stockAtDelivery * BOTTLES_PER_BOX);

    $('#resultCards').innerHTML = `
      <div class="r-card highlight">
        <div class="r-card-label">建議叫貨量</div>
        <div class="r-card-value">${mainLabel}</div>
        <div class="r-card-sub">${mainSub}</div>
      </div>
      <div class="r-card">
        <div class="r-card-label">庫存可撐</div>
        <div class="r-card-value">${result.stockDays} 天</div>
      </div>
      <div class="r-card">
        <div class="r-card-label">到貨時剩餘</div>
        <div class="r-card-value">${stockAtDeliveryRound} 箱</div>
        <div class="r-card-sub">${stockAtDeliveryBottles} 瓶</div>
      </div>
      <div class="r-card">
        <div class="r-card-label">距下次訂貨</div>
        <div class="r-card-value">${result.daysToOrder === 0 ? '今天' : result.daysToOrder + ' 天'}</div>
      </div>
      <div class="r-card">
        <div class="r-card-label">距下次到貨</div>
        <div class="r-card-value">${result.daysToDeliver} 天</div>
      </div>`;

    const statusClass = result.urgency === 'urgent' ? 'danger' : result.urgency;
    const statusLabel = result.urgency === 'urgent' ? '⚠️ 庫存不足' : result.urgency === 'warn' ? '⚡ 庫存偏低' : '✅ 正常';
    const safetyBoxes = Math.round(result.safetyStock * 10) / 10;
    const safetyBottles = Math.round(result.safetyStock * BOTTLES_PER_BOX);

    let holidayRow = '';
    if (result.holidayMultiplier > 1) {
        holidayRow = `<div class="detail-row"><span class="detail-label">連假用量倍數</span><span class="detail-value warn">×${result.holidayMultiplier}（實際日用 ${Math.round(result.effectiveUsage * 10) / 10} 箱）</span></div>`;
    }

    $('#detailBox').innerHTML = `
      <div class="detail-row"><span class="detail-label">目前庫存</span><span class="detail-value">${inputs.currentStock} 箱（${inputs.currentStock * BOTTLES_PER_BOX} 瓶）</span></div>
      <div class="detail-row"><span class="detail-label">每日用量</span><span class="detail-value">${inputs.dailyUsage} 箱/天（${inputs.dailyUsage * BOTTLES_PER_BOX} 瓶）</span></div>
      ${holidayRow}
      <div class="detail-row"><span class="detail-label">安全庫存</span><span class="detail-value">${safetyBoxes} 箱（${safetyBottles} 瓶 / ${inputs.safetyDays} 天）</span></div>
      <div class="detail-row"><span class="detail-label">到貨後需涵蓋</span><span class="detail-value">${result.coverDays} 天</span></div>
      <div class="detail-row"><span class="detail-label">庫存狀態</span><span class="detail-value ${statusClass}">${statusLabel}</span></div>`;

    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- History (Firebase Realtime Database) ----
function loadHistory() {
    const histRef = query(ref(db, MILK_DB_PATH), orderByChild('timestamp'), limitToLast(10));
    onValue(histRef, (snapshot) => {
        const entries = [];
        snapshot.forEach(child => entries.push(child.val()));
        entries.reverse(); // newest first

        if (entries.length === 0) {
            historySection.style.display = 'none';
            return;
        }
        historySection.style.display = '';
        historyList.innerHTML = entries.map((e) => {
            const multiplierTag = e.multiplier > 1 ? ` ×${e.multiplier}` : '';
            return `
      <div class="history-item" data-stock="${e.stock}" data-usage="${e.usage}" data-safety="${e.safety}" data-multiplier="${e.multiplier || 1}">
        <div><span>庫存 ${e.stock} 箱 ｜ 用量 ${e.usage} 箱/天${multiplierTag}</span></div>
        <div><span class="hi-result">${e.result} 箱</span><span class="hi-date">${e.date}</span></div>
      </div>`;
        }).join('');

        historyList.querySelectorAll('.history-item').forEach((el) => {
            el.addEventListener('click', () => {
                $('#currentStock').value = el.dataset.stock;
                $('#dailyUsage').value = el.dataset.usage;
                $('#safetyDays').value = el.dataset.safety;
                $('#holidayMultiplier').value = el.dataset.multiplier || 1;
                form.dispatchEvent(new Event('submit', { cancelable: true }));
            });
        });
    });
}

async function saveHistory(entry) {
    try {
        const histRef = ref(db, MILK_DB_PATH);
        await push(histRef, { ...entry, timestamp: Date.now() });

        // Trim to 10 entries
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
    const dailyUsage = parseFloat($('#dailyUsage').value);
    const safetyDays = parseFloat($('#safetyDays').value) || 1;
    const holidayMultiplier = parseFloat($('#holidayMultiplier').value) || 1;

    if (isNaN(currentStock) || isNaN(dailyUsage) || dailyUsage <= 0) {
        alert('請輸入有效的庫存與用量！');
        return;
    }

    const result = calculate(currentStock, dailyUsage, safetyDays, holidayMultiplier);
    renderResults(result, { currentStock, dailyUsage, safetyDays, holidayMultiplier });
    updateStatusBanner(result);

    const now = today();
    const dateStr = `${now.getMonth() + 1}/${now.getDate()} ${DAY_NAMES[now.getDay()]}`;
    saveHistory({
        stock: currentStock,
        usage: dailyUsage,
        safety: safetyDays,
        multiplier: holidayMultiplier,
        result: result.recommendedQty,
        date: dateStr,
    });
    // No need to call loadHistory() — onValue listener auto-updates
}
