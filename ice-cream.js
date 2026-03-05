/**
 * 冰淇淋叫貨系統 – 核心邏輯 (ES Module + Firebase)
 */

import { db, ref, push, onValue, remove, get, query, orderByChild, limitToLast }
    from './firebase-config.js';

'use strict';

const $ = (sel) => document.querySelector(sel);
const UNITS_PER_BOX = 12;
const ORDER_TO_DELIVER_DAYS = 12;
const IC_DB_PATH = 'ic_history';

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
    initIceCreamStatus();
    const form = $('#icOrderForm');
    if (form) form.addEventListener('submit', handleIcSubmit);

    // Safety preset buttons
    const presets = document.querySelectorAll('#icSafetyPresets .safety-btn');
    presets.forEach((btn) => {
        btn.addEventListener('click', () => {
            presets.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            $('#icSafetyDays').value = btn.dataset.days;
        });
    });

    // Coverage mode buttons
    const modeBtns = document.querySelectorAll('#icCoverageModes .coverage-mode-btn');
    modeBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            $('#icCoverageMode').value = btn.dataset.mode;
        });
    });

    // Load history (real-time Firebase listener)
    loadIcHistory();

    const clearBtn = $('#icBtnClearHistory');
    if (clearBtn) clearBtn.addEventListener('click', clearIcHistory);
});

// ---- Date Helpers ----
function getToday() { return new Date(); }

function getNthFriday(year, month, n) {
    const first = new Date(year, month, 1);
    let day = 1;
    const dow = first.getDay();
    const toFirstFri = (5 - dow + 7) % 7;
    day += toFirstFri;
    day += (n - 1) * 7;
    const result = new Date(year, month, day);
    if (result.getMonth() !== month) return null;
    return result;
}

function getDeliverDate(orderDate) {
    const d = new Date(orderDate);
    d.setDate(d.getDate() + ORDER_TO_DELIVER_DAYS);
    return d;
}

function getUpcomingCycles() {
    const today = getToday();
    const results = [];
    for (let m = 0; m < 5; m++) {
        const d = new Date(today.getFullYear(), today.getMonth() + m, 1);
        const year = d.getFullYear();
        const month = d.getMonth();
        [1, 3].forEach((n) => {
            const orderDate = getNthFriday(year, month, n);
            if (orderDate) results.push({ orderDate, deliverDate: getDeliverDate(orderDate) });
        });
    }
    results.sort((a, b) => a.orderDate - b.orderDate);
    return results;
}

function getNextCycleInfo(mode) {
    mode = mode || 'two-cycle';
    const today = getToday();
    today.setHours(0, 0, 0, 0);
    const cycles = getUpcomingCycles();

    let nextIdx = cycles.findIndex(c => c.orderDate >= today);
    if (nextIdx === -1) nextIdx = cycles.length - 1;

    const next = cycles[nextIdx];
    const nextNext = cycles[nextIdx + 1] || null;
    const nextNextNext = cycles[nextIdx + 2] || null;

    const daysToOrder = Math.ceil((next.orderDate - today) / 86400000);
    const daysToDeliver = Math.ceil((next.deliverDate - today) / 86400000);

    let targetDate;
    if (mode === 'one-cycle') {
        targetDate = nextNext ? nextNext.deliverDate : new Date(next.deliverDate.getTime() + 14 * 86400000);
    } else {
        if (nextNextNext) targetDate = nextNextNext.deliverDate;
        else if (nextNext) targetDate = new Date(nextNext.deliverDate.getTime() + 14 * 86400000);
        else targetDate = new Date(next.deliverDate.getTime() + 28 * 86400000);
    }

    const coverDays = Math.ceil((targetDate - today) / 86400000);

    return {
        nextOrderDate: next.orderDate,
        nextDeliverDate: next.deliverDate,
        daysToOrder, daysToDeliver, coverDays, targetDate, mode,
        nextNextDeliverDate: nextNext ? nextNext.deliverDate : null,
    };
}

// ---- Status Banner ----
function initIceCreamStatus() {
    const info = getNextCycleInfo();
    const text = $('#icStatusText');
    const banner = $('#icStatusBanner');
    if (!text || !banner) return;

    const fmtD = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    if (info.daysToOrder === 0) {
        text.textContent = `🔔 今天是訂貨日！下次到貨: ${fmtD(info.nextDeliverDate)}`;
        banner.className = 'status-banner warn';
    } else {
        text.textContent = `距下次訂貨還有 ${info.daysToOrder} 天（${fmtD(info.nextOrderDate)}），到貨 ${fmtD(info.nextDeliverDate)}`;
        banner.className = 'status-banner';
    }
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
function calcProduct(stock, weekdayUsage, holidayUsage, safetyDays, cycleInfo) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalPeriod = countWeekdaysAndHolidays(today, cycleInfo.targetDate);
    const totalConsume = totalPeriod.weekdays * weekdayUsage + totalPeriod.holidays * holidayUsage;

    const totalDays = totalPeriod.weekdays + totalPeriod.holidays;
    const avgDailyUsage = totalDays > 0 ? totalConsume / totalDays : weekdayUsage;
    const safetyStock = avgDailyUsage * safetyDays;

    const rawQty = totalConsume + safetyStock - stock;
    const recommendedQty = Math.max(0, Math.ceil(rawQty));

    const overallAvg = (weekdayUsage * 5 + holidayUsage * 2) / 7;
    const stockDays = overallAvg > 0 ? Math.round((stock / overallAvg) * 10) / 10 : Infinity;

    let urgency = 'ok';
    if (stockDays < cycleInfo.daysToDeliver) urgency = 'urgent';
    else if (stockDays < cycleInfo.daysToDeliver + 2) urgency = 'warn';

    return {
        stock, weekdayUsage, holidayUsage,
        totalConsume: Math.round(totalConsume * 10) / 10,
        safetyStock: Math.round(safetyStock * 10) / 10,
        recommendedQty,
        recommendedUnits: recommendedQty * UNITS_PER_BOX,
        stockDays, urgency,
        coverWeekdays: totalPeriod.weekdays,
        coverHolidays: totalPeriod.holidays,
    };
}

// ---- Render ----
function fmtDate(d) { return `${d.getMonth() + 1}/${d.getDate()}`; }
function dayName(d) { return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]; }

function renderIcResults(vanilla, milk, cycleInfo, safetyDays) {
    const section = $('#icResultsSection');
    section.style.display = '';

    $('#icScheduleCard').innerHTML = `
        <div class="sch-row">
            <span class="sch-label">下次訂貨日</span>
            <span class="sch-value ${cycleInfo.daysToOrder === 0 ? 'warn-date' : 'highlight-date'}">${fmtDate(cycleInfo.nextOrderDate)}（週${dayName(cycleInfo.nextOrderDate)}）${cycleInfo.daysToOrder === 0 ? '📢 今天！' : `還有 ${cycleInfo.daysToOrder} 天`}</span>
        </div>
        <div class="sch-row">
            <span class="sch-label">預計到貨日</span>
            <span class="sch-value">${fmtDate(cycleInfo.nextDeliverDate)}（週${dayName(cycleInfo.nextDeliverDate)}）還有 ${cycleInfo.daysToDeliver} 天</span>
        </div>
        <div class="sch-row">
            <span class="sch-label">建議涵蓋至</span>
            <span class="sch-value">${fmtDate(cycleInfo.targetDate)}（共 ${cycleInfo.coverDays} 天，${cycleInfo.mode === 'one-cycle' ? '1 個交貨週期' : '2 個交貨週期'}）</span>
        </div>`;

    const needOrder = vanilla.recommendedQty > 0 || milk.recommendedQty > 0;
    const totalBoxes = vanilla.recommendedQty + milk.recommendedQty;

    $('#icResultCards').innerHTML = `
        <div class="r-card highlight ic-highlight">
            <div class="r-card-label">建議叫貨</div>
            <div class="r-card-value">${needOrder ? '需要叫貨 📦' : '不需叫貨 ✅'}</div>
            <div class="r-card-sub">${needOrder ? `共 ${totalBoxes} 箱` : '庫存充足'}</div>
        </div>
        <div class="r-card">
            <div class="r-card-label">🍨 香草粉</div>
            <div class="r-card-value">${vanilla.recommendedQty > 0 ? vanilla.recommendedQty + ' 箱' : '✅ 夠用'}</div>
            <div class="r-card-sub">${vanilla.recommendedQty > 0 ? vanilla.recommendedUnits + ' 包' : `庫存可撐 ${vanilla.stockDays} 天`}</div>
        </div>
        <div class="r-card">
            <div class="r-card-label">🥛 保久乳</div>
            <div class="r-card-value">${milk.recommendedQty > 0 ? milk.recommendedQty + ' 箱' : '✅ 夠用'}</div>
            <div class="r-card-sub">${milk.recommendedQty > 0 ? milk.recommendedUnits + ' 罐' : `庫存可撐 ${milk.stockDays} 天`}</div>
        </div>`;

    function productDetail(name, icon, unitName, data) {
        const urgClass = data.urgency === 'urgent' ? 'danger' : data.urgency;
        const urgLabel = data.urgency === 'urgent' ? '⚠️ 庫存不足' : data.urgency === 'warn' ? '⚡ 偏低' : '✅ 正常';
        const weekdayUnits = Math.round(data.weekdayUsage * UNITS_PER_BOX * 10) / 10;
        const holidayUnits = Math.round(data.holidayUsage * UNITS_PER_BOX * 10) / 10;
        return `
            <div class="product-result">
                <div class="product-result-header">${icon} ${name}</div>
                <div class="detail-row"><span class="detail-label">目前庫存</span><span class="pr-value">${data.stock} 箱（${data.stock * UNITS_PER_BOX} ${unitName}）</span></div>
                <div class="detail-row"><span class="detail-label">平日用量</span><span class="pr-value">${weekdayUnits} ${unitName}/天</span></div>
                <div class="detail-row"><span class="detail-label">假日用量</span><span class="pr-value">${holidayUnits} ${unitName}/天</span></div>
                <div class="detail-row"><span class="detail-label">涵蓋期間天數</span><span class="pr-value">平日 ${data.coverWeekdays} 天 / 假日 ${data.coverHolidays} 天</span></div>
                <div class="detail-row"><span class="detail-label">期間總耗量</span><span class="pr-value">${data.totalConsume} 箱</span></div>
                <div class="detail-row"><span class="detail-label">安全庫存</span><span class="pr-value">${data.safetyStock} 箱（${safetyDays} 天）</span></div>
                <div class="detail-row"><span class="detail-label">庫存可撐</span><span class="pr-value">${data.stockDays} 天</span></div>
                <div class="detail-row"><span class="detail-label">庫存狀態</span><span class="pr-value ${urgClass}">${urgLabel}</span></div>
            </div>`;
    }

    $('#icDetailBox').innerHTML = productDetail('香草粉', '🍨', '包', vanilla)
        + productDetail('保久乳', '🥛', '罐', milk);

    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- History (Firebase Realtime Database) ----
function loadIcHistory() {
    const histRef = query(ref(db, IC_DB_PATH), orderByChild('timestamp'), limitToLast(10));
    onValue(histRef, (snapshot) => {
        const entries = [];
        snapshot.forEach(child => entries.push(child.val()));
        entries.reverse(); // newest first

        const section = $('#icHistorySection');
        const list = $('#icHistoryList');
        if (!section || !list) return;

        if (entries.length === 0) {
            section.style.display = 'none';
            return;
        }
        section.style.display = '';
        list.innerHTML = entries.map((e) => {
            const modeLabel = e.mode === 'one-cycle' ? '兩週' : '整月';
            return `
                <div class="history-item ic-history-item"
                    data-vs="${e.vanillaStock}" data-vw="${e.vanillaWeekday}" data-vh="${e.vanillaHoliday}"
                    data-ms="${e.milkStock}" data-mw="${e.milkWeekday}" data-mh="${e.milkHoliday}"
                    data-safety="${e.safetyDays}" data-mode="${e.mode}">
                    <div>
                        <span>🍨 香草粉 庫存 ${e.vanillaStock}箱｜平日 ${e.vanillaWeekday}包｜假日 ${e.vanillaHoliday}包</span><br>
                        <span>🥛 保久乳 庫存 ${e.milkStock}箱｜平日 ${e.milkWeekday}罐｜假日 ${e.milkHoliday}罐</span>
                    </div>
                    <div>
                        <span class="hi-result">共 ${e.totalBoxes} 箱（${modeLabel}）</span>
                        <span class="hi-date">${e.date}</span>
                    </div>
                </div>`;
        }).join('');

        list.querySelectorAll('.ic-history-item').forEach((el) => {
            el.addEventListener('click', () => {
                $('#icVanillaStock').value = el.dataset.vs;
                $('#icVanillaWeekday').value = el.dataset.vw;
                $('#icVanillaHoliday').value = el.dataset.vh;
                $('#icMilkStock').value = el.dataset.ms;
                $('#icMilkWeekday').value = el.dataset.mw;
                $('#icMilkHoliday').value = el.dataset.mh;

                const safetyDays = parseFloat(el.dataset.safety);
                $('#icSafetyDays').value = safetyDays;
                document.querySelectorAll('#icSafetyPresets .safety-btn').forEach((btn) => {
                    btn.classList.toggle('active', parseFloat(btn.dataset.days) === safetyDays);
                });

                const mode = el.dataset.mode;
                $('#icCoverageMode').value = mode;
                document.querySelectorAll('#icCoverageModes .coverage-mode-btn').forEach((btn) => {
                    btn.classList.toggle('active', btn.dataset.mode === mode);
                });

                $('#icOrderForm').dispatchEvent(new Event('submit', { cancelable: true }));
            });
        });
    });
}

async function saveIcHistory(entry) {
    try {
        const histRef = ref(db, IC_DB_PATH);
        await push(histRef, { ...entry, timestamp: Date.now() });

        // Trim to 10 entries
        const snapshot = await get(query(histRef, orderByChild('timestamp')));
        if (snapshot.exists()) {
            const keys = [];
            snapshot.forEach(child => keys.push(child.key));
            if (keys.length > 10) {
                for (const key of keys.slice(0, keys.length - 10)) {
                    await remove(ref(db, `${IC_DB_PATH}/${key}`));
                }
            }
        }
    } catch (err) {
        console.error('Firebase save error:', err);
    }
}

function clearIcHistory() {
    remove(ref(db, IC_DB_PATH)).catch(err => console.error('Firebase clear error:', err));
}

// ---- Submit ----
function handleIcSubmit(e) {
    e.preventDefault();

    const vanillaStock = parseFloat($('#icVanillaStock').value);
    // 輸入單位：包/天 → 換算成箱/天（÷12）
    const vanillaWeekdayPkg = parseFloat($('#icVanillaWeekday').value);
    const vanillaHolidayPkg = parseFloat($('#icVanillaHoliday').value);
    const vanillaWeekday = vanillaWeekdayPkg / UNITS_PER_BOX;
    const vanillaHoliday = vanillaHolidayPkg / UNITS_PER_BOX;
    const milkStock = parseFloat($('#icMilkStock').value);
    // 輸入單位：罐/天 → 換算成箱/天（÷12）
    const milkWeekdayCan = parseFloat($('#icMilkWeekday').value);
    const milkHolidayCan = parseFloat($('#icMilkHoliday').value);
    const milkWeekday = milkWeekdayCan / UNITS_PER_BOX;
    const milkHoliday = milkHolidayCan / UNITS_PER_BOX;
    const safetyDays = parseFloat($('#icSafetyDays').value) || 1;

    if ([vanillaStock, vanillaWeekdayPkg, vanillaHolidayPkg, milkStock, milkWeekdayCan, milkHolidayCan].some(v => isNaN(v) || v < 0)) {
        alert('請輸入有效的庫存與用量！');
        return;
    }

    const mode = $('#icCoverageMode') ? $('#icCoverageMode').value : 'two-cycle';
    const cycleInfo = getNextCycleInfo(mode);
    const vanillaResult = calcProduct(vanillaStock, vanillaWeekday, vanillaHoliday, safetyDays, cycleInfo);
    const milkResult = calcProduct(milkStock, milkWeekday, milkHoliday, safetyDays, cycleInfo);

    renderIcResults(vanillaResult, milkResult, cycleInfo, safetyDays);

    const banner = $('#icStatusBanner');
    const text = $('#icStatusText');
    const needOrder = vanillaResult.recommendedQty > 0 || milkResult.recommendedQty > 0;
    const worstUrgency = [vanillaResult.urgency, milkResult.urgency].includes('urgent') ? 'urgent'
        : [vanillaResult.urgency, milkResult.urgency].includes('warn') ? 'warn' : 'ok';
    banner.className = 'status-banner' + (worstUrgency === 'warn' ? ' warn' : worstUrgency === 'urgent' ? ' urgent' : '');

    if (worstUrgency === 'urgent') {
        text.textContent = `⚠️ 部分品項庫存不足，可能撐不到到貨日！`;
    } else if (!needOrder) {
        text.textContent = `✅ 所有品項庫存充足，目前不需叫貨`;
    } else {
        const total = vanillaResult.recommendedQty + milkResult.recommendedQty;
        text.textContent = `建議叫貨共 ${total} 箱（${fmtDate(cycleInfo.nextOrderDate)} 訂貨，涵蓋至 ${fmtDate(cycleInfo.targetDate)}）`;
    }

    const now = new Date();
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    const dateStr = `${now.getMonth() + 1}/${now.getDate()} 週${days[now.getDay()]}`;
    saveIcHistory({
        vanillaStock,
        vanillaWeekday: vanillaWeekdayPkg,   // 存包
        vanillaHoliday: vanillaHolidayPkg,
        milkStock,
        milkWeekday: milkWeekdayCan,          // 存罐
        milkHoliday: milkHolidayCan,
        safetyDays, mode,
        totalBoxes: vanillaResult.recommendedQty + milkResult.recommendedQty,
        date: dateStr,
    });
    // onValue listener auto-updates the UI
}
