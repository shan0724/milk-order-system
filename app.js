/**
 * 牛奶叫貨系統 – 核心邏輯 (ES Module + Firebase)
 * 單位：箱（1 箱 = 20 瓶）
 * 用量：分平日（週一～週五）/ 假日（週六、週日）
 */

import { db, ref, push, onValue, remove, get, query, orderByChild, limitToLast }
    from './firebase-config.js';

'use strict';

// ---- Constants ----
const DAY_NAMES = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const BOTTLES_PER_BOX = 20;
const MILK_DB_PATH = 'milk_history';

const CYCLES = [
    { orderDay: 1, deliverDay: 2, coverDays: 3 },  // 週一訂 → 週二到
    { orderDay: 3, deliverDay: 5, coverDays: 3 },  // 週三訂 → 週五到
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

// ---- 計算平日/假日天數 ----
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

// ---- 核心計算 ----
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

    // 日期物件
    const todayDate = today();
    todayDate.setHours(0, 0, 0, 0);
    const deliverDate = new Date(todayDate);
    deliverDate.setDate(todayDate.getDate() + next.dDeliver);
    const nextNextDeliverDate = new Date(todayDate);
    nextNextDeliverDate.setDate(todayDate.getDate() + dNextNextDeliver);

    // 今天→到貨：計算到貨時剩餘庫存
    const period1 = countWeekdaysAndHolidays(todayDate, deliverDate);
    const consumeToDeliver = period1.weekdays * weekdayUsage + period1.holidays * holidayUsage;
    const stockAtDelivery = Math.max(0, currentStock - consumeToDeliver);

    // 到貨→下次到貨：需涵蓋的消耗量
    const period2 = countWeekdaysAndHolidays(deliverDate, nextNextDeliverDate);
    const consumeCoverPeriod = period2.weekdays * weekdayUsage + period2.holidays * holidayUsage;

    // 安全庫存：加權平均日用量 × 安全天數
    const coverTotalDays = period2.weekdays + period2.holidays;
    const avgDailyUsage = coverTotalDays > 0 ? consumeCoverPeriod / coverTotalDays : weekdayUsage;
    const safetyStock = avgDailyUsage * safetyDays;

    const rawQty = consumeCoverPeriod + safetyStock - stockAtDelivery;
    const recommendedQty = Math.max(0, Math.ceil(rawQty));

    // 庫存可撐幾天（加權平均）
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

    $('#detailBox').innerHTML = `
      <div class="detail-row"><span class="detail-label">目前庫存</span><span class="detail-value">${inputs.currentStock} 箱（${inputs.currentStock * BOTTLES_PER_BOX} 瓶）</span></div>
      <div class="detail-row"><span class="detail-label">平日用量</span><span class="detail-value">${inputs.weekdayUsage} 箱/天（${inputs.weekdayUsage * BOTTLES_PER_BOX} 瓶）</span></div>
      <div class="detail-row"><span class="detail-label">假日用量</span><span class="detail-value">${inputs.holidayUsage} 箱/天（${inputs.holidayUsage * BOTTLES_PER_BOX} 瓶）</span></div>
      <div class="detail-row"><span class="detail-label">涵蓋期間天數</span><span class="detail-value">平日 ${result.period2.weekdays} 天 / 假日 ${result.period2.holidays} 天</span></div>
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
                ? `假日 ${holiday} 箱`
                : (e.multiplier > 1 ? ` ×${e.multiplier}` : '');
            return `
      <div class="history-item"
          data-weekday="${weekday}" data-holiday="${holiday}"
          data-safety="${e.safety}">
        <div>
          <span>庫存 ${e.stock} 箱｜平日 ${weekday} 箱/天｜${e.weekdayUsage != null ? `假日 ${holiday} 箱/天` : `用量 ${weekday} 箱${holidayDisplay}`}</span>
        </div>
        <div>
          <span class="hi-result">${e.result} 箱</span>
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
        alert('請輸入有效的庫存與用量！');
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

const DISC_RATE = 0.8; // 8折

const DISC_PRODUCTS = [
    { id: 'p01', name: '咖啡酥餅乾',     price: 125, icon: '🍪' },
    { id: 'p02', name: '海苔薄餅',       price: 130, icon: '🌿' },
    { id: 'p03', name: '厚味牛奶棒',     price: 130, icon: '🥛' },
    { id: 'p04', name: '起司卡滋棒',     price: 130, icon: '🧀' },
    { id: 'p05', name: '法式香草餅乾',   price: 100, icon: '🫐' },
    { id: 'p06', name: '香草杏仁奇普',   price: 130, icon: '🌸' },
    { id: 'p07', name: '巧克力杏仁奇普', price: 135, icon: '🍫' },
    { id: 'p08', name: '香草巧克力餅乾', price: 145, icon: '🍦' },
    { id: 'p09', name: '金元寶米菓',     price:  30, icon: '🍘' },
    { id: 'p10', name: '鳳凰酥',         price:  32, icon: '🐦' },
    { id: 'p11', name: '金磚鳳梨酥',     price:  45, icon: '🍍' },
    { id: 'p12', name: '蜜香夏威夷豆塔', price:  50, icon: '🌺' },
    { id: 'p13', name: '琉金酥餅',       price:  45, icon: '✨' },
    { id: 'p14', name: 'QQ布朗尼',       price:  35, icon: '🍬' },
    { id: 'p15', name: '香蒜奶油餅乾',   price:  65, icon: '🧄' },
    { id: 'p16', name: '卡滋小帕芙',     price:  60, icon: '🎀' },
];

// 購物車：{ id -> qty }
const discCart = {};

// LocalStorage key for custom products
const CUSTOM_PROD_KEY = 'disc_custom_products';

function loadCustomProducts() {
    try {
        return JSON.parse(localStorage.getItem(CUSTOM_PROD_KEY) || '[]');
    } catch { return []; }
}

function saveCustomProducts(list) {
    localStorage.setItem(CUSTOM_PROD_KEY, JSON.stringify(list));
}

function getAllProducts() {
    return [...DISC_PRODUCTS, ...loadCustomProducts()];
}

function discPrice(p) { return Math.round(p.price * DISC_RATE); }
function discSaving(p) { return p.price - discPrice(p); }

function initDiscountTab() {
    renderDiscProducts();

    // 清空計算機
    $('#discClearCart').addEventListener('click', () => {
        Object.keys(discCart).forEach(k => delete discCart[k]);
        renderDiscCart();
    });

    // ----- 設定 Modal 開閉 -----
    $('#discOpenSettings').addEventListener('click', openDiscModal);
    $('#discModalClose').addEventListener('click', closeDiscModal);
    $('#discModalOverlay').addEventListener('click', (e) => {
        if (e.target === $('#discModalOverlay')) closeDiscModal();
    });

    // 新增商品
    $('#discAddProduct').addEventListener('click', () => {
        const icon  = $('#newProdIcon').value.trim()  || '📦';
        const name  = $('#newProdName').value.trim();
        const price = parseInt($('#newProdPrice').value);

        if (!name) { shakeInput($('#newProdName')); return; }
        if (!price || price < 1) { shakeInput($('#newProdPrice')); return; }

        const customs = loadCustomProducts();
        const newId = 'c' + Date.now();
        customs.push({ id: newId, name, price, icon, custom: true });
        saveCustomProducts(customs);

        // 清空輸入
        $('#newProdIcon').value = '';
        $('#newProdName').value = '';
        $('#newProdPrice').value = '';

        renderDiscProducts();
        renderDiscCustomList();
        showToast('✅ 已新增：' + name);
    });
}

function openDiscModal() {
    renderDiscCustomList();
    const overlay = $('#discModalOverlay');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeDiscModal() {
    const overlay = $('#discModalOverlay');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
}

function renderDiscCustomList() {
    const customs = loadCustomProducts();
    const container = $('#discCustomList');
    if (customs.length === 0) {
        container.innerHTML = '<p class="disc-empty-hint">尚未新增任何自訂商品</p>';
        return;
    }
    container.innerHTML = customs.map(p => `
        <div class="disc-custom-item">
            <span class="dci-icon">${p.icon}</span>
            <span class="dci-name">${p.name}</span>
            <span class="dci-price">$${p.price} → $${discPrice(p)}</span>
            <button class="dci-del" onclick="discDeleteCustom('${p.id}')">🗑️</button>
        </div>
    `).join('');
}

window.discDeleteCustom = function(id) {
    let customs = loadCustomProducts();
    const prod = customs.find(p => p.id === id);
    customs = customs.filter(p => p.id !== id);
    saveCustomProducts(customs);
    // 如果在購物車中，移除
    delete discCart[id];
    renderDiscProducts();
    renderDiscCustomList();
    renderDiscCart();
    if (prod) showToast('✖️ 已刪除：' + prod.name);
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

// ---- 渲染品項卡片 ----
function renderDiscProducts() {
    const grid = $('#discProductGrid');
    grid.innerHTML = getAllProducts().map(p => {
        const sale = discPrice(p);
        const save = discSaving(p);
        return `
        <div class="disc-prod-card" id="dpc-${p.id}" data-id="${p.id}" onclick="discAddOne('${p.id}')">
            <div class="dpc-icon">${p.icon}</div>
            <div class="dpc-name">${p.name}</div>
            <div class="dpc-prices">
                <span class="dpc-orig">$${p.price}</span>
                <span class="dpc-sale">$${sale}</span>
            </div>
            <div class="dpc-saving">省 $${save}</div>
            <div class="dpc-qty-badge" id="dqb-${p.id}" style="display:none;">0</div>
        </div>`;
    }).join('');
    // 重渲染後恢覆購物車徐章
    Object.keys(discCart).forEach(id => updateDiscBadge(id));
}

// ---- 加一件 ----
window.discAddOne = function(id) {
    discCart[id] = (discCart[id] || 0) + 1;
    renderDiscCart();
    updateDiscBadge(id);
};

// ---- 更新卡片上的數量徽章 ----
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

// ---- 渲染計算機清單 ----
function renderDiscCart() {
    const keys = Object.keys(discCart).filter(k => discCart[k] > 0);
    const section = $('#discCartSection');

    if (keys.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = '';

    let totalOrig = 0, totalSale = 0;

    $('#discCartList').innerHTML = keys.map(id => {
        const p = DISC_PRODUCTS.find(x => x.id === id);
        const qty = discCart[id];
        const sale = discPrice(p);
        const rowOrig = p.price * qty;
        const rowSale = sale * qty;
        totalOrig += rowOrig;
        totalSale += rowSale;
        return `
        <div class="disc-cart-row">
            <div class="dcr-info">
                <span class="dcr-icon">${p.icon}</span>
                <span class="dcr-name">${p.name}</span>
                <span class="dcr-unit">$${p.price} → <strong>$${sale}</strong></span>
            </div>
            <div class="dcr-ctrl">
                <button class="dcr-btn" onclick="discChangeQty('${id}', -1)">−</button>
                <span class="dcr-qty">${qty}</span>
                <button class="dcr-btn" onclick="discChangeQty('${id}', 1)">+</button>
                <span class="dcr-subtotal">$${rowSale}</span>
            </div>
        </div>`;
    }).join('');

    const totalSaving = totalOrig - totalSale;
    $('#discSummary').innerHTML = `
        <div class="disc-sum-row">
            <span>原價合計</span>
            <span class="disc-sum-orig">$${totalOrig}</span>
        </div>
        <div class="disc-sum-row">
            <span>8折優惠價</span>
            <span class="disc-sum-sale">$${totalSale}</span>
        </div>
        <div class="disc-sum-row disc-sum-saving-row">
            <span>💰 總共折價</span>
            <span class="disc-sum-saving">省 $${totalSaving}</span>
        </div>`;
}

// ---- 調整數量 ----
window.discChangeQty = function(id, delta) {
    discCart[id] = Math.max(0, (discCart[id] || 0) + delta);
    if (discCart[id] === 0) delete discCart[id];
    updateDiscBadge(id);
    renderDiscCart();
};
