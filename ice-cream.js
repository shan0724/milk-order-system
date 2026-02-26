/**
 * 冰淇淋叫貨系統 – 核心邏輯
 * 叫貨週期：每月第 1 個週五、第 3 個週五下單
 * 到貨：下單後 12 天（兩週後的週三）
 * 品項：香草粉（1 箱=12 包）、保久乳（1 箱=12 罐）
 * 用量：分平日 / 假日
 */

(function () {
    'use strict';

    const $ = (sel) => document.querySelector(sel);
    const UNITS_PER_BOX = 12;          // 香草粉 12 包/箱，保久乳 12 罐/箱
    const ORDER_TO_DELIVER_DAYS = 12;  // 下單到到貨天數

    // ---- Init ----
    document.addEventListener('DOMContentLoaded', () => {
        initIceCreamStatus();
        const form = $('#icOrderForm');
        if (form) form.addEventListener('submit', handleIcSubmit);
    });

    // ---- Date Helpers ----

    function getToday() { return new Date(); }

    /**
     * 找出某月份的第 N 個週五 (n: 1-based)
     */
    function getNthFriday(year, month, n) {
        const first = new Date(year, month, 1);
        // 找到這個月第一個週五
        let day = 1;
        const dow = first.getDay(); // 0=Sun
        // 距離第一個週五的天數
        const toFirstFri = (5 - dow + 7) % 7;
        day += toFirstFri;
        // 第 n 個週五
        day += (n - 1) * 7;
        const result = new Date(year, month, day);
        // 確保還在同一個月
        if (result.getMonth() !== month) return null;
        return result;
    }

    /**
     * 取得下單日對應的到貨日 (下單後 12 天)
     */
    function getDeliverDate(orderDate) {
        const d = new Date(orderDate);
        d.setDate(d.getDate() + ORDER_TO_DELIVER_DAYS);
        return d;
    }

    /**
     * 取得所有未來的叫貨週期（往後看 3 個月），回傳 [{orderDate, deliverDate}]
     */
    function getUpcomingCycles() {
        const today = getToday();
        const results = [];

        for (let m = 0; m < 4; m++) {
            const d = new Date(today.getFullYear(), today.getMonth() + m, 1);
            const year = d.getFullYear();
            const month = d.getMonth();

            [1, 3].forEach((n) => {
                const orderDate = getNthFriday(year, month, n);
                if (orderDate) {
                    const deliverDate = getDeliverDate(orderDate);
                    results.push({ orderDate, deliverDate });
                }
            });
        }

        // 按 orderDate 排序
        results.sort((a, b) => a.orderDate - b.orderDate);
        return results;
    }

    /**
     * 找到「下一個還沒過的」訂貨日和到貨日
     * 以及「下下次」到貨日（用來算涵蓋天數）
     */
    function getNextCycleInfo() {
        const today = getToday();
        today.setHours(0, 0, 0, 0);
        const cycles = getUpcomingCycles();

        // 找最近一個 orderDate >= today 的
        let nextIdx = cycles.findIndex(c => c.orderDate >= today);
        if (nextIdx === -1) nextIdx = cycles.length - 1;

        const next = cycles[nextIdx];
        const nextNext = cycles[nextIdx + 1] || null;

        const daysToOrder = Math.ceil((next.orderDate - today) / 86400000);
        const daysToDeliver = Math.ceil((next.deliverDate - today) / 86400000);

        // 涵蓋天數 = 到貨日到下下次到貨日
        let coverDays = 14; // default fallback (about half month)
        if (nextNext) {
            coverDays = Math.ceil((nextNext.deliverDate - next.deliverDate) / 86400000);
        }

        return {
            nextOrderDate: next.orderDate,
            nextDeliverDate: next.deliverDate,
            daysToOrder,
            daysToDeliver,
            coverDays,
            nextNextDeliverDate: nextNext ? nextNext.deliverDate : null,
        };
    }

    // ---- Status Banner ----
    function initIceCreamStatus() {
        const info = getNextCycleInfo();
        const text = $('#icStatusText');
        const banner = $('#icStatusBanner');
        if (!text || !banner) return;

        const fmtDate = (d) => `${d.getMonth() + 1}/${d.getDate()}`;

        if (info.daysToOrder === 0) {
            text.textContent = `🔔 今天是訂貨日！下次到貨: ${fmtDate(info.nextDeliverDate)}`;
            banner.className = 'status-banner warn';
        } else {
            text.textContent = `距下次訂貨還有 ${info.daysToOrder} 天（${fmtDate(info.nextOrderDate)}），到貨 ${fmtDate(info.nextDeliverDate)}`;
            banner.className = 'status-banner';
        }
    }

    // ---- 計算平日/假日天數 ----

    /**
     * 計算 fromDate 到 toDate 之間有多少平日跟假日
     * weekday = 週一～週五, holiday = 週六、週日
     */
    function countWeekdaysAndHolidays(fromDate, toDate) {
        let weekdays = 0;
        let holidays = 0;
        const d = new Date(fromDate);
        d.setHours(0, 0, 0, 0);
        const end = new Date(toDate);
        end.setHours(0, 0, 0, 0);

        while (d < end) {
            const dow = d.getDay();
            if (dow === 0 || dow === 6) {
                holidays++;
            } else {
                weekdays++;
            }
            d.setDate(d.getDate() + 1);
        }

        return { weekdays, holidays };
    }

    // ---- 核心計算 ----

    /**
     * 計算單一品項的建議叫貨量
     */
    function calcProduct(stock, weekdayUsage, holidayUsage, safetyDays, cycleInfo) {
        // 到貨前消耗（今天到 deliverDate 之間）
        const beforeDeliver = countWeekdaysAndHolidays(getToday(), cycleInfo.nextDeliverDate);
        const consumeBefore = beforeDeliver.weekdays * weekdayUsage + beforeDeliver.holidays * holidayUsage;
        const stockAtDelivery = Math.max(0, stock - consumeBefore);

        // 到貨後需涵蓋的天數中的平日/假日
        const afterDeliver = countWeekdaysAndHolidays(
            cycleInfo.nextDeliverDate,
            cycleInfo.nextNextDeliverDate || new Date(cycleInfo.nextDeliverDate.getTime() + cycleInfo.coverDays * 86400000)
        );
        const coverConsume = afterDeliver.weekdays * weekdayUsage + afterDeliver.holidays * holidayUsage;

        // 加權平均日用量（用來算安全庫存）
        const totalDays = afterDeliver.weekdays + afterDeliver.holidays;
        const avgDailyUsage = totalDays > 0 ? coverConsume / totalDays : weekdayUsage;

        // 安全庫存
        const safetyStock = avgDailyUsage * safetyDays;

        // 建議量
        const rawQty = coverConsume + safetyStock - stockAtDelivery;
        const recommendedQty = Math.max(0, Math.ceil(rawQty));

        // 庫存可撐幾天（用加權平均）
        const overallAvg = (weekdayUsage * 5 + holidayUsage * 2) / 7;
        const stockDays = overallAvg > 0 ? Math.round((stock / overallAvg) * 10) / 10 : Infinity;

        // urgency
        let urgency = 'ok';
        if (stockDays < cycleInfo.daysToDeliver) {
            urgency = 'urgent';
        } else if (stockDays < cycleInfo.daysToDeliver + 2) {
            urgency = 'warn';
        }

        return {
            stock,
            weekdayUsage,
            holidayUsage,
            stockAtDelivery: Math.round(stockAtDelivery * 10) / 10,
            coverConsume: Math.round(coverConsume * 10) / 10,
            safetyStock: Math.round(safetyStock * 10) / 10,
            recommendedQty,
            recommendedUnits: recommendedQty * UNITS_PER_BOX,
            stockDays,
            urgency,
            coverWeekdays: afterDeliver.weekdays,
            coverHolidays: afterDeliver.holidays,
        };
    }

    // ---- Render ----

    function fmtDate(d) {
        return `${d.getMonth() + 1}/${d.getDate()}`;
    }

    function dayName(d) {
        return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    }

    function renderIcResults(vanilla, milk, cycleInfo, safetyDays) {
        const section = $('#icResultsSection');
        section.style.display = '';

        // Schedule card
        const schedCard = `
            <div class="sch-row">
                <span class="sch-label">下次訂貨日</span>
                <span class="sch-value ${cycleInfo.daysToOrder === 0 ? 'warn-date' : 'highlight-date'}">${fmtDate(cycleInfo.nextOrderDate)}（週${dayName(cycleInfo.nextOrderDate)}）${cycleInfo.daysToOrder === 0 ? '📢 今天！' : `還有 ${cycleInfo.daysToOrder} 天`}</span>
            </div>
            <div class="sch-row">
                <span class="sch-label">預計到貨日</span>
                <span class="sch-value">${fmtDate(cycleInfo.nextDeliverDate)}（週${dayName(cycleInfo.nextDeliverDate)}）還有 ${cycleInfo.daysToDeliver} 天</span>
            </div>
            <div class="sch-row">
                <span class="sch-label">到貨後需涵蓋</span>
                <span class="sch-value">${cycleInfo.coverDays} 天（平日 ${vanilla.coverWeekdays} / 假日 ${vanilla.coverHolidays}）</span>
            </div>
        `;
        $('#icScheduleCard').innerHTML = schedCard;

        // Result cards
        const needOrder = vanilla.recommendedQty > 0 || milk.recommendedQty > 0;
        const totalBoxes = vanilla.recommendedQty + milk.recommendedQty;

        const cardsHtml = `
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
            </div>
        `;
        $('#icResultCards').innerHTML = cardsHtml;

        // Detail box — per product
        function productDetail(name, icon, unitName, data) {
            const urgClass = data.urgency === 'urgent' ? 'danger' : data.urgency;
            const urgLabel = data.urgency === 'urgent' ? '⚠️ 庫存不足' : data.urgency === 'warn' ? '⚡ 偏低' : '✅ 正常';
            return `
                <div class="product-result">
                    <div class="product-result-header">${icon} ${name}</div>
                    <div class="detail-row">
                        <span class="detail-label">目前庫存</span>
                        <span class="pr-value">${data.stock} 箱（${data.stock * UNITS_PER_BOX} ${unitName}）</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">平日用量</span>
                        <span class="pr-value">${data.weekdayUsage} 箱/天</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">假日用量</span>
                        <span class="pr-value">${data.holidayUsage} 箱/天</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">到貨時預估剩餘</span>
                        <span class="pr-value">${data.stockAtDelivery} 箱</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">涵蓋期間消耗</span>
                        <span class="pr-value">${data.coverConsume} 箱</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">安全庫存</span>
                        <span class="pr-value">${data.safetyStock} 箱（${safetyDays} 天）</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">庫存可撐</span>
                        <span class="pr-value">${data.stockDays} 天</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">庫存狀態</span>
                        <span class="pr-value ${urgClass}">${urgLabel}</span>
                    </div>
                </div>
            `;
        }

        const detailHtml = productDetail('香草粉', '🍨', '包', vanilla)
            + productDetail('保久乳', '🥛', '罐', milk);
        $('#icDetailBox').innerHTML = detailHtml;

        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ---- Submit ----
    function handleIcSubmit(e) {
        e.preventDefault();

        const vanillaStock = parseFloat($('#icVanillaStock').value);
        const vanillaWeekday = parseFloat($('#icVanillaWeekday').value);
        const vanillaHoliday = parseFloat($('#icVanillaHoliday').value);
        const milkStock = parseFloat($('#icMilkStock').value);
        const milkWeekday = parseFloat($('#icMilkWeekday').value);
        const milkHoliday = parseFloat($('#icMilkHoliday').value);
        const safetyDays = parseFloat($('#icSafetyDays').value) || 1;

        // Validate
        if ([vanillaStock, vanillaWeekday, vanillaHoliday, milkStock, milkWeekday, milkHoliday].some(v => isNaN(v) || v < 0)) {
            alert('請輸入有效的庫存與用量！');
            return;
        }

        const cycleInfo = getNextCycleInfo();
        const vanillaResult = calcProduct(vanillaStock, vanillaWeekday, vanillaHoliday, safetyDays, cycleInfo);
        const milkResult = calcProduct(milkStock, milkWeekday, milkHoliday, safetyDays, cycleInfo);

        renderIcResults(vanillaResult, milkResult, cycleInfo, safetyDays);

        // Update status
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
            text.textContent = `建議叫貨共 ${total} 箱（${fmtDate(cycleInfo.nextOrderDate)} 訂貨）`;
        }
    }

})();
