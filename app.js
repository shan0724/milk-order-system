/**
 * 牛奶叫貨系統 – 核心邏輯 (ES Module + Firebase)
 * 單位：箱（1 箱 = 20 瓶）
 * 用量：分平日（週一～週五）/ 假日（週六、週日）
 * ?›å¥¶?«è²¨ç³»çµ± ???¸å??è¼¯ (ES Module + Firebase)
 * ?®ä?ï¼šç®±ï¼? ç®?= 20 ?¶ï?
 * ?¨é?ï¼šå?å¹³æ—¥ï¼ˆé€±ä?ï½žé€±ä?ï¼? ?‡æ—¥ï¼ˆé€±å…­?é€±æ—¥ï¼?
*/

import { db, ref, push, onValue, remove, get, query, orderByChild, limitToLast }
@@ -10,13 +10,13 @@ import { db, ref, push, onValue, remove, get, query, orderByChild, limitToLast }
'use strict';

// ---- Constants ----
const DAY_NAMES = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const DAY_NAMES = ['?±æ—¥', '?±ä?', '?±ä?', '?±ä?', '?±å?', '?±ä?', '?±å…­'];
const BOTTLES_PER_BOX = 20;
const MILK_DB_PATH = 'milk_history';

const CYCLES = [
    { orderDay: 1, deliverDay: 2, coverDays: 3 },  // 週一訂 → 週二到
    { orderDay: 3, deliverDay: 5, coverDays: 3 },  // 週三訂 → 週五到
    { orderDay: 1, deliverDay: 2, coverDays: 3 },  // ?±ä?è¨????±ä???
    { orderDay: 3, deliverDay: 5, coverDays: 3 },  // ?±ä?è¨????±ä???
];

// ---- DOM Refs ----
@@ -64,7 +64,7 @@ function daysUntil(targetDay) {
return (targetDay - dayOfWeek() + 7) % 7;
}

// ---- 計算平日/假日天數 ----
// ---- è¨ˆç?å¹³æ—¥/?‡æ—¥å¤©æ•¸ ----
function countWeekdaysAndHolidays(fromDate, toDate) {
let weekdays = 0, holidays = 0;
const d = new Date(fromDate);
@@ -79,7 +79,7 @@ function countWeekdaysAndHolidays(fromDate, toDate) {
return { weekdays, holidays };
}

// ---- 核心計算 ----
// ---- ?¸å?è¨ˆç? ----
function calculate(currentStock, weekdayUsage, holidayUsage, safetyDays) {
const ranked = CYCLES.map((c) => {
let dOrder = daysUntil(c.orderDay);
@@ -94,32 +94,32 @@ function calculate(currentStock, weekdayUsage, holidayUsage, safetyDays) {
if (dNextNextDeliver <= next.dDeliver) dNextNextDeliver += 7;
const actualCoverDays = dNextNextDeliver - next.dDeliver;

    // 日期物件
    // ?¥æ??©ä»¶
const todayDate = today();
todayDate.setHours(0, 0, 0, 0);
const deliverDate = new Date(todayDate);
deliverDate.setDate(todayDate.getDate() + next.dDeliver);
const nextNextDeliverDate = new Date(todayDate);
nextNextDeliverDate.setDate(todayDate.getDate() + dNextNextDeliver);

    // 今天→到貨：計算到貨時剩餘庫存
    // ä»Šå¤©?’åˆ°è²¨ï?è¨ˆç??°è²¨?‚å‰©é¤˜åº«å­?
const period1 = countWeekdaysAndHolidays(todayDate, deliverDate);
const consumeToDeliver = period1.weekdays * weekdayUsage + period1.holidays * holidayUsage;
const stockAtDelivery = Math.max(0, currentStock - consumeToDeliver);

    // 到貨→下次到貨：需涵蓋的消耗量
    // ?°è²¨?’ä?æ¬¡åˆ°è²¨ï??€æ¶µè??„æ??—é?
const period2 = countWeekdaysAndHolidays(deliverDate, nextNextDeliverDate);
const consumeCoverPeriod = period2.weekdays * weekdayUsage + period2.holidays * holidayUsage;

    // 安全庫存：加權平均日用量 × 安全天數
    // å®‰å…¨åº«å?ï¼šå?æ¬Šå¹³?‡æ—¥?¨é? ? å®‰å…¨å¤©æ•¸
const coverTotalDays = period2.weekdays + period2.holidays;
const avgDailyUsage = coverTotalDays > 0 ? consumeCoverPeriod / coverTotalDays : weekdayUsage;
const safetyStock = avgDailyUsage * safetyDays;

const rawQty = consumeCoverPeriod + safetyStock - stockAtDelivery;
const recommendedQty = Math.max(0, Math.ceil(rawQty));

    // 庫存可撐幾天（加權平均）
    // åº«å??¯æ?å¹¾å¤©ï¼ˆå?æ¬Šå¹³?‡ï?
const overallAvg = (weekdayUsage * 5 + holidayUsage * 2) / 7;
const stockDays = overallAvg > 0 ? currentStock / overallAvg : Infinity;

@@ -157,22 +157,22 @@ function updateStatusBanner(result) {
const nearest = dOrder0 <= dOrder1 ? CYCLES[0] : CYCLES[1];
const d = daysUntil(nearest.orderDay);
if (d === 0) {
            text.textContent = `今天是 ${DAY_NAMES[nearest.orderDay]}，是訂貨日！請記得下單 🔔`;
            text.textContent = `ä»Šå¤©??${DAY_NAMES[nearest.orderDay]}ï¼Œæ˜¯è¨‚è²¨?¥ï?è«‹è?å¾—ä?????`;
banner.className = 'status-banner warn';
} else {
            text.textContent = `距離下次訂貨（${DAY_NAMES[nearest.orderDay]}）還有 ${d} 天`;
            text.textContent = `è·é›¢ä¸‹æ¬¡è¨‚è²¨ï¼?{DAY_NAMES[nearest.orderDay]}ï¼‰é???${d} å¤©`;
banner.className = 'status-banner';
}
return;
}

banner.className = 'status-banner' + (result.urgency === 'warn' ? ' warn' : result.urgency === 'urgent' ? ' urgent' : '');
if (result.urgency === 'urgent') {
        text.textContent = `⚠️ 庫存僅剩 ${result.stockDays} 天，可能撐不到到貨日！`;
        text.textContent = `? ï? åº«å??…å‰© ${result.stockDays} å¤©ï??¯èƒ½?ä??°åˆ°è²¨æ—¥ï¼`;
} else if (!result.needOrder) {
        text.textContent = `✅ 庫存充足，目前不需叫貨`;
        text.textContent = `??åº«å??…è¶³ï¼Œç›®?ä??€?«è²¨`;
} else {
        text.textContent = `建議叫貨 ${result.recommendedQty} 箱（${result.recommendedBottles} 瓶）（${DAY_NAMES[result.nextOrderDay]}訂）`;
        text.textContent = `å»ºè­°?«è²¨ ${result.recommendedQty} ç®±ï?${result.recommendedBottles} ?¶ï?ï¼?{DAY_NAMES[result.nextOrderDay]}è¨‚ï?`;
}
}

@@ -193,58 +193,58 @@ function renderResults(result, inputs) {
if (isDeliver) cls += ' deliver-day';
let tag = '';
if (isToday) tag = 'ä»Šå¤©';
        else if (isOrder && isDeliver) tag = '訂/到';
        else if (isOrder && isDeliver) tag = 'è¨???;
else if (isOrder) tag = 'è¨‚è²¨';
        else if (isDeliver) tag = '到貨';
        else if (isDeliver) tag = '?°è²¨';
tmpl.push(`<div class="${cls}"><div class="tl-dot"></div><div class="tl-day">${DAY_NAMES[d]}</div><div class="tl-tag">${tag}</div></div>`);
}
$('#timeline').innerHTML = tmpl.join('');

    const mainLabel = result.needOrder ? `${result.recommendedQty} 箱` : '不需叫貨 ✅';
    const mainLabel = result.needOrder ? `${result.recommendedQty} ç®±` : 'ä¸é??«è²¨ ??;
const mainSub = result.needOrder
        ? `${result.recommendedBottles} 瓶 ｜ ${DAY_NAMES[result.nextOrderDay]}訂貨 → ${DAY_NAMES[result.nextDeliverDay]}到貨`
        : '庫存充足';
        ? `${result.recommendedBottles} ??ï½?${DAY_NAMES[result.nextOrderDay]}è¨‚è²¨ ??${DAY_NAMES[result.nextDeliverDay]}?°è²¨`
        : 'åº«å??…è¶³';

const stockAtDeliveryRound = Math.round(result.stockAtDelivery * 10) / 10;
const stockAtDeliveryBottles = Math.round(result.stockAtDelivery * BOTTLES_PER_BOX);

$('#resultCards').innerHTML = `
     <div class="r-card highlight">
        <div class="r-card-label">建議叫貨量</div>
        <div class="r-card-label">å»ºè­°?«è²¨??/div>
       <div class="r-card-value">${mainLabel}</div>
       <div class="r-card-sub">${mainSub}</div>
     </div>
     <div class="r-card">
        <div class="r-card-label">庫存可撐</div>
        <div class="r-card-value">${result.stockDays} 天</div>
        <div class="r-card-label">åº«å??¯æ?</div>
        <div class="r-card-value">${result.stockDays} å¤?/div>
     </div>
     <div class="r-card">
        <div class="r-card-label">到貨時剩餘</div>
        <div class="r-card-value">${stockAtDeliveryRound} 箱</div>
        <div class="r-card-sub">${stockAtDeliveryBottles} 瓶</div>
        <div class="r-card-label">?°è²¨?‚å‰©é¤?/div>
        <div class="r-card-value">${stockAtDeliveryRound} ç®?/div>
        <div class="r-card-sub">${stockAtDeliveryBottles} ??/div>
     </div>
     <div class="r-card">
        <div class="r-card-label">距下次訂貨</div>
        <div class="r-card-value">${result.daysToOrder === 0 ? '今天' : result.daysToOrder + ' 天'}</div>
        <div class="r-card-label">è·ä?æ¬¡è?è²?/div>
        <div class="r-card-value">${result.daysToOrder === 0 ? 'ä»Šå¤©' : result.daysToOrder + ' å¤?}</div>
     </div>
     <div class="r-card">
        <div class="r-card-label">距下次到貨</div>
        <div class="r-card-value">${result.daysToDeliver} 天</div>
        <div class="r-card-label">è·ä?æ¬¡åˆ°è²?/div>
        <div class="r-card-value">${result.daysToDeliver} å¤?/div>
     </div>`;

   const statusClass = result.urgency === 'urgent' ? 'danger' : result.urgency;
    const statusLabel = result.urgency === 'urgent' ? '⚠️ 庫存不足' : result.urgency === 'warn' ? '⚡ 庫存偏低' : '✅ 正常';
    const statusLabel = result.urgency === 'urgent' ? '? ï? åº«å?ä¸è¶³' : result.urgency === 'warn' ? '??åº«å??ä?' : '??æ­?¸¸';
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
      <div class="detail-row"><span class="detail-label">?®å?åº«å?</span><span class="detail-value">${inputs.currentStock} ç®±ï?${inputs.currentStock * BOTTLES_PER_BOX} ?¶ï?</span></div>
      <div class="detail-row"><span class="detail-label">å¹³æ—¥?¨é?</span><span class="detail-value">${inputs.weekdayUsage} ç®?å¤©ï?${inputs.weekdayUsage * BOTTLES_PER_BOX} ?¶ï?</span></div>
      <div class="detail-row"><span class="detail-label">?‡æ—¥?¨é?</span><span class="detail-value">${inputs.holidayUsage} ç®?å¤©ï?${inputs.holidayUsage * BOTTLES_PER_BOX} ?¶ï?</span></div>
      <div class="detail-row"><span class="detail-label">æ¶µè??Ÿé?å¤©æ•¸</span><span class="detail-value">å¹³æ—¥ ${result.period2.weekdays} å¤?/ ?‡æ—¥ ${result.period2.holidays} å¤?/span></div>
      <div class="detail-row"><span class="detail-label">å®‰å…¨åº«å?</span><span class="detail-value">${safetyBoxes} ç®±ï?${safetyBottles} ??/ ${inputs.safetyDays} å¤©ï?</span></div>
      <div class="detail-row"><span class="detail-label">?°è²¨å¾Œé?æ¶µè?</span><span class="detail-value">${result.coverDays} å¤?/span></div>
      <div class="detail-row"><span class="detail-label">åº«å??€??/span><span class="detail-value ${statusClass}">${statusLabel}</span></div>`;

   resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
@@ -267,17 +267,17 @@ function loadHistory() {
           const weekday = e.weekdayUsage ?? e.usage;
           const holiday = e.holidayUsage ?? (e.usage * (e.multiplier || 1));
           const holidayDisplay = e.weekdayUsage != null
                ? `假日 ${holiday} 箱`
                : (e.multiplier > 1 ? ` ×${e.multiplier}` : '');
                ? `?‡æ—¥ ${holiday} ç®±`
                : (e.multiplier > 1 ? ` ?${e.multiplier}` : '');
           return `
     <div class="history-item"
         data-weekday="${weekday}" data-holiday="${holiday}"
         data-safety="${e.safety}">
       <div>
          <span>庫存 ${e.stock} 箱｜平日 ${weekday} 箱/天｜${e.weekdayUsage != null ? `假日 ${holiday} 箱/天` : `用量 ${weekday} 箱${holidayDisplay}`}</span>
          <span>åº«å? ${e.stock} ç®±ï?å¹³æ—¥ ${weekday} ç®?å¤©ï?${e.weekdayUsage != null ? `?‡æ—¥ ${holiday} ç®?å¤©` : `?¨é? ${weekday} ç®?{holidayDisplay}`}</span>
       </div>
       <div>
          <span class="hi-result">${e.result} 箱</span>
          <span class="hi-result">${e.result} ç®?/span>
         <span class="hi-date">${e.date}</span>
       </div>
     </div>`;
@@ -329,7 +329,7 @@ function handleSubmit(e) {
   const safetyDays = parseFloat($('#safetyDays').value) || 1;

   if (isNaN(currentStock) || isNaN(weekdayUsage) || weekdayUsage <= 0 || isNaN(holidayUsage) || holidayUsage < 0) {
        alert('請輸入有效的庫存與用量！');
        alert('è«‹è¼¸?¥æ??ˆç?åº«å??‡ç”¨?ï?');
       return;
   }

@@ -353,45 +353,52 @@ function handleSubmit(e) {
// ==================== DISCOUNT TAB ==========================
// ============================================================

const DISC_RATE = 0.8; // 8折
const DISC_RATE = 0.8; // 8??

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
    { id: 'p01', name: '?–å•¡?¥é?ä¹?,     price: 125, icon: '?ª' },
    { id: 'p02', name: 'æµ·è??„é?',       price: 130, icon: '?Œ¿' },
    { id: 'p03', name: '?šå‘³?›å¥¶æ£?,     price: 130, icon: '??' },
    { id: 'p04', name: 'èµ·å¸?¡æ?æ£?,     price: 130, icon: '??' },
    { id: 'p05', name: 'æ³•å?é¦™è?é¤…ä¹¾',   price: 100, icon: '??' },
    { id: 'p06', name: 'é¦™è??ä?å¥‡æ™®',   price: 130, icon: '?Œ¸' },
    { id: 'p07', name: 'å·§å??›æ?ä»å???, price: 135, icon: '?«' },
    { id: 'p08', name: 'é¦™è?å·§å??›é?ä¹?, price: 145, icon: '?¦' },
    { id: 'p09', name: '?‘å?å¯¶ç±³??,     price:  30, icon: '??' },
    { id: 'p10', name: 'é³³å‡°??,         price:  32, icon: '?¦' },
    { id: 'p11', name: '?‘ç?é³³æ¢¨??,     price:  45, icon: '??' },
    { id: 'p12', name: '?œé?å¤å?å¤·è?å¡?, price:  50, icon: '?Œº' },
    { id: 'p13', name: '?‰é??¥é?',       price:  45, icon: '?? },
    { id: 'p14', name: 'QQå¸ƒæ?å°?,       price:  35, icon: '?¬' },
    { id: 'p15', name: 'é¦™è?å¥¶æ²¹é¤…ä¹¾',   price:  65, icon: '??' },
    { id: 'p16', name: '?¡æ?å°å???,     price:  60, icon: '??' },
];

// 購物車：{ id -> qty }
// è³¼ç‰©è»Šï?{ id -> qty }
const discCart = {};

// LocalStorage key for custom products
const CUSTOM_PROD_KEY = 'disc_custom_products';
// LocalStorage keys
const CUSTOM_PROD_KEY   = 'disc_custom_products';
const DISC_DELETED_KEY  = 'disc_deleted_ids';

function loadCustomProducts() {
    try {
        return JSON.parse(localStorage.getItem(CUSTOM_PROD_KEY) || '[]');
    } catch { return []; }
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
    return [...DISC_PRODUCTS, ...loadCustomProducts()];
    const deleted = loadDeletedIds();
    const defaults = DISC_PRODUCTS.filter(p => !deleted.has(p.id));
    return [...defaults, ...loadCustomProducts()];
}

function discPrice(p) { return Math.round(p.price * DISC_RATE); }
@@ -400,85 +407,90 @@ function discSaving(p) { return p.price - discPrice(p); }
function initDiscountTab() {
renderDiscProducts();

    // 清空計算機
    // æ¸…ç©ºè¨ˆç?æ©?
$('#discClearCart').addEventListener('click', () => {
Object.keys(discCart).forEach(k => delete discCart[k]);
renderDiscCart();
});

    // ----- 設定 Modal 開閉 -----
    // ----- è¨­å? Modal ?‹é? -----
$('#discOpenSettings').addEventListener('click', openDiscModal);
$('#discModalClose').addEventListener('click', closeDiscModal);
$('#discModalOverlay').addEventListener('click', (e) => {
if (e.target === $('#discModalOverlay')) closeDiscModal();
});

    // 新增商品
    // ?°å??†å?
$('#discAddProduct').addEventListener('click', () => {
        const icon  = $('#newProdIcon').value.trim()  || '📦';
const name  = $('#newProdName').value.trim();
const price = parseInt($('#newProdPrice').value);

        if (!name) { shakeInput($('#newProdName')); return; }
        if (!name)  { shakeInput($('#newProdName'));  return; }
if (!price || price < 1) { shakeInput($('#newProdPrice')); return; }

const customs = loadCustomProducts();
const newId = 'c' + Date.now();
        customs.push({ id: newId, name, price, icon, custom: true });
        customs.push({ id: newId, name, price, custom: true });
saveCustomProducts(customs);

        // 清空輸入
        $('#newProdIcon').value = '';
        $('#newProdName').value = '';
        $('#newProdName').value  = '';
$('#newProdPrice').value = '';

renderDiscProducts();
        renderDiscCustomList();
        showToast('✅ 已新增：' + name);
        renderAllProductsInModal();
        showToast('??å·²æ–°å¢žï?' + name);
});
}

function openDiscModal() {
    renderDiscCustomList();
    const overlay = $('#discModalOverlay');
    overlay.classList.add('open');
    renderAllProductsInModal();
    $('#discModalOverlay').classList.add('open');
document.body.style.overflow = 'hidden';
}

function closeDiscModal() {
    const overlay = $('#discModalOverlay');
    overlay.classList.remove('open');
    $('#discModalOverlay').classList.remove('open');
document.body.style.overflow = '';
}

function renderDiscCustomList() {
    const customs = loadCustomProducts();
// ---- é¡¯ç¤º?€?‰å??ï??«é?è¨?+ ?ªè?ï¼‰å¯?ªé™¤ ----
function renderAllProductsInModal() {
    const all = getAllProducts();
const container = $('#discCustomList');
    if (customs.length === 0) {
        container.innerHTML = '<p class="disc-empty-hint">尚未新增任何自訂商品</p>';
    if (all.length === 0) {
        container.innerHTML = '<p class="disc-empty-hint">?€?‰å??å·²ç§»é™¤</p>';
return;
}
    container.innerHTML = customs.map(p => `
    container.innerHTML = all.map(p => `
       <div class="disc-custom-item">
            <span class="dci-icon">${p.icon}</span>
           <span class="dci-name">${p.name}</span>
            <span class="dci-price">$${p.price} → $${discPrice(p)}</span>
            <button class="dci-del" onclick="discDeleteCustom('${p.id}')">🗑️</button>
            <span class="dci-price">$${p.price} ??$${discPrice(p)}</span>
            <button class="dci-del" onclick="discDeleteProduct('${p.id}', event)" title="ç§»é™¤æ­¤å???>??ï¸?/button>
       </div>
   `).join('');
}

window.discDeleteCustom = function(id) {
    let customs = loadCustomProducts();
    const prod = customs.find(p => p.id === id);
    customs = customs.filter(p => p.id !== id);
    saveCustomProducts(customs);
    // 如果在購物車中，移除
// ---- ?ªé™¤ä»»æ??†å?ï¼ˆé?è¨­æ??ªè?ï¼?---
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
    renderDiscCustomList();
    renderAllProductsInModal();
renderDiscCart();
    if (prod) showToast('✖️ 已刪除：' + prod.name);
    if (prod) showToast('?–ï? å·²ç§»?¤ï?' + prod.name);
};

function shakeInput(el) {
@@ -501,36 +513,42 @@ function showToast(msg) {
setTimeout(() => { toast.style.transform = 'translateX(-50%) translateY(80px)'; toast.style.opacity = '0'; }, 2200);
}

// ---- 渲染品項卡片 ----
// ---- æ¸²æ??é??¡ç?ï¼ˆç„¡?–ç¤ºï¼Œæ??ªé™¤?‰é?ï¼?---
function renderDiscProducts() {
const grid = $('#discProductGrid');
    grid.innerHTML = getAllProducts().map(p => {
    const all = getAllProducts();
    if (all.length === 0) {
        grid.innerHTML = '<p class="disc-empty-hint" style="grid-column:1/-1;padding:24px 0;text-align:center;">?€?‰å??å·²ç§»é™¤ï¼Œè??³ã€Œç®¡?†å??ã€æ–°å¢?/p>';
        return;
    }
    grid.innerHTML = all.map(p => {
const sale = discPrice(p);
const save = discSaving(p);
return `
        <div class="disc-prod-card" id="dpc-${p.id}" data-id="${p.id}" onclick="discAddOne('${p.id}')">
            <div class="dpc-icon">${p.icon}</div>
            <div class="dpc-name">${p.name}</div>
            <div class="dpc-prices">
                <span class="dpc-orig">$${p.price}</span>
                <span class="dpc-sale">$${sale}</span>
        <div class="disc-prod-card" id="dpc-${p.id}" data-id="${p.id}">
            <button class="dpc-del-btn" onclick="discDeleteProduct('${p.id}', event)" title="ç§»é™¤">??/button>
            <div class="dpc-click-area" onclick="discAddOne('${p.id}')">
                <div class="dpc-name">${p.name}</div>
                <div class="dpc-prices">
                    <span class="dpc-orig">$${p.price}</span>
                    <span class="dpc-sale">$${sale}</span>
                </div>
                <div class="dpc-saving">??$${save}</div>
           </div>
            <div class="dpc-saving">省 $${save}</div>
           <div class="dpc-qty-badge" id="dqb-${p.id}" style="display:none;">0</div>
       </div>`;
}).join('');
    // 重渲染後恢覆購物車徐章
Object.keys(discCart).forEach(id => updateDiscBadge(id));
}

// ---- 加一件 ----
// ---- ? ä?ä»?----
window.discAddOne = function(id) {
discCart[id] = (discCart[id] || 0) + 1;
renderDiscCart();
updateDiscBadge(id);
};

// ---- 更新卡片上的數量徽章 ----
// ---- ?´æ–°?¡ç?ä¸Šç??¸é?å¾½ç? ----
function updateDiscBadge(id) {
const badge = document.getElementById('dqb-' + id);
const card  = document.getElementById('dpc-' + id);
@@ -544,21 +562,25 @@ function updateDiscBadge(id) {
}
}

// ---- 渲染計算機清單 ----
// ---- æ¸²æ?è¨ˆç?æ©Ÿæ??®ï?æ°¸é?é¡¯ç¤ºï¼›ç©º?‚é¡¯ç¤ºæ?ç¤ºï?----
function renderDiscCart() {
const keys = Object.keys(discCart).filter(k => discCart[k] > 0);
    const section = $('#discCartSection');
    const clearBtn = $('#discClearCart');

if (keys.length === 0) {
        section.style.display = 'none';
        $('#discCartList').innerHTML = '<p class="disc-cart-empty">??é»žæ?å·¦å´?é?? å…¥</p>';
        $('#discSummary').innerHTML  = '';
        if (clearBtn) clearBtn.style.display = 'none';
return;
}
    section.style.display = '';
    if (clearBtn) clearBtn.style.display = '';

    const allProds = getAllProducts();
let totalOrig = 0, totalSale = 0;

$('#discCartList').innerHTML = keys.map(id => {
        const p = DISC_PRODUCTS.find(x => x.id === id);
        const p = allProds.find(x => x.id === id);
        if (!p) return '';
const qty = discCart[id];
const sale = discPrice(p);
const rowOrig = p.price * qty;
@@ -568,12 +590,11 @@ function renderDiscCart() {
return `
       <div class="disc-cart-row">
           <div class="dcr-info">
                <span class="dcr-icon">${p.icon}</span>
               <span class="dcr-name">${p.name}</span>
                <span class="dcr-unit">$${p.price} → <strong>$${sale}</strong></span>
                <span class="dcr-unit">$${p.price}??strong>$${sale}</strong></span>
           </div>
           <div class="dcr-ctrl">
                <button class="dcr-btn" onclick="discChangeQty('${id}', -1)">−</button>
                <button class="dcr-btn" onclick="discChangeQty('${id}', -1)">??/button>
               <span class="dcr-qty">${qty}</span>
               <button class="dcr-btn" onclick="discChangeQty('${id}', 1)">+</button>
               <span class="dcr-subtotal">$${rowSale}</span>
@@ -584,23 +605,29 @@ function renderDiscCart() {
const totalSaving = totalOrig - totalSale;
$('#discSummary').innerHTML = `
       <div class="disc-sum-row">
            <span>原價合計</span>
            <span>?Ÿåƒ¹?ˆè?</span>
           <span class="disc-sum-orig">$${totalOrig}</span>
       </div>
       <div class="disc-sum-row">
            <span>8折優惠價</span>
            <span>8?˜å„ª? åƒ¹</span>
           <span class="disc-sum-sale">$${totalSale}</span>
       </div>
       <div class="disc-sum-row disc-sum-saving-row">
            <span>💰 總共折價</span>
            <span class="disc-sum-saving">省 $${totalSaving}</span>
            <span>?’° ç¸½å…±?˜åƒ¹</span>
            <span class="disc-sum-saving">??$${totalSaving}</span>
       </div>`;
}

// ---- 調整數量 ----
// ---- èª¿æ•´?¸é? ----
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
