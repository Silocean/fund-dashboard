// ========== 配置与常量 ==========
const CONFIG = {
    NAV_PUBLISH_HOUR: 20,   // 基金公司通常在此时间后公布当天净值（24 小时制）
    TRADE_CUTOFF_HOUR: 15   // 15:00 前申购/赎回按当日净值，15:00 后按下一交易日
};

// 中国 A 股休市日（沪深交易所公布，仅含节假日，不含周末）
// 每年初需更新：在 CN_MARKET_HOLIDAYS_DAYS 中追加新年度日期后，运行一次即可
const CN_MARKET_HOLIDAYS_DAYS = [
    '2024-01-01', '2024-02-09', '2024-02-10', '2024-02-11', '2024-02-12', '2024-02-13', '2024-02-14', '2024-02-15', '2024-02-16', '2024-02-17',
    '2024-04-04', '2024-04-05', '2024-04-06', '2024-05-01', '2024-05-02', '2024-05-03', '2024-05-04', '2024-05-05',
    '2024-06-10', '2024-09-15', '2024-09-16', '2024-09-17', '2024-10-01', '2024-10-02', '2024-10-03', '2024-10-04', '2024-10-05', '2024-10-06', '2024-10-07',
    '2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', '2025-02-01', '2025-02-02', '2025-02-03', '2025-02-04',
    '2025-04-04', '2025-04-05', '2025-04-06', '2025-05-01', '2025-05-02', '2025-05-03', '2025-05-04', '2025-05-05',
    '2025-05-31', '2025-06-01', '2025-06-02', '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04', '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08',
    '2026-01-01', '2026-01-02', '2026-01-03', '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
    '2026-04-04', '2026-04-05', '2026-04-06', '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
    '2026-06-19', '2026-06-20', '2026-06-21', '2026-09-25', '2026-09-26', '2026-09-27',
    '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'
];
const CN_MARKET_HOLIDAYS = new Set(CN_MARKET_HOLIDAYS_DAYS);

// ========== 状态（单一 state 对象，便于调试与快照） ==========
const state = {
    fundsData: {},
    charts: {},
    historyData: {},
    loadingFundCodes: new Set(),
    sortOrder: 'default',
    listSort: null, // { by: 'pct'|'dailyProfit', dir: 'asc'|'desc' } 列表表头点击排序，null 表示默认顺序
    currentMainView: 'holding',
    fundListViewMode: localStorage.getItem('fundListViewMode') || 'card',
    positions: {},
    dailyRanges: {},
    currentModalFundCode: null,
    currentAvailableShares: 0,
    confirmCallback: null,
    fundList: [],
    isFetchingFundList: false,
    fundDetails: {},
    netWorthRefreshed: new Set(),
    chartRangeSelection: {},
    _renderTimer: null,
    _switchViewRenderTimer: null,
    fundDataTimeouts: {}, // 基金数据请求 15s 超时 id，切到后台时统一清除避免切回时成批触发
    fundDetailsQueue: [],
    isLoadingFundDetails: false,
    overviewExpanded: localStorage.getItem('overviewExpanded') === 'true',
    calendarView: localStorage.getItem('pnlCalendarView') || 'day',
    calendarDisplay: localStorage.getItem('pnlCalendarDisplay') || 'amount',
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth() + 1,
    lastFocusBeforeModal: null,
    activeModalId: null,
    dailyPnlModalContext: null, // { type:'day'|'month'|'year', dateStr?, year?, month? } 盈亏明细弹窗当前上下文，用于上一项/下一项
    justAddedFundCode: null,
    autocompleteSelectedIndex: -1,
    scrollDeferredForNewFund: false,
    initialPurchaseModalHasOpened: false,
    _viewCache: null,
    _listRenderToken: 0
};

// ========== UI：Toast 与确认框 ==========
// 无障碍：模态框焦点陷阱与还原（由 observeModalActive 在弹窗显示时调用）
function trapModalFocus(modalId) {
    state.lastFocusBeforeModal = document.activeElement;
    state.activeModalId = modalId;
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'false');
    const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    if (first) first.focus();
    modal.addEventListener('keydown', handleModalKeydown);
}
function restoreModalFocus() {
    document.querySelectorAll('.modal').forEach(m => m.removeEventListener('keydown', handleModalKeydown));
    if (state.lastFocusBeforeModal && state.lastFocusBeforeModal.focus) {
        state.lastFocusBeforeModal.focus();
    }
    state.lastFocusBeforeModal = null;
    state.activeModalId = null;
}
function handleModalKeydown(e) {
    if (e.key !== 'Tab') return;
    const modal = e.target.closest('.modal');
    if (!modal) return;
    const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const list = Array.from(focusable);
    const idx = list.indexOf(e.target);
    if (e.shiftKey) {
        if (idx <= 0) {
            e.preventDefault();
            list[list.length - 1].focus();
        }
    } else {
        if (idx >= list.length - 1) {
            e.preventDefault();
            list[0].focus();
        }
    }
}
// 弹窗打开时禁止背景页面滚动，关闭后恢复
function updateBodyScrollLock() {
    const hasActive = document.querySelectorAll('.modal.active').length > 0;
    document.body.style.overflow = hasActive ? 'hidden' : '';
    document.documentElement.style.overflow = hasActive ? 'hidden' : '';
}

// 监听模态框显示/隐藏，统一设置 aria-hidden、焦点与背景滚动锁定
function observeModalActive() {
    document.querySelectorAll('.modal').forEach(modal => {
        const obs = new MutationObserver(mutations => {
            mutations.forEach(mut => {
                if (mut.attributeName !== 'class') return;
                const isActive = modal.classList.contains('active');
                modal.setAttribute('aria-hidden', !isActive);
                updateBodyScrollLock();
                if (isActive) {
                    trapModalFocus(modal.id);
                } else if (state.activeModalId === modal.id) {
                    restoreModalFocus();
                }
            });
        });
        obs.observe(modal, { attributes: true, attributeFilter: ['class'] });
    });
}

// Toast 轻提示：type = success | error | warning | info
function showToast(message, type = 'info', duration = 3200) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (type === 'success' || type === 'error' || type === 'warning' || type === 'info' ? type : 'info');
    el.setAttribute('role', 'alert');
    const text = document.createElement('span');
    text.className = 'toast-text';
    text.textContent = String(message).trim();
    el.appendChild(text);
    container.appendChild(el);
    const t = setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(-8px)';
        el.style.transition = 'opacity 0.2s, transform 0.2s';
        setTimeout(() => el.remove(), 220);
    }, duration);
    el.addEventListener('click', () => {
        clearTimeout(t);
        el.style.opacity = '0';
        el.style.transform = 'translateY(-8px)';
        el.style.transition = 'opacity 0.2s, transform 0.2s';
        setTimeout(() => el.remove(), 220);
    });
}

function isTradingDay(d) {
    const day = d.getDay();
    if (day === 0 || day === 6) return false; // 周末
    const s = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return !CN_MARKET_HOLIDAYS.has(s);
}

// ========== 工具函数：日期与交易日 ==========
function toDateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getNextTradingDay(dateStr) {
    let d = new Date(dateStr + 'T12:00:00');
    for (let i = 1; i <= 14; i++) {
        d.setDate(d.getDate() + 1);
        if (isTradingDay(d)) return toDateStr(d);
    }
    return toDateStr(d);
}

/** 获取上一交易日（用于今日收益排除：昨日买入的份额不参与今日收益） */
function getPreviousTradingDay(dateStr) {
    let d = new Date(dateStr + 'T12:00:00');
    for (let i = 1; i <= 14; i++) {
        d.setDate(d.getDate() - 1);
        if (isTradingDay(d)) return toDateStr(d);
    }
    return toDateStr(d);
}

// 根据交易日期 + 是否15点前，得到实际采用的净值日期
function getEffectiveNavDate(tradeDateStr, beforeCutoff) {
    if (beforeCutoff) return tradeDateStr;
    return getNextTradingDay(tradeDateStr);
}

/** 从净值数据项得到 YYYY-MM-DD 字符串（兼容 x 为时间戳或日期字符串） */
function netWorthItemDateStr(x) {
    if (x == null || x.x == null) return '';
    const t = typeof x.x === 'number' ? new Date(x.x < 1e10 ? x.x * 1000 : x.x) : new Date(x.x);
    if (isNaN(t.getTime())) return '';
    return toDateStr(t);
}

// 从净值走势中获取某日的实际净值（精确匹配）
function getNavForEffectiveDate(code, effectiveDateStr) {
    const details = state.fundDetails[code];
    if (!details || !details.netWorthData || details.netWorthData.length === 0) return null;
    const item = details.netWorthData.find(x => netWorthItemDateStr(x) === effectiveDateStr);
    return item ? item.y : null;
}

/** 获取该日或之前最近一次净值（用于日历市值，避免缺数据时相邻日跳变） */
function getNavOnOrBefore(code, dateStr) {
    const details = state.fundDetails[code];
    if (!details || !details.netWorthData || details.netWorthData.length === 0) return null;
    let best = null;
    details.netWorthData.forEach(x => {
        const d = netWorthItemDateStr(x);
        if (d && d <= dateStr && (best === null || d > netWorthItemDateStr(best))) best = x;
    });
    return best ? best.y : null;
}

/** 某笔交易生效的净值日期（份额从该日起计入持仓） */
function getTransEffectiveDate(trans) {
    if (trans.effectiveNavDate) return trans.effectiveNavDate;
    const tradeDate = trans.tradeDate || toDateStr(new Date(trans.date));
    const beforeCutoff = trans.beforeCutoff !== false;
    return getEffectiveNavDate(tradeDate, beforeCutoff);
}

/** 回放到 dateStr 当日结束时的持仓份额与成本（dateStr 为 YYYY-MM-DD）；按有效净值日期判断，并按有效日排序后回放避免顺序错乱 */
function getSharesAndCostAtDate(code, dateStr) {
    const position = state.positions[code];
    if (!position || !position.transactions) return { shares: 0, cost: 0 };
    const upToDate = position.transactions
        .filter(trans => getTransEffectiveDate(trans) <= dateStr)
        .sort((a, b) => getTransEffectiveDate(a).localeCompare(getTransEffectiveDate(b)));
    let shares = 0, cost = 0;
    upToDate.forEach(trans => {
        if (trans.type === 'buy') {
            shares += trans.shares;
            cost += trans.amount;
        } else if (trans.type === 'sell') {
            const ratio = shares > 0 ? trans.shares / shares : 0;
            cost -= cost * ratio;
            shares -= trans.shares;
        }
    });
    shares = parseFloat(Math.max(0, shares).toFixed(2));
    return { shares, cost };
}

/** 计算某日收盘时组合总市值（使用该日或之前最近净值，避免缺数据日导致相邻日盈亏跳变）；含已删除基金以与盈亏合计一致） */
function getPortfolioValueAtDate(dateStr) {
    const codes = getOverviewFundCodes();
    let total = 0;
    for (const code of codes) {
        const { shares } = getSharesAndCostAtDate(code, dateStr);
        if (shares <= 0) continue;
        const nav = getNavOnOrBefore(code, dateStr);
        if (nav == null) continue;
        total += shares * nav;
    }
    return total;
}

/** 与 getDailyPnlMap 中当日 rate 分母一致：prev 日市值，仅统计 prev 与 cur 均有净值的持仓（用于月/年百分比）；含已删除基金） */
function getPortfolioValueForRateBetween(prevDateStr, curDateStr) {
    const codes = getOverviewFundCodes();
    let total = 0;
    codes.forEach(code => {
        const { shares: sharesPrev } = getSharesAndCostAtDate(code, prevDateStr);
        if (sharesPrev <= 0) return;
        const navPrev = getNavOnOrBefore(code, prevDateStr);
        const navCur = getNavOnOrBefore(code, curDateStr);
        if (navPrev == null || navCur == null) return;
        total += sharesPrev * navPrev;
    });
    return total;
}

/** 生成盈亏日历用的每日数据：dateStr -> { amount, rate, value }，仅包含有净值的交易日（带短期缓存减少重复计算）；含已删除基金以与明细合计一致） */
function getDailyPnlMap() {
    const CACHE_MS = 60000;
    if (state._dailyPnlMapCache && (Date.now() - state._dailyPnlMapCache.ts < CACHE_MS)) return state._dailyPnlMapCache.data;
    const codes = getOverviewFundCodes();
    const dateSet = new Set();
    codes.forEach(code => {
        const position = state.positions[code];
        if (!position || !position.transactions) return;
        position.transactions.forEach(trans => {
            dateSet.add(trans.tradeDate || toDateStr(new Date(trans.date)));
            dateSet.add(getTransEffectiveDate(trans));
        });
    });
    const today = toDateStr(new Date());
    dateSet.add(today);
    // 保障最近交易日的日历连续性：即使交易记录起点较晚，
    // 也至少纳入前一/前两交易日，避免出现“今天有值、昨天空白”的断层。
    const prev1 = getPreviousTradingDay(today);
    const prev2 = getPreviousTradingDay(prev1);
    dateSet.add(prev1);
    dateSet.add(prev2);
    const sorted = Array.from(dateSet).sort();
    if (sorted.length < 2) return {};
    const first = sorted[0];
    // 为了覆盖边界场景（例如仅有“当天+下一有效日”两类日期时），
    // 起点再向前扩一个交易日，避免首个可展示日被跳过。
    const firstPrevTradingDay = getPreviousTradingDay(first);
    const startTradingDay = getPreviousTradingDay(firstPrevTradingDay);
    let d = new Date(startTradingDay + 'T12:00:00');
    const end = new Date(today + 'T12:00:00');
    const tradingDays = [];
    while (d <= end) {
        const s = toDateStr(d);
        if (isTradingDay(d)) tradingDays.push(s);
        d.setDate(d.getDate() + 1);
    }
    const map = {};
    for (let i = 1; i < tradingDays.length; i++) {
        const cur = tradingDays[i];
        const prev = tradingDays[i - 1];
        // 与「今日盈亏」一致：仅算持仓市值变动 = 前一交易日收盘持仓 × (今日净值 - 昨日净值)，不含当日申购/赎回资金流
        let amount = 0;
        let valuePrevForRate = 0;
        codes.forEach(code => {
            const { shares: sharesPrev } = getSharesAndCostAtDate(code, prev);
            if (sharesPrev <= 0) return;
            const navPrev = getNavOnOrBefore(code, prev);
            const navCur = getNavOnOrBefore(code, cur);
            if (navPrev == null || navCur == null) return;
            amount += sharesPrev * (navCur - navPrev);
            valuePrevForRate += sharesPrev * navPrev;
        });
        const valueCur = getPortfolioValueAtDate(cur);
        const valuePrev = getPortfolioValueAtDate(prev);
        const rate = valuePrevForRate > 0 ? (amount / valuePrevForRate) * 100 : 0;
        map[cur] = { amount, rate, value: valueCur, prevValue: valuePrev, prevValueForRate: valuePrevForRate };
    }
    state._dailyPnlMapCache = { data: map, ts: Date.now() };
    return map;
}

/** 某日各基金的盈亏明细（用于日历点击弹窗），返回 [{ code, name, amount, rate }]；含已删除基金，名称取 fundsData/fundDetails/code */
function getDailyPnlByFund(dateStr) {
    const codes = getOverviewFundCodes();
    const prev = getPreviousTradingDay(dateStr);
    const list = [];
    codes.forEach(code => {
        const { shares: sharesPrev } = getSharesAndCostAtDate(code, prev);
        if (sharesPrev <= 0) return;
        const navPrev = getNavOnOrBefore(code, prev);
        const navCur = getNavOnOrBefore(code, dateStr);
        if (navPrev == null || navCur == null) return;
        const amount = sharesPrev * (navCur - navPrev);
        const valuePrevForRate = sharesPrev * navPrev;
        const rate = valuePrevForRate > 0 ? (amount / valuePrevForRate) * 100 : 0;
        const name = getFundDisplayName(code);
        list.push({ code, name, amount, rate });
    });
    return list.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

/** 今日盘中估算盈亏（基于实时估值 gszzl），用于日历在当日净值未公布前展示当天数据 */
function getTodayEstimatedPnlSummary() {
    const today = new Date();
    if (!isTradingDay(today) || isAfterNavPublishTime()) return null;
    const codes = loadFundCodes();
    let amount = 0;
    let valuePrevForRate = 0;
    codes.forEach(code => {
        const data = state.fundsData[code];
        const posInfo = calculatePosition(code);
        if (!data || !posInfo || posInfo.totalShares <= 0) return;
        const display = getDisplayValues(data);
        const percentage = parseFloat(display.percentage || 0);
        const yesterdayValue = parseFloat(data.dwjz);
        const eligibleShares = getSharesEligibleForTodayProfit(code);
        if (!isFinite(percentage) || !isFinite(yesterdayValue) || eligibleShares <= 0) return;
        amount += eligibleShares * yesterdayValue * (percentage / 100);
        valuePrevForRate += eligibleShares * yesterdayValue;
    });
    if (valuePrevForRate <= 0) return null;
    const rate = (amount / valuePrevForRate) * 100;
    return { amount, rate, estimated: true };
}

/** 今日盘中估算盈亏按基金明细（基于实时估值 gszzl） */
function getTodayEstimatedPnlByFund() {
    const today = new Date();
    if (!isTradingDay(today) || isAfterNavPublishTime()) return [];
    const codes = loadFundCodes();
    const list = [];
    codes.forEach(code => {
        const data = state.fundsData[code];
        const posInfo = calculatePosition(code);
        if (!data || !posInfo || posInfo.totalShares <= 0) return;
        const display = getDisplayValues(data);
        const percentage = parseFloat(display.percentage || 0);
        const yesterdayValue = parseFloat(data.dwjz);
        const eligibleShares = getSharesEligibleForTodayProfit(code);
        if (!isFinite(percentage) || !isFinite(yesterdayValue) || eligibleShares <= 0) return;
        const amount = eligibleShares * yesterdayValue * (percentage / 100);
        const base = eligibleShares * yesterdayValue;
        const rate = base > 0 ? (amount / base) * 100 : 0;
        list.push({ code, name: getFundDisplayName(code), amount, rate });
    });
    return list.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

/** 日期区间内各基金盈亏汇总（单次遍历区间内交易日，按 code 累加）；含已删除基金 */
function getPnlByFundForDateRange(startStr, endStr) {
    const codes = getOverviewFundCodes();
    const sumByCode = {};
    const nameByCode = {};
    let d = new Date(startStr + 'T12:00:00');
    const end = new Date(endStr + 'T12:00:00');
    while (d <= end) {
        const cur = toDateStr(d);
        if (!isTradingDay(d)) { d.setDate(d.getDate() + 1); continue; }
        const prev = getPreviousTradingDay(cur);
        codes.forEach(code => {
            const { shares: sharesPrev } = getSharesAndCostAtDate(code, prev);
            if (sharesPrev <= 0) return;
            const navPrev = getNavOnOrBefore(code, prev);
            const navCur = getNavOnOrBefore(code, cur);
            if (navPrev == null || navCur == null) return;
            const amount = sharesPrev * (navCur - navPrev);
            sumByCode[code] = (sumByCode[code] || 0) + amount;
            if (!nameByCode[code]) nameByCode[code] = getFundDisplayName(code);
        });
        d.setDate(d.getDate() + 1);
    }
    return { sumByCode, nameByCode };
}

/** 某月各基金盈亏汇总（用于日历按月点击），返回 [{ code, name, amount, rate }] */
function getMonthlyPnlByFund(year, month) {
    const monthFirst = year + '-' + String(month).padStart(2, '0') + '-01';
    const lastDate = new Date(year, month, 0);
    const monthLast = year + '-' + String(month).padStart(2, '0') + '-' + String(lastDate.getDate()).padStart(2, '0');
    const { sumByCode, nameByCode } = getPnlByFundForDateRange(monthFirst, monthLast);
    const codes = Object.keys(sumByCode);
    if (codes.length === 0) return [];
    const monthStartValue = {};
    codes.forEach(code => {
        const { shares } = getSharesAndCostAtDate(code, monthFirst);
        const nav = getNavOnOrBefore(code, monthFirst);
        monthStartValue[code] = shares > 0 && nav != null ? shares * nav : 0;
    });
    const list = codes.map(code => ({
        code,
        name: nameByCode[code],
        amount: sumByCode[code],
        rate: monthStartValue[code] > 0 ? (sumByCode[code] / monthStartValue[code]) * 100 : 0
    }));
    return list.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

/** 某年各基金盈亏汇总（用于日历按年点击），返回 [{ code, name, amount, rate }] */
function getYearlyPnlByFund(year) {
    const yearFirst = year + '-01-01';
    const yearLast = year + '-12-31';
    const { sumByCode, nameByCode } = getPnlByFundForDateRange(yearFirst, yearLast);
    const codes = Object.keys(sumByCode);
    if (codes.length === 0) return [];
    const yearStartValue = {};
    codes.forEach(code => {
        const { shares } = getSharesAndCostAtDate(code, yearFirst);
        const nav = getNavOnOrBefore(code, yearFirst);
        yearStartValue[code] = shares > 0 && nav != null ? shares * nav : 0;
    });
    const list = codes.map(code => ({
        code,
        name: nameByCode[code],
        amount: sumByCode[code],
        rate: yearStartValue[code] > 0 ? (sumByCode[code] / yearStartValue[code]) * 100 : 0
    }));
    return list.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

// 生成可选的交易日列表（最近约一年 + 未来一个月）
function generateTradingDateOptions() {
    const opts = [];
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 5);  // 5 年前起，提供更多历史候选日期
    let d = new Date(end);
    d.setDate(d.getDate() + 31);
    const futureEnd = d;
    d = new Date(start);
    while (d <= futureEnd) {
        if (isTradingDay(d)) {
            const s = toDateStr(d);
            const label = d.getTime() > Date.now() ? s + ' (未来)' : s;
            opts.push({ value: s, label: label });
        }
        d.setDate(d.getDate() + 1);
    }
    opts.sort((a, b) => b.value.localeCompare(a.value));
    return opts;
}

// 渲染防抖器：避免短时间内多次整体重绘引起闪烁
function scheduleRender(delay = 250) {
    if (state._renderTimer) clearTimeout(state._renderTimer);
    state._renderTimer = setTimeout(() => {
        if (document.getElementById('initialPurchaseModal').classList.contains('active')) {
            state._renderTimer = null;
            return;
        }
        state._renderTimer = null;
        var run = function () {
            try {
                state._viewCache = null;
                renderFunds();
                scrollToAndHighlightAddedFund();
            } catch (e) {
                console.error('scheduleRender: renderFunds 错误', e);
                showToast('列表刷新异常，请重试', 'error');
            }
        };
        if (state.fundListViewMode === 'list' && typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(run, { timeout: 350 });
        } else {
            run();
        }
    }, delay);
}

/** 将刚添加的基金滚动到视区内并高亮。可选传入 code，关闭弹窗时传入以不受 state 被清空影响 */
function scrollToAndHighlightAddedFund(codeFromClose) {
    const code = codeFromClose != null ? String(codeFromClose) : state.justAddedFundCode;
    if (!code) return;
    if (!codeFromClose) {
        if (document.getElementById('initialPurchaseModal').classList.contains('active')) return;
        if (state.scrollDeferredForNewFund) {
            if (!state.initialPurchaseModalHasOpened) return;
            state.scrollDeferredForNewFund = false;
            state.initialPurchaseModalHasOpened = false;
        }
    }
    if (state.currentMainView === 'holding') {
        const posInfo = calculatePosition(code);
        if (!posInfo || posInfo.totalShares <= 0) {
            switchMainView('watching');
            scheduleRender();
            return;
        }
    }
    const el = document.querySelector('[data-code="' + code + '"]');
    if (!el) return;
    state.justAddedFundCode = null;
    el.classList.add('fund-added-highlight');
    setTimeout(function () {
        el.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
    }, 100);
    setTimeout(function () {
        el.classList.remove('fund-added-highlight');
    }, 2500);
}

// ========== 基金详细信息加载队列 ==========
// 全局清理函数 - 清除所有基金详细信息数据
window.clearAllFundDetails = function() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('fundDetail_')) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    state.fundDetails = {};
    state.fundDetailsQueue = [];
    state.isLoadingFundDetails = false;
};

// 显示自定义确认对话框
function showCustomConfirm(title, message, confirmText = '确定', isHtml = false) {
    return new Promise((resolve) => {
        document.getElementById('confirmTitle').textContent = title;
        if (isHtml) {
            document.getElementById('confirmMessage').innerHTML = message;
        } else {
            document.getElementById('confirmMessage').textContent = message;
        }
        document.getElementById('confirmBtn').textContent = confirmText;
        document.getElementById('customConfirmModal').classList.add('active');
        state.confirmCallback = resolve;
    });
}

// 关闭自定义确认对话框
function closeCustomConfirm(result) {
    document.getElementById('customConfirmModal').classList.remove('active');
    if (state.confirmCallback) {
        state.confirmCallback(result);
        state.confirmCallback = null;
    }
    restoreModalFocus();
}

// ========== 本地存储 ==========
function loadFundCodes() {
    const saved = localStorage.getItem('fundCodes');
    return saved ? JSON.parse(saved) : [];
}

// 总览统计用：当前列表 + 已从列表移除但仍有交易记录的基金（清仓后删除的仍计入历史收益）
function getOverviewFundCodes() {
    const list = loadFundCodes();
    const withPositions = Object.keys(state.positions || {});
    return [...new Set([...list, ...withPositions])];
}

/** 是否已从当前基金列表删除（仅保留在持仓/交易记录中，用于明细弹窗标识） */
function isFundDeleted(code) {
    return !loadFundCodes().includes(code);
}

/** 解析基金显示名称：优先 fundsData/fundDetails，其次从全量基金列表 fundList 按 code 查找（已删除/未拉详情的基金），最后回退为 code */
function getFundDisplayName(code) {
    if (state.fundsData[code] && state.fundsData[code].name) return state.fundsData[code].name;
    if (state.fundDetails[code] && state.fundDetails[code].name) return state.fundDetails[code].name;
    if (state.fundList && state.fundList.length) {
        const fund = state.fundList.find(f => f.code === code);
        if (fund && fund.name) return fund.name;
    }
    return code;
}

// ===== 数据同步提醒 =====
function markDataChanged(skipReminder) {
    localStorage.setItem('hasUnsyncedChanges', 'true');
    if (!skipReminder) showSyncReminder();
    updateFooterSyncStatus();
}

function clearSyncReminder() {
    localStorage.removeItem('hasUnsyncedChanges');
    const reminder = document.getElementById('syncReminder');
    if (reminder) reminder.style.display = 'none';
    updateFooterSyncStatus();
}

function showSyncReminder() {
    const settings = loadCloudSettings();
    if (!settings.token) return;
    if (document.getElementById('initialPurchaseModal').classList.contains('active')) return;
    const reminder = document.getElementById('syncReminder');
    if (reminder) reminder.style.display = 'flex';
}

// ========== 总览面板 ==========
function openOverviewDetailModal() {
    const modal = document.getElementById('overviewDetailModal');
    if (!modal) return;
    if (state._dailyPnlMapCache) state._dailyPnlMapCache = null;
    modal.classList.add('active');
    var runWhenIdle = typeof requestIdleCallback !== 'undefined' ? requestIdleCallback : function (fn, opts) { setTimeout(fn, opts && opts.timeout ? Math.min(50, opts.timeout) : 50); };
    runWhenIdle(function () {
        if (typeof drawAllocationChart === 'function') drawAllocationChart();
        runWhenIdle(function () {
            if (typeof drawProfitTrendChart === 'function') drawProfitTrendChart();
            runWhenIdle(function () {
                if (typeof renderPnlCalendar === 'function') renderPnlCalendar();
            }, { timeout: 200 });
        }, { timeout: 150 });
    }, { timeout: 100 });
}

function closeOverviewDetailModal() {
    document.getElementById('overviewDetailModal').classList.remove('active');
}

// 持仓弹窗：打开
function openPositionModal(code) {
    const data = state.fundsData[code];
    const posInfo = calculatePosition(code);
    const titleEl = document.getElementById('positionModalTitle');
    const contentEl = document.getElementById('positionModalContent');
    const fundName = getFundDisplayName(code);
    titleEl.textContent = '💼 持仓信息 - ' + fundName;

    if (posInfo && posInfo.totalShares > 0) {
        const display = getDisplayValues(data || {});
        const currentNav = display.isActual ? parseFloat(display.value) : parseFloat((data && data.gsz) ? data.gsz : 0);
        const currentValue = posInfo.totalShares * currentNav;
        const profit = currentValue - posInfo.totalCost;
        const profitRateNum = (currentNav - posInfo.avgCost) / posInfo.avgCost * 100;
        const isZeroProfit = Math.abs(profit) < 0.005;
        const isZeroRate = Math.abs(profitRateNum) < 0.005;
        const profitClass = isZeroProfit ? 'neutral' : (profit >= 0 ? 'profit' : 'loss');
        const profitAmountStr = isZeroProfit ? '0.00' : (profit >= 0 ? '+' : '') + (profit < 0 ? Math.abs(profit) : profit).toFixed(2);
        const profitRateStr = isZeroRate ? '0.00' : (profitRateNum >= 0 ? '+' : (profitRateNum < 0 ? '-' : '')) + (profitRateNum < 0 ? Math.abs(profitRateNum) : profitRateNum).toFixed(2);
        contentEl.innerHTML = `
            <div class="position-summary">
                <span>市值 ${currentValue.toFixed(2)}</span>
                <span class="position-summary-tag ${profitClass}">${profitAmountStr}（${profitRateStr}%）</span>
            </div>
            <p style="margin-bottom:12px;font-size:13px;">
                <a href="javascript:void(0)" onclick="closePositionModal(); openTransactionHistoryModal('${code}')" style="color:var(--primary);">📋 ${posInfo.transactions.length}笔交易记录</a>
            </p>
            <div class="position-grid">
                <div class="position-item"><div class="position-label">持有份额</div><div class="position-value">${posInfo.totalShares.toFixed(2)}</div></div>
                <div class="position-item"><div class="position-label">平均成本</div><div class="position-value">${posInfo.avgCost.toFixed(4)}</div></div>
                <div class="position-item"><div class="position-label">当前市值</div><div class="position-value">${currentValue.toFixed(2)}</div></div>
                <div class="position-item"><div class="position-label">持仓成本</div><div class="position-value">${posInfo.totalCost.toFixed(2)}</div></div>
                <div class="position-item"><div class="position-label">收益金额</div><div class="position-value ${profitClass}">${profitAmountStr}</div></div>
                <div class="position-item"><div class="position-label">收益率</div><div class="position-value ${profitClass}">${profitRateStr}%</div></div>
            </div>
            <div class="position-modal-actions">
                <button class="btn btn-primary" onclick="closePositionModal(); openBuyModal('${code}')">买入</button>
                <button class="btn btn-warning" onclick="closePositionModal(); openSellModal('${code}')">卖出</button>
                <button class="btn btn-secondary" onclick="closePositionModal(); openConvertModal('${code}')">转换</button>
            </div>
        `;
    } else {
        const hasHistory = posInfo && posInfo.transactions && posInfo.transactions.length > 0;
        const emptyTitle = hasHistory ? '已清仓' : '暂无持仓';
        const emptyDesc = hasHistory ? '该基金当前无持仓，可买入建仓或查看历史交易记录。' : '添加自选后尚未买入，点击下方按钮开始第一笔申购。';
        contentEl.innerHTML = `
            <div class="position-modal-empty">
                <div class="empty-icon">💼</div>
                <h3 class="empty-title">${emptyTitle}</h3>
                <p class="empty-desc">${emptyDesc}</p>
                <div class="position-modal-actions position-modal-actions--column">
                    <button class="btn btn-primary" onclick="closePositionModal(); openBuyModal('${code}')">买入</button>
                    ${hasHistory ? '<a href="javascript:void(0)" class="empty-link" onclick="closePositionModal(); openTransactionHistoryModal(\'' + code + '\')">📋 查看交易记录</a>' : ''}
                </div>
            </div>
        `;
    }
    document.getElementById('positionModal').classList.add('active');
}

function closePositionModal() {
    document.getElementById('positionModal').classList.remove('active');
}

// 暗色模式
function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', isDark ? 'light' : 'dark');
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
    document.getElementById('themeToggle').textContent = isDark ? '🌙' : '☀️';
}

function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        const btn = document.getElementById('themeToggle');
        if (btn) btn.textContent = '☀️';
    }
}
initTheme();

function getPrimaryColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#06b6d4';
}

function applyColorTheme(value) {
    const html = document.documentElement;
    const valid = ['cyan', 'purple', 'green', 'orange', 'rose'].includes(value) ? value : 'cyan';
    html.setAttribute('data-color-theme', valid);
    localStorage.setItem('colorTheme', valid);
    const sel = document.getElementById('colorThemeSelect');
    if (sel) sel.value = valid;
    // 主题色仅影响 CSS 变量，列表无需重绘；仅重绘使用 --primary 的图表
    if (typeof drawProfitTrendChart === 'function') drawProfitTrendChart();
    if (typeof drawAllocationChart === 'function') drawAllocationChart();
}

function initColorTheme() {
    const saved = localStorage.getItem('colorTheme');
    const valid = ['cyan', 'purple', 'green', 'orange', 'rose'].includes(saved) ? saved : 'cyan';
    document.documentElement.setAttribute('data-color-theme', valid);
    const sel = document.getElementById('colorThemeSelect');
    if (sel) sel.value = valid;
}
initColorTheme();
initFundListViewMode();

// 回到顶部按钮
(function() {
    const scrollBtn = document.getElementById('scrollTopBtn');
    if (!scrollBtn) return;
    let ticking = false;
    window.addEventListener('scroll', function() {
        if (!ticking) {
            window.requestAnimationFrame(function() {
                if (window.scrollY > 300) {
                    scrollBtn.classList.add('visible');
                } else {
                    scrollBtn.classList.remove('visible');
                }
                ticking = false;
            });
            ticking = true;
        }
    });
})();

// 更新页脚同步状态
function updateFooterSyncStatus() {
    const el = document.getElementById('footerSyncStatus');
    if (!el) return;
    const hasUnsynced = localStorage.getItem('hasUnsyncedChanges') === 'true';
    const gistId = localStorage.getItem('gist_id');
    if (!gistId) {
        el.textContent = '未配置云同步';
    } else if (hasUnsynced) {
        el.textContent = '⚠️ 有未同步数据';
        el.style.color = '#e67e22';
    } else {
        el.textContent = '✅ 已同步';
        el.style.color = '';
    }
}

// 更多菜单
function toggleBackupMenu() {
    const dropdown = document.getElementById('backupDropdown');
    dropdown.classList.toggle('active');
}

function closeBackupMenu() {
    document.getElementById('backupDropdown').classList.remove('active');
}

function dismissSyncReminder() {
    const reminder = document.getElementById('syncReminder');
    if (reminder) reminder.style.display = 'none';
    // badge 保留，只关闭提示条
}

function initSyncReminder() {
    if (localStorage.getItem('hasUnsyncedChanges') === 'true') {
        showSyncReminder();
    }
}

// 保存基金代码到localStorage；skipSyncReminder=true 时仅标记未同步不弹提醒（用于添加基金流程，关闭弹窗后再提示）
function saveFundCodes(codes, skipSyncReminder) {
    localStorage.setItem('fundCodes', JSON.stringify(codes));
    markDataChanged(!!skipSyncReminder);
}

// 基金所属板块：code -> 板块名，用于总览饼图按板块汇总
// 优先级：1) 用户手动设置  2) 按名称关键词推断  3) 仅当名称无法匹配时再用天天基金「基金类型」
// 候选板块来自 fund.eastmoney.com/js/fundcode_search.js 全量基金名称分析，见 sector-candidates.json；可用 scripts/extract_sector_candidates.py 重新生成
const SECTOR_OPTIONS = ['债券', '指数', '科技', '港股', '医疗', '消费', '金融', '红利', '养老', '新能源', '纳斯达克', '机器人', '有色', '央企', '国企', '军工', '同业存单', '地产', '黄金', '传媒', '农业', 'ESG', '电力', '环保', '光伏产业', '化工', '港股通科技', '基建', '石油', '红利低波动', '港股通互联网', '电池主题', '一带一路', '煤炭', '上海环交所碳中和', '油气', '港股通高股息投资', '钢铁', '新能源汽车', '天然气', '长三角', '细分化工产业主题', '卫星', '创新药产业', '金融科技主题', '芯片产业', '消费电子主题', '港股通央企红利', '农业主题', '物流', '软件服务', '卫星产业', '主要消费', '红利低波', '畜牧养殖', '动漫游戏', '工业有色金属主题', '有色金属矿业主题', '绿色电力', '电信主题', '物联网主题', '信息技术应用创新产业', '港股通创新药', '港股通医疗主题', '国企一带一路', '稀土产业', '人工智能主题', '稀有金属主题', '生物科技主题', '港股通消费主题', '云计算与大数据主题', '汽车零部件主题', '沪港深云计算产业', '数字经济主题', '大数据产业', '油气资源', '科创创业人工智能', '体育', '长江保护主题', '机床', '装备产业', '油气产业', '通用航空主题', '工程机械主题', '建筑', '智能电动汽车', '新材料主题', '智能汽车主题', '金融地产', '基建工程', '生物医药', '京津冀', '央企创新驱动', '红利质量', '石化产业', '半导体产业', '香港内地国有企业', '车联网主题', '工业互联网主题', '香港科技', '其他'];
function loadFundSectors() {
    const saved = localStorage.getItem('fundSectors');
    return saved ? JSON.parse(saved) : {};
}
function saveFundSectors(sectors) {
    localStorage.setItem('fundSectors', JSON.stringify(sectors));
    markDataChanged();
}
/** 从已加载的基金列表（fundcode_search.js）获取该基金的「基金类型」 */
function getFundTypeFromApi(code) {
    if (!state.fundList || state.fundList.length === 0) return null;
    const fund = state.fundList.find(f => f.code === code);
    return fund && fund.type ? fund.type : null;
}
/** 将天天基金「基金类型」映射为板块（仅能区分指数/债券/QDII 等，股票型/混合型仍靠名称推断） */
function mapApiTypeToSector(apiType) {
    if (!apiType) return null;
    const t = String(apiType);
    if (/指数|ETF/.test(t)) return '指数';
    if (/债券|债基|纯债|短债|中短债|信用债|利率债/.test(t)) return '债券';
    if (/QDII|QDII型/.test(t)) return '海外';
    if (/货币/.test(t)) return '其他';
    return null; // 股票型、混合型等无法从类型得知板块，返回 null 走名称推断
}
function getFundSector(code, fundName) {
    const sectors = loadFundSectors();
    if (sectors[code]) return sectors[code];
    const name = fundName || '';
    const fromName = inferSectorFromName(name);
    // 名称能推断出具体板块时优先用名称；只有推断为「其他」时才用 API 类型（指数/债券/QDII）
    if (fromName !== '其他') return fromName;
    const apiType = getFundTypeFromApi(code);
    const sectorFromApi = mapApiTypeToSector(apiType);
    return sectorFromApi || '其他';
}
function setFundSector(code, sector) {
    const sectors = loadFundSectors();
    if (sector) sectors[code] = sector; else delete sectors[code];
    saveFundSectors(sectors);
}
/** 按基金名称推断板块，关键词与市面行业/主题命名对齐（顺序：更具体的先匹配） */
function inferSectorFromName(name) {
    if (!name) return '其他';
    const n = name;
    // 医药
    if (/医药|医疗|生物|创新药|CXO|中药|医疗器械|医疗服务/.test(n)) return '医药';
    // 消费（白酒/食品/家电/汽车/旅游等）
    if (/消费|白酒|食品|饮料|家电|汽车|旅游|免税|纺织服装|零售/.test(n)) return '消费';
    // 新能源（光伏/电池/储能/新能车）
    if (/新能源|光伏|电池|锂电|储能|新能车|电动车|碳中和/.test(n)) return '新能源';
    // 金融
    if (/金融|银行|证券|保险|券商/.test(n)) return '金融';
    // 卫星（卫星互联网/导航/低轨等，单独板块，先于军工匹配）
    if (/卫星|北斗|低轨|星链|卫星互联网|卫星导航/.test(n)) return '卫星';
    // 军工
    if (/军工|国防|航空|航天|兵器/.test(n)) return '军工';
    // 地产
    if (/地产|房地产/.test(n)) return '地产';
    // 电网/电力（输配/绿电）
    if (/电网|电力|输配|绿电|水电|火电/.test(n)) return '电网';
    // 有色金属（有色/稀土/工业金属，先于黄金匹配）
    if (/有色金属|有色|稀土|工业金属|铜|铝业|稀有金属/.test(n)) return '有色金属';
    // 黄金/贵金属
    if (/黄金|贵金属/.test(n)) return '黄金';
    // 机器人/高端制造/自动化（单独板块，先于科技匹配）
    if (/机器人|智能机器|工业机器人|自动化|高端制造|智能装备|数控/.test(n)) return '机器人';
    // 科技（半导体/芯片/电子/计算机/互联网/软件/AI等）
    if (/科技|半导体|芯片|电子|通信|计算机|互联网|软件|人工智能|AI|数字经济|云计算|大数据/.test(n)) return '科技';
    // 煤炭
    if (/煤炭|煤矿/.test(n)) return '煤炭';
    // 钢铁
    if (/钢铁|黑色金属/.test(n)) return '钢铁';
    // 化工
    if (/化工|化学|化纤/.test(n)) return '化工';
    // 建材
    if (/建材|水泥|玻璃|陶瓷/.test(n)) return '建材';
    // 传媒/游戏
    if (/传媒|游戏|影视|动漫|文化传播|娱乐|手游|电竞/.test(n)) return '传媒';
    // 环保（与新能源的碳中和已归新能源，此处为环保/ESG等）
    if (/环保|ESG|节能|污水处理/.test(n)) return '环保';
    // 农业
    if (/农业|养殖|畜牧|种业|农林牧渔|生猪|饲料/.test(n)) return '农业';
    // 港股/海外/债券/指数
    if (/港股|恒生|沪港深/.test(n)) return '港股';
    if (/纳斯达克|标普|美股|QDII|海外/.test(n)) return '海外';
    if (/债券|纯债|短债|中短债|信用债|利率债/.test(n)) return '债券';
    if (/宽基|指数|沪深|中证|上证|创业板|科创/.test(n)) return '指数';
    return '其他';
}

// 每只基金最多保留的历史点数，避免 localStorage 超配额（约 5MB）
var MAX_HISTORY_POINTS_PER_FUND = 300;

function trimHistoryDataForStorage(historyData, maxPerFund) {
    if (!historyData || typeof historyData !== 'object') return {};
    maxPerFund = maxPerFund || MAX_HISTORY_POINTS_PER_FUND;
    var out = {};
    Object.keys(historyData).forEach(function (code) {
        var arr = historyData[code];
        if (Array.isArray(arr) && arr.length > 0) {
            out[code] = arr.length <= maxPerFund ? arr : arr.slice(-maxPerFund);
        }
    });
    return out;
}

// 加载历史数据
function loadHistoryData() {
    const saved = localStorage.getItem('fundHistoryData');
    return saved ? JSON.parse(saved) : {};
}

// 保存历史数据（写入前裁剪，避免超出 localStorage 配额）
function saveHistoryData() {
    var toSave = trimHistoryDataForStorage(state.historyData);
    var str = JSON.stringify(toSave);
    try {
        localStorage.setItem('fundHistoryData', str);
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            toSave = trimHistoryDataForStorage(state.historyData, 80);
            try {
                localStorage.setItem('fundHistoryData', JSON.stringify(toSave));
            } catch (e2) {
                console.warn('fundHistoryData 仍超配额，已跳过保存', e2);
            }
        } else {
            throw e;
        }
    }
}

// 加载持仓数据
function loadPositions() {
    const saved = localStorage.getItem('state.positions');
    return saved ? JSON.parse(saved) : {};
}

// 保存持仓数据
function savePositions() {
    localStorage.setItem('state.positions', JSON.stringify(state.positions));
    markDataChanged();
    if (state._dailyPnlMapCache) state._dailyPnlMapCache = null;
}

// 加载今日范围数据
function loadDailyRanges() {
    const saved = localStorage.getItem('state.dailyRanges');
    const data = saved ? JSON.parse(saved) : {};
    // 检查日期，如果不是今天的数据则清空
    const today = new Date().toLocaleDateString('zh-CN');
    if (data.date !== today) {
        return { date: today, ranges: {} };
    }
    return data;
}

// 保存今日范围数据
function saveDailyRanges() {
    const today = new Date().toLocaleDateString('zh-CN');
    localStorage.setItem('state.dailyRanges', JSON.stringify({
        date: today,
        ranges: state.dailyRanges
    }));
}

// ========== 基金列表与估值数据拉取 ==========
function fetchFundList() {
    if (state.isFetchingFundList) return;
    
    state.isFetchingFundList = true;
    
    // 清理旧的全局变量
    if (window.r) {
        delete window.r;
    }
    
    const script = document.createElement('script');
    script.id = 'state.fundListScript';
    script.src = `https://fund.eastmoney.com/js/fundcode_search.js?t=${Date.now()}`;
    
    script.onload = () => {
        // Script加载完成后，r变量应该已经定义
        setTimeout(() => {
            if (window.r && Array.isArray(window.r)) {
                processFundListData(window.r);
            } else {
                console.error('基金列表数据格式错误或未定义');
                state.isFetchingFundList = false;
                showToast('基金列表数据加载异常，请稍后重试', 'warning');
            }
            script.remove();
        }, 100);
    };

    script.onerror = () => {
        console.error('获取基金列表失败');
        state.isFetchingFundList = false;
        showToast('获取基金列表失败，请检查网络', 'error');
        script.remove();
    };
    
    document.body.appendChild(script);
}

// 处理基金列表数据
function processFundListData(data) {
    if (!data || !Array.isArray(data)) {
        console.error('基金列表数据格式错误');
        state.isFetchingFundList = false;
        showToast('基金列表数据格式错误，请稍后重试', 'warning');
        return;
    }

    // 解析基金列表数据
    // 数据格式: ["代码","简拼","基金名称","基金类型","拼音全拼"]
    state.fundList = data.map(item => ({
        code: item[0],
        abbr: item[1],
        name: item[2],
        type: item[3],
        pinyin: item[4]
    }));

    // 保存到本地缓存
    const cacheData = {
        data: state.fundList,
        timestamp: Date.now()
    };
    localStorage.setItem('fundListCache', JSON.stringify(cacheData));
    
    state.isFetchingFundList = false;
    
    // 如果用户正在输入，更新下拉列表
    const input = document.getElementById('fundCodeInput');
    const listEl = document.getElementById('autocompleteList');
    if (input && listEl && listEl.classList.contains('active')) {
        const keyword = input.value.trim();
        if (keyword) {
            showAutocompleteSuggestions(keyword);
        }
    }
    
    // 清理全局变量
    if (window.r) {
        delete window.r;
    }
}

// 加载缓存的基金列表
function loadFundListCache() {
    const cached = localStorage.getItem('fundListCache');
    if (!cached) return null;

    try {
        const cacheData = JSON.parse(cached);
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        // 检查缓存是否过期（超过1天）
        if (now - cacheData.timestamp > oneDay) {
            return null;
        }

        state.fundList = cacheData.data || [];
        return state.fundList;
    } catch (e) {
        console.error('加载基金列表缓存失败', e);
        return null;
    }
}

// 搜索基金
function searchFunds(keyword) {
    if (!keyword || keyword.length === 0) return [];
    
    const lowerKeyword = keyword.toLowerCase();
    
    // 搜索匹配的基金（代码、名称、简拼、全拼）
    const results = state.fundList.filter(fund => {
        return fund.code.includes(keyword) ||
               fund.name.toLowerCase().includes(lowerKeyword) ||
               fund.abbr.toLowerCase().includes(lowerKeyword) ||
               fund.pinyin.toLowerCase().includes(lowerKeyword);
    });

    // 限制返回数量，避免列表太长
    return results.slice(0, 20);
}

// 显示自动补全列表
function showAutocompleteSuggestions(keyword) {
    const listEl = document.getElementById('autocompleteList');
    
    if (!keyword || keyword.length === 0) {
        listEl.classList.remove('active');
        return;
    }

    // 如果基金列表还没加载，显示加载中，并触发加载
    if (state.fundList.length === 0) {
        listEl.innerHTML = '<div class="autocomplete-loading">基金列表加载中，请稍候...</div>';
        listEl.classList.add('active');
        
        // 如果还没开始加载，立即开始加载
        if (!state.isFetchingFundList) {
            fetchFundList();
        }
        return;
    }

    const results = searchFunds(keyword);
    
    if (results.length === 0) {
        listEl.innerHTML = '<div class="autocomplete-empty">未找到匹配的基金</div>';
        listEl.classList.add('active');
        return;
    }

    // 渲染搜索结果
    listEl.innerHTML = '';
    results.forEach(function (fund, index) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'autocomplete-item';
        itemDiv.dataset.code = fund.code;
        itemDiv.dataset.name = fund.name;
        itemDiv.onclick = function () { selectFund(fund.code, fund.name); };
        if (index === 0) itemDiv.classList.add('selected');
        const nameDiv = document.createElement('div');
        nameDiv.className = 'autocomplete-item-name';
        nameDiv.textContent = fund.name;
        const typeSpan = document.createElement('span');
        typeSpan.className = 'autocomplete-item-type';
        typeSpan.textContent = fund.type;
        nameDiv.appendChild(typeSpan);
        const codeDiv = document.createElement('div');
        codeDiv.className = 'autocomplete-item-code';
        codeDiv.textContent = fund.code;
        itemDiv.appendChild(nameDiv);
        itemDiv.appendChild(codeDiv);
        listEl.appendChild(itemDiv);
    });
    state.autocompleteSelectedIndex = results.length > 0 ? 0 : -1;
    listEl.classList.add('active');
}

// HTML转义函数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 选择基金
function selectFund(code, name) {
    const input = document.getElementById('fundCodeInput');
    input.value = code;
    document.getElementById('autocompleteList').classList.remove('active');
    state.autocompleteSelectedIndex = -1;
    addFund();
}

/** 键盘切换备选列表选中项，并滚动到可见 */
function setAutocompleteSelection(index) {
    const listEl = document.getElementById('autocompleteList');
    const items = listEl.querySelectorAll('.autocomplete-item');
    if (items.length === 0) return;
    state.autocompleteSelectedIndex = Math.max(0, Math.min(index, items.length - 1));
    items.forEach(function (el, i) {
        el.classList.toggle('selected', i === state.autocompleteSelectedIndex);
    });
    items[state.autocompleteSelectedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/** 处理基金输入框在备选列表展开时的键盘操作 */
function handleFundInputKeydown(e) {
    const listEl = document.getElementById('autocompleteList');
    if (!listEl || !listEl.classList.contains('active')) return;
    const items = listEl.querySelectorAll('.autocomplete-item');
    if (items.length === 0) return;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAutocompleteSelection(state.autocompleteSelectedIndex + 1);
        return;
    }
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAutocompleteSelection(state.autocompleteSelectedIndex - 1);
        return;
    }
    if (e.key === 'Enter') {
        e.preventDefault();
        const idx = state.autocompleteSelectedIndex;
        if (idx >= 0 && items[idx]) {
            selectFund(items[idx].dataset.code, items[idx].dataset.name);
        }
        return;
    }
    if (e.key === 'Escape') {
        e.preventDefault();
        listEl.classList.remove('active');
        state.autocompleteSelectedIndex = -1;
    }
}

// 隐藏自动补全列表
function hideAutocompleteList() {
    setTimeout(() => {
        document.getElementById('autocompleteList').classList.remove('active');
    }, 200); // 延迟以便点击事件能触发
}

// 导出数据
function exportData() {
    // 收集所有数据
    const exportData = {
        version: '1.1',
        exportDate: new Date().toISOString(),
        fundCodes: loadFundCodes(),
        fundSectors: loadFundSectors(),
        positions: state.positions,
        historyData: state.historyData,
        dailyRanges: {
            date: new Date().toDateString(),
            ranges: state.dailyRanges
        },
        sortOrder: state.sortOrder,
        fundDetails: state.fundDetails
    };

    // 转换为JSON字符串
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    // 创建下载链接
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    
    // 生成文件名：fund-dashboard-backup-日期时间.json
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    link.download = `fund-dashboard-backup-${timestamp}.json`;
    
    // 触发下载
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // 更新最后备份时间
    updateLastBackupDate();

    showToast('✅ 数据导出成功！\n文件已保存到下载文件夹\n建议定期备份以防数据丢失', 'success');
}

// 导出CSV
function exportCSV() {
    const codes = loadFundCodes();
    const rows = [['基金代码', '基金名称', '当前估值', '涨跌幅%', '单位净值', '持有份额', '持仓成本', '当前市值', '持仓收益', '收益率%']];

    codes.forEach(code => {
        const data = state.fundsData[code];
        const posInfo = calculatePosition(code);
        const name = data ? data.name : code;
        const display = data ? getDisplayValues(data) : { value: '', percentage: 0 };
        const dwjz = data ? data.dwjz : '';
        const shares = posInfo ? posInfo.totalShares.toFixed(2) : '0';
        const cost = posInfo ? posInfo.totalCost.toFixed(2) : '0';
        let marketValue = '', profit = '', profitRate = '';
        if (posInfo && posInfo.totalShares > 0 && data) {
            const currentNav = display.isActual ? parseFloat(display.value) : parseFloat(data.gsz);
            const mv = posInfo.totalShares * currentNav;
            const p = mv - posInfo.totalCost;
            marketValue = mv.toFixed(2);
            profit = p.toFixed(2);
            profitRate = posInfo.avgCost > 0 ? ((currentNav - posInfo.avgCost) / posInfo.avgCost * 100).toFixed(2) : '0';
        }
        rows.push([code, name, display.value, display.percentage.toFixed(2), dwjz, shares, cost, marketValue, profit, profitRate]);
    });

    // BOM + CSV content for Excel compatibility
    const csvContent = '\uFEFF' + rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    link.download = `fund-dashboard-${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('✅ CSV导出成功！可用Excel或WPS打开查看', 'success');
}

// 导入数据
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 检查文件类型
    if (!file.name.endsWith('.json')) {
        showToast('❌ 请选择JSON格式的备份文件', 'error');
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);

            // 验证数据格式
            if (!importedData.version || !importedData.fundCodes) {
                throw new Error('无效的备份文件格式');
            }

            // 询问用户是否覆盖现有数据
            const currentCodes = loadFundCodes();
            let message = '确定要导入数据吗？\n\n';
            
            if (currentCodes.length > 0) {
                message += `⚠️ 当前有 ${currentCodes.length} 只基金\n`;
                message += `📥 导入文件包含 ${importedData.fundCodes.length} 只基金\n\n`;
                message += '选择导入方式：\n';
                message += '确定 = 合并数据（保留现有+添加新的）\n';
                message += '取消 = 放弃导入';
                
                if (!confirm(message)) {
                    event.target.value = '';
                    return;
                }

                // 合并模式：询问是否要完全覆盖
                if (confirm('是否要完全覆盖现有数据？\n\n确定 = 完全覆盖\n取消 = 合并保留')) {
                    // 完全覆盖模式
                    performFullImport(importedData);
                } else {
                    // 合并模式
                    performMergeImport(importedData);
                }
            } else {
                // 没有现有数据，直接导入
                if (confirm(message + `将导入 ${importedData.fundCodes.length} 只基金的数据`)) {
                    performFullImport(importedData);
                }
            }

            event.target.value = '';
        } catch (error) {
            console.error('导入数据失败：', error);
            showToast('❌ 导入失败：' + error.message + '\n请确保选择的是有效的备份文件', 'error');
            event.target.value = '';
        }
    };

    reader.readAsText(file);
}

// 执行完全覆盖导入
function performFullImport(importedData) {
    try {
        // 清空现有数据
        state.fundsData = {};
        state.charts = {};
        
        // 导入所有数据
        saveFundCodes(importedData.fundCodes || []);
        if (importedData.fundSectors && typeof importedData.fundSectors === 'object') {
            saveFundSectors(importedData.fundSectors);
        }
        state.positions = importedData.positions || {};
        if (state._dailyPnlMapCache) state._dailyPnlMapCache = null;
        savePositions();
        state.historyData = trimHistoryDataForStorage(importedData.historyData || {});
        saveHistoryData();
        state.fundDetails = importedData.fundDetails || {};
        
        // 保存详细信息到缓存
        Object.keys(state.fundDetails).forEach(code => {
            const cacheData = {
                data: state.fundDetails[code],
                timestamp: Date.now()
            };
            localStorage.setItem(`fundDetail_${code}`, JSON.stringify(cacheData));
        });
        
        if (importedData.dailyRanges) {
            state.dailyRanges = importedData.dailyRanges.ranges || {};
            saveDailyRanges();
        }
        
        if (importedData.sortOrder) {
            state.sortOrder = importedData.sortOrder;
            localStorage.setItem('sortOrder', state.sortOrder);
            document.getElementById('sortSelect').value = state.sortOrder;
        }

        // 重新加载基金数据
        renderFunds();
        const codes = loadFundCodes();
        codes.forEach(code => {
            fetchFundData(code);
        });
        setTimeout(function () {
            if (state._dailyPnlMapCache) state._dailyPnlMapCache = null;
            if (typeof updateOverviewPanel === 'function') updateOverviewPanel();
        }, 0);

        const dateStr = importedData.exportDate || importedData.syncDate;
        const dateDisplay = dateStr ? (() => { const d = new Date(dateStr); return isNaN(d.getTime()) ? '' : d.toLocaleString('zh-CN'); })() : '';
        const dateLine = dateDisplay ? `\n${importedData.syncDate ? '同步' : '导出'}时间：${dateDisplay}` : '';
        showToast(`✅ 数据导入成功！已导入 ${importedData.fundCodes.length} 只基金${dateLine}`, 'success');
    } catch (error) {
        console.error('完全导入失败：', error);
        showToast('❌ 导入过程中出错：' + error.message, 'error');
    }
}

// 执行合并导入
function performMergeImport(importedData) {
    try {
        const currentCodes = loadFundCodes();
        const newCodes = importedData.fundCodes || [];
        
        // 合并基金代码（去重）
        const mergedCodes = [...new Set([...currentCodes, ...newCodes])];
        saveFundCodes(mergedCodes);
        if (importedData.fundSectors && typeof importedData.fundSectors === 'object') {
            const currentSectors = loadFundSectors();
            Object.assign(currentSectors, importedData.fundSectors);
            saveFundSectors(currentSectors);
        }

        // 合并持仓数据（导入的数据优先，含已删除基金的持仓）
        Object.keys(importedData.positions || {}).forEach(code => {
            if (!state.positions[code] || confirm(`基金 ${code} 已有持仓数据，是否覆盖？`)) {
                state.positions[code] = importedData.positions[code];
            }
        });
        if (state._dailyPnlMapCache) state._dailyPnlMapCache = null;
        savePositions();

        // 合并历史数据（单只基金只保留未覆盖时的合并，写入前整体裁剪避免超配额）
        Object.keys(importedData.historyData || {}).forEach(code => {
            if (!state.historyData[code]) {
                state.historyData[code] = importedData.historyData[code];
            }
        });
        state.historyData = trimHistoryDataForStorage(state.historyData);
        saveHistoryData();

        // 重新加载
        renderFunds();
        const codes = loadFundCodes();
        codes.forEach(code => {
            if (!state.fundsData[code]) {
                fetchFundData(code);
            }
        });

        if (typeof updateOverviewPanel === 'function') updateOverviewPanel();
        const addedCount = mergedCodes.length - currentCodes.length;
        showToast(`✅ 数据合并成功！新增 ${addedCount} 只基金，总计 ${mergedCodes.length} 只基金`, 'success');
    } catch (error) {
        console.error('合并导入失败：', error);
        showToast('❌ 合并过程中出错：' + error.message, 'error');
    }
}

// ==================== 云同步功能 (GitHub Gist) ====================

// 加载云同步设置
function loadCloudSettings() {
    return {
        token: localStorage.getItem('github_token') || '',
        gistId: localStorage.getItem('gist_id') || ''
    };
}

// 保存云同步设置
function saveCloudSettings() {
    const token = document.getElementById('githubTokenInput').value.trim();
    const gistId = document.getElementById('gistIdInput').value.trim();
    
    if (token) {
        localStorage.setItem('github_token', token);
    } else {
        localStorage.removeItem('github_token');
    }
    
    if (gistId) {
        localStorage.setItem('gist_id', gistId);
    } else {
        localStorage.removeItem('gist_id');
    }
    
    closeCloudSettingsModal();
    showToast('✅ 云同步设置已保存', 'success');
}

// 打开云同步设置模态框
function openCloudSettingsModal() {
    const settings = loadCloudSettings();
    document.getElementById('githubTokenInput').value = settings.token;
    document.getElementById('gistIdInput').value = settings.gistId;
    
    // 更新连接状态显示
    const statusEl = document.getElementById('cloudStatusDisplay');
    if (settings.token) {
        statusEl.innerHTML = `<div class="cloud-status connected">✅ 已配置 Token${settings.gistId ? '，Gist ID: <code>' + settings.gistId.slice(0, 8) + '...</code>' : '（首次上传将自动创建 Gist）'}</div>`;
    } else {
        statusEl.innerHTML = '<div class="cloud-status disconnected">⚠️ 未配置 Token，请按下方说明设置</div>';
    }
    
    document.getElementById('cloudSettingsModal').classList.add('active');
}

// 关闭云同步设置模态框（自动保存）
function closeCloudSettingsModal() {
    // 自动保存当前输入的设置
    const token = document.getElementById('githubTokenInput').value.trim();
    const gistId = document.getElementById('gistIdInput').value.trim();
    
    if (token) {
        localStorage.setItem('github_token', token);
    } else {
        localStorage.removeItem('github_token');
    }
    if (gistId) {
        localStorage.setItem('gist_id', gistId);
    } else {
        localStorage.removeItem('gist_id');
    }
    
    document.getElementById('cloudSettingsModal').classList.remove('active');
}

// 切换 Token 可见性
function toggleTokenVisibility() {
    const input = document.getElementById('githubTokenInput');
    input.type = input.type === 'password' ? 'text' : 'password';
}

// 收集所有需要同步的数据（positions 含已删除基金；仅同步已删除基金的 fundDetails 以控制体积并供日历计算盈亏）
function collectSyncData() {
    const codes = loadFundCodes();
    const details = state.fundDetails || {};
    const deletedDetails = {};
    Object.keys(state.positions || {}).forEach(code => {
        if (!codes.includes(code) && details[code] && details[code].netWorthData && details[code].netWorthData.length > 0) {
            deletedDetails[code] = { netWorthData: details[code].netWorthData, name: details[code].name };
        }
    });
    return {
        version: '1.1',
        syncDate: new Date().toISOString(),
        fundCodes: codes,
        fundSectors: loadFundSectors(),
        positions: Object.assign({}, state.positions),
        fundDetails: deletedDetails,
        historyData: state.historyData,
        dailyRanges: {
            date: new Date().toDateString(),
            ranges: state.dailyRanges
        },
        sortOrder: state.sortOrder,
        chartRangeSelection: state.chartRangeSelection,
        currentMainView: state.currentMainView
    };
}

// 上传数据到云端 (GitHub Gist)
async function uploadToCloud() {
    const settings = loadCloudSettings();
    
    if (!settings.token) {
        openCloudSettingsModal();
        return;
    }
    
    if (!confirm('确定要上传本地数据到云端吗？\n\n这将覆盖云端已有的数据。')) {
        return;
    }
    
    // 禁用按钮防止重复点击
    const backupToggleBtn = document.getElementById('backupToggle');
    if (backupToggleBtn) backupToggleBtn.disabled = true;
    
    try {
        const data = collectSyncData();
        const content = JSON.stringify(data, null, 2);
        
        const gistData = {
            description: '百特曼计划 - 云同步数据',
            public: false,
            files: {
                'fund-dashboard-sync.json': {
                    content: content
                }
            }
        };
        
        let response;
        
        if (settings.gistId) {
            // 更新已有 Gist
            response = await fetch(`https://api.github.com/gists/${settings.gistId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `token ${settings.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(gistData)
            });
            
            if (response.status === 404) {
                // Gist 不存在，清除旧 ID 并创建新的
                localStorage.removeItem('gist_id');
                settings.gistId = '';
            }
        }
        
        if (!settings.gistId) {
            // 创建新 Gist
            response = await fetch('https://api.github.com/gists', {
                method: 'POST',
                headers: {
                    'Authorization': `token ${settings.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(gistData)
            });
        }
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }
        
        const result = await response.json();
        
        // 保存 Gist ID
        localStorage.setItem('gist_id', result.id);
        
        clearSyncReminder();
        const syncTime = new Date().toLocaleString('zh-CN');
        showToast(`✅ 数据上传成功！时间：${syncTime}\nGist ID：${result.id}\n在其他设备上使用相同 Token 和 Gist ID 即可下载。`, 'success');
        
    } catch (error) {
        console.error('上传到云端失败：', error);
        if (error.message.includes('Bad credentials') || error.message.includes('401')) {
            showToast('❌ 上传失败：Token 无效或已过期，请在设置中更新 Token', 'error');
        } else if (error.message.includes('Not Found') || error.message.includes('404')) {
            showToast('❌ 上传失败：Gist 不存在，请清空 Gist ID 后重试', 'error');
        } else {
            showToast('❌ 上传失败：' + error.message, 'error');
        }
    } finally {
        if (backupToggleBtn) backupToggleBtn.disabled = false;
    }
}

// 从云端下载数据
async function downloadFromCloud() {
    const settings = loadCloudSettings();
    
    if (!settings.token) {
        openCloudSettingsModal();
        return;
    }
    
    if (!settings.gistId) {
        showToast('⚠️ 未设置 Gist ID，请先在设置中填入 Gist ID 或先在其他设备上传一次', 'warning');
        openCloudSettingsModal();
        return;
    }
    
    if (!confirm('确定要从云端下载数据吗？\n\n您可以选择覆盖或合并本地数据。')) {
        return;
    }
    
    const backupToggleBtn = document.getElementById('backupToggle');
    if (backupToggleBtn) backupToggleBtn.disabled = true;
    
    try {
        const response = await fetch(`https://api.github.com/gists/${settings.gistId}`, {
            cache: 'no-store',
            headers: {
                'Authorization': `token ${settings.token}`
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }
        
        const gist = await response.json();
        const file = gist.files['fund-dashboard-sync.json'];
        
        if (!file) {
            throw new Error('Gist 中未找到同步数据文件');
        }
        
        let importedData;
        try {
            importedData = JSON.parse(file.content);
        } catch (e) {
            throw new Error('云端数据解析失败，可能因文件过大被截断。请在原设备重新上传（当前仅同步已删除基金的净值数据以减小体积）');
        }
        
        // 验证数据格式
        if (!importedData.version || !importedData.fundCodes) {
            throw new Error('云端数据格式无效');
        }
        
        const cloudDate = new Date(importedData.syncDate).toLocaleString('zh-CN');
        const currentCodes = loadFundCodes();
        
        let message = `📥 云端数据信息：\n`;
        message += `⏰ 上传时间：${cloudDate}\n`;
        message += `📊 包含 ${importedData.fundCodes.length} 只基金\n\n`;
        
        if (currentCodes.length > 0) {
            message += `本地目前有 ${currentCodes.length} 只基金\n\n`;
            message += '确定 = 完全覆盖本地数据\n';
            message += '取消 = 放弃下载';
        } else {
            message += '确定 = 导入数据';
        }
        
        if (!confirm(message)) {
            return;
        }
        
        // 执行完全覆盖导入
        performFullImport(importedData);
        
        // 恢复额外的同步设置
        if (importedData.chartRangeSelection) {
            state.chartRangeSelection = importedData.chartRangeSelection;
        }
        
        clearSyncReminder();
        const posCount = Object.keys(importedData.positions || {}).length;
        const posHint = posCount > 0 ? `、${posCount} 条持仓记录` : '';
        showToast(`✅ 云端数据下载成功！已导入 ${importedData.fundCodes.length} 只基金${posHint}`, 'success');
        
    } catch (error) {
        console.error('从云端下载失败：', error);
        if (error.message.includes('Bad credentials') || error.message.includes('401')) {
            showToast('❌ 下载失败：Token 无效或已过期，请在设置中更新 Token', 'error');
        } else if (error.message.includes('Not Found') || error.message.includes('404')) {
            showToast('❌ 下载失败：Gist 不存在，请检查 Gist ID 是否正确', 'error');
        } else {
            showToast('❌ 下载失败：' + error.message, 'error');
        }
    } finally {
        if (backupToggleBtn) backupToggleBtn.disabled = false;
    }
}

// ==================== 基金管理 ====================

// 添加基金
function addFund() {
    const input = document.getElementById('fundCodeInput');
    const code = input.value.trim();
    
    if (!code) {
        showToast('请输入基金代码或名称搜索', 'warning');
        return;
    }

    if (!/^\d{6}$/.test(code)) {
        showToast('请选择正确的6位基金代码', 'warning');
        return;
    }

    const codes = loadFundCodes();
    if (codes.includes(code)) {
        showToast('该基金已添加', 'info');
        return;
    }

    codes.push(code);
    saveFundCodes(codes, true);
    input.value = '';
    state.justAddedFundCode = code;
    state.scrollDeferredForNewFund = true;

    // 隐藏自动补全列表
    document.getElementById('autocompleteList').classList.remove('active');

    // 先加载基金数据（渲染后会在 scheduleRender 回调中定位并高亮该基金）
    fetchFundData(code);
    
    // 弹出初始申购模态框（延迟等待数据加载，加载失败时取消）
    const purchaseTimer = setTimeout(() => {
        // 只有基金未被删除（加载成功）时才弹出
        if (loadFundCodes().includes(code)) {
            openInitialPurchaseModal(code);
        }
    }, 500);
}

// 删除基金
async function removeFund(code, skipConfirm = false) {
    if (!skipConfirm) {
        // 构建详细的确认信息
        const data = state.fundsData[code];
        const posInfo = calculatePosition(code);
        
        // 构建HTML格式的确认信息
        let messageHtml = '';
        
        // 基金信息卡片
        messageHtml += '<div class="confirm-fund-info">';
        messageHtml += '<div class="confirm-fund-name">📊 ' + (data ? data.name : '未知基金') + '</div>';
        messageHtml += '<div class="confirm-fund-code">代码：' + code + '</div>';
        messageHtml += '</div>';
        
        // 持仓信息
        if (posInfo && posInfo.totalShares > 0) {
            messageHtml += '<div class="confirm-section">';
            messageHtml += '<div class="confirm-section-title">💼 持仓信息</div>';
            messageHtml += '<div class="confirm-detail-grid">';
            messageHtml += '<div class="confirm-detail-item">';
            messageHtml += '<div class="confirm-detail-label">持有份额</div>';
            messageHtml += '<div class="confirm-detail-value">' + posInfo.totalShares.toFixed(2) + '</div>';
            messageHtml += '</div>';
            messageHtml += '<div class="confirm-detail-item">';
            messageHtml += '<div class="confirm-detail-label">平均成本</div>';
            messageHtml += '<div class="confirm-detail-value">' + posInfo.avgCost.toFixed(4) + '</div>';
            messageHtml += '</div>';
            messageHtml += '<div class="confirm-detail-item">';
            messageHtml += '<div class="confirm-detail-label">持仓成本</div>';
            messageHtml += '<div class="confirm-detail-value highlight">' + posInfo.totalCost.toFixed(2) + '</div>';
            messageHtml += '</div>';
            messageHtml += '<div class="confirm-detail-item">';
            messageHtml += '<div class="confirm-detail-label">交易记录</div>';
            messageHtml += '<div class="confirm-detail-value">' + posInfo.transactions.length + ' 笔</div>';
            messageHtml += '</div>';
            messageHtml += '</div>';
            messageHtml += '</div>';
        }
        
        // 历史数据
        let hasOtherData = false;
        let otherDataHtml = '<div class="confirm-section"><div class="confirm-section-title">📦 其他数据</div><div class="confirm-detail-grid">';
        
        if (state.historyData[code] && state.historyData[code].length > 0) {
            hasOtherData = true;
            otherDataHtml += '<div class="confirm-detail-item">';
            otherDataHtml += '<div class="confirm-detail-label">历史数据</div>';
            otherDataHtml += '<div class="confirm-detail-value">' + state.historyData[code].length + ' 条记录</div>';
            otherDataHtml += '</div>';
        }
        
        otherDataHtml += '</div></div>';
        if (hasOtherData) {
            messageHtml += otherDataHtml;
        }
        
        // 警告信息
        messageHtml += '<div class="confirm-warning">';
        messageHtml += '<div class="confirm-warning-title">⚠️ 重要提醒</div>';
        messageHtml += '<div class="confirm-warning-text">删除后该基金将从列表中移除，并清除行情等缓存。<br>';
        messageHtml += '• 交易记录会保留，用于投资总览中的历史收益统计<br>';
        messageHtml += '• 历史涨跌数据将清除<br><br>';
        messageHtml += '建议删除前先导出数据备份。</div>';
        messageHtml += '</div>';
        
        const confirmed = await showCustomConfirm('删除基金', messageHtml, '确定删除', true);
        if (!confirmed) {
            return;
        }
        
        // 如果有持仓，再次确认
        if (posInfo && posInfo.totalShares > 0) {
            let finalMessageHtml = '<div class="confirm-final-warning">';
            finalMessageHtml += '<div class="confirm-final-icon">⚠️</div>';
            finalMessageHtml += '<div class="confirm-final-title">最后确认</div>';
            finalMessageHtml += '<div class="confirm-final-content">';
            finalMessageHtml += '您还持有 <strong>' + posInfo.totalShares.toFixed(2) + '</strong> 份该基金<br>';
            finalMessageHtml += '持仓成本 <strong>' + posInfo.totalCost.toFixed(2) + '</strong><br><br>';
            finalMessageHtml += '<strong>删除后无法恢复！</strong>';
            finalMessageHtml += '</div>';
            finalMessageHtml += '<div class="confirm-final-note">💡 建议：如不再持有该基金，可将份额卖出至0，保留交易记录供日后参考</div>';
            finalMessageHtml += '</div>';
            
            const finalConfirmed = await showCustomConfirm('最后确认', finalMessageHtml, '确定删除', true);
            if (!finalConfirmed) {
                return;
            }
        }
    }

    const codes = loadFundCodes();
    const index = codes.indexOf(code);
    if (index > -1) {
        codes.splice(index, 1);
        saveFundCodes(codes);
    }

    delete state.fundsData[code];
    delete state.charts[code];
    delete state.charts[`net-worth-${code}`]; // 清理净值图表
    delete state.historyData[code];
    // 保留 state.positions[code]、state.fundDetails[code] 及本地 fundDetail 缓存，供总览折线图用历史净值回放
    delete state.dailyRanges[code];
    const sectors = loadFundSectors();
    delete sectors[code];
    saveFundSectors(sectors);
    saveHistoryData();
    savePositions();
    saveDailyRanges();
    
    renderFunds();
    
    // 显示删除成功提示
    if (!skipConfirm) {
        showToast('✅ 基金已删除，建议定期导出数据备份', 'success');
    }
}

let sectorPickerCode = null;
function openSectorPicker(code) {
    sectorPickerCode = code;
    const data = state.fundsData[code];
    const name = data ? data.name : code;
    const sectors = loadFundSectors();
    const current = sectors[code] || '';
    document.getElementById('sectorPickerFundName').textContent = name + ' (' + code + ')';
    const container = document.getElementById('sectorPickerOptions');
    container.innerHTML = SECTOR_OPTIONS.map(s => {
        const isActive = current === s ? ' active' : '';
        return `<button type="button" class="sector-btn${isActive}" data-sector="${s}" onclick="chooseSector('${s}')">${s}</button>`;
    }).join('');
    document.getElementById('sectorPickerModal').classList.add('active');
}
function closeSectorPicker() {
    sectorPickerCode = null;
    document.getElementById('sectorPickerModal').classList.remove('active');
}
function chooseSector(sector) {
    if (!sectorPickerCode) return;
    setFundSector(sectorPickerCode, sector || null);
    closeSectorPicker();
    renderFunds();
    updateOverviewPanel();
    showToast(sector ? `已设为「${sector}」` : '已清除，将按名称自动推断板块', 'success');
}

// 计算参与今日盈亏的份额（排除今日买入 + 上一交易日买入的份额，其按当日净值成交不产生今日涨跌收益）
function getSharesEligibleForTodayProfit(code) {
    const posInfo = calculatePosition(code);
    if (!posInfo || posInfo.totalShares <= 0) return 0;
    const position = state.positions[code];
    if (!position || !position.transactions) return posInfo.totalShares;
    const todayStr = toDateStr(new Date());
    const prevTradingDayStr = getPreviousTradingDay(todayStr);
    let excludeShares = 0, soldShares = 0;
    position.transactions.forEach(trans => {
        const td = trans.tradeDate || toDateStr(new Date(trans.date));
        if (trans.type === 'buy') {
            if (td === todayStr || td === prevTradingDayStr) excludeShares += trans.shares;
        } else if (trans.type === 'sell') {
            if (td === todayStr) soldShares += trans.shares;
        }
    });
    return Math.max(0, posInfo.totalShares - excludeShares + soldShares);
}

/** 单只基金历史已实现收益（卖出所得 - 对应成本），无卖出记录返回 0 */
function getHistoricalProfitForFund(code) {
    const position = state.positions[code];
    if (!position || !position.transactions) return 0;
    let runningShares = 0, runningCost = 0, fundProfit = 0;
    const sorted = position.transactions.slice().sort((a, b) => getTransEffectiveDate(a).localeCompare(getTransEffectiveDate(b)));
    sorted.forEach(trans => {
        if (trans.type === 'buy') {
            runningShares += trans.shares;
            runningCost += trans.amount;
        } else if (trans.type === 'sell') {
            const sellRatio = runningShares > 0 ? trans.shares / runningShares : 0;
            const costBasis = runningCost * sellRatio;
            fundProfit += trans.amount - costBasis;
            runningShares -= trans.shares;
            runningCost -= costBasis;
        }
    });
    return fundProfit;
}

// 计算持仓信息（按有效净值日期排序后回放，保证成本分摊正确）
function calculatePosition(code) {
    const position = state.positions[code];
    if (!position || !position.transactions || position.transactions.length === 0) {
        return null;
    }

    const sorted = position.transactions.slice().sort((a, b) => getTransEffectiveDate(a).localeCompare(getTransEffectiveDate(b)));
    let totalShares = 0;
    let totalCost = 0;

    sorted.forEach(trans => {
        if (trans.type === 'buy') {
            totalShares += trans.shares;
            totalCost += trans.amount;  // 包含手续费的总成本
        } else if (trans.type === 'sell') {
            totalShares -= trans.shares;
            // 卖出时按比例减少成本
            const sellRatio = totalShares + trans.shares > 0 ? trans.shares / (totalShares + trans.shares) : 0;
            totalCost -= totalCost * sellRatio;
        }
    });

    // 修正浮点精度：份额保留2位小数，消除极小残余值（如 0.0000000001）
    totalShares = parseFloat(totalShares.toFixed(2));
    if (totalShares <= 0) {
        totalShares = 0;
        totalCost = 0;
    }

    const avgCost = totalShares > 0 ? totalCost / totalShares : 0;

    return {
        totalShares: totalShares,
        totalCost: totalCost,
        avgCost: avgCost,
        transactions: position.transactions
    };
}

// 填充交易日期下拉（可交易日）
function populateTradeDateSelect(selectId, defaultDateStr) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const opts = generateTradingDateOptions();
    sel.innerHTML = opts.map(o => `<option value="${o.value}" ${o.value === defaultDateStr ? 'selected' : ''}>${o.label}</option>`).join('');
}

// 获取当前最近的交易日
function getLatestTradingDateStr() {
    let d = new Date();
    for (let i = 0; i < 14; i++) {
        if (isTradingDay(d)) return toDateStr(d);
        d.setDate(d.getDate() - 1);
    }
    return toDateStr(d);
}

function onInitialTradeDateTimeChange() {
    const code = state.currentModalFundCode;
    if (!code) return;
    const tradeDate = document.getElementById('initialTradeDate').value;
    const beforeCutoff = document.querySelector('input[name="initialCutoff"]:checked').value === 'before';
    const effDate = getEffectiveNavDate(tradeDate, beforeCutoff);
    const nav = getNavForEffectiveDate(code, effDate);
    const input = document.getElementById('initialNetValue');
    const hint = document.getElementById('initialNavHint');
    if (nav != null) {
        input.value = nav.toFixed(4);
        hint.textContent = '实际净值（来自历史数据）';
        input.dataset.navSource = 'actual';
    } else {
        input.value = '';
        hint.textContent = '申购时的单位净值，请手动填写';
        input.dataset.navSource = 'manual';
    }
    calcInitialShares();
}

function onBuyTradeDateTimeChange() {
    const code = state.currentModalFundCode;
    if (!code) return;
    const tradeDate = document.getElementById('buyTradeDate').value;
    const beforeCutoff = document.querySelector('input[name="buyCutoff"]:checked').value === 'before';
    const effDate = getEffectiveNavDate(tradeDate, beforeCutoff);
    const nav = getNavForEffectiveDate(code, effDate);
    const input = document.getElementById('buyNetValue');
    const hint = document.getElementById('buyNavHint');
    if (nav != null) {
        input.value = nav.toFixed(4);
        hint.textContent = '实际净值（来自历史数据）';
        input.dataset.navSource = 'actual';
    } else {
        input.value = '';
        hint.textContent = '买入时的单位净值，请手动填写';
        input.dataset.navSource = 'manual';
    }
    calcBuyShares();
}

function refreshTradeModalNavIfOpen(code) {
    if (state.currentModalFundCode !== code) return;
    if (document.getElementById('initialPurchaseModal').classList.contains('active')) onInitialTradeDateTimeChange();
    else if (document.getElementById('buyModal').classList.contains('active')) onBuyTradeDateTimeChange();
    else if (document.getElementById('sellModal').classList.contains('active')) onSellTradeDateTimeChange();
}

function onSellTradeDateTimeChange() {
    const code = state.currentModalFundCode;
    if (!code) return;
    const tradeDate = document.getElementById('sellTradeDate').value;
    const beforeCutoff = document.querySelector('input[name="sellCutoff"]:checked').value === 'before';
    const effDate = getEffectiveNavDate(tradeDate, beforeCutoff);
    const nav = getNavForEffectiveDate(code, effDate);
    const input = document.getElementById('sellNetValue');
    const hint = document.getElementById('sellNavHint');
    if (nav != null) {
        input.value = nav.toFixed(4);
        hint.textContent = '实际净值（来自历史数据）';
        input.dataset.navSource = 'actual';
    } else {
        input.value = '';
        hint.textContent = '卖出时的单位净值，请手动填写';
        input.dataset.navSource = 'manual';
    }
    calcSellAmount();
}

function calcInitialShares() {
    const netValue = parseFloat(document.getElementById('initialNetValue').value);
    const amount = parseFloat(document.getElementById('initialAmount').value);
    const fee = parseFloat(document.getElementById('initialFee').value) || 0;
    const el = document.getElementById('initialShares');
    if (netValue && amount && netValue > 0 && amount > 0) el.value = ((amount - fee) / netValue).toFixed(2);
    else el.value = '';
}
function calcBuyShares() {
    const netValue = parseFloat(document.getElementById('buyNetValue').value);
    const amount = parseFloat(document.getElementById('buyAmount').value);
    const fee = parseFloat(document.getElementById('buyFee').value) || 0;
    const el = document.getElementById('buyShares');
    if (netValue && amount && netValue > 0 && amount > 0) el.value = ((amount - fee) / netValue).toFixed(2);
    else el.value = '';
}
function calcSellAmount() {
    const netValue = parseFloat(document.getElementById('sellNetValue').value);
    const shares = parseFloat(document.getElementById('sellShares').value);
    const fee = parseFloat(document.getElementById('sellFee').value) || 0;
    const el = document.getElementById('sellAmount');
    if (netValue && shares && netValue > 0 && shares > 0) el.value = (shares * netValue - fee).toFixed(2);
    else el.value = '';
}

// 打开初始申购模态框
function openInitialPurchaseModal(code) {
    state.initialPurchaseModalHasOpened = true;
    state.currentModalFundCode = code;
    const latest = getLatestTradingDateStr();
    populateTradeDateSelect('initialTradeDate', latest);
    document.querySelector('input[name="initialCutoff"][value="before"]').checked = true;
    document.getElementById('initialNetValue').value = '';
    document.getElementById('initialAmount').value = '';
    document.getElementById('initialFee').value = '0';
    document.getElementById('initialShares').value = '';
    document.getElementById('initialPurchaseModal').classList.add('active');
    fetchFundDetails(code, true);
    onInitialTradeDateTimeChange();
}

// 关闭初始申购模态框。cancel=true 表示用户点 X 或点击遮罩，取消添加并移除该基金；false/不传 表示跳过或确认添加，保留基金并可选定位
function closeInitialPurchaseModal(cancel) {
    const code = state.currentModalFundCode;
    document.getElementById('initialPurchaseModal').classList.remove('active');
    state.currentModalFundCode = null;

    if (cancel && code) {
        removeFund(code, true);
        state.justAddedFundCode = null;
        state.scrollDeferredForNewFund = false;
        state.initialPurchaseModalHasOpened = false;
        clearSyncReminder();
        return;
    }

    if (!code) return;

    // 跳过申购（基金无持仓）时切到自选视图
    const posInfo = calculatePosition(code);
    const isWatching = !posInfo || posInfo.totalShares <= 0;
    if (isWatching && state.currentMainView !== 'watching') {
        switchMainView('watching');
    }

    // 弹窗关闭后重新渲染并定位到该基金（显式传入 code，确保跳过时也能滚动并高亮）
    const codeToScroll = code;
    if (localStorage.getItem('hasUnsyncedChanges') === 'true') showSyncReminder();
    setTimeout(function () {
        try {
            renderFunds();
        } finally {
            scrollToAndHighlightAddedFund(codeToScroll);
        }
    }, 320);
}

// 构建交易记录的 date 与扩展字段
function buildTransactionDateFields(tradeDateStr, beforeCutoff) {
    const effDate = getEffectiveNavDate(tradeDateStr, beforeCutoff);
    const hour = beforeCutoff ? 9 : 15;
    const min = beforeCutoff ? 30 : 1;
    const iso = `${tradeDateStr}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
    return { date: new Date(iso).toISOString(), tradeDate: tradeDateStr, beforeCutoff, effectiveNavDate: effDate };
}

// 保存初始申购
function saveInitialPurchase() {
    if (!state.currentModalFundCode) return;

    const netValue = parseFloat(document.getElementById('initialNetValue').value);
    const amount = parseFloat(document.getElementById('initialAmount').value);
    const fee = parseFloat(document.getElementById('initialFee').value) || 0;
    const tradeDate = document.getElementById('initialTradeDate').value;
    const beforeCutoff = document.querySelector('input[name="initialCutoff"]:checked').value === 'before';
    const navSource = document.getElementById('initialNetValue').dataset.navSource || 'manual';

    if (!netValue || !amount || netValue <= 0 || amount <= 0) {
        showToast('请输入有效的申购净值和申购金额', 'warning');
        return;
    }

    const shares = (amount - fee) / netValue;
    const { date, effectiveNavDate } = buildTransactionDateFields(tradeDate, beforeCutoff);

    if (!state.positions[state.currentModalFundCode] || !state.positions[state.currentModalFundCode].transactions) {
        state.positions[state.currentModalFundCode] = { transactions: [] };
    }

    state.positions[state.currentModalFundCode].transactions.push({
        type: 'buy',
        date,
        tradeDate,
        beforeCutoff,
        effectiveNavDate,
        navSource,
        netValue: netValue,
        amount: amount,
        fee: fee,
        shares: shares
    });

    savePositions();
    markDataChanged();
    closeInitialPurchaseModal();
    if (state.currentMainView !== 'holding') {
        switchMainView('holding');
    } else {
        renderFunds();
    }
}

// 打开买入模态框
function openBuyModal(code) {
    state.currentModalFundCode = code;
    const latest = getLatestTradingDateStr();
    populateTradeDateSelect('buyTradeDate', latest);
    document.querySelector('input[name="buyCutoff"][value="before"]').checked = true;
    document.getElementById('buyNetValue').value = '';
    document.getElementById('buyAmount').value = '';
    document.getElementById('buyFee').value = '0';
    document.getElementById('buyShares').value = '';
    document.getElementById('buyModal').classList.add('active');
    fetchFundDetails(code, true);
    onBuyTradeDateTimeChange();
}

// 关闭买入模态框
function closeBuyModal() {
    document.getElementById('buyModal').classList.remove('active');
    state.currentModalFundCode = null;
}

// 保存买入
function saveBuy() {
    if (!state.currentModalFundCode) return;

    const netValue = parseFloat(document.getElementById('buyNetValue').value);
    const amount = parseFloat(document.getElementById('buyAmount').value);
    const fee = parseFloat(document.getElementById('buyFee').value) || 0;
    const tradeDate = document.getElementById('buyTradeDate').value;
    const beforeCutoff = document.querySelector('input[name="buyCutoff"]:checked').value === 'before';
    const navSource = document.getElementById('buyNetValue').dataset.navSource || 'manual';

    if (!netValue || !amount || netValue <= 0 || amount <= 0) {
        showToast('请输入有效的买入净值和买入金额', 'warning');
        return;
    }

    const shares = (amount - fee) / netValue;
    const { date, effectiveNavDate } = buildTransactionDateFields(tradeDate, beforeCutoff);

    if (!state.positions[state.currentModalFundCode] || !state.positions[state.currentModalFundCode].transactions) {
        state.positions[state.currentModalFundCode] = { transactions: [] };
    }

    state.positions[state.currentModalFundCode].transactions.push({
        type: 'buy',
        date,
        tradeDate,
        beforeCutoff,
        effectiveNavDate,
        navSource,
        netValue: netValue,
        amount: amount,
        fee: fee,
        shares: shares
    });

    savePositions();
    markDataChanged();
    closeBuyModal();
    if (state.currentMainView !== 'holding') {
        switchMainView('holding');
    } else {
        renderFunds();
    }
}

// 打开卖出模态框
function openSellModal(code) {
    state.currentModalFundCode = code;
    const posInfo = calculatePosition(code);
    
    if (!posInfo || posInfo.totalShares <= 0) {
        showToast('当前没有可卖出的份额', 'warning');
        return;
    }

    // 保存可卖出份额
    state.currentAvailableShares = posInfo.totalShares;

    const latest = getLatestTradingDateStr();
    populateTradeDateSelect('sellTradeDate', latest);
    document.querySelector('input[name="sellCutoff"][value="before"]').checked = true;
    document.getElementById('sellNetValue').value = '';
    document.getElementById('sellShares').value = '';
    document.getElementById('sellFee').value = '0';
    document.getElementById('sellAmount').value = '';
    document.getElementById('sellSharesHint').textContent = `可卖出份额：${posInfo.totalShares.toFixed(2)}`;
    document.getElementById('sellModal').classList.add('active');
    fetchFundDetails(code, true);
    onSellTradeDateTimeChange();
}

// 快速设置卖出份额
function setQuickSellShares(ratio) {
    if (state.currentAvailableShares <= 0) return;
    
    const shares = state.currentAvailableShares * ratio;
    document.getElementById('sellShares').value = shares.toFixed(2);
    
    // 触发input事件，让金额自动计算
    const event = new Event('input', { bubbles: true });
    document.getElementById('sellShares').dispatchEvent(event);
}

// 关闭卖出模态框
function closeSellModal() {
    document.getElementById('sellModal').classList.remove('active');
    state.currentModalFundCode = null;
    state.currentAvailableShares = 0;
}

// 保存卖出
function saveSell() {
    if (!state.currentModalFundCode) return;

    const netValue = parseFloat(document.getElementById('sellNetValue').value);
    const shares = parseFloat(document.getElementById('sellShares').value);
    const fee = parseFloat(document.getElementById('sellFee').value) || 0;

    if (!netValue || !shares || netValue <= 0 || shares <= 0) {
        showToast('请输入有效的卖出净值和卖出份额', 'warning');
        return;
    }

    const posInfo = calculatePosition(state.currentModalFundCode);
    // 使用 toFixed(2) 对齐精度，避免浮点误差导致相同份额被判定为超额
    const sellSharesRounded = parseFloat(shares.toFixed(2));
    const holdSharesRounded = posInfo ? parseFloat(posInfo.totalShares.toFixed(2)) : 0;
    if (!posInfo || sellSharesRounded > holdSharesRounded) {
        showToast(`卖出份额不能超过持有份额 ${holdSharesRounded}`, 'error');
        return;
    }

    const amount = shares * netValue - fee;
    const tradeDate = document.getElementById('sellTradeDate').value;
    const beforeCutoff = document.querySelector('input[name="sellCutoff"]:checked').value === 'before';
    const navSource = document.getElementById('sellNetValue').dataset.navSource || 'manual';
    const { date, effectiveNavDate } = buildTransactionDateFields(tradeDate, beforeCutoff);

    state.positions[state.currentModalFundCode].transactions.push({
        type: 'sell',
        date,
        tradeDate,
        beforeCutoff,
        effectiveNavDate,
        navSource,
        netValue: netValue,
        amount: amount,
        fee: fee,
        shares: shares
    });

    savePositions();
    markDataChanged();
    closeSellModal();
    renderFunds();
}

// ----- 转换 -----
function calcConvertOut() {
    const netValue = parseFloat(document.getElementById('convertOutNetValue').value);
    const shares = parseFloat(document.getElementById('convertOutShares').value);
    const fee = parseFloat(document.getElementById('convertOutFee').value) || 0;
    const amountEl = document.getElementById('convertOutAmountHint');
    const proceedsEl = document.getElementById('convertOutProceedsHint');
    if (netValue && shares != null && !isNaN(shares) && netValue > 0 && shares > 0) {
        const amount = shares * netValue;
        const proceeds = amount - fee;
        amountEl.textContent = '金额 ' + amount.toFixed(2);
        proceedsEl.textContent = '到账 ' + proceeds.toFixed(2);
    } else {
        amountEl.textContent = '--';
        proceedsEl.textContent = '到账 --';
    }
}
function calcConvertIn() {
    const netValue = parseFloat(document.getElementById('convertInNetValue').value);
    const shares = parseFloat(document.getElementById('convertInShares').value);
    const fee = parseFloat(document.getElementById('convertInFee').value) || 0;
    const el = document.getElementById('convertInAmountHint');
    if (netValue && shares != null && !isNaN(shares) && netValue > 0 && shares > 0) {
        const amount = shares * netValue + fee;
        el.value = amount.toFixed(2);
    } else {
        el.value = '';
    }
}

function openConvertModal(code) {
    const posInfo = calculatePosition(code);
    if (!posInfo || posInfo.totalShares <= 0) {
        showToast('当前没有可转出的份额', 'warning');
        return;
    }
    state.currentModalFundCode = code;
    const name = getFundDisplayName(code);
    document.getElementById('convertOutFundDisplay').textContent = name + '（' + code + '）';
    const latest = getLatestTradingDateStr();
    populateTradeDateSelect('convertTradeDate', latest);

    const codes = loadFundCodes().filter(c => c !== code);
    const list = document.getElementById('convertToCodeList');
    list.innerHTML = codes.map(c => {
        const d = state.fundsData[c];
        const label = (d && d.name) ? d.name + ' ' + c : c;
        return '<option value="' + c + '" label="' + escapeHtml(label) + '">';
    }).join('');

    document.getElementById('convertToCodeInput').value = '';
    document.getElementById('convertOutNetValue').value = '';
    document.getElementById('convertOutShares').value = '';
    document.getElementById('convertOutFee').value = '0';
    document.getElementById('convertInNetValue').value = '';
    document.getElementById('convertInShares').value = '';
    document.getElementById('convertInFee').value = '0';
    calcConvertOut();
    calcConvertIn();

    ['convertOutNetValue', 'convertOutShares', 'convertOutFee', 'convertInNetValue', 'convertInShares', 'convertInFee'].forEach(id => {
        const el = document.getElementById(id);
        el.removeEventListener('input', _convertInputHandler);
        el.addEventListener('input', _convertInputHandler);
    });
    document.getElementById('convertModal').classList.add('active');
}
function _convertInputHandler() {
    calcConvertOut();
    calcConvertIn();
}

function closeConvertModal() {
    document.getElementById('convertModal').classList.remove('active');
    state.currentModalFundCode = null;
}

function saveConvert() {
    const outCode = state.currentModalFundCode;
    if (!outCode) return;

    const outNetValue = parseFloat(document.getElementById('convertOutNetValue').value);
    const outShares = parseFloat(document.getElementById('convertOutShares').value);
    const outFee = parseFloat(document.getElementById('convertOutFee').value) || 0;
    const inCodeRaw = (document.getElementById('convertToCodeInput').value || '').trim();
    const inNetValue = parseFloat(document.getElementById('convertInNetValue').value);
    const inShares = parseFloat(document.getElementById('convertInShares').value);
    const inFee = parseFloat(document.getElementById('convertInFee').value) || 0;
    const tradeDate = document.getElementById('convertTradeDate').value;

    if (!outNetValue || outShares == null || isNaN(outShares) || outNetValue <= 0 || outShares <= 0) {
        showToast('请填写有效的转出净值和转出份额', 'warning');
        return;
    }
    if (!inCodeRaw || !/^\d{6}$/.test(inCodeRaw)) {
        showToast('请输入有效的转入基金代码（6位数字）', 'warning');
        return;
    }
    if (outCode === inCodeRaw) {
        showToast('转入基金不能与转出基金相同', 'warning');
        return;
    }
    if (!inNetValue || inShares == null || isNaN(inShares) || inNetValue <= 0 || inShares <= 0) {
        showToast('请填写有效的转入净值和转入份额', 'warning');
        return;
    }

    const outAmount = outShares * outNetValue;
    const outProceeds = outAmount - outFee;
    const inAmount = inShares * inNetValue + inFee;

    const posInfo = calculatePosition(outCode);
    const holdRounded = posInfo ? parseFloat(posInfo.totalShares.toFixed(2)) : 0;
    const sellRounded = parseFloat(outShares.toFixed(2));
    if (sellRounded > holdRounded) {
        showToast('转出份额不能超过持有份额 ' + holdRounded, 'error');
        return;
    }

    let codes = loadFundCodes();
    if (codes.indexOf(inCodeRaw) === -1) {
        codes = [...codes, inCodeRaw];
        saveFundCodes(codes);
        if (!state.positions[inCodeRaw]) state.positions[inCodeRaw] = { transactions: [] };
        fetchFundData(inCodeRaw);
    }

    const beforeCutoff = true;
    const { date, effectiveNavDate } = buildTransactionDateFields(tradeDate, beforeCutoff);

    state.positions[outCode].transactions.push({
        type: 'sell',
        date,
        tradeDate,
        beforeCutoff,
        effectiveNavDate,
        navSource: 'manual',
        netValue: outNetValue,
        amount: outProceeds,
        fee: outFee,
        shares: outShares
    });

    if (!state.positions[inCodeRaw] || !state.positions[inCodeRaw].transactions) {
        state.positions[inCodeRaw] = { transactions: [] };
    }
    state.positions[inCodeRaw].transactions.push({
        type: 'buy',
        date,
        tradeDate,
        beforeCutoff,
        effectiveNavDate,
        navSource: 'manual',
        netValue: inNetValue,
        amount: inAmount,
        fee: inFee,
        shares: inShares
    });

    savePositions();
    markDataChanged();
    closeConvertModal();
    renderFunds();
    showToast('转换已记录');
}

// 打开历史收益明细弹窗
function openHistoricalProfitDetail() {
    const codes = getOverviewFundCodes();
    const modal = document.getElementById('historicalProfitModal');
    const title = modal.querySelector('h2');
    const content = document.getElementById('historicalProfitContent');
    title.textContent = '📜 历史收益明细';
    
    // 计算每个基金的历史收益
    const fundProfits = [];
    let totalHistorical = 0;

    codes.forEach(code => {
        const position = state.positions[code];
        if (!position || !position.transactions) return;

        let runningShares = 0;
        let runningCost = 0;
        let fundProfit = 0;
        let sellCount = 0;
        let totalSellAmount = 0;
        let totalCostBasis = 0;

        // 与总览一致：按有效净值日期排序后回放，否则交易顺序与日期不一致时成本分摊会错，导致单只基金显示为负
        const sorted = position.transactions.slice().sort((a, b) => getTransEffectiveDate(a).localeCompare(getTransEffectiveDate(b)));
        sorted.forEach(trans => {
            if (trans.type === 'buy') {
                runningShares += trans.shares;
                runningCost += trans.amount;
            } else if (trans.type === 'sell') {
                const sellRatio = runningShares > 0 ? trans.shares / runningShares : 0;
                const costBasis = runningCost * sellRatio;
                const profit = trans.amount - costBasis;
                fundProfit += profit;
                totalSellAmount += trans.amount;
                totalCostBasis += costBasis;
                sellCount++;
                runningShares -= trans.shares;
                runningCost -= costBasis;
            }
        });

        if (sellCount > 0) {
            const name = getFundDisplayName(code);
            fundProfits.push({
                code: code,
                name: name,
                profit: fundProfit,
                sellCount: sellCount,
                totalSellAmount: totalSellAmount,
                totalCostBasis: totalCostBasis
            });
            totalHistorical += fundProfit;
        }
    });

    if (fundProfits.length === 0) {
        content.innerHTML = '<div class="no-position" style="padding: 40px;">暂无历史卖出记录</div>';
    } else {
        // 按收益金额降序排列
        fundProfits.sort((a, b) => b.profit - a.profit);

        const totalClass = totalHistorical > 0 ? 'positive' : (totalHistorical < 0 ? 'negative' : 'neutral');
        const totalAmountStr = (totalHistorical > 0 ? '+' : (totalHistorical < 0 ? '-' : '')) + (totalHistorical < 0 ? Math.abs(totalHistorical) : totalHistorical).toFixed(2);

        let html = `
            <div class="historical-profit-summary">
                <div class="summary-label">历史收益合计</div>
                <div class="summary-value ${totalClass}">${totalAmountStr}</div>
            </div>
        `;

        html += fundProfits.map(fp => {
            const isZeroProfit = Math.abs(fp.profit) < 0.005;
            const profitClass = isZeroProfit ? 'neutral' : (fp.profit > 0 ? 'positive' : 'negative');
            const profitAmountStr = isZeroProfit ? '0.00' : (fp.profit > 0 ? '+' : (fp.profit < 0 ? '-' : '')) + (fp.profit < 0 ? Math.abs(fp.profit) : fp.profit).toFixed(2);
            const profitRateNum = fp.totalCostBasis > 0 ? (fp.profit / fp.totalCostBasis * 100) : 0;
            const isZeroRate = Math.abs(profitRateNum) < 0.005;
            const profitRateStr = isZeroRate ? '0.00' : (profitRateNum > 0 ? '+' : (profitRateNum < 0 ? '-' : '')) + (profitRateNum < 0 ? Math.abs(profitRateNum) : profitRateNum).toFixed(2);

            const nameEsc = (fp.name || '').replace(/</g, '&lt;').replace(/"/g, '&quot;');
            const codeEsc = (fp.code || '').replace(/</g, '&lt;');
            const deleted = isFundDeleted(fp.code);
            const namePart = deleted
                ? `<span class="historical-fund-name historical-fund-name-deleted" title="该基金已从列表删除">${nameEsc} <span class="deleted-tag">已删除</span></span>`
                : `<a href="javascript:void(0)" class="historical-fund-name historical-fund-name-link" onclick="closeHistoricalProfitDetail(); openFundDetailModal('${codeEsc}')" title="点击查看基金详情">${nameEsc}</a>`;
            return `
                <div class="historical-fund-item">
                    <div class="historical-fund-info">
                        ${namePart}
                        <div class="historical-fund-code">${fp.code}</div>
                        <div class="historical-fund-detail">
                            卖出 ${fp.sellCount} 笔 · 收回 ${fp.totalSellAmount.toFixed(2)} · 成本 ${fp.totalCostBasis.toFixed(2)} · 收益率 ${profitRateStr}%
                        </div>
                    </div>
                    <div class="historical-fund-profit">
                        <div class="profit-amount ${profitClass}">${profitAmountStr}</div>
                        <div class="profit-sells">${fp.sellCount} 笔卖出</div>
                    </div>
                </div>
            `;
        }).join('');

        content.innerHTML = html;
    }

    document.getElementById('historicalProfitModal').classList.add('active');
}

// 关闭历史收益明细弹窗
function closeHistoricalProfitDetail() {
    document.getElementById('historicalProfitModal').classList.remove('active');
}

// 打开某日盈亏明细弹窗（日历按日视图点击日期时调用）
function openDailyPnlDetail(dateStr) {
    state.dailyPnlModalContext = { type: 'day', dateStr };
    const modal = document.getElementById('dailyPnlDetailModal');
    const titleEl = document.getElementById('dailyPnlDetailModalTitle');
    const content = document.getElementById('dailyPnlDetailContent');
    const toolbar = document.getElementById('dailyPnlModalToolbar');
    if (toolbar) toolbar.style.display = 'flex';
    const dateObj = new Date(dateStr + 'T12:00:00');
    const dateLabel = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
    const todayStr = toDateStr(new Date());
    const useEstimated = (dateStr === todayStr) && !isAfterNavPublishTime() && isTradingDay(new Date(todayStr + 'T12:00:00'));
    titleEl.textContent = '📅 ' + dateLabel + (useEstimated ? ' 估算盈亏明细' : ' 盈亏明细');
    const list = useEstimated ? getTodayEstimatedPnlByFund() : getDailyPnlByFund(dateStr);
    const showAmount = state.calendarDisplay === 'amount';
    let totalAmount = 0;
    list.forEach(item => { totalAmount += item.amount; });
    if (list.length === 0) {
        content.innerHTML = '<div class="no-position" style="padding: 24px; text-align: center; color: var(--text-muted);">' + (useEstimated ? '今日暂无可用估值数据' : '该日无组合盈亏数据（非交易日或尚无净值）') + '</div>';
    } else {
        renderPnlDetailList(content, list, totalAmount, showAmount, 'day', dateStr);
    }
    modal.classList.add('active');
}

function closeDailyPnlDetailModal() {
    document.getElementById('dailyPnlDetailModal').classList.remove('active');
    state.dailyPnlModalContext = null;
}

function dailyPnlModalPrev() {
    const ctx = state.dailyPnlModalContext;
    if (!ctx) return;
    if (ctx.type === 'day') {
        const prev = getPreviousTradingDay(ctx.dateStr);
        openDailyPnlDetail(prev);
    } else if (ctx.type === 'month') {
        let y = ctx.year, m = ctx.month - 1;
        if (m < 1) { m = 12; y--; }
        openMonthlyPnlDetail(y, m);
    } else {
        openYearlyPnlDetail(ctx.year - 1);
    }
}

function dailyPnlModalNext() {
    const ctx = state.dailyPnlModalContext;
    if (!ctx) return;
    if (ctx.type === 'day') {
        const next = getNextTradingDay(ctx.dateStr);
        const today = toDateStr(new Date());
        if (next > today) return;
        openDailyPnlDetail(next);
    } else if (ctx.type === 'month') {
        let y = ctx.year, m = ctx.month + 1;
        if (m > 12) { m = 1; y++; }
        openMonthlyPnlDetail(y, m);
    } else {
        openYearlyPnlDetail(ctx.year + 1);
    }
}

function dailyPnlModalCopy() {
    const titleEl = document.getElementById('dailyPnlDetailModalTitle');
    const content = document.getElementById('dailyPnlDetailContent');
    if (!titleEl || !content) return;
    const lines = [titleEl.textContent];
    const summary = content.querySelector('.historical-profit-summary');
    if (summary) {
        const label = summary.querySelector('.summary-label');
        const value = summary.querySelector('.summary-value');
        if (label && value) lines.push((label.textContent || '') + '\t' + (value.textContent || ''));
    }
    content.querySelectorAll('.historical-fund-item').forEach(row => {
        const name = row.querySelector('.historical-fund-name, .historical-fund-name-link');
        const code = row.querySelector('.historical-fund-code, .historical-fund-code-link');
        const amount = row.querySelector('.profit-amount');
        if (name && amount) lines.push((name.textContent || '').trim() + '\t' + (code ? code.textContent.trim() : '') + '\t' + (amount.textContent || ''));
    });
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => showToast('已复制到剪贴板', 'success')).catch(() => showToast('复制失败', 'error'));
}

function dailyPnlModalExport() {
    const titleEl = document.getElementById('dailyPnlDetailModalTitle');
    const content = document.getElementById('dailyPnlDetailContent');
    if (!titleEl || !content) return;
    const rows = [['基金名称', '基金代码', '盈亏']];
    const summary = content.querySelector('.historical-profit-summary');
    if (summary) {
        const label = summary.querySelector('.summary-label');
        const value = summary.querySelector('.summary-value');
        if (label && value) rows.push([(label.textContent || '').replace(/"/g, '""'), '', (value.textContent || '').replace(/"/g, '""')]);
    }
    content.querySelectorAll('.historical-fund-item').forEach(row => {
        const name = row.querySelector('.historical-fund-name, .historical-fund-name-link');
        const code = row.querySelector('.historical-fund-code, .historical-fund-code-link');
        const amount = row.querySelector('.profit-amount');
        if (name && amount) rows.push([(name.textContent || '').trim().replace(/"/g, '""'), (code ? code.textContent.trim() : ''), (amount.textContent || '').replace(/"/g, '""')]);
    });
    const csv = rows.map(r => r.map(c => '"' + c + '"').join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (titleEl.textContent.replace(/\s+/g, '_') || '盈亏明细') + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('已导出 CSV', 'success');
}

function openMonthlyPnlDetail(year, month) {
    state.dailyPnlModalContext = { type: 'month', year, month };
    const modal = document.getElementById('dailyPnlDetailModal');
    const titleEl = document.getElementById('dailyPnlDetailModalTitle');
    const content = document.getElementById('dailyPnlDetailContent');
    const toolbar = document.getElementById('dailyPnlModalToolbar');
    if (toolbar) toolbar.style.display = 'flex';
    titleEl.textContent = '📅 ' + year + '年' + month + '月 盈亏明细';
    const showAmount = state.calendarDisplay === 'amount';
    const list = getMonthlyPnlByFund(year, month);
    const dailyMap = getDailyPnlMap();
    const monthFirst = year + '-' + String(month).padStart(2, '0') + '-01';
    let totalAmount = 0;
    Object.keys(dailyMap).forEach(dateStr => {
        if (dateStr >= monthFirst && dateStr <= year + '-' + String(month).padStart(2, '0') + '-31') totalAmount += dailyMap[dateStr].amount;
    });
    renderPnlDetailList(content, list, totalAmount, showAmount, 'month', { year, month });
    modal.classList.add('active');
}

function openYearlyPnlDetail(year) {
    state.dailyPnlModalContext = { type: 'year', year };
    const modal = document.getElementById('dailyPnlDetailModal');
    const titleEl = document.getElementById('dailyPnlDetailModalTitle');
    const content = document.getElementById('dailyPnlDetailContent');
    const toolbar = document.getElementById('dailyPnlModalToolbar');
    if (toolbar) toolbar.style.display = 'flex';
    titleEl.textContent = '📅 ' + year + '年 盈亏明细';
    const showAmount = state.calendarDisplay === 'amount';
    const list = getYearlyPnlByFund(year);
    const dailyMap = getDailyPnlMap();
    let totalAmount = 0;
    Object.keys(dailyMap).forEach(dateStr => {
        if (dateStr.slice(0, 4) === String(year)) totalAmount += dailyMap[dateStr].amount;
    });
    renderPnlDetailList(content, list, totalAmount, showAmount, 'year', { year });
    modal.classList.add('active');
}

function renderPnlDetailList(content, list, totalAmount, showAmount, periodType, periodData) {
    const sortedList = list.slice().sort((a, b) => (b.amount || 0) - (a.amount || 0));
    const isZeroTotal = Math.abs(totalAmount) < 0.005;
    const totalCls = isZeroTotal ? '' : (totalAmount > 0 ? 'positive' : 'negative');
    let totalStr;
    if (showAmount) {
        totalStr = isZeroTotal ? '0.00' : ((totalAmount >= 0 ? '+' : '-') + (totalAmount >= 0 ? totalAmount : Math.abs(totalAmount)).toFixed(2));
    } else {
        let rate = 0;
        let hasRate = true;
        if (periodType === 'day') {
            const dayInfo = getDailyPnlMap()[periodData];
            hasRate = !!dayInfo;
            rate = dayInfo ? dayInfo.rate : 0;
        } else if (periodType === 'month') {
            const valueStart = getPortfolioValueAtDate(periodData.year + '-' + String(periodData.month).padStart(2, '0') + '-01');
            rate = valueStart > 0 ? (totalAmount / valueStart) * 100 : 0;
        } else {
            const valueStart = getPortfolioValueAtDate(periodData.year + '-01-01');
            const valueEnd = getPortfolioValueAtDate(periodData.year + '-12-31');
            const denom = valueStart > 0 ? valueStart : valueEnd;
            rate = denom > 0 ? (totalAmount / denom) * 100 : 0;
        }
        const isZeroRate = Math.abs(rate) < 0.005;
        totalStr = !hasRate ? '--' : (isZeroRate ? '0.00%' : ((rate >= 0 ? '+' : '-') + (rate >= 0 ? rate : Math.abs(rate)).toFixed(2) + '%'));
    }
    const sumLabel = periodType === 'day' ? '当日合计' : (periodType === 'month' ? '当月合计' : '当年合计');
    if (sortedList.length === 0) {
        content.innerHTML = '<div class="no-position" style="padding: 24px; text-align: center; color: var(--text-muted);">该时段无组合盈亏数据</div>';
        return;
    }
    let html = `<div class="historical-profit-summary" style="margin-bottom: 12px;"><div class="summary-label">${sumLabel}</div><div class="summary-value ${totalCls}">${totalStr}</div></div>`;
    html += '<div class="historical-fund-list">';
    sortedList.forEach(item => {
        const isZeroAmount = Math.abs(item.amount) < 0.005;
        const isZeroRate = Math.abs(item.rate) < 0.005;
        const cls = isZeroAmount ? 'neutral' : (item.amount > 0 ? 'positive' : 'negative');
        const amountStr = showAmount
            ? (isZeroAmount ? '0.00' : (item.amount >= 0 ? '+' : '-') + (item.amount >= 0 ? item.amount : Math.abs(item.amount)).toFixed(2))
            : (isZeroRate ? '0.00%' : (item.rate >= 0 ? '+' : '-') + (item.rate >= 0 ? item.rate : Math.abs(item.rate)).toFixed(2) + '%');
        const nameEsc = (item.name || '').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const codeEsc = (item.code || '').replace(/</g, '&lt;');
        const deleted = isFundDeleted(item.code);
        const namePart = deleted
            ? `<span class="historical-fund-name historical-fund-name-deleted" title="该基金已从列表删除">${nameEsc} <span class="deleted-tag">已删除</span></span>`
            : `<a href="javascript:void(0)" class="historical-fund-name historical-fund-name-link" onclick="closeDailyPnlDetailModal(); openFundDetailModal('${codeEsc}')" title="点击查看基金详情">${nameEsc}</a>`;
        html += `<div class="historical-fund-item"><div class="historical-fund-info">${namePart}<span class="historical-fund-code">${codeEsc}</span></div><div class="historical-fund-profit"><div class="profit-amount ${cls}">${amountStr}</div></div></div>`;
    });
    html += '</div>';
    content.innerHTML = html;
}

// 打开持仓收益明细弹窗
function openHoldingProfitDetail() {
    const codes = loadFundCodes();
    const modal = document.getElementById('holdingProfitModal');
    const content = document.getElementById('holdingProfitContent');

    const items = [];
    let totalProfit = 0;

    codes.forEach(code => {
        const data = state.fundsData[code];
        const posInfo = calculatePosition(code);
        if (!posInfo || posInfo.totalShares <= 0 || !data) return;

        const display = getDisplayValues(data);
        const currentNav = display.isActual ? parseFloat(display.value) : parseFloat(data.gsz);
        if (Number.isNaN(currentNav)) return;
        const currentValue = posInfo.totalShares * currentNav;
        const profit = currentValue - posInfo.totalCost;
        const rate = posInfo.totalCost > 0 ? (profit / posInfo.totalCost * 100) : 0;

        items.push({
            code: code,
            name: getFundDisplayName(code),
            currentValue: currentValue,
            cost: posInfo.totalCost,
            profit: profit,
            rate: rate
        });
        totalProfit += profit;
    });

    items.sort((a, b) => b.profit - a.profit);

    const totalClass = totalProfit > 0 ? 'positive' : (totalProfit < 0 ? 'negative' : 'neutral');
    const totalAmountStr = (totalProfit > 0 ? '+' : (totalProfit < 0 ? '-' : '')) + (totalProfit < 0 ? Math.abs(totalProfit) : totalProfit).toFixed(2);

    let html = `
        <div class="historical-profit-summary">
            <div class="summary-label">持仓收益合计</div>
            <div class="summary-value ${totalClass}">${totalAmountStr}</div>
        </div>
    `;

    if (items.length === 0) {
        html += '<div class="no-position" style="padding: 40px;">暂无持仓</div>';
    } else {
        items.forEach(item => {
            const isZeroProfit = Math.abs(item.profit) < 0.005;
            const profitClass = isZeroProfit ? 'neutral' : (item.profit > 0 ? 'positive' : 'negative');
            const profitAmountStr = isZeroProfit ? '0.00' : (item.profit > 0 ? '+' : (item.profit < 0 ? '-' : '')) + (item.profit < 0 ? Math.abs(item.profit) : item.profit).toFixed(2);
            const isZeroRate = Math.abs(item.rate) < 0.005;
            const rateStr = isZeroRate ? '0.00' : (item.rate > 0 ? '+' : (item.rate < 0 ? '-' : '')) + (item.rate < 0 ? Math.abs(item.rate) : item.rate).toFixed(2);
            const nameEsc = (item.name || '').replace(/</g, '&lt;').replace(/"/g, '&quot;');
            const codeEsc = (item.code || '').replace(/</g, '&lt;');
            html += `
                <div class="historical-fund-item">
                    <div class="historical-fund-info">
                        <a href="javascript:void(0)" class="historical-fund-name historical-fund-name-link" onclick="closeHoldingProfitDetail(); openFundDetailModal('${codeEsc}')" title="点击查看基金详情">${nameEsc}</a>
                        <div class="historical-fund-code">${item.code}</div>
                        <div class="historical-fund-detail">
                            市值 ${item.currentValue.toFixed(2)} · 成本 ${item.cost.toFixed(2)} · 收益率 ${rateStr}%
                        </div>
                    </div>
                    <div class="historical-fund-profit">
                        <div class="profit-amount ${profitClass}">${profitAmountStr}</div>
                    </div>
                </div>
            `;
        });
    }

    content.innerHTML = html;
    modal.classList.add('active');
}

// 关闭持仓收益明细弹窗
function closeHoldingProfitDetail() {
    document.getElementById('holdingProfitModal').classList.remove('active');
}

// 打开交易历史模态框
function openTransactionHistoryModal(code) {
    state.currentModalFundCode = code;
    const position = state.positions[code];
    const content = document.getElementById('transactionHistoryContent');
    
    if (!position || !position.transactions || position.transactions.length === 0) {
        content.innerHTML = '<div class="no-position" style="padding: 40px;">暂无交易记录</div>';
    } else {
        const getTradeDateStr = (trans) => trans.tradeDate || (() => { const d = new Date(trans.date); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
        const withIndex = position.transactions.map((trans, i) => ({ trans, originalIndex: i }));
        withIndex.sort((a, b) => getTradeDateStr(b.trans).localeCompare(getTradeDateStr(a.trans))); // 按交易日期降序，最新在上
        const transHtml = withIndex.map(({ trans, originalIndex }) => {
            const d = new Date(trans.date);
            const tradeDate = trans.tradeDate || (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
            const cutoffText = trans.beforeCutoff === false ? '15:00后' : (trans.beforeCutoff === true ? '15:00前' : '');
            const navTag = trans.navSource === 'actual' ? '<span class="nav-source-tag actual">实际</span>' : (trans.navSource === 'manual' ? '<span class="nav-source-tag manual">手动</span>' : '');
            const typeText = trans.type === 'buy' ? '买入' : '卖出';
            const typeClass = trans.type;
            return `
                <div class="transaction-item" data-index="${originalIndex}">
                    <div class="transaction-info">
                        <div>
                            <span class="transaction-type ${typeClass}">${typeText}</span>
                            <span style="font-weight: 600;">${trans.shares.toFixed(2)} 份</span>
                            ${navTag}
                        </div>
                        <div class="transaction-details">
                            净值: ${trans.netValue.toFixed(4)} | 
                            ${trans.type === 'buy' ? '投入' : '收回'}: ${trans.amount.toFixed(2)} | 
                            手续费: ${trans.fee.toFixed(2)}
                        </div>
                        <div class="transaction-date">${tradeDate} ${cutoffText}</div>
                    </div>
                    <div class="transaction-actions">
                        <button class="trans-action-btn trans-edit-btn" onclick="editTransaction('${code}', ${originalIndex})" title="编辑">✏️</button>
                        <button class="trans-action-btn trans-delete-btn" onclick="deleteTransaction('${code}', ${originalIndex})" title="删除">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
        content.innerHTML = transHtml;
    }
    
    document.getElementById('transactionHistoryModal').classList.add('active');
}

// 删除交易记录
function deleteTransaction(code, index) {
    const position = state.positions[code];
    if (!position || !position.transactions || !position.transactions[index]) return;

    const trans = position.transactions[index];
    const typeText = trans.type === 'buy' ? '买入' : '卖出';
    if (!confirm(`确认删除这笔${typeText}记录？\n份额: ${trans.shares.toFixed(2)}\n金额: ${trans.amount.toFixed(2)}`)) return;

    position.transactions.splice(index, 1);
    // 如果交易记录清空，删除整个 position
    if (position.transactions.length === 0) {
        delete state.positions[code];
    }
    savePositions();
    renderFunds();
    // 刷新弹窗内容
    openTransactionHistoryModal(code);
}

// 编辑交易记录
function editTransaction(code, index) {
    const position = state.positions[code];
    if (!position || !position.transactions || !position.transactions[index]) return;

    const trans = position.transactions[index];
    const content = document.getElementById('transactionHistoryContent');
    const isBuy = trans.type === 'buy';
    const td = trans.tradeDate || (() => { const d = new Date(trans.date); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
    const before = trans.beforeCutoff !== false;
    const opts = generateTradingDateOptions().map(o => `<option value="${o.value}" ${o.value === td ? 'selected' : ''}>${o.label}</option>`).join('');

    const editHtml = `
        <div class="trans-edit-form">
            <div style="font-weight: 600; margin-bottom: 12px; font-size: 15px;">
                ✏️ 编辑${isBuy ? '买入' : '卖出'}记录
            </div>
            <div class="form-row">
                <div>
                    <label>${isBuy ? '买入' : '卖出'}净值</label>
                    <input type="number" id="editNetValue" step="0.0001" value="${trans.netValue}">
                </div>
                <div>
                    <label>${isBuy ? '买入金额' : '卖出份额'}</label>
                    <input type="number" id="editAmountOrShares" step="0.01" value="${isBuy ? trans.amount : trans.shares}">
                </div>
            </div>
            <div class="form-row">
                <div>
                    <label>手续费（元）</label>
                    <input type="number" id="editFee" step="0.01" value="${trans.fee}">
                </div>
                <div>
                    <label>交易日期</label>
                    <select id="editTradeDate">${opts}</select>
                </div>
            </div>
            <div class="form-row-single">
                <label>交易时段</label>
                <div class="trade-cutoff-options">
                    <label><input type="radio" name="editCutoff" value="before" ${before ? 'checked' : ''}> 15:00 前</label>
                    <label><input type="radio" name="editCutoff" value="after" ${!before ? 'checked' : ''}> 15:00 后</label>
                </div>
            </div>
            <div class="trans-edit-actions">
                <button class="btn btn-secondary" onclick="openTransactionHistoryModal('${code}')">取消</button>
                <button class="btn btn-primary" onclick="saveEditTransaction('${code}', ${index})">保存</button>
            </div>
        </div>
    `;

    content.innerHTML = editHtml;
}

// 保存编辑的交易记录
function saveEditTransaction(code, index) {
    const position = state.positions[code];
    if (!position || !position.transactions || !position.transactions[index]) return;

    const trans = position.transactions[index];
    const netValue = parseFloat(document.getElementById('editNetValue').value);
    const amountOrShares = parseFloat(document.getElementById('editAmountOrShares').value);
    const fee = parseFloat(document.getElementById('editFee').value) || 0;
    const tradeDate = document.getElementById('editTradeDate').value;
    const beforeCutoff = document.querySelector('input[name="editCutoff"]:checked').value === 'before';
    const { date, effectiveNavDate } = buildTransactionDateFields(tradeDate, beforeCutoff);

    if (!netValue || !amountOrShares || netValue <= 0 || amountOrShares <= 0) {
        showToast('请输入有效的数值', 'warning');
        return;
    }

    if (trans.type === 'buy') {
        trans.netValue = netValue;
        trans.amount = amountOrShares;
        trans.fee = fee;
        trans.shares = (amountOrShares - fee) / netValue;
    } else {
        trans.netValue = netValue;
        trans.shares = amountOrShares;
        trans.fee = fee;
        trans.amount = amountOrShares * netValue - fee;
    }

    trans.date = date;
    trans.tradeDate = tradeDate;
    trans.beforeCutoff = beforeCutoff;
    trans.effectiveNavDate = effectiveNavDate;
    trans.navSource = trans.navSource || 'manual';

    savePositions();
    renderFunds();
    // 刷新弹窗内容
    openTransactionHistoryModal(code);
}

// 关闭交易历史模态框
function closeTransactionHistoryModal() {
    document.getElementById('transactionHistoryModal').classList.remove('active');
    state.currentModalFundCode = null;
}

// 更新今日最高最低
function updateDailyRange(code, percentage) {
    if (!state.dailyRanges[code]) {
        state.dailyRanges[code] = { high: percentage, low: percentage };
    } else {
        if (percentage > state.dailyRanges[code].high) {
            state.dailyRanges[code].high = percentage;
        }
        if (percentage < state.dailyRanges[code].low) {
            state.dailyRanges[code].low = percentage;
        }
    }
    saveDailyRanges();
}

// 判断是否已过当日净值公布时间（通常 20:00 后基金公司会公布实际净值）
function isAfterNavPublishTime() {
    const hour = new Date().getHours();
    return hour >= CONFIG.NAV_PUBLISH_HOUR;
}

// 从基金详情的净值走势中提取最新实际净值，并合并到 state.fundsData
// 使用场景：1）当天晚上净值公布后用实际净值替代估值；2）非交易日（周末/节假日）继续显示最近一次实际净值
function tryUpdateActualNav(code) {
    const details = state.fundDetails[code];
    const data = state.fundsData[code];
    if (!details || !details.netWorthData || details.netWorthData.length < 2 || !data) return;
    const arr = details.netWorthData;
    const last = arr[arr.length - 1];
    const prev = arr[arr.length - 2];
    const lastDate = new Date(last.x);
    const today = new Date();
    const lastDateStr = toDateStr(lastDate);
    const todayStr = toDateStr(today);
    const useActual =
        (lastDateStr === todayStr && isAfterNavPublishTime()) ||  // 当天已过公布时间，用当天实际净值
        !isTradingDay(today);                                     // 非交易日（周末/节假日），用最近一条实际净值
    if (!useActual) return;
    const actualValue = last.y;
    const prevValue = prev.y;
    const actualPercentage = prevValue > 0 ? ((actualValue - prevValue) / prevValue * 100) : 0;
    data.actualNav = actualValue;
    data.actualNavDate = lastDateStr;
    data.actualNavPercentage = actualPercentage;
    data.actualNavJzrq = lastDateStr;
    const updated = updateFundCardInPlace(code) || (state.fundListViewMode === 'list' && updateFundListItemInPlace(code));
    if (!updated) scheduleRender();
    else updateOverviewPanel();
}

/** 生成列表行内当日走势小图 SVG（基于当日 historyData） */
function renderListSparklineSvg(history, currentPercentage) {
    if (!history || history.length < 2) return '';
    const data = history.map(function (d) { return d.percentage; });
    var minPct = Math.min.apply(null, data);
    var maxPct = Math.max.apply(null, data);
    var range = maxPct - minPct || 1;
    var w = 80, h = 28, pad = 2;
    var points = [];
    for (var i = 0; i < data.length; i++) {
        var x = data.length === 1 ? 0 : (i / (data.length - 1)) * (w - 1);
        var y = pad + (1 - (data[i] - minPct) / range) * (h - 2 * pad);
        points.push(x.toFixed(2) + ',' + y.toFixed(2));
    }
    var pathD = 'M ' + points.join(' L ');
    var color = currentPercentage >= 0 ? '#ff4d4f' : '#00b96b';
    return '<svg viewBox="0 0 80 28" xmlns="http://www.w3.org/2000/svg"><path d="' + pathD + '" fill="none" stroke="' + color + '" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

// 获取用于展示的当前净值/估算值及涨跌幅（优先使用晚间公布的实际净值）
function getDisplayValues(data) {
    if (!data) return { value: '', percentage: 0, label: '估算', isActual: false };
    if (data.actualNav != null && data.actualNav !== '') {
        return {
            value: parseFloat(data.actualNav).toFixed(4),
            percentage: parseFloat(data.actualNavPercentage || 0),
            label: '实际',
            isActual: true
        };
    }
    return {
        value: data.gsz || '',
        percentage: parseFloat(data.gszzl || 0),
        label: '估算',
        isActual: false
    };
}

// 获取基金数据（JSONP）
// skipDetails: 定时刷新时跳过详情获取，避免不必要的渲染
function fetchFundData(code, skipDetails = false) {
    // 清理旧的script标签
    const oldScript = document.getElementById(`fund-script-${code}`);
    if (oldScript) {
        oldScript.remove();
    }

    state.loadingFundCodes.add(code);
    const script = document.createElement('script');
    script.id = `fund-script-${code}`;
    script.src = `https://fundgz.1234567.com.cn/js/${code}.js?t=${Date.now()}`;
    script.onerror = () => {
        console.error(`加载基金 ${code} 数据失败`);
        showToast(`加载基金 ${code} 数据失败，请检查基金代码是否正确`, 'error');
        state.loadingFundCodes.delete(code);
        if (state.fundDataTimeouts[code]) {
            clearTimeout(state.fundDataTimeouts[code]);
            delete state.fundDataTimeouts[code];
        }
        removeFund(code, true); // 跳过确认对话框
    };
    // 超时：若 15 秒后仍未收到数据，标记加载失败并刷新卡片，避免一直显示「加载中」
    const timeoutId = setTimeout(() => {
        if (state.loadingFundCodes.has(code)) {
            state.loadingFundCodes.delete(code);
            state.fundsData[code] = { _loadFailed: true, fundcode: code };
            scheduleRender();
        }
        delete state.fundDataTimeouts[code];
    }, 15000);
    state.fundDataTimeouts[code] = timeoutId;
    document.body.appendChild(script);

    if (!skipDetails) {
        fetchFundDetails(code);
    }
}

function retryFundLoad(code) {
    delete state.fundsData[code];
    fetchFundData(code);
    scheduleRender();
}

// 处理基金详细信息加载队列
function processFundDetailsQueue() {
    if (state.isLoadingFundDetails || state.fundDetailsQueue.length === 0) {
        return;
    }
    
    const { code, skipRender } = state.fundDetailsQueue.shift();
    state.isLoadingFundDetails = true;
    
    fetchFundDetailsInternal(code, skipRender);
}

// 将基金详细信息加载请求加入队列
function fetchFundDetails(code, skipRender = false) {
    
    // 检查是否已在队列中
    const exists = state.fundDetailsQueue.some(item => item.code === code);
    if (!exists) {
        state.fundDetailsQueue.push({ code, skipRender });
    } else {
    }
    
    // 开始处理队列
    processFundDetailsQueue();
}

// 内部函数：实际加载基金详细信息
function fetchFundDetailsInternal(code, skipRender = false) {
    // 检查缓存
    const cached = localStorage.getItem(`fundDetail_${code}`);
    if (cached) {
        try {
            const cacheData = JSON.parse(cached);
            const now = Date.now();
            const oneDay = 24 * 60 * 60 * 1000;
            const cacheTime = new Date(cacheData.timestamp);
            const cacheHour = cacheTime.getHours();
            // 晚间（20:00 后）净值已公布，若缓存是当天 20:00 前存的，可能不含当天实际净值，需重新拉取
            const isCacheStaleForEvening = isAfterNavPublishTime() &&
                cacheTime.toDateString() === new Date().toDateString() && cacheHour < CONFIG.NAV_PUBLISH_HOUR;
            const cacheValid = (now - cacheData.timestamp < oneDay) && !isCacheStaleForEvening;

            if (cacheValid) {
                // 检查缓存中是否有净值数据
                const hasNetWorthData = cacheData.data.netWorthData && cacheData.data.netWorthData.length > 0;

                if (hasNetWorthData) {
                    state.fundDetails[code] = cacheData.data;
                    if (state._dailyPnlMapCache) state._dailyPnlMapCache = null;
                    tryUpdateActualNav(code);
                    refreshTradeModalNavIfOpen(code);
                    if (!skipRender) {
                        const updated = updateFundDetailsTab(code);
                        if (!updated) {
                            scheduleRender();
                        }
                    }
                    state.isLoadingFundDetails = false;
                    processFundDetailsQueue();
                    return;
                }
            }
        } catch (e) {
            console.error(`[fetchFundDetailsInternal] 基金 ${code} 解析缓存失败`, e);
        }
    }
    
    // 清理旧的script标签
    const oldScript = document.getElementById(`fund-detail-script-${code}`);
    if (oldScript) {
        oldScript.remove();
    }

    const script = document.createElement('script');
    script.id = `fund-detail-script-${code}`;
    script.src = `https://fund.eastmoney.com/pingzhongdata/${code}.js?t=${Date.now()}`;
    
    script.onload = () => {
        
        // 需要稍微延迟，让脚本中的赋值语句完全执行
        setTimeout(() => {
            
            // 立即捕获全局变量，避免被其他script覆盖
            const immediateCapture = {
                fS_code: window.fS_code,
                fS_name: window.fS_name,
                fund_sourceRate: window.fund_sourceRate,
                fund_Rate: window.fund_Rate,
                fund_minsg: window.fund_minsg,
                syl_1y: window.syl_1y,
                syl_3y: window.syl_3y,
                syl_6y: window.syl_6y,
                syl_1n: window.syl_1n,
                Data_currentFundManager: window.Data_currentFundManager ? JSON.parse(JSON.stringify(window.Data_currentFundManager)) : null,
                Data_netWorthTrend: window.Data_netWorthTrend ? JSON.parse(JSON.stringify(window.Data_netWorthTrend)) : null
            };
            
            
            // 立即清理全局变量，避免影响其他基金
            delete window.fS_name;
            delete window.fS_code;
            delete window.fund_sourceRate;
            delete window.fund_Rate;
            delete window.fund_minsg;
            delete window.syl_1y;
            delete window.syl_3y;
            delete window.syl_6y;
            delete window.syl_1n;
            delete window.Data_currentFundManager;
            delete window.Data_netWorthTrend;
        
        // 现在可以安全地处理捕获的数据
        try {
            
            // 验证捕获的数据是否属于当前基金
            if (!immediateCapture.fS_code) {
                console.error(`[fetchFundDetailsInternal] 基金 ${code} - 无法获取fS_code，数据可能未加载`);
                script.remove();
                
                // 延迟后重新加入队列重试
                setTimeout(() => {
                    state.fundDetailsQueue.unshift({ code, skipRender }); // 重新加到队列前面
                    state.isLoadingFundDetails = false;
                    processFundDetailsQueue();
                }, 1000);
                return;
            }
            
            if (immediateCapture.fS_code !== code) {
                console.error(`[fetchFundDetailsInternal] 基金 ${code} - 数据不匹配！`);
                console.error(`[fetchFundDetailsInternal] 基金 ${code} - 捕获的fS_code='${immediateCapture.fS_code}'，期望='${code}'`);
                console.error(`[fetchFundDetailsInternal] 基金 ${code} - 这不应该发生，因为使用了队列机制`);
                script.remove();
                
                // 标记加载完成，处理队列中的下一个
                state.isLoadingFundDetails = false;
                processFundDetailsQueue();
                return;
            }
            
            
            // 检查前几个净值数据点
            if (immediateCapture.Data_netWorthTrend && immediateCapture.Data_netWorthTrend.length > 0) {
            }
            
            // 构造最终的数据对象
            const capturedData = {
                name: immediateCapture.fS_name || '',
                sourceRate: immediateCapture.fund_sourceRate || '',
                currentRate: immediateCapture.fund_Rate || '',
                minAmount: immediateCapture.fund_minsg || '',
                syl_1y: immediateCapture.syl_1y || '',
                syl_3y: immediateCapture.syl_3y || '',
                syl_6y: immediateCapture.syl_6y || '',
                syl_1n: immediateCapture.syl_1n || '',
                managers: immediateCapture.Data_currentFundManager || [],
                netWorthData: immediateCapture.Data_netWorthTrend || []
            };
            
            if (capturedData.netWorthData.length > 0) {
            }
            
            // 最终验证：确保捕获的数据名称包含预期的基金代码或名称
            
            state.fundDetails[code] = capturedData;
            if (state._dailyPnlMapCache) state._dailyPnlMapCache = null;
            tryUpdateActualNav(code);
            refreshTradeModalNavIfOpen(code);
            
            // 验证存储后的数据
            if (state.fundDetails[code] && state.fundDetails[code].netWorthData && state.fundDetails[code].netWorthData.length > 0) {
            }
            
            // 保存到缓存（注意：净值数据可能较大，考虑是否缓存）
            const cacheData = {
                data: capturedData,
                timestamp: Date.now()
            };
            try {
                localStorage.setItem(`fundDetail_${code}`, JSON.stringify(cacheData));
            } catch (e) {
                console.warn(`基金 ${code} 详细信息缓存失败（数据可能过大）`, e);
                // 如果缓存失败（可能因为数据太大），尝试不缓存净值数据
                const lightDetails = { ...capturedData };
                delete lightDetails.netWorthData;
                const lightCacheData = {
                    data: lightDetails,
                    timestamp: Date.now()
                };
                localStorage.setItem(`fundDetail_${code}`, JSON.stringify(lightCacheData));
            }
            
            
            // 只更新该基金的详情选项卡，而不是重新渲染整个页面
            const updated = updateFundDetailsTab(code);
            
            // 如果更新失败（可能是DOM还没创建），说明是初次加载，需要renderFunds
            if (!updated && !skipRender) {
                scheduleRender();
            }
            
            // 如果基金详情弹窗正在显示，刷新内容
            setTimeout(() => {
                updateFundDetailsTab(code);
                // 若总览弹窗已打开，重绘日历使新拉取净值的基金（如已删除）出现在日期格与日期弹窗
                var overviewModal = document.getElementById('overviewDetailModal');
                if (overviewModal && overviewModal.classList.contains('active') && typeof renderPnlCalendar === 'function') renderPnlCalendar();
                // 标记当前加载完成，处理队列中的下一个
                state.isLoadingFundDetails = false;
                processFundDetailsQueue();
            }, 150);
        } catch (e) {
            console.error(`[fetchFundDetailsInternal] 解析基金 ${code} 详细信息失败`, e);
            // 即使出错也要处理队列
            state.isLoadingFundDetails = false;
            processFundDetailsQueue();
        }
        script.remove();
        }, 50); // setTimeout 延迟 50ms，确保脚本中的赋值语句已执行
    };
    
    script.onerror = () => {
        console.error(`[fetchFundDetailsInternal] 获取基金 ${code} 详细信息失败`);
        script.remove();
        
        // 标记加载完成，处理队列中的下一个
        state.isLoadingFundDetails = false;
        processFundDetailsQueue();
    };
    
    document.body.appendChild(script);
}

// JSONP回调函数
window.jsonpgz = function(data) {
    // 验证数据是否有效
    if (!data || !data.fundcode || !data.name || !data.gszzl || !data.dwjz || !data.gsz) {
        // 尝试找出是哪个基金的数据有问题
        // 如果只有一个正在加载，就是它
        if (state.loadingFundCodes.size === 1) {
            const code = Array.from(state.loadingFundCodes)[0];
            console.error(`基金 ${code} 数据不完整或无效`);
            showToast(`基金代码 ${code} 的数据有问题，可能该基金不支持实时估值或代码错误`, 'error');
            state.loadingFundCodes.delete(code);
            removeFund(code, true); // 跳过确认对话框
        } else if (state.loadingFundCodes.size > 1) {
            // 多个同时加载时无法确定是哪个，显示通用提示
            console.error('某个基金数据不完整或无效');
            showToast('有基金数据加载失败，可能该基金不支持实时估值', 'error');
        }
        return;
    }
    
    state.fundsData[data.fundcode] = data;
    state.loadingFundCodes.delete(data.fundcode);
    if (state.fundDataTimeouts[data.fundcode]) {
        clearTimeout(state.fundDataTimeouts[data.fundcode]);
        delete state.fundDataTimeouts[data.fundcode];
    }
    tryUpdateActualNav(data.fundcode);
    
    // 保存历史数据
    if (!state.historyData[data.fundcode]) {
        state.historyData[data.fundcode] = [];
    }
    
    // 添加新的数据点
    const history = state.historyData[data.fundcode];
    const now = new Date();
    const today = now.toLocaleDateString('zh-CN');
    const time = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const percentage = parseFloat(parseFloat(data.gszzl).toFixed(2));
    
    // 获取当前小时和分钟
    const hour = now.getHours();
    const minute = now.getMinutes();
    
    // 清理非当天的数据
    const todayHistory = history.filter(item => item.date === today);
    state.historyData[data.fundcode] = todayHistory;
    
    // 判断是否在交易时段（9:30-15:00）
    const isInTradingHours = (hour === 9 && minute >= 30) || (hour >= 10 && hour < 15) || (hour === 15 && minute === 0);
    
    // 避免重复添加相同时间的数据
    const currentHistory = state.historyData[data.fundcode];
    const shouldAddData = currentHistory.length === 0 || currentHistory[currentHistory.length - 1].time !== time;
    
    if (shouldAddData) {
        if (isInTradingHours) {
            currentHistory.push({ time, percentage, date: today, tradingHours: true });
        } else {
            const hasTradingData = currentHistory.some(item => item.tradingHours === true);
            if (!hasTradingData) {
                if (currentHistory.length >= 3) {
                    currentHistory.shift();
                }
                currentHistory.push({ time, percentage, date: today, tradingHours: false });
            } else if (currentHistory.length > 0) {
                currentHistory[currentHistory.length - 1].percentage = percentage;
            }
        }
    } else if (currentHistory.length > 0) {
        currentHistory[currentHistory.length - 1].percentage = percentage;
    }
    
    // 更新今日最高最低
    updateDailyRange(data.fundcode, percentage);
    
    saveHistoryData();

    // 尝试原地更新卡片或列表行，避免整体 innerHTML 重建导致的闪烁
    const updated = updateFundCardInPlace(data.fundcode) || (state.fundListViewMode === 'list' && updateFundListItemInPlace(data.fundcode));
    if (!updated) {
        scheduleRender();
    } else {
        updateOverviewPanel();
        scrollToAndHighlightAddedFund();
    }
};

// 切换主视图（持有/自选）：有缓存则直接复用 DOM 立即切换，否则在空闲时渲染
function switchMainView(view) {
    state.currentMainView = view;
    document.querySelectorAll('.main-view-tab').forEach(tab => {
        const isSelected = tab.dataset.view === view;
        tab.classList.toggle('active', isSelected);
        tab.setAttribute('aria-selected', isSelected);
    });
    const container = document.getElementById('fundsContainer');
    const _hw = getHoldingWatchingCodes();
    const holdingCountEl = document.getElementById('holdingCount');
    const watchingCountEl = document.getElementById('watchingCount');
    if (holdingCountEl) holdingCountEl.textContent = _hw.holdingCodes.length;
    if (watchingCountEl) watchingCountEl.textContent = _hw.watchingCodes.length;

    if (state._viewCache && state._viewCache[view]) {
        container.className = state.fundListViewMode === 'list' ? 'fund-list' : 'funds-grid';
        if (state.fundListViewMode === 'list') {
            const renderToken = beginListRender();
            var cached = state._viewCache[view];
            if (cached && typeof cached === 'object' && cached.header && Array.isArray(cached.rowChunks)) {
                container.innerHTML = cached.header;
                var chunkIdx = 0;
                function applyNextChunk() {
                    if (renderToken !== state._listRenderToken) return;
                    if (chunkIdx < cached.rowChunks.length) {
                        container.insertAdjacentHTML('beforeend', cached.rowChunks[chunkIdx]);
                        chunkIdx++;
                        if (chunkIdx < cached.rowChunks.length) requestAnimationFrame(applyNextChunk);
                    }
                }
                requestAnimationFrame(applyNextChunk);
            } else {
                container.innerHTML = '';
                var html = typeof cached === 'string' ? cached : (cached && cached.header ? cached.header + (cached.rowChunks || []).join('') : '');
                if (html) {
                    var applyList = function () { container.innerHTML = html; };
                    if (typeof requestIdleCallback !== 'undefined') requestIdleCallback(applyList, { timeout: 80 });
                    else setTimeout(applyList, 0);
                }
            }
        } else {
            beginListRender(); // 取消仍在排队的列表分块渲染
            container.innerHTML = state._viewCache[view];
            if (typeof observeCharts === 'function') observeCharts();
        }
        return;
    }

    if (state._switchViewRenderTimer) clearTimeout(state._switchViewRenderTimer);
    state._switchViewRenderTimer = setTimeout(function () {
        state._switchViewRenderTimer = null;
        var doRender = function () { renderFunds(); };
        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(doRender, { timeout: 120 });
        } else {
            doRender();
        }
    }, 50);
}

// 切换展示方式（卡片 / 列表）
function setFundListViewMode(mode) {
    state.fundListViewMode = mode;
    localStorage.setItem('fundListViewMode', mode);
    document.getElementById('viewModeCard').classList.toggle('active', mode === 'card');
    document.getElementById('viewModeList').classList.toggle('active', mode === 'list');
    state._viewCache = null;
    beginListRender(); // 切换模式时先使旧列表分块任务失效
    var container = document.getElementById('fundsContainer');
    if (mode === 'list') {
        container.className = 'fund-list';
        container.innerHTML = '<div class="list-loading-placeholder" style="padding:24px;text-align:center;color:var(--primary);">加载中…</div>';
        var holdingCountEl = document.getElementById('holdingCount');
        var watchingCountEl = document.getElementById('watchingCount');
        var displayCodes, listHeader;
        function step1() {
            var codes = loadFundCodes();
            var _hw = getHoldingWatchingCodes();
            if (holdingCountEl) holdingCountEl.textContent = _hw.holdingCodes.length;
            if (watchingCountEl) watchingCountEl.textContent = _hw.watchingCodes.length;
            displayCodes = state.currentMainView === 'holding' ? _hw.holdingCodes : _hw.watchingCodes;
            if (codes.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><h2>还没有添加基金</h2><p>请在上方输入基金代码来添加基金</p></div>';
                document.getElementById('overviewPanel').style.display = 'none';
                return;
            }
            if (displayCodes.length === 0) {
                var emptyMsg = state.currentMainView === 'holding' ? '暂无持有基金，买入基金后会显示在这里' : '暂无自选基金，添加基金后未买入的会显示在这里';
                var emptyIcon = state.currentMainView === 'holding' ? '💼' : '⭐';
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">' + emptyIcon + '</div><h2>' + emptyMsg + '</h2></div>';
                if (state.currentMainView === 'holding' && typeof updateOverviewPanel === 'function') updateOverviewPanel();
                return;
            }
            setTimeout(step2, 0);
        }
        function step2() {
            var listSort = state.listSort;
            var sortByPct = listSort ? (listSort.by === 'pct') : (state.sortOrder !== 'default');
            var sortByProfit = listSort && listSort.by === 'dailyProfit';
            var sortDir = listSort ? listSort.dir : state.sortOrder;
            if (sortByPct || sortByProfit) {
                var mult = (sortDir === 'desc') ? 1 : -1;
                displayCodes = displayCodes.slice().sort(function (a, b) {
                    var dataA = state.fundsData[a];
                    var dataB = state.fundsData[b];
                    if (!dataA || !dataB) return 0;
                    if (sortByProfit) {
                        var posA = calculatePosition(a);
                        var posB = calculatePosition(b);
                        var hasA = posA && posA.totalShares > 0;
                        var hasB = posB && posB.totalShares > 0;
                        var profitA = hasA ? getSharesEligibleForTodayProfit(a) * parseFloat(dataA.dwjz) * (getDisplayValues(dataA).percentage / 100) : 0;
                        var profitB = hasB ? getSharesEligibleForTodayProfit(b) * parseFloat(dataB.dwjz) * (getDisplayValues(dataB).percentage / 100) : 0;
                        return mult * (profitB - profitA);
                    }
                    var pctA = getDisplayValues(dataA).percentage;
                    var pctB = getDisplayValues(dataB).percentage;
                    return mult * (pctB - pctA);
                });
            }
            setTimeout(step3, 0);
        }
        function step3() {
            const renderToken = beginListRender();
            var now = new Date();
            var todayStr = toDateStr(now);
            var dataTradeDateStr = isTradingDay(now) ? todayStr : getPreviousTradingDay(todayStr);
            var dataTradeDate = new Date(dataTradeDateStr + 'T12:00:00');
            var headerDateStr = (dataTradeDate.getMonth() + 1) + '/' + dataTradeDate.getDate();
            var ls = state.listSort;
            var defaultMark = '<span class="list-col-sort-arrow list-col-sort-default" title="默认顺序">≡</span>';
            var pctArrow = (ls && ls.by === 'pct') ? (ls.dir === 'desc' ? '<span class="list-col-sort-arrow">↓</span>' : '<span class="list-col-sort-arrow">↑</span>') : defaultMark;
            var profitArrow = (ls && ls.by === 'dailyProfit') ? (ls.dir === 'desc' ? '<span class="list-col-sort-arrow">↓</span>' : '<span class="list-col-sort-arrow">↑</span>') : defaultMark;
            listHeader = '<div class="fund-list-header"><div class="list-name">名称</div><div class="list-pct"><span class="list-col-sortable list-col-label" onclick="sortListBy(\'pct\')" title="点击切换：默认顺序 / 涨跌幅降序 / 涨跌幅升序">涨跌幅' + pctArrow + '</span><span class="list-col-date">' + headerDateStr + '</span></div><div class="list-profit-cell"><span class="list-col-sortable list-col-label" onclick="sortListBy(\'dailyProfit\')" title="点击切换：默认顺序 / 今日盈亏降序 / 今日盈亏升序">今日盈亏' + profitArrow + '</span><span class="list-col-date">' + headerDateStr + '</span></div><div class="list-sparkline"><span class="list-col-label">当日走势</span><span class="list-col-date">' + headerDateStr + '</span></div><div class="list-actions">操作</div></div>';
            container.innerHTML = listHeader;
            var rowIndex = 0;
            var rowChunks = [];
            function appendListChunk() {
                if (renderToken !== state._listRenderToken) return;
                var chunk = displayCodes.slice(rowIndex, rowIndex + LIST_CHUNK_SIZE);
                rowIndex += chunk.length;
                if (chunk.length) {
                    var chunkHtml = buildListRowsHTML(chunk);
                    rowChunks.push(chunkHtml);
                    container.insertAdjacentHTML('beforeend', chunkHtml);
                }
                if (rowIndex < displayCodes.length) {
                    requestAnimationFrame(appendListChunk);
                } else {
                    if (typeof updateOverviewPanel === 'function') updateOverviewPanel();
                    state._viewCache = state._viewCache || {};
                    state._viewCache[state.currentMainView] = { header: listHeader, rowChunks: rowChunks };
                }
            }
            requestAnimationFrame(appendListChunk);
        }
        setTimeout(step1, 0);
    } else {
        renderFunds();
    }
}

function initFundListViewMode() {
    const mode = state.fundListViewMode;
    const cardBtn = document.getElementById('viewModeCard');
    const listBtn = document.getElementById('viewModeList');
    if (cardBtn) cardBtn.classList.toggle('active', mode === 'card');
    if (listBtn) listBtn.classList.toggle('active', mode === 'list');
}

// 改变排序方式
function changeSortOrder() {
    state.sortOrder = document.getElementById('sortSelect').value;
    state.listSort = state.sortOrder === 'default' ? null : { by: 'pct', dir: state.sortOrder };
    localStorage.setItem('sortOrder', state.sortOrder);
    try { localStorage.setItem('listSort', state.listSort ? JSON.stringify(state.listSort) : ''); } catch (e) {}
    state._viewCache = null;
    renderFunds();
}

// 列表表头点击排序（涨跌幅 / 今日盈亏），三档循环：默认 → 降序 → 升序 → 默认
function sortListBy(by) {
    const cur = state.listSort;
    if (!cur || cur.by !== by) {
        state.listSort = { by: by, dir: 'desc' };
    } else if (cur.dir === 'desc') {
        state.listSort = { by: by, dir: 'asc' };
    } else {
        state.listSort = null; // 恢复默认
    }
    // 与顶部下拉框联动
    state.sortOrder = state.listSort && state.listSort.by === 'pct' ? state.listSort.dir : 'default';
    localStorage.setItem('sortOrder', state.sortOrder);
    const sel = document.getElementById('sortSelect');
    if (sel) sel.value = state.sortOrder;
    try { localStorage.setItem('listSort', state.listSort ? JSON.stringify(state.listSort) : ''); } catch (e) {}
    state._viewCache = null;
    renderFunds();
}

// 加载排序设置
function loadSortOrder() {
    const saved = localStorage.getItem('sortOrder');
    if (saved) {
        state.sortOrder = saved;
        document.getElementById('sortSelect').value = saved;
    }
    try {
        const listSaved = localStorage.getItem('listSort');
        if (listSaved) {
            state.listSort = JSON.parse(listSaved);
            const sel = document.getElementById('sortSelect');
            if (state.listSort) {
                state.sortOrder = state.listSort.by === 'pct' ? state.listSort.dir : 'default';
                if (sel) sel.value = state.sortOrder;
            }
        }
    } catch (e) {}
}

// 更新总览看板
function updateOverviewPanel() {
    const codes = getOverviewFundCodes();

    const overviewEl = document.getElementById('overviewPanel');
    // 如果没有基金，隐藏总览
    if (codes.length === 0) {
        overviewEl.style.display = 'none';
        return;
    }

    let totalMarketValue = 0;
    let totalCost = 0;
    let todayProfit = 0;
    let hasPosition = false;
    let historicalProfit = 0;    // 历史已实现收益
    let totalHistoricalCost = 0; // 历史总投入成本（用于计算累计收益率）
    let hasHistory = false;

    codes.forEach(code => {
        const data = state.fundsData[code];
        const posInfo = calculatePosition(code);
        
        // 持仓收益计算
        if (posInfo && posInfo.totalShares > 0 && data) {
            hasPosition = true;
            const display = getDisplayValues(data);
            const currentNav = display.isActual ? parseFloat(display.value) : parseFloat(data.gsz);
            const currentValue = posInfo.totalShares * currentNav;
            totalMarketValue += currentValue;
            totalCost += posInfo.totalCost;
            
            // 今日盈亏 = 参与计算的份额 × 昨日净值 × 涨跌幅（排除今日买入份额）
            const percentage = display.percentage;
            const yesterdayValue = parseFloat(data.dwjz);
            const eligibleShares = getSharesEligibleForTodayProfit(code);
            const dailyProfit = eligibleShares * yesterdayValue * (percentage / 100);
            todayProfit += dailyProfit;
        }

        // 历史收益计算：按有效净值日期排序后回放，计算每笔卖出的已实现盈亏
        const position = state.positions[code];
        if (position && position.transactions && position.transactions.length > 0) {
            let runningShares = 0;
            let runningCost = 0;
            const sorted = position.transactions.slice().sort((a, b) => getTransEffectiveDate(a).localeCompare(getTransEffectiveDate(b)));

            sorted.forEach(trans => {
                if (trans.type === 'buy') {
                    runningShares += trans.shares;
                    runningCost += trans.amount;
                    totalHistoricalCost += trans.amount; // 累计所有买入成本
                } else if (trans.type === 'sell') {
                    hasHistory = true;
                    const sellRatio = runningShares > 0 ? trans.shares / runningShares : 0;
                    const costBasis = runningCost * sellRatio;
                    historicalProfit += trans.amount - costBasis;
                    runningShares -= trans.shares;
                    runningCost -= costBasis;
                }
            });
        }
    });

    // 如果既没有持仓也没有历史交易，隐藏总览
    if (!hasPosition && !hasHistory) {
        overviewEl.style.display = 'none';
        return;
    }

    // 显示总览并移除骨架态（首屏骨架在数据就绪后替换为真实内容）
    overviewEl.style.display = 'block';
    overviewEl.classList.remove('overview-panel-skeleton');
    overviewEl.setAttribute('aria-busy', 'false');

    // === 持仓收益 ===
    const holdingProfit = totalMarketValue - totalCost;
    const holdingProfitRate = totalCost > 0 ? (holdingProfit / totalCost * 100) : 0;

    const totalMarketValueEl = document.getElementById('totalMarketValue');
    const totalCostEl = document.getElementById('totalCost');
    if (totalMarketValueEl) animateValue(totalMarketValueEl, totalMarketValue.toFixed(2), '', '', 400, true);
    if (totalCostEl) animateValue(totalCostEl, totalCost.toFixed(2), '', '', 400, true);
    
    const totalProfitEl = document.getElementById('totalProfit');
    animateValue(totalProfitEl, holdingProfit.toFixed(2), '', '', 400);
    totalProfitEl.className = 'stat-value ' + (holdingProfit >= 0 ? 'positive' : 'negative');
    
    const totalProfitRateEl = document.getElementById('totalProfitRate');
    const rateSymbol = holdingProfitRate >= 0 ? '+' : '';
    animateValue(totalProfitRateEl, holdingProfitRate.toFixed(2), rateSymbol, '%', 400);
    totalProfitRateEl.className = 'stat-value ' + (holdingProfit >= 0 ? 'positive' : 'negative');
    
    const todayProfitEl = document.getElementById('todayProfit');
    animateValue(todayProfitEl, todayProfit.toFixed(2), '', '', 400);
    todayProfitEl.className = 'stat-value ' + (todayProfit >= 0 ? 'positive' : 'negative');

    // 今日盈亏高亮
    applyTodayHighlight(todayProfit, totalMarketValue);

    // === 历史收益 & 累计收益 ===
    const cumulativeProfit = holdingProfit + historicalProfit;
    const cumulativeProfitRate = totalHistoricalCost > 0 ? (cumulativeProfit / totalHistoricalCost * 100) : 0;

    const historicalProfitEl = document.getElementById('historicalProfit');
    animateValue(historicalProfitEl, historicalProfit.toFixed(2), '', '', 400);
    historicalProfitEl.className = 'stat-value ' + (historicalProfit >= 0 ? 'positive' : 'negative');

    const cumulativeProfitEl = document.getElementById('cumulativeProfit');
    animateValue(cumulativeProfitEl, cumulativeProfit.toFixed(2), '', '', 400);
    cumulativeProfitEl.className = 'stat-value ' + (cumulativeProfit >= 0 ? 'positive' : 'negative');

    const cumulativeProfitRateEl = document.getElementById('cumulativeProfitRate');
    const crSymbol = cumulativeProfitRate >= 0 ? '+' : '';
    animateValue(cumulativeProfitRateEl, cumulativeProfitRate.toFixed(2), crSymbol, '%', 400);
    cumulativeProfitRateEl.className = 'stat-value ' + (cumulativeProfitRate >= 0 ? 'positive' : 'negative');
    
    // === 更新紧凑模式指标（带动效）===
    const compactMV = document.getElementById('compactMarketValue');
    if (compactMV) animateValue(compactMV, totalMarketValue.toFixed(2), '', '', 400, true);

    const todayProfitSymbol = todayProfit >= 0 ? '+' : '';
    const compactToday = document.getElementById('compactTodayProfit');
    if (compactToday) {
        animateValue(compactToday, todayProfit.toFixed(2), todayProfitSymbol, '', 400);
        compactToday.className = 'overview-compact-value ' + (todayProfit >= 0 ? 'positive' : 'negative');
    }

    // 缓存数据用于金额/收益率切换（紧凑区持仓/累计用动效更新）
    _compactData = {
        holdingProfit, holdingProfitRate,
        cumulativeProfit, cumulativeProfitRate
    };
    applyCompactDisplay(true);

    // 更新时间
    const now = new Date().toLocaleString('zh-CN', { 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    document.getElementById('overviewUpdateTime').textContent = now;

    // 绘制图表
    drawAllocationChart();
    drawProfitTrendChart();
    if (typeof renderPnlCalendar === 'function') renderPnlCalendar();
}

// ===== 盈亏日历 =====
function setPnlCalendarView(view) {
    state.calendarView = view;
    localStorage.setItem('pnlCalendarView', view);
    document.querySelectorAll('.pnl-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    renderPnlCalendar();
}
function setPnlCalendarDisplay(display) {
    state.calendarDisplay = display;
    localStorage.setItem('pnlCalendarDisplay', display);
    document.querySelectorAll('.pnl-display-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.display === display);
    });
    renderPnlCalendar();
}
function pnlCalendarPrev() {
    if (state.calendarView === 'day') {
        state.calendarMonth--;
        if (state.calendarMonth < 1) {
            state.calendarMonth = 12;
            state.calendarYear--;
        }
    } else if (state.calendarView === 'month') {
        state.calendarYear--;
    } else {
        state.calendarYear -= 4;
    }
    renderPnlCalendar();
}
function pnlCalendarNext() {
    if (state.calendarView === 'day') {
        state.calendarMonth++;
        if (state.calendarMonth > 12) {
            state.calendarMonth = 1;
            state.calendarYear++;
        }
    } else if (state.calendarView === 'month') {
        state.calendarYear++;
    } else {
        state.calendarYear += 4;
    }
    renderPnlCalendar();
}
function pnlCalendarGoToday() {
    const now = new Date();
    state.calendarYear = now.getFullYear();
    state.calendarMonth = now.getMonth() + 1;
    renderPnlCalendar();
    if (state.calendarView === 'day') {
        const todayStr = toDateStr(now);
        const gridEl = document.getElementById('pnlCalendarGrid');
        const todayBtn = gridEl && gridEl.querySelector('button.pnl-cell[data-date="' + todayStr + '"]');
        if (todayBtn) {
            todayBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            todayBtn.focus({ preventScroll: true });
        }
    }
}
function renderPnlCalendar() {
    const gridEl = document.getElementById('pnlCalendarGrid');
    const titleEl = document.getElementById('pnlCalendarTitle');
    const hintEl = document.getElementById('pnlCalendarHint');
    const prevBtn = document.getElementById('pnlCalendarPrev');
    const nextBtn = document.getElementById('pnlCalendarNext');
    if (!gridEl || !titleEl) return;

    // 同步视图/展示选项的选中状态（解决刷新后 state 从 localStorage 恢复但 tab 仍为默认的问题）
    document.querySelectorAll('.pnl-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === state.calendarView);
    });
    const displayTabsWrap = document.querySelector('.pnl-calendar-display-tabs');
    if (displayTabsWrap) displayTabsWrap.style.display = state.calendarView === 'day' ? '' : 'none';
    document.querySelectorAll('.pnl-display-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.display === state.calendarDisplay);
    });

    const dailyMap = getDailyPnlMap();
    const hasData = Object.keys(dailyMap).length > 0;
    const clickHint = state.calendarView === 'day' ? '点击日期可查看各基金明细' : (state.calendarView === 'month' ? '点击月份可查看各基金盈亏' : '点击年份可查看各基金盈亏');
    hintEl.textContent = hasData ? ('每日为当日相对前一交易日的组合盈亏（基于历史净值），' + clickHint) : '暂无历史净值数据，请打开基金详情加载净值走势后查看';
    const legendEl = document.getElementById('pnlCalendarLegend');
    if (legendEl) {
        if (hasData) legendEl.innerHTML = '<span><span class="leg-dot positive"></span>盈利</span><span><span class="leg-dot negative"></span>亏损</span><span><span class="leg-dot zero"></span>持平</span><span>相对前一交易日</span>';
        legendEl.style.display = hasData ? '' : 'none';
    }

    if (state.calendarView === 'day') {
        titleEl.textContent = state.calendarYear + '年' + state.calendarMonth + '月';
        const showAmount = state.calendarDisplay === 'amount';
        const todayEstimate = getTodayEstimatedPnlSummary();
        const firstDay = new Date(state.calendarYear, state.calendarMonth - 1, 1);
        const lastDay = new Date(state.calendarYear, state.calendarMonth, 0);
        const startPad = firstDay.getDay();
        const daysInMonth = lastDay.getDate();
        const todayStr = toDateStr(new Date());
        gridEl.className = 'pnl-calendar-grid by-day';
        const weekHeads = ['日', '一', '二', '三', '四', '五', '六'];
        let html = weekHeads.map(w => `<div class="pnl-cell head">${w}</div>`).join('');
        for (let i = 0; i < startPad; i++) html += '<div class="pnl-cell empty"></div>';
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = state.calendarYear + '-' + String(state.calendarMonth).padStart(2, '0') + '-' + String(d).padStart(2, '0');
            let info = dailyMap[dateStr];
            const isToday = dateStr === todayStr;
            const dateObj = new Date(dateStr + 'T12:00:00');
            const isNonTrading = !isTradingDay(dateObj);
            const useEstimated = isToday && todayEstimate && !isAfterNavPublishTime();
            if (useEstimated) info = todayEstimate;
            // 兜底：若日历缓存缺该交易日，按当日明细动态聚合，避免出现“个别交易日空白”。
            if (!info && !useEstimated && !isNonTrading && dateStr <= todayStr) {
                const list = getDailyPnlByFund(dateStr);
                if (list.length > 0) {
                    const amount = list.reduce((sum, item) => sum + (item.amount || 0), 0);
                    const prev = getPreviousTradingDay(dateStr);
                    const prevValueForRate = getPortfolioValueForRateBetween(prev, dateStr);
                    const rate = prevValueForRate > 0 ? (amount / prevValueForRate) * 100 : 0;
                    info = { amount, rate };
                } else {
                    // 有交易日但无可计算明细时显示 0，避免视觉上“缺格”。
                    info = { amount: 0, rate: 0 };
                }
            }
            let cls = 'pnl-cell';
            let valueHtml = '';
            if (info) {
                if (info.amount > 0) cls += ' positive';
                else if (info.amount < 0) cls += ' negative';
                else cls += ' zero';
                const value = showAmount
                    ? (info.amount >= 0 ? '+' : '') + info.amount.toFixed(2)
                    : (info.rate >= 0 ? '+' : '') + info.rate.toFixed(2) + '%';
                valueHtml = `<span class="pnl-value">${value}</span>`;
            } else if (isNonTrading) {
                cls += ' pnl-cell-non-trading';
            }
            if (isToday) cls += ' pnl-cell-today';
            cls += ' pnl-cell-day';
            let title = dateStr;
            if (info) title += ' ' + (showAmount ? info.amount.toFixed(2) : info.rate.toFixed(2) + '%') + (useEstimated ? '（估算）' : '') + '，点击查看各基金明细';
            else title += isNonTrading ? ' 非交易日' : ' 暂无净值数据，点击查看';
            html += `<button type="button" class="${cls}" data-date="${dateStr}" title="${title}" onclick="openDailyPnlDetail('${dateStr}')" aria-label="${title}"><span class="pnl-label">${d}</span>${valueHtml}</button>`;
        }
        gridEl.innerHTML = html;
        prevBtn.style.visibility = 'visible';
        nextBtn.style.visibility = 'visible';
    } else if (state.calendarView === 'month') {
        titleEl.textContent = state.calendarYear + '年';
        gridEl.className = 'pnl-calendar-grid by-month';
        let html = '';
        for (let m = 1; m <= 12; m++) {
            let sumAmount = 0;
            Object.keys(dailyMap).forEach(dateStr => {
                const y = parseInt(dateStr.slice(0, 4), 10);
                const mo = parseInt(dateStr.slice(5, 7), 10);
                if (y === state.calendarYear && mo === m) sumAmount += dailyMap[dateStr].amount;
            });
            let cls = 'pnl-cell';
            if (sumAmount > 0) cls += ' positive';
            else if (sumAmount < 0) cls += ' negative';
            else cls += ' zero';
            const value = (sumAmount >= 0 ? '+' : '') + sumAmount.toFixed(2);
            html += `<button type="button" class="${cls} pnl-cell-clickable" title="点击查看${state.calendarYear}年${m}月各基金盈亏" onclick="openMonthlyPnlDetail(${state.calendarYear}, ${m})" aria-label="${state.calendarYear}年${m}月，点击查看各基金盈亏"><span class="pnl-value">${value}</span><span class="pnl-label">${m}月</span></button>`;
        }
        gridEl.innerHTML = html;
        prevBtn.style.visibility = 'visible';
        nextBtn.style.visibility = 'visible';
    } else {
        const startYear = Math.floor(state.calendarYear / 4) * 4;
        titleEl.textContent = startYear + '–' + (startYear + 3) + '年';
        gridEl.className = 'pnl-calendar-grid by-year';
        let html = '';
        for (let y = 0; y < 4; y++) {
            const yr = startYear + y;
            let sumAmount = 0;
            Object.keys(dailyMap).forEach(dateStr => {
                const dateYear = parseInt(dateStr.slice(0, 4), 10);
                if (dateYear === yr) sumAmount += dailyMap[dateStr].amount;
            });
            let cls = 'pnl-cell';
            if (sumAmount > 0) cls += ' positive';
            else if (sumAmount < 0) cls += ' negative';
            else cls += ' zero';
            const value = (sumAmount >= 0 ? '+' : '') + sumAmount.toFixed(2);
            html += `<button type="button" class="${cls} pnl-cell-clickable" title="点击查看${yr}年各基金盈亏" onclick="openYearlyPnlDetail(${yr})" aria-label="${yr}年，点击查看各基金盈亏"><span class="pnl-value">${value}</span><span class="pnl-label">${yr}年</span></button>`;
        }
        gridEl.innerHTML = html;
        prevBtn.style.visibility = 'visible';
        nextBtn.style.visibility = 'visible';
    }
}

// ===== 今日盈亏明细弹窗 =====
function openTodayProfitDetail() {
    const codes = loadFundCodes();
    const modal = document.getElementById('historicalProfitModal');
    const title = modal.querySelector('h2');
    const content = document.getElementById('historicalProfitContent');

    title.textContent = '📊 今日盈亏明细';

    const items = [];
    let totalToday = 0;

    codes.forEach(code => {
        const data = state.fundsData[code];
        const posInfo = calculatePosition(code);
        if (!posInfo || posInfo.totalShares <= 0 || !data) return;

        const display = getDisplayValues(data);
        const percentage = display.percentage;
        const yesterdayValue = parseFloat(data.dwjz);
        const eligibleShares = getSharesEligibleForTodayProfit(code);
        const dailyProfit = eligibleShares * yesterdayValue * (percentage / 100);
        totalToday += dailyProfit;

        items.push({
            name: getFundDisplayName(code),
            code: code,
            profit: dailyProfit,
            percentage: percentage
        });
    });

    items.sort((a, b) => b.profit - a.profit);

    const totalCls = totalToday > 0 ? 'positive' : (totalToday < 0 ? 'negative' : 'neutral');
    const totalAmountStr = (totalToday > 0 ? '+' : (totalToday < 0 ? '-' : '')) + (totalToday < 0 ? Math.abs(totalToday) : totalToday).toFixed(2);

    let html = `
        <div class="historical-profit-summary">
            <span class="summary-label">今日总盈亏</span>
            <span class="summary-value ${totalCls}">${totalAmountStr}</span>
        </div>
    `;

    if (items.length === 0) {
        html += '<div class="no-position" style="padding: 30px;">暂无持仓基金</div>';
    } else {
        items.forEach(item => {
            const isZeroProfit = Math.abs(item.profit) < 0.005;
            const cls = isZeroProfit ? 'neutral' : (item.profit > 0 ? 'positive' : 'negative');
            const profitAmountStr = isZeroProfit ? '0.00' : (item.profit > 0 ? '+' : (item.profit < 0 ? '-' : '')) + (item.profit < 0 ? Math.abs(item.profit) : item.profit).toFixed(2);
            const isZeroPct = Math.abs(item.percentage) < 0.005;
            const pctStr = isZeroPct ? '0.00' : (item.percentage > 0 ? '+' : (item.percentage < 0 ? '-' : '')) + (item.percentage < 0 ? Math.abs(item.percentage) : item.percentage).toFixed(2);
            const nameEsc = (item.name || '').replace(/</g, '&lt;').replace(/"/g, '&quot;');
            const codeEsc = (item.code || '').replace(/</g, '&lt;');
            html += `
                <div class="historical-fund-item">
                    <div class="historical-fund-info">
                        <a href="javascript:void(0)" class="historical-fund-name historical-fund-name-link" onclick="closeHistoricalProfitDetail(); openFundDetailModal('${codeEsc}')" title="点击查看基金详情">${nameEsc}</a>
                        <div class="historical-fund-code">${item.code}</div>
                    </div>
                    <div class="historical-fund-profit">
                        <div class="profit-amount ${cls}">${profitAmountStr}</div>
                        <div class="profit-sells">${pctStr}%</div>
                    </div>
                </div>
            `;
        });
    }

    content.innerHTML = html;
    modal.classList.add('active');
}

// ===== 持仓占比环形图 =====
let allocationChartInstance = null;
const allocationColors = () => [getPrimaryColor(), (getComputedStyle(document.documentElement).getPropertyValue('--primary-dark').trim() || '#0891b2'), '#f093fb', '#ff6b6b', '#ffa502', '#2ed573', '#1e90ff', '#ff6348', '#7bed9f', '#70a1ff'];

function drawAllocationChart() {
    const ctx = document.getElementById('allocationChart');
    if (!ctx) return;

    const codes = loadFundCodes();
    const sectorSums = {};
    const sectorFunds = {};
    let total = 0;

    codes.forEach(code => {
        const data = state.fundsData[code];
        const posInfo = calculatePosition(code);
        if (!posInfo || posInfo.totalShares <= 0 || !data) return;
        const display = getDisplayValues(data);
        const currentNav = display.isActual ? parseFloat(display.value) : parseFloat(data.gsz);
        const mv = posInfo.totalShares * currentNav;
        const sector = getFundSector(code, data.name) || '其他';
        sectorSums[sector] = (sectorSums[sector] || 0) + mv;
        if (!sectorFunds[sector]) sectorFunds[sector] = [];
        sectorFunds[sector].push({ name: data.name || code, value: mv });
        total += mv;
    });

    const items = Object.keys(sectorSums).map(sector => ({
        sector,
        value: sectorSums[sector],
        funds: sectorFunds[sector] || []
    })).sort((a, b) => b.value - a.value);

    if (items.length === 0) {
        if (allocationChartInstance) { allocationChartInstance.destroy(); allocationChartInstance = null; }
        const legendEl = document.getElementById('allocationLegend');
        if (legendEl) legendEl.innerHTML = '';
        return;
    }

    const labels = items.map(i => i.sector);
    const data = items.map(i => i.value);
    const colorsArr = allocationColors();
    const colors = items.map((_, i) => colorsArr[i % colorsArr.length]);

    if (allocationChartInstance && allocationChartInstance.canvas === ctx) {
        allocationChartInstance.data.labels = labels;
        allocationChartInstance.data.datasets[0].data = data;
        allocationChartInstance.data.datasets[0].backgroundColor = colors;
        allocationChartInstance._allocationItems = items;
        allocationChartInstance._allocationTotal = total;
        allocationChartInstance.update('none');
    } else {
        if (allocationChartInstance) allocationChartInstance.destroy();
        allocationChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: 'transparent',
                    hoverBorderColor: '#fff',
                    borderRadius: 3,
                    spacing: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                hoverOffset: 4,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const chart = context.chart;
                                const items = chart._allocationItems || [];
                                const total = chart._allocationTotal || 0;
                                const item = items.find(function(i) { return i.sector === context.label; })
                                    || items[context.dataIndex];
                                if (!item) return [context.label, ''];
                                const pct = total > 0 ? (item.value / total * 100).toFixed(1) : 0;
                                const funds = item.funds;
                                const fundList = funds.length <= 3
                                    ? funds.map(function(f) { return f.name; }).join('、')
                                    : funds.slice(0, 2).map(function(f) { return f.name; }).join('、') + ' 等' + funds.length + '只';
                                return [context.label + ': ' + item.value.toFixed(0) + ' (' + pct + '%)', fundList];
                            }
                        }
                    }
                }
            }
        });
        allocationChartInstance._allocationItems = items;
        allocationChartInstance._allocationTotal = total;
    }

    const legendEl = document.getElementById('allocationLegend');
    if (legendEl) {
        legendEl.innerHTML = items.slice(0, 8).map((item, i) => {
            const pct = total > 0 ? (item.value / total * 100).toFixed(1) : '0';
            return `<div class="allocation-legend-item">
                <span class="allocation-legend-dot" style="background:${colors[i]}"></span>
                <span class="allocation-legend-name">${item.sector}</span>
                <span class="allocation-legend-pct">${pct}%</span>
            </div>`;
        }).join('');
    }
}

// ===== 最大回撤计算 =====
// 定义：沿时间轴维护「至今最高点」peak，每点的回撤 = (peak - 当前值) / peak；
// 最大回撤 = 所有点回撤的最大值。即：从曲线前期高点到后续最低点的跌幅（相对该高点）。
// 例：累计收益从 1000 跌到 84，回撤 = (1000-84)/1000 = 91.6%。收益率模式下同理，为「收益率曲线」的回撤。
function calculateMaxDrawdown(dataPoints) {
    if (dataPoints.length < 2) return 0;
    let peak = dataPoints[0];
    let maxDd = 0;
    dataPoints.forEach(val => {
        if (val > peak) peak = val;
        const dd = peak > 0 ? (peak - val) / peak : 0;
        if (dd > maxDd) maxDd = dd;
    });
    return maxDd;
}

// ===== 紧凑模式迷你趋势线 =====
let sparklineInstance = null;

function drawCompactSparkline(dataPoints) {
    const ctx = document.getElementById('compactSparkline');
    if (!ctx || dataPoints.length < 2) return;

    const recent = dataPoints.slice(-15);
    const lastVal = recent[recent.length - 1] || 0;
    const color = lastVal >= 0 ? '#ff4d4f' : '#00b96b';

    if (sparklineInstance && sparklineInstance.canvas === ctx) {
        sparklineInstance.data.labels = recent.map(() => '');
        sparklineInstance.data.datasets[0].data = recent;
        sparklineInstance.data.datasets[0].borderColor = color;
        sparklineInstance.update('none');
        return;
    }

    if (sparklineInstance) sparklineInstance.destroy();
    sparklineInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: recent.map(() => ''),
            datasets: [{
                data: recent,
                borderColor: color,
                borderWidth: 1.5,
                tension: 0.4,
                fill: false,
                pointRadius: 0,
                pointHoverRadius: 0
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: {
                x: { display: false },
                y: { display: false }
            },
            animation: false
        }
    });
}

// ===== 数字动画过渡 =====
// noPlus: 为 true 时正数不加 '+'（用于总市值、总成本等）
function animateValue(el, endValue, prefix, suffix, duration, noPlus) {
    if (!el) return;
    const text = el.textContent;
    const currentMatch = text.replace(/[¥,+%()（）]/g, '').trim();
    const startVal = parseFloat(currentMatch) || 0;
    const endVal = parseFloat(String(endValue).replace(/[%]/g, '')) || 0;

    if (Math.abs(startVal - endVal) < 0.005) {
        const symbol = (suffix === '%') ? (prefix || (endVal >= 0 ? '+' : '')) : (noPlus ? '' : (endVal >= 0 ? '+' : ''));
        el.textContent = `${symbol}${endValue}${suffix}`;
        return;
    }

    const startTime = performance.now();
    const dur = duration || 400;

    function step(now) {
        const progress = Math.min((now - startTime) / dur, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        const current = startVal + (endVal - startVal) * ease;
        const symbol = (suffix === '%') ? (prefix || (current >= 0 ? '+' : '')) : (noPlus ? '' : (current >= 0 ? '+' : ''));
        if (suffix === '%') {
            el.textContent = `${symbol}${current.toFixed(2)}${suffix}`;
        } else {
            el.textContent = `${symbol}${current.toFixed(2)}`;
        }
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// ===== 紧凑模式：金额/收益率切换 =====
let compactShowRate = false;
let _compactData = {}; // 缓存数据供切换

function toggleCompactDisplay() {
    compactShowRate = !compactShowRate;
    applyCompactDisplay();
}

function applyCompactDisplay(animate) {
    const d = _compactData;
    if (!d.holdingProfit && d.holdingProfit !== 0) return;

    const compactHP = document.getElementById('compactHoldingProfit');
    const compactHR = document.getElementById('compactHoldingRate');
    const compactCP = document.getElementById('compactCumulativeProfit');
    const duration = 400;

    if (compactHP) compactHP.className = 'overview-compact-value ' + (d.holdingProfit >= 0 ? 'positive' : 'negative');
    if (compactCP) compactCP.className = 'overview-compact-value ' + (d.cumulativeProfit >= 0 ? 'positive' : 'negative');

    if (compactShowRate) {
        if (compactHP && animate) animateValue(compactHP, d.holdingProfitRate.toFixed(2), (d.holdingProfitRate >= 0 ? '+' : ''), '%', duration);
        else if (compactHP) compactHP.textContent = `${d.holdingProfitRate >= 0 ? '+' : ''}${d.holdingProfitRate.toFixed(2)}%`;
        if (compactHR) compactHR.textContent = '';
        if (compactCP && animate) animateValue(compactCP, d.cumulativeProfitRate.toFixed(2), (d.cumulativeProfitRate >= 0 ? '+' : ''), '%', duration);
        else if (compactCP) compactCP.textContent = `${d.cumulativeProfitRate >= 0 ? '+' : ''}${d.cumulativeProfitRate.toFixed(2)}%`;
    } else {
        if (compactHP && animate) animateValue(compactHP, d.holdingProfit.toFixed(2), (d.holdingProfit >= 0 ? '+' : ''), '', duration);
        else if (compactHP) compactHP.textContent = `${d.holdingProfit >= 0 ? '+' : ''}${d.holdingProfit.toFixed(2)}`;
        if (compactHR) {
            const s = d.holdingProfitRate >= 0 ? '+' : '';
            compactHR.textContent = `(${s}${d.holdingProfitRate.toFixed(2)}%)`;
            compactHR.className = 'overview-compact-sub ' + (d.holdingProfit >= 0 ? 'positive' : 'negative');
        }
        if (compactCP && animate) animateValue(compactCP, d.cumulativeProfit.toFixed(2), (d.cumulativeProfit >= 0 ? '+' : ''), '', duration);
        else if (compactCP) compactCP.textContent = `${d.cumulativeProfit >= 0 ? '+' : ''}${d.cumulativeProfit.toFixed(2)}`;
    }
}

// ===== 收益趋势图时间段选择 =====
// 0=全部, 30/90/180/365=近N天, 'week'/'month'/'year'=当周/当月/当年（自然周/月/年至今）
let trendRange = 'year';
let profitTrendChartDisplay = 'amount'; // 'amount' | 'rate'

function changeTrendRange(value) {
    trendRange = value;
    document.querySelectorAll('.trend-range-selector .trend-range-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.range === String(value));
    });
    drawProfitTrendChart();
}

function changeTrendChartDisplay(mode) {
    profitTrendChartDisplay = mode;
    const amountBtn = document.getElementById('trendDisplayAmount');
    const rateBtn = document.getElementById('trendDisplayRate');
    if (amountBtn) amountBtn.classList.toggle('active', mode === 'amount');
    if (rateBtn) rateBtn.classList.toggle('active', mode === 'rate');
    drawProfitTrendChart();
}

// ===== 今日盈亏高亮 =====
function applyTodayHighlight(todayProfit, totalMarketValue) {
    const card = document.getElementById('todayProfitCard');
    if (!card) return;
    card.classList.remove('today-highlight-profit', 'today-highlight-loss');
    // 盈亏幅度超过市值的 1% 时高亮
    if (totalMarketValue > 0) {
        const ratio = Math.abs(todayProfit) / totalMarketValue;
        if (ratio >= 0.01) {
            card.classList.add(todayProfit >= 0 ? 'today-highlight-profit' : 'today-highlight-loss');
        }
    }
}

// 收益趋势图实例
let profitTrendChartInstance = null;

// 收益趋势图 Y 轴范围：数据少或数值区间小时让折线更饱满；rate 模式用更细粒度使收益率曲线变化更明显
function makeProfitTrendYAxisLimits(filteredData, isRate) {
    return function(axis) {
        if (axis.max < 0) axis.max = 0;
        else if (axis.min > 0) axis.min = 0;
        let range = axis.max - axis.min;
        const center = (axis.max + axis.min) / 2;
        const absCenter = Math.abs(center);
        const minRange = isRate ? Math.max(0.8, absCenter * 0.15) : Math.max(30, absCenter * 0.12);
        if (range < minRange && range > 0) {
            axis.min = center - minRange / 2;
            axis.max = center + minRange / 2;
            if (axis.min < 0 && filteredData.some(v => v < 0)) axis.min = Math.min(axis.min, 0);
            if (axis.max > 0 && filteredData.some(v => v > 0)) axis.max = Math.max(axis.max, 0);
            range = axis.max - axis.min;
        }
        const paddingRatio = isRate ? 0.03 : 0.12;
        const padding = range * paddingRatio;
        axis.max += padding;
        axis.min -= padding;
    };
}

// 绘制收益趋势图
function drawProfitTrendChart() {
    const ctx = document.getElementById('profitTrendChart');
    if (!ctx) return;

    const codes = getOverviewFundCodes();

    // 收集所有交易，按日期排序
    const allTransactions = [];
    codes.forEach(code => {
        const position = state.positions[code];
        if (!position || !position.transactions) return;
        position.transactions.forEach(trans => {
            allTransactions.push({ ...trans, code });
        });
    });

    if (allTransactions.length === 0) {
        if (profitTrendChartInstance) {
            profitTrendChartInstance.destroy();
            profitTrendChartInstance = null;
        }
        const summaryEl = document.getElementById('profitTrendChartSummary');
        if (summaryEl) summaryEl.innerHTML = '';
        return;
    }

    allTransactions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // 时间轴：从首笔交易日到今天的每个交易日（按天粒度）
    const dateSet = new Set();
    allTransactions.forEach(t => {
        dateSet.add(t.tradeDate || toDateStr(new Date(t.date)));
        dateSet.add(getTransEffectiveDate(t));
    });
    dateSet.add(toDateStr(new Date()));
    const sortedSet = Array.from(dateSet).sort();
    const firstDateStr = sortedSet[0];
    const endDateStr = toDateStr(new Date());
    let d = new Date(firstDateStr + 'T12:00:00');
    const end = new Date(endDateStr + 'T12:00:00');
    const dates = [];
    while (d <= end) {
        if (isTradingDay(d)) dates.push(toDateStr(d));
        d.setDate(d.getDate() + 1);
    }

    // 每个时间点：按当日历史净值算持仓市值，按有效日回放算已实现收益；并算当日累计投入成本（用于收益率）
    const todayStr = toDateStr(new Date());
    const dataPoints = [];
    const holdingProfitPoints = [];
    const historicalProfitPoints = [];
    const totalCostAtDate = [];   // 总投入（总买入），与总览「累计收益率」一致，用于收益率分母

    dates.forEach(dateStr => {
        let totalHoldingProfit = 0;
        let totalHistoricalProfit = 0;
        let buyAtDate = 0;
        const isToday = dateStr === todayStr;

        codes.forEach(code => {
            const position = state.positions[code];
            if (!position || !position.transactions) return;

            let runningShares = 0;
            let runningCost = 0;
            let realizedProfit = 0;

            // 只考虑有效日 <= dateStr 的交易，并按有效日排序后回放，避免顺序错乱导致已实现收益算错
            const upToDate = position.transactions
                .filter(trans => getTransEffectiveDate(trans) <= dateStr)
                .sort((a, b) => getTransEffectiveDate(a).localeCompare(getTransEffectiveDate(b)));
            upToDate.forEach(trans => {
                if (trans.type === 'buy') {
                    runningShares += trans.shares;
                    runningCost += trans.amount;
                    buyAtDate += trans.amount;
                } else if (trans.type === 'sell') {
                    const sellRatio = runningShares > 0 ? trans.shares / runningShares : 0;
                    const costBasis = runningCost * sellRatio;
                    realizedProfit += trans.amount - costBasis;
                    runningShares -= trans.shares;
                    runningCost -= costBasis;
                }
            });

            totalHistoricalProfit += realizedProfit;

            // 持仓收益：历史日期用该日净值，今日用总览一致的最新展示净值，使折线末端与「累计收益」一致
            const { shares, cost } = getSharesAndCostAtDate(code, dateStr);
            if (shares > 0) {
                let nav = null;
                if (isToday) {
                    const data = state.fundsData[code];
                    if (data) {
                        const display = getDisplayValues(data);
                        const v = display.isActual ? parseFloat(display.value) : parseFloat(data.gsz);
                        if (!Number.isNaN(v)) nav = v;
                    }
                }
                if (nav == null) nav = getNavOnOrBefore(code, dateStr);
                if (nav != null) totalHoldingProfit += shares * nav - cost;
            }
        });

        holdingProfitPoints.push(totalHoldingProfit);
        historicalProfitPoints.push(totalHistoricalProfit);
        dataPoints.push(totalHoldingProfit + totalHistoricalProfit);
        // 总投入 = 总买入（与总览「累计收益率」一致，分母不减去卖出收回）
        totalCostAtDate.push(buyAtDate);
    });

    // 收益率序列：累计收益/总投入*100；总投入为0时取0（与总览累计收益率一致）
    const dataPointsRate = dataPoints.map((v, i) => totalCostAtDate[i] > 0 ? (v / totalCostAtDate[i]) * 100 : 0);
    const holdingProfitPointsRate = holdingProfitPoints.map((v, i) => totalCostAtDate[i] > 0 ? (v / totalCostAtDate[i]) * 100 : 0);
    const historicalProfitPointsRate = historicalProfitPoints.map((v, i) => totalCostAtDate[i] > 0 ? (v / totalCostAtDate[i]) * 100 : 0);

    const isRateMode = profitTrendChartDisplay === 'rate';
    const fullCumulativeSeries = isRateMode ? dataPointsRate.slice() : dataPoints.slice();
    const fullHistoricalSeries = isRateMode ? historicalProfitPointsRate.slice() : historicalProfitPoints.slice();
    const fullHoldingSeries = isRateMode ? holdingProfitPointsRate.slice() : holdingProfitPoints.slice();

    // 时间范围过滤：仅当选定区间严格小于全量（真的裁掉了一段）时才按区间重算、起始为 0；否则与「全部」一致，只做切片
    let filteredDates = dates;
    let filteredData = fullCumulativeSeries.slice();
    let filteredHistorical = fullHistoricalSeries.slice();
    let filteredHolding = fullHoldingSeries.slice();

    if (trendRange !== 0) {
        let startDateStr = null;
        if (trendRange === 'week' || trendRange === 'month' || trendRange === 'year') {
            const now = new Date();
            if (trendRange === 'week') {
                const day = now.getDay();
                const toMonday = day === 0 ? 6 : day - 1;
                const mon = new Date(now);
                mon.setDate(mon.getDate() - toMonday);
                startDateStr = toDateStr(mon);
            } else if (trendRange === 'month') {
                startDateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
            } else {
                startDateStr = now.getFullYear() + '-01-01';
            }
        } else {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - trendRange);
            startDateStr = toDateStr(cutoff);
        }

        const indices = [];
        dates.forEach((d, i) => {
            if (d >= startDateStr) indices.push(i);
        });

        // 先按选定区间切片（即使只有 0/1 个点也与「全部」区分，避免本周/本月/今年与全部显示相同）
        filteredDates = indices.map(i => dates[i]);
        filteredData = indices.map(i => fullCumulativeSeries[i]);
        filteredHistorical = indices.map(i => fullHistoricalSeries[i]);
        filteredHolding = indices.map(i => fullHoldingSeries[i]);

        if (indices.length >= 2) {
            const startIdx = indices[0];
            const isPartialRange = startIdx > 0 || indices.length < dates.length;

            if (isPartialRange) {
                // 区间确实比全量短：用区间数据重算，期初为 0
                if (isRateMode) {
                    const baseCost = totalCostAtDate[startIdx] || 0;
                    const baseCumulative = dataPoints[startIdx] || 0;
                    const baseHolding = holdingProfitPoints[startIdx] || 0;
                    const baseHistorical = historicalProfitPoints[startIdx] || 0;
                    filteredData = indices.map(i => baseCost > 0 ? (dataPoints[i] - baseCumulative) / baseCost * 100 : 0);
                    filteredHistorical = indices.map(i => baseCost > 0 ? (historicalProfitPoints[i] - baseHistorical) / baseCost * 100 : 0);
                    filteredHolding = indices.map(i => baseCost > 0 ? (holdingProfitPoints[i] - baseHolding) / baseCost * 100 : 0);
                } else {
                    const baseCumulative = dataPoints[startIdx] || 0;
                    const baseHolding = holdingProfitPoints[startIdx] || 0;
                    const baseHistorical = historicalProfitPoints[startIdx] || 0;
                    filteredData = indices.map(i => dataPoints[i] - baseCumulative);
                    filteredHistorical = indices.map(i => historicalProfitPoints[i] - baseHistorical);
                    filteredHolding = indices.map(i => holdingProfitPoints[i] - baseHolding);
                }
            } else {
                // 选定区间等于全量（如数据不足一年时选「近一年」）：只切片，数值不变（上面已切片）
                filteredData = indices.map(i => fullCumulativeSeries[i]);
                filteredHistorical = indices.map(i => fullHistoricalSeries[i]);
                filteredHolding = indices.map(i => fullHoldingSeries[i]);
            }
        }
    }

    // 更新紧凑模式迷你趋势线（用全量 dataPoints）
    drawCompactSparkline(dataPoints);

    // 格式化日期标签：跨年时显示年份（如 24/12/31），否则只显示月/日
    const yearsInRange = new Set(filteredDates.map(d => (d.split('-')[0] || '')));
    const showYear = yearsInRange.size > 1;
    const labels = filteredDates.map(d => {
        const parts = d.split('-');
        if (parts.length < 3) return d;
        if (showYear) return `${parts[0].slice(-2)}/${parts[1]}/${parts[2]}`;
        return `${parts[1]}/${parts[2]}`;
    });

    // 累计收益线颜色：正红负绿
    const lastValue = filteredData[filteredData.length - 1] || 0;
    const mainColor = lastValue >= 0 ? '#ff4d4f' : '#00b96b';

    // 图表上方显示当前区间末端的具体数字
    const summaryEl = document.getElementById('profitTrendChartSummary');
    if (summaryEl) {
        const lastCumulative = filteredData[filteredData.length - 1];
        const lastHistorical = filteredHistorical[filteredHistorical.length - 1];
        const lastHolding = filteredHolding[filteredHolding.length - 1];
        const fmt = (v, isRate) => {
            if (v == null || v === undefined || isNaN(v)) return { text: '--', cls: 'neutral' };
            const cls = v >= 0 ? 'positive' : 'negative';
            const sym = v >= 0 ? '+' : '';
            return isRate ? { text: sym + v.toFixed(2) + '%', cls } : { text: sym + (typeof v === 'number' ? v.toFixed(2) : v), cls };
        };
        const isRate = profitTrendChartDisplay === 'rate';
        const c = fmt(lastCumulative, isRate);
        const h = fmt(lastHistorical, isRate);
        const p = fmt(lastHolding, isRate);
        const hasData = filteredData.length > 0;
        const emptyHint = trendRange === 'week' ? '本周暂无数据' : trendRange === 'month' ? '本月暂无数据' : trendRange === 'year' ? '今年暂无数据' : '当前区间暂无数据';
        summaryEl.innerHTML = (hasData ? '' : '<p class="trend-summary-empty">' + emptyHint + '</p>')
            + (hasData ? '<span class="summary-item"><span class="label">累计</span><span class="value ' + (c.cls || 'neutral') + '">' + (c.text ?? '--') + '</span></span>'
            + '<span class="summary-item"><span class="label">历史</span><span class="value ' + (h.cls || 'neutral') + '">' + (h.text ?? '--') + '</span></span>'
            + '<span class="summary-item"><span class="label">持仓</span><span class="value ' + (p.cls || 'neutral') + '">' + (p.text ?? '--') + '</span></span>' : '');
    }

    // 数据量少时放大数据点、加粗线条，让折线更醒目
    const pointCount = filteredData.length;
    const pointRadius = pointCount <= 5 ? 6 : pointCount <= 10 ? 5 : pointCount <= 15 ? 4 : 0;
    const borderWidth = pointCount <= 5 ? 3 : 2.5;
    const fillOpacity = pointCount <= 10 ? '22' : '15'; // 数据少时填充稍深

    if (profitTrendChartInstance && profitTrendChartInstance.canvas === ctx) {
        // 原地更新
        const chart = profitTrendChartInstance;
        chart.data.labels = labels;
        chart.data.datasets[0].data = filteredData;
        chart.data.datasets[0].borderColor = mainColor;
        chart.data.datasets[0].backgroundColor = `${mainColor}${fillOpacity}`;
        chart.data.datasets[0].pointRadius = pointRadius;
        chart.data.datasets[0].borderWidth = borderWidth;
        chart.data.datasets[1].data = filteredHistorical;
        chart.data.datasets[2].data = filteredHolding;
        chart.options.scales.y.afterDataLimits = makeProfitTrendYAxisLimits(filteredData, profitTrendChartDisplay === 'rate');
        chart.options.scales.y.ticks.callback = function(value) {
            return profitTrendChartDisplay === 'rate'
                ? (value >= 0 ? '+' : '') + value.toFixed(2) + '%'
                : (value >= 0 ? '+' : '') + value.toFixed(0);
        };
        chart.options.plugins.tooltip.callbacks.label = function(context) {
            const val = context.parsed.y;
            const symbol = val >= 0 ? '+' : '';
            return profitTrendChartDisplay === 'rate'
                ? `${context.dataset.label}: ${symbol}${val.toFixed(2)}%`
                : `${context.dataset.label}: ${symbol}${val.toFixed(2)}`;
        };
        chart.update('none');
        return;
    }

    if (profitTrendChartInstance) {
        profitTrendChartInstance.destroy();
    }

    profitTrendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '累计收益',
                    data: filteredData,
                    borderColor: mainColor,
                    backgroundColor: `${mainColor}${fillOpacity}`,
                    borderWidth: borderWidth,
                    tension: pointCount <= 5 ? 0.2 : 0.3,
                    fill: true,
                    pointRadius: pointRadius,
                    pointHoverRadius: Math.max(pointRadius + 2, 6),
                    pointBackgroundColor: mainColor,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    order: 1
                },
                {
                    label: '历史收益',
                    data: filteredHistorical,
                    borderColor: '#faad14',
                    borderWidth: 1.5,
                    borderDash: [5, 3],
                    tension: 0.3,
                    fill: false,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    order: 2
                },
                {
                    label: '持仓收益',
                    data: filteredHolding,
                    borderColor: getPrimaryColor(),
                    borderWidth: 1.5,
                    borderDash: [3, 3],
                    tension: 0.3,
                    fill: false,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    order: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        boxWidth: 20,
                        padding: 15,
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            const val = context.parsed.y;
                            const symbol = val >= 0 ? '+' : '';
                            return profitTrendChartDisplay === 'rate'
                                ? `${context.dataset.label}: ${symbol}${val.toFixed(2)}%`
                                : `${context.dataset.label}: ${symbol}${val.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: { display: false },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 0,
                        font: { size: 10 },
                        maxTicksLimit: 10
                    }
                },
                y: {
                    display: true,
                    ticks: {
                        callback: function(value) {
                            if (value == null || value === undefined || Number.isNaN(value)) return '';
                            return profitTrendChartDisplay === 'rate'
                                ? (value >= 0 ? '+' : '') + value.toFixed(2) + '%'
                                : (value >= 0 ? '+' : '') + value.toFixed(0);
                        },
                        font: { size: 10 }
                    },
                    grid: {
                        color: function(context) {
                            if (context.tick.value === 0) return 'rgba(100, 100, 100, 0.4)';
                            return 'rgba(0, 0, 0, 0.05)';
                        },
                        lineWidth: function(context) {
                            return context.tick.value === 0 ? 1.5 : 1;
                        }
                    },
                    afterDataLimits: makeProfitTrendYAxisLimits(filteredData, profitTrendChartDisplay === 'rate')
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

// 原地更新单个基金卡片的动态数据（避免整体innerHTML重建导致的闪烁）
function updateFundCardInPlace(code) {
    const data = state.fundsData[code];
    if (!data) return false;

    const realtimeTab = document.getElementById(`tab-realtime-${code}`);
    if (!realtimeTab) return false;

    // 卡片级别元素（fund-data-bar 在 tab 外面）
    const card = realtimeTab.closest('.fund-card');
    if (!card) return false;

    const display = getDisplayValues(data);
    const percentage = display.percentage;
    const isPositive = percentage >= 0;
    const percentageClass = isPositive ? 'positive' : 'negative';
    const percentageSymbol = isPositive ? '+' : '';

    // 1. 更新涨跌幅百分比（动效）
    const percentageEl = card.querySelector('.percentage');
    if (percentageEl) {
        percentageEl.className = 'percentage ' + percentageClass;
        animateValue(percentageEl, percentage.toFixed(2), percentageSymbol, '%', 400);
    }

    const posInfo = calculatePosition(code);

    // 2. 更新当日盈亏（动效）
    const dailyProfitEl = card.querySelector('.daily-profit');
    if (dailyProfitEl && posInfo && posInfo.totalShares > 0) {
        const yesterdayValue = parseFloat(data.dwjz);
        const eligibleShares = getSharesEligibleForTodayProfit(code);
        const dailyProfit = eligibleShares * yesterdayValue * (percentage / 100);
        const isZeroDaily = Math.abs(dailyProfit) < 0.005;
        const dailyProfitSymbol = isZeroDaily ? '' : (dailyProfit > 0 ? '+' : '');
        const dailyProfitClass = isZeroDaily ? 'neutral' : (dailyProfit > 0 ? 'positive' : 'negative');
        dailyProfitEl.className = 'daily-profit ' + dailyProfitClass;
        animateValue(dailyProfitEl, isZeroDaily ? '0.00' : dailyProfit.toFixed(2), dailyProfitSymbol, '', 400);
    }

    // 3. 更新净值和估算/实际值（动效）
    const dataValNums = card.querySelectorAll('.data-val-num');
    const dataValLabels = card.querySelectorAll('.data-val-label');
    if (dataValNums.length >= 2) {
        const navNum = parseFloat(data.dwjz);
        if (!isNaN(navNum)) animateValue(dataValNums[0], data.dwjz, '', '', 400, true);
        else dataValNums[0].textContent = data.dwjz;
        const isRate = display.value.indexOf('%') !== -1;
        const valNum = parseFloat(String(display.value).replace(/%/g, ''));
        if (!isNaN(valNum)) {
            animateValue(dataValNums[1], isRate ? valNum.toFixed(2) : display.value, isRate ? (valNum >= 0 ? '+' : '') : '', isRate ? '%' : '', 400, !isRate);
        } else {
            dataValNums[1].textContent = display.value;
        }
        dataValNums[1].className = 'data-val-num ' + percentageClass;
        if (dataValLabels.length >= 2) dataValLabels[1].textContent = display.label;
    }

    // 4. 更新头部时间
    const headerTimeEl = card.querySelector('.fund-update-time');
    if (headerTimeEl) {
        headerTimeEl.textContent = data.gztime || '';
    }

    // 5. 更新持仓入口动态数值（市值、盈亏）
    if (posInfo && posInfo.totalShares > 0) {
        const currentNav = display.isActual ? parseFloat(display.value) : parseFloat(data.gsz);
        const currentValue = posInfo.totalShares * currentNav;
        const profit = currentValue - posInfo.totalCost;
        const profitRateNum = (currentNav - posInfo.avgCost) / posInfo.avgCost * 100;
        const isZeroProfit = Math.abs(profit) < 0.005;
        const isZeroRate = Math.abs(profitRateNum) < 0.005;
        const profitClass = isZeroProfit ? 'neutral' : (profit >= 0 ? 'profit' : 'loss');
        const profitAmountStr = isZeroProfit ? '0.00' : (profit >= 0 ? '+' : '') + (profit < 0 ? Math.abs(profit) : profit).toFixed(2);
        const profitRateStr = isZeroRate ? '0.00' : (profitRateNum >= 0 ? '+' : '') + (profitRateNum < 0 ? Math.abs(profitRateNum) : profitRateNum).toFixed(2);
        const mktEl = realtimeTab.querySelector('.position-entry-mkt');
        const tagEl = realtimeTab.querySelector('.position-entry-tag');
        if (mktEl) animateValue(mktEl, currentValue.toFixed(2), '', '', 400, true);
        if (tagEl) {
            tagEl.className = 'position-entry-tag ' + profitClass;
            tagEl.textContent = profitAmountStr + '（' + profitRateStr + '%）';
        }
    }

    // 6. 重绘日内涨跌幅图表（canvas保留，只更新数据）
    drawChart(code);

    return true;
}

// 列表视图下原地更新单行数字（涨跌幅、今日盈亏），带动效
function updateFundListItemInPlace(code) {
    const data = state.fundsData[code];
    if (!data) return false;
    const container = document.getElementById('fundsContainer');
    if (!container || !container.classList.contains('fund-list')) return false;
    const row = container.querySelector('.fund-list-item[data-code="' + code + '"]');
    if (!row) return false;

    const display = getDisplayValues(data);
    const percentage = display.percentage;
    const isZeroPct = Math.abs(percentage) < 0.005;
    const isPositive = percentage >= 0;
    const pctClass = isZeroPct ? 'neutral' : (isPositive ? 'positive' : 'negative');
    const pctSymbol = isZeroPct ? '' : (isPositive ? '+' : '');

    const pctEl = row.querySelector('.list-pct');
    if (pctEl) {
        pctEl.className = 'list-pct ' + pctClass;
        animateValue(pctEl, (isZeroPct ? '0.00' : percentage.toFixed(2)), pctSymbol, '%', 400);
    }

    const posInfo = calculatePosition(code);
    const hasPosition = posInfo && posInfo.totalShares > 0;
    const profitCell = row.querySelector('.list-profit-cell');
    const profitSpan = row.querySelector('.list-profit');
    if (profitCell && profitSpan && hasPosition) {
        const yesterdayValue = parseFloat(data.dwjz);
        const eligibleShares = getSharesEligibleForTodayProfit(code);
        const dailyProfit = eligibleShares * yesterdayValue * (percentage / 100);
        const isZeroDaily = Math.abs(dailyProfit) < 0.005;
        const dpClass = isZeroDaily ? 'neutral' : (dailyProfit > 0 ? 'positive' : 'negative');
        const dpSymbol = isZeroDaily ? '' : (dailyProfit > 0 ? '+' : '');
        profitSpan.className = 'list-profit ' + dpClass;
        animateValue(profitSpan, isZeroDaily ? '0.00' : dailyProfit.toFixed(2), dpSymbol, '', 400);
    }

    // 缩略折线图随估值实时更新（含当日新数据点）+ 轻微淡入动效
    const sparklineEl = row.querySelector('.list-sparkline');
    if (sparklineEl) {
        const dayHistory = state.historyData[code];
        const newSvg = renderListSparklineSvg(dayHistory, percentage);
        if (newSvg) {
            sparklineEl.innerHTML = newSvg;
            sparklineEl.classList.add('list-sparkline-updated');
            clearTimeout(sparklineEl._sparklineAnimTimer);
            sparklineEl._sparklineAnimTimer = setTimeout(function() {
                sparklineEl.classList.remove('list-sparkline-updated');
            }, 280);
        }
    }
    return true;
}

// ========== 列表与总览渲染 ==========
var LIST_CHUNK_SIZE = 8;
function beginListRender() {
    state._listRenderToken = (state._listRenderToken || 0) + 1;
    return state._listRenderToken;
}

function buildListRowsHTML(codes) {
    return codes.map(function (code) {
        const data = state.fundsData[code];
        const posInfo = calculatePosition(code);
        const hasPosition = posInfo && posInfo.totalShares > 0;
        if (!data) {
            return '<div class="fund-list-item" data-code="' + code + '"><div class="list-name"><div class="list-name-main">加载中…</div><div class="list-name-code">' + code + '</div></div><div class="list-pct">--</div><div class="list-profit-cell">--</div><div class="list-sparkline"></div><div class="list-actions"><button class="btn-del" onclick="removeFund(\'' + code + '\')">删除</button></div></div>';
        }
        if (data._loadFailed) {
            return '<div class="fund-list-item fund-card-failed" data-code="' + code + '"><div class="list-name"><div class="list-name-main">加载失败</div><div class="list-name-code">' + code + '</div></div><div class="list-pct">--</div><div class="list-profit-cell">--</div><div class="list-sparkline"></div><div class="list-actions"><button onclick="retryFundLoad(\'' + code + '\')">重试</button><button class="btn-del" onclick="removeFund(\'' + code + '\')">删除</button></div></div>';
        }
        const display = getDisplayValues(data);
        const percentage = display.percentage;
        const isZeroPct = Math.abs(percentage) < 0.005;
        const isPositive = percentage >= 0;
        const pctClass = isZeroPct ? 'neutral' : (isPositive ? 'positive' : 'negative');
        const pctSymbol = isZeroPct ? '' : (isPositive ? '+' : '');
        const pctStr = isZeroPct ? '0.00%' : (pctSymbol + percentage.toFixed(2) + '%');
        var dailyProfitStr = '';
        if (hasPosition) {
            const yesterdayValue = parseFloat(data.dwjz);
            const eligibleShares = getSharesEligibleForTodayProfit(code);
            const dailyProfit = eligibleShares * yesterdayValue * (percentage / 100);
            const isZeroDaily = Math.abs(dailyProfit) < 0.005;
            const dpClass = isZeroDaily ? 'neutral' : (dailyProfit > 0 ? 'positive' : 'negative');
            const dpSymbol = isZeroDaily ? '' : (dailyProfit > 0 ? '+' : '');
            const dailyAmountStr = isZeroDaily ? '0.00' : (dailyProfit < 0 ? '-' : dpSymbol) + (dailyProfit < 0 ? Math.abs(dailyProfit) : dailyProfit).toFixed(2);
            dailyProfitStr = '<span class="list-profit ' + dpClass + '">' + dailyAmountStr + '</span>';
        }
        const rowClass = hasPosition ? 'holding' : 'watching';
        const dayHistory = state.historyData[code];
        const sparklineSvg = renderListSparklineSvg(dayHistory, percentage);
        var nameSubHtml = '';
        if (hasPosition) {
            const currentNav = display.isActual ? parseFloat(display.value) : parseFloat(data.gsz);
            const currentValue = posInfo.totalShares * currentNav;
            const profit = currentValue - posInfo.totalCost;
            const profitRateNum = (currentNav - posInfo.avgCost) / posInfo.avgCost * 100;
            const isZeroProfit = Math.abs(profit) < 0.005;
            const isZeroRate = Math.abs(profitRateNum) < 0.005;
            const profitClass = isZeroProfit ? 'holding-neutral' : (profit >= 0 ? 'holding-profit' : 'holding-loss');
            const profitSymbol = isZeroProfit ? '' : (profit >= 0 ? '+' : '');
            const valueStr = currentValue.toFixed(2);
            const profitAmountStr = isZeroProfit ? '0.00' : (profit < 0 ? '' : profitSymbol) + (profit < 0 ? Math.abs(profit) : profit).toFixed(2);
            const rateStr = isZeroRate ? '0.00%' : (profitRateNum > 0 ? '+' : (profitRateNum < 0 ? '-' : '')) + (profitRateNum < 0 ? Math.abs(profitRateNum) : profitRateNum).toFixed(2) + '%';
            const fullTitle = '市值 ' + currentValue.toFixed(2) + ' · 收益 ' + profitAmountStr + '（' + rateStr + '）';
            nameSubHtml = '<div class="list-name-holding"><a href="javascript:void(0)" class="list-holding-link" onclick="openPositionModal(\'' + code + '\')" title="' + fullTitle + '">' + valueStr + '<span class="list-holding-rate ' + profitClass + '">' + rateStr + '</span></a></div>';
        } else {
            nameSubHtml = '<div class="list-name-code">' + data.fundcode + '</div>';
        }
        return '<div class="fund-list-item ' + rowClass + '" data-code="' + code + '"><div class="list-name"><div class="list-name-main">' + (data.name || code) + '</div>' + nameSubHtml + '</div><div class="list-pct ' + pctClass + '">' + pctStr + '</div><div class="list-profit-cell">' + dailyProfitStr + '</div><div class="list-sparkline">' + (sparklineSvg || '') + '</div><div class="list-actions"><a href="javascript:void(0)" onclick="openFundDetailModal(\'' + code + '\')">详情</a><button class="btn-del" onclick="removeFund(\'' + code + '\')">删除</button></div></div>';
    }).join('');
}

function getHoldingWatchingCodes() {
    const codes = loadFundCodes();
    const holdingCodes = [];
    const watchingCodes = [];
    codes.forEach(code => {
        const posInfo = calculatePosition(code);
        if (posInfo && posInfo.totalShares > 0) holdingCodes.push(code);
        else watchingCodes.push(code);
    });
    return { holdingCodes, watchingCodes };
}

function renderFunds() {
    const container = document.getElementById('fundsContainer');
    container.setAttribute('aria-busy', 'false'); // 首屏骨架由 JS 替换后标记为就绪
    let codes = loadFundCodes();
    const _hw = getHoldingWatchingCodes();
    const holdingCodes = _hw.holdingCodes;
    const watchingCodes = _hw.watchingCodes;

    // 更新标签上的计数
    const holdingCountEl = document.getElementById('holdingCount');
    const watchingCountEl = document.getElementById('watchingCount');
    if (holdingCountEl) holdingCountEl.textContent = holdingCodes.length;
    if (watchingCountEl) watchingCountEl.textContent = watchingCodes.length;

    // 根据当前视图选择要显示的基金
    let displayCodes = state.currentMainView === 'holding' ? holdingCodes : watchingCodes;

    if (codes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📊</div>
                <h2>还没有添加基金</h2>
                <p>请在上方输入基金代码来添加基金</p>
            </div>
        `;
        document.getElementById('overviewPanel').style.display = 'none';
        return;
    }

    if (displayCodes.length === 0) {
        const emptyMsg = state.currentMainView === 'holding' 
            ? '暂无持有基金，买入基金后会显示在这里'
            : '暂无自选基金，添加基金后未买入的会显示在这里';
        const emptyIcon = state.currentMainView === 'holding' ? '💼' : '⭐';
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">${emptyIcon}</div>
                <h2>${emptyMsg}</h2>
            </div>
        `;
        // 持有为空时也需要更新总览
        if (state.currentMainView === 'holding') {
            updateOverviewPanel();
        }
        return;
    }

    // 根据排序方式对显示的基金代码进行排序（列表表头点击优先 listSort，否则用 sortSelect 的 sortOrder）
    const listSort = state.listSort;
    const sortByPct = listSort ? (listSort.by === 'pct') : (state.sortOrder !== 'default');
    const sortByProfit = listSort && listSort.by === 'dailyProfit';
    const sortDir = listSort ? listSort.dir : state.sortOrder;
    if (sortByPct || sortByProfit) {
        const mult = (sortDir === 'desc') ? 1 : -1;
        displayCodes = [...displayCodes].sort((a, b) => {
            const dataA = state.fundsData[a];
            const dataB = state.fundsData[b];
            if (!dataA || !dataB) return 0;
            if (sortByProfit) {
                const posA = calculatePosition(a);
                const posB = calculatePosition(b);
                const hasA = posA && posA.totalShares > 0;
                const hasB = posB && posB.totalShares > 0;
                const profitA = hasA ? getSharesEligibleForTodayProfit(a) * parseFloat(dataA.dwjz) * (getDisplayValues(dataA).percentage / 100) : 0;
                const profitB = hasB ? getSharesEligibleForTodayProfit(b) * parseFloat(dataB.dwjz) * (getDisplayValues(dataB).percentage / 100) : 0;
                return mult * (profitB - profitA);
            }
            const percentageA = getDisplayValues(dataA).percentage;
            const percentageB = getDisplayValues(dataB).percentage;
            return mult * (percentageB - percentageA);
        });
    }

    container.className = state.fundListViewMode === 'list' ? 'fund-list' : 'funds-grid';

    if (state.fundListViewMode === 'list') {
        const renderToken = beginListRender();
        // 涨跌幅/估值对应的交易日：交易日即当天，非交易日为上一交易日（显示的是该日实际净值）
        const now = new Date();
        const todayStr = toDateStr(now);
        const dataTradeDateStr = isTradingDay(now) ? todayStr : getPreviousTradingDay(todayStr);
        const dataTradeDate = new Date(dataTradeDateStr + 'T12:00:00');
        const headerDateStr = (dataTradeDate.getMonth() + 1) + '/' + dataTradeDate.getDate();
        const ls = state.listSort;
        const defaultMark = '<span class="list-col-sort-arrow list-col-sort-default" title="默认顺序">≡</span>';
        const pctArrow = (ls && ls.by === 'pct') ? (ls.dir === 'desc' ? '<span class="list-col-sort-arrow">↓</span>' : '<span class="list-col-sort-arrow">↑</span>') : defaultMark;
        const profitArrow = (ls && ls.by === 'dailyProfit') ? (ls.dir === 'desc' ? '<span class="list-col-sort-arrow">↓</span>' : '<span class="list-col-sort-arrow">↑</span>') : defaultMark;
        const listHeader = `
            <div class="fund-list-header">
                <div class="list-name">名称</div>
                <div class="list-pct"><span class="list-col-sortable list-col-label" onclick="sortListBy('pct')" title="点击切换：默认顺序 / 涨跌幅降序 / 涨跌幅升序">涨跌幅${pctArrow}</span><span class="list-col-date">${headerDateStr}</span></div>
                <div class="list-profit-cell"><span class="list-col-sortable list-col-label" onclick="sortListBy('dailyProfit')" title="点击切换：默认顺序 / 今日盈亏降序 / 今日盈亏升序">今日盈亏${profitArrow}</span><span class="list-col-date">${headerDateStr}</span></div>
                <div class="list-sparkline"><span class="list-col-label">当日走势</span><span class="list-col-date">${headerDateStr}</span></div>
                <div class="list-actions">操作</div>
            </div>`;
        container.innerHTML = listHeader;
        if (displayCodes.length === 0) {
            updateOverviewPanel();
            return;
        }
        var rowIndex = 0;
        var listCodes = displayCodes;
        var rowChunks = [];
        function appendListChunk() {
            if (renderToken !== state._listRenderToken) return;
            var chunk = listCodes.slice(rowIndex, rowIndex + LIST_CHUNK_SIZE);
            rowIndex += chunk.length;
            if (chunk.length) {
                var chunkHtml = buildListRowsHTML(chunk);
                rowChunks.push(chunkHtml);
                container.insertAdjacentHTML('beforeend', chunkHtml);
            }
            if (rowIndex < listCodes.length) {
                requestAnimationFrame(appendListChunk);
            } else {
                updateOverviewPanel();
                state._viewCache = state._viewCache || {};
                state._viewCache[state.currentMainView] = { header: listHeader, rowChunks: rowChunks };
            }
        }
        requestAnimationFrame(appendListChunk);
        return;
    }
    beginListRender(); // 非列表模式时，取消遗留的列表分块渲染任务

    container.innerHTML = displayCodes.map(code => {
        const data = state.fundsData[code];
        if (!data) {
            return `
                <div class="fund-card fund-card-skeleton">
                    <div class="skeleton-block skeleton-title"></div>
                    <div class="skeleton-block skeleton-code"></div>
                    <div class="skeleton-block skeleton-bar"></div>
                    <div class="skeleton-block skeleton-chart"></div>
                    <div class="skeleton-row">
                        <div class="skeleton-block"></div>
                        <div class="skeleton-block"></div>
                    </div>
                </div>
            `;
        }
        if (data._loadFailed) {
            return `
                <div class="fund-card fund-card-failed">
                    <div class="loading load-failed">加载失败</div>
                    <p class="load-failed-hint">网络超时或该基金暂不支持实时估值</p>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="retryFundLoad('${code}')">重试</button>
                </div>
            `;
        }

        const display = getDisplayValues(data);
        const percentage = display.percentage;
        const isPositive = percentage >= 0;
        const percentageClass = isPositive ? 'positive' : 'negative';
        const percentageSymbol = isPositive ? '+' : '';
        const formattedPercentage = percentage.toFixed(2);

        // 持仓信息
        const posInfo = calculatePosition(code);
        
        // 计算当日盈亏金额（排除今日买入份额）
        let dailyProfitHtml = '';
        if (posInfo && posInfo.totalShares > 0) {
            const yesterdayValue = parseFloat(data.dwjz);
            const eligibleShares = getSharesEligibleForTodayProfit(code);
            const dailyProfit = eligibleShares * yesterdayValue * (percentage / 100);
            const isZeroDaily = Math.abs(dailyProfit) < 0.005;
            const dailyProfitSymbol = isZeroDaily ? '' : (dailyProfit > 0 ? '+' : '');
            const dailyProfitClass = isZeroDaily ? 'neutral' : (dailyProfit > 0 ? 'positive' : 'negative');
            const dailyAmountStr = isZeroDaily ? '0.00' : (dailyProfit < 0 ? '' : dailyProfitSymbol) + (dailyProfit < 0 ? Math.abs(dailyProfit) : dailyProfit).toFixed(2);
            dailyProfitHtml = `
                <div class="daily-profit ${dailyProfitClass}">
                    ${dailyAmountStr}
                </div>
            `;
        }

        let positionHtml = '';
        if (posInfo && posInfo.totalShares > 0) {
            const currentNav = display.isActual ? parseFloat(display.value) : parseFloat(data.gsz);
            const currentValue = posInfo.totalShares * currentNav;
            const profit = currentValue - posInfo.totalCost;
            const profitRateNum = (currentNav - posInfo.avgCost) / posInfo.avgCost * 100;
            const isZeroProfit = Math.abs(profit) < 0.005;
            const isZeroRate = Math.abs(profitRateNum) < 0.005;
            const profitClass = isZeroProfit ? 'neutral' : (profit >= 0 ? 'profit' : 'loss');
            const profitAmountStr = isZeroProfit ? '0.00' : (profit >= 0 ? '+' : '') + (profit < 0 ? Math.abs(profit) : profit).toFixed(2);
            const profitRateStr = isZeroRate ? '0.00' : (profitRateNum > 0 ? '+' : (profitRateNum < 0 ? '-' : '')) + (profitRateNum < 0 ? Math.abs(profitRateNum) : profitRateNum).toFixed(2);
            positionHtml = `
                <div class="position-entry" data-code="${code}">
                    <div class="position-entry-click" onclick="openPositionModal('${code}')">
                        <span>💼 持仓</span>
                        <span class="position-entry-mkt">${currentValue.toFixed(2)}</span>
                        <span class="position-entry-tag ${profitClass}">${profitAmountStr}（${profitRateStr}%）</span>
                    </div>
                    <div class="position-entry-actions" onclick="event.stopPropagation()">
                        <button class="btn btn-secondary" onclick="openBuyModal('${code}')">买入</button>
                        <button class="btn btn-warning" onclick="openSellModal('${code}')">卖出</button>
                        <button class="btn btn-secondary" onclick="openConvertModal('${code}')">转换</button>
                    </div>
                </div>
            `;
        } else {
            const hasHistory = posInfo && posInfo.transactions && posInfo.transactions.length > 0;
            positionHtml = `
                <div class="position-entry" data-code="${code}">
                    <div class="position-entry-click" onclick="openPositionModal('${code}')">💼 ${hasHistory ? '已清仓' : '暂无持仓'}</div>
                    <div class="position-entry-actions" onclick="event.stopPropagation()">
                        <button class="btn btn-secondary" onclick="openBuyModal('${code}')">买入</button>
                    </div>
                </div>
            `;
        }

        const hasPosition = posInfo && posInfo.totalShares > 0;

        return `
            <div class="fund-card ${hasPosition ? 'holding' : 'watching'}" draggable="true" data-code="${code}">
                <div class="fund-header">
                    <div class="fund-title">
                        <div class="fund-name">
                            <span>${data.name}</span>
                            <span class="fund-sector-tag ${loadFundSectors()[code] ? '' : 'auto'}" onclick="event.stopPropagation(); openSectorPicker('${code}')" title="点击设置板块，用于总览饼图">${getFundSector(code, data.name)}</span>
                        </div>
                        <div class="fund-meta">
                            <span class="fund-code">${data.fundcode}</span>
                            <span class="fund-update-time">${data.gztime || ''}</span>
                            <a class="fund-detail-link" href="javascript:void(0)" onclick="openFundDetailModal('${code}')">详情 ›</a>
                        </div>
                    </div>
                    <button class="btn btn-danger" onclick="removeFund('${code}')">删除</button>
                </div>

                <div class="fund-data-bar">
                    <div class="percentage ${percentageClass}">
                        ${percentageSymbol}${formattedPercentage}%
                    </div>
                    ${dailyProfitHtml}
                    <div class="fund-data-spacer"></div>
                    <div class="fund-data-values">
                        <div class="data-val">
                            <span class="data-val-label">净值</span>
                            <span class="data-val-num">${data.dwjz}</span>
                        </div>
                        <div class="data-val">
                            <span class="data-val-label">${display.label}</span>
                            <span class="data-val-num ${percentageClass}">${display.value}</span>
                        </div>
                    </div>
                </div>

                <div id="tab-realtime-${code}">
                    ${positionHtml}

                    <div class="chart-container">
                        <canvas id="chart-${code}"></canvas>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    observeCharts();

    // 更新总览看板
    updateOverviewPanel();

    state._viewCache = state._viewCache || {};
    state._viewCache[state.currentMainView] = container.innerHTML;
}

// 拖拽排序
function initDragSort() {
    const container = document.getElementById('fundsContainer');
    let draggedEl = null;

    container.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.fund-card[draggable]');
        if (!card) return;
        draggedEl = card;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    container.addEventListener('dragend', (e) => {
        if (draggedEl) draggedEl.classList.remove('dragging');
        container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        draggedEl = null;
    });

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const card = e.target.closest('.fund-card[draggable]');
        if (card && card !== draggedEl) {
            container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            card.classList.add('drag-over');
        }
    });

    container.addEventListener('dragleave', (e) => {
        const card = e.target.closest('.fund-card[draggable]');
        if (card) card.classList.remove('drag-over');
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetCard = e.target.closest('.fund-card[draggable]');
        if (!targetCard || !draggedEl || targetCard === draggedEl) return;
        targetCard.classList.remove('drag-over');

        const fromCode = draggedEl.getAttribute('data-code');
        const toCode = targetCard.getAttribute('data-code');
        if (!fromCode || !toCode) return;

        // 更新 fundCodes 数组顺序
        const codes = loadFundCodes();
        const fromIdx = codes.indexOf(fromCode);
        const toIdx = codes.indexOf(toCode);
        if (fromIdx === -1 || toIdx === -1) return;

        codes.splice(fromIdx, 1);
        codes.splice(toIdx, 0, fromCode);
        saveFundCodes(codes);

        // 如果当前排序不是默认，切回默认以尊重手动排序
        if (state.sortOrder !== 'default') {
            state.sortOrder = 'default';
            localStorage.setItem('sortOrder', state.sortOrder);
            document.getElementById('sortSelect').value = 'default';
        }

        renderFunds();
    });
}

// 更新基金详情（如果弹窗正在显示该基金则刷新内容）
function updateFundDetailsTab(code) {
    const modal = document.getElementById('fundDetailModal');
    if (!modal || !modal.classList.contains('active')) return false;

    // 检查弹窗标题是否包含该基金（判断是否当前显示的就是这只基金）
    const titleEl = document.getElementById('fundDetailModalTitle');
    const data = state.fundsData[code];
    if (data && titleEl && titleEl.textContent.includes(data.name)) {
        // 重新打开以刷新内容
        openFundDetailModal(code);
    }
    
    return true;
}

// 打开基金详情弹窗
function openFundDetailModal(code) {
    const data = state.fundsData[code];
    const details = state.fundDetails[code];
    const modal = document.getElementById('fundDetailModal');
    const title = document.getElementById('fundDetailModalTitle');
    const content = document.getElementById('fundDetailModalContent');

    title.textContent = `📊 ${data ? data.name : code} 基金详情`;

    // === 骨架屏加载态 ===
    if (!details) {
        content.innerHTML = `
            <div class="skeleton skeleton-hero"></div>
            <div class="skeleton skeleton-bar long"></div>
            <div class="skeleton skeleton-bar medium"></div>
            <div class="skeleton skeleton-bar short"></div>
            <div class="skeleton skeleton-bar medium"></div>
            <div class="skeleton skeleton-chart"></div>
        `;
        modal.classList.add('active');
        fetchFundDetails(code, true);
        return;
    }

    let html = '';

    // === 1. 概要头卡 ===
    if (data) {
        const display = getDisplayValues(data);
        const dwjz = data.dwjz || '--';
        const changeCls = display.percentage >= 0 ? 'positive' : 'negative';
        const changeSymbol = display.percentage >= 0 ? '+' : '';
        html += `
            <div class="detail-hero">
                <div class="detail-hero-main">
                    <div class="detail-hero-name">${data.name || code}</div>
                    <div class="detail-hero-code">${code}</div>
                </div>
                <div class="detail-hero-price">
                    <div class="detail-hero-gsz">${display.value}</div>
                    <div class="detail-hero-change ${changeCls}">${changeSymbol}${display.percentage.toFixed(2)}% <span style="font-size:12px;opacity:0.8">(${display.label})</span></div>
                    <div class="detail-hero-dwjz">昨日净值 ${dwjz}</div>
                </div>
            </div>
        `;
    }

    // === 2. 持仓概要（如果有持仓） ===
    const posInfo = calculatePosition(code);
    if (posInfo && posInfo.totalShares > 0 && data) {
        const display = getDisplayValues(data);
        const currentNav = display.isActual ? parseFloat(display.value) : parseFloat(data.gsz);
        const mv = posInfo.totalShares * currentNav;
        const profit = mv - posInfo.totalCost;
        const profitRate = posInfo.avgCost > 0 ? ((currentNav - posInfo.avgCost) / posInfo.avgCost * 100) : 0;
        const isZeroProfit = Math.abs(profit) < 0.005;
        const isZeroRate = Math.abs(profitRate) < 0.005;
        const cls = isZeroProfit ? '' : (profit >= 0 ? 'positive' : 'negative');
        const profitSym = isZeroProfit ? '' : (profit >= 0 ? '+' : '-');
        const rateSym = isZeroRate ? '' : (profitRate >= 0 ? '+' : '-');
        const profitStr = isZeroProfit ? '0.00' : (profitSym + (profit < 0 ? Math.abs(profit) : profit).toFixed(2));
        const rateStr = isZeroRate ? '0.00%' : (rateSym + (profitRate < 0 ? Math.abs(profitRate) : profitRate).toFixed(2) + '%');
        html += `
            <div class="detail-position-summary">
                <div class="detail-pos-item">
                    <div class="detail-pos-label">持有份额</div>
                    <div class="detail-pos-value">${posInfo.totalShares.toFixed(2)}</div>
                </div>
                <div class="detail-pos-item">
                    <div class="detail-pos-label">持仓市值</div>
                    <div class="detail-pos-value">${mv.toFixed(2)}</div>
                </div>
                <div class="detail-pos-item">
                    <div class="detail-pos-label">持仓收益</div>
                    <div class="detail-pos-value ${cls}">${profitStr} (${rateStr})</div>
                </div>
            </div>
        `;
    }

    // === 2.1 历史收益（已实现）：有交易记录即展示 ===
    const histProfit = getHistoricalProfitForFund(code);
    const hasHistProfit = Math.abs(histProfit) >= 0.005;
    const histCls = hasHistProfit ? (histProfit > 0 ? 'positive' : 'negative') : '';
    const histSym = hasHistProfit ? (histProfit > 0 ? '+' : '-') : '';
    const histStr = hasHistProfit ? (histSym + (histProfit < 0 ? Math.abs(histProfit) : histProfit).toFixed(2)) : '0.00';
    html += `
        <div class="detail-profit-row">
            <span class="detail-profit-label">历史收益</span>
            <span class="detail-profit-value ${histCls}">${histStr}</span>
        </div>
    `;

    // === 3. 收益率柱状可视化 ===
    const rateFields = [
        { key: 'syl_1y', label: '近1月' },
        { key: 'syl_3y', label: '近3月' },
        { key: 'syl_6y', label: '近6月' },
        { key: 'syl_1n', label: '近1年' }
    ];
    const rates = rateFields.filter(f => details[f.key]).map(f => ({
        label: f.label,
        value: parseFloat(details[f.key])
    }));

    if (rates.length > 0) {
        const maxAbs = Math.max(...rates.map(r => Math.abs(r.value)), 1);
        html += `<div class="fund-details">
            <div class="fund-details-header"><h4>📊 历史收益率</h4></div>
            <div class="rate-bar-list">`;

        rates.forEach(r => {
            const cls = r.value >= 0 ? 'positive' : 'negative';
            const sym = r.value >= 0 ? '+' : '';
            const widthPct = Math.min(Math.abs(r.value) / maxAbs * 50, 50);
            html += `
                <div class="rate-bar-item">
                    <span class="rate-bar-label">${r.label}</span>
                    <div class="rate-bar-track">
                        <div class="rate-bar-center"></div>
                        <div class="rate-bar-fill ${cls}" style="width: ${widthPct}%;"></div>
                    </div>
                    <span class="rate-bar-value ${cls}">${sym}${r.value.toFixed(2)}%</span>
                </div>
            `;
        });
        html += `</div>`;

        // 基金经理信息
        if (details.managers && details.managers.length > 0) {
            const managerNames = details.managers.map(m => m.name).join('、');
            const workTime = details.managers[0].workTime || '';
            html += `
                <div class="fund-manager-info">
                    👨‍💼 基金经理：<span class="fund-manager-name">${managerNames}</span>
                    ${workTime ? ` (任职${workTime})` : ''}
                </div>
            `;
        }

        // 费率信息
        if (details.sourceRate || details.currentRate || details.minAmount) {
            html += `<div class="detail-fee-row">`;
            if (details.sourceRate) {
                const hasDiscount = details.currentRate && details.currentRate !== details.sourceRate;
                html += `
                    <div class="detail-fee-item">
                        <div class="detail-fee-label">申购费率</div>
                        <div class="detail-fee-value">
                            ${hasDiscount ? `<span style="text-decoration: line-through; color: var(--text-muted); font-size: 12px;">${details.sourceRate}%</span> <span class="fee-discount">${details.currentRate}%</span>` : `${details.sourceRate}%`}
                        </div>
                    </div>
                `;
            }
            if (details.minAmount) {
                html += `
                    <div class="detail-fee-item">
                        <div class="detail-fee-label">起购金额</div>
                        <div class="detail-fee-value">${details.minAmount}</div>
                    </div>
                `;
            }
            html += `</div>`;
        }

        html += `</div>`;
    }

    // === 4. 净值走势图 ===
    if (details.netWorthData && details.netWorthData.length > 0) {
        const selectedRange = state.chartRangeSelection[code] || 180;
        html += `
            <div class="net-worth-chart-container">
                <div class="chart-range-selector" id="chart-range-selector-${code}">
                    <button class="chart-range-btn ${selectedRange === 30 ? 'active' : ''}" onclick="changeChartRange('${code}', 30)">近1月</button>
                    <button class="chart-range-btn ${selectedRange === 90 ? 'active' : ''}" onclick="changeChartRange('${code}', 90)">近3月</button>
                    <button class="chart-range-btn ${selectedRange === 180 ? 'active' : ''}" onclick="changeChartRange('${code}', 180)">近半年</button>
                    <button class="chart-range-btn ${selectedRange === 365 ? 'active' : ''}" onclick="changeChartRange('${code}', 365)">近1年</button>
                    <button class="chart-range-btn ${selectedRange === 1095 ? 'active' : ''}" onclick="changeChartRange('${code}', 1095)">近三年</button>
                    <button class="chart-range-btn ${selectedRange === 0 ? 'active' : ''}" onclick="changeChartRange('${code}', 0)">成立以来</button>
                </div>
                <div class="net-worth-chart-wrapper">
                    <canvas id="net-worth-chart-${code}"></canvas>
                </div>
            </div>
        `;
    } else {
        html += `
            <div class="skeleton skeleton-chart"></div>
        `;
        if (!details.netWorthData) {
            fetchFundDetails(code, true);
        }
    }

    // === 5. 近期净值列表 ===
    if (details.netWorthData && details.netWorthData.length > 0) {
        const nwData = details.netWorthData.slice(-30).reverse(); // 最近30天，倒序
        const defaultShow = 10;
        const hasMore = nwData.length > defaultShow;

        let tableRows = '';
        nwData.forEach((item, i) => {
            const date = new Date(item.x);
            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const nwValue = item.y.toFixed(4);

            // 日涨幅：与前一天对比（注意数组已倒序，前一天在 i+1）
            let changeHtml = '<span class="nw-change zero">--</span>';
            const prevIdx = details.netWorthData.indexOf(item) - 1;
            if (prevIdx >= 0) {
                const prevValue = details.netWorthData[prevIdx].y;
                const change = prevValue > 0 ? ((item.y - prevValue) / prevValue * 100) : 0;
                const cls = change > 0 ? 'positive' : (change < 0 ? 'negative' : 'zero');
                const sym = change > 0 ? '+' : '';
                changeHtml = `<span class="nw-change ${cls}">${sym}${change.toFixed(2)}%</span>`;
            }

            const rowClass = i >= defaultShow ? 'nw-row nw-row-hidden' : 'nw-row';
            tableRows += `<tr class="${rowClass}"><td class="nw-date">${dateStr}</td><td>${nwValue}</td><td>${changeHtml}</td></tr>`;
        });

        html += `
            <div class="nw-history-section">
                <div class="nw-history-header">
                    <h4>📋 近期净值</h4>
                    ${hasMore ? `<button class="nw-history-toggle" onclick="toggleNwHistory(this)">展开更多 ▼</button>` : ''}
                </div>
                <table class="nw-history-table">
                    <thead><tr><th>日期</th><th>单位净值</th><th>日涨幅</th></tr></thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
        `;
    }

    // === 6. 快捷操作 ===
    const hasPos = posInfo && posInfo.totalShares > 0;
    html += `
        <div class="detail-actions">
            <button class="detail-action-btn buy" onclick="closeFundDetailModal(); openBuyModal('${code}')">买入</button>
            ${hasPos ? `<button class="detail-action-btn sell" onclick="closeFundDetailModal(); openSellModal('${code}')">卖出</button>` : ''}
            ${hasPos ? `<button class="detail-action-btn convert" onclick="closeFundDetailModal(); openConvertModal('${code}')">转换</button>` : ''}
            <button class="detail-action-btn history" onclick="closeFundDetailModal(); openTransactionHistoryModal('${code}')">交易记录</button>
        </div>
    `;

    content.innerHTML = html;
    modal.classList.add('active');

    // 延迟绘制净值走势图
    if (details.netWorthData && details.netWorthData.length > 0) {
        setTimeout(() => drawNetWorthChart(code), 150);
    }
}

function closeFundDetailModal() {
    document.getElementById('fundDetailModal').classList.remove('active');
}

function toggleNwHistory(btn) {
    const section = btn.closest('.nw-history-section');
    const hiddenRows = section.querySelectorAll('.nw-row-hidden');
    if (hiddenRows.length > 0) {
        hiddenRows.forEach(r => r.classList.remove('nw-row-hidden'));
        btn.textContent = '收起 ▲';
    } else {
        const rows = section.querySelectorAll('.nw-row');
        rows.forEach((r, i) => { if (i >= 10) r.classList.add('nw-row-hidden'); });
        btn.textContent = '展开更多 ▼';
    }
}

// 绘制所有基金卡片中的图表（同步绘制，确保 renderFunds 后立即可见）
function observeCharts() {
    document.querySelectorAll('.chart-container canvas').forEach(canvas => {
        const code = canvas.id.replace('chart-', '');
        if (state.charts[code] && state.charts[code].canvas !== canvas) {
            state.charts[code].destroy();
            delete state.charts[code];
        }
        if (state.fundsData[code]) {
            drawChart(code);
        }
    });
}

// 绘制图表（每次销毁旧实例并重建，确保数据可靠刷新）
function drawChart(code) {
    const history = state.historyData[code] || [];
    if (history.length === 0) return;

    const ctx = document.getElementById(`chart-${code}`);
    if (!ctx) return;

    const labels = history.map(d => d.time);
    const data = history.map(d => d.percentage);
    // 根据最新（最后一个）数据点的涨跌判断颜色：涨红跌绿
    const latestValue = data[data.length - 1];
    const lineColor = latestValue >= 0 ? '#ff4d4f' : '#00b96b';

    // 找出最高点和最低点的索引
    let maxIndex = 0;
    let minIndex = 0;
    let maxValue = data[0];
    let minValue = data[0];
    
    data.forEach((value, index) => {
        if (value > maxValue) {
            maxValue = value;
            maxIndex = index;
        }
        if (value < minValue) {
            minValue = value;
            minIndex = index;
        }
    });

    // 为每个点设置不同的样式（普通点不显示，只显示最高最低点）
    const pointRadius = data.map((_, index) => {
        if (index === maxIndex || index === minIndex) return 6;
        return 0; // 普通点隐藏
    });

    const pointBackgroundColor = data.map((_, index) => {
        if (index === maxIndex) return '#ff4d4f'; // 最高点红色
        if (index === minIndex) return '#00b96b'; // 最低点绿色
        return lineColor;
    });

    const pointBorderColor = data.map((_, index) => {
        if (index === maxIndex || index === minIndex) return '#fff';
        return lineColor;
    });

    const pointBorderWidth = data.map((_, index) => {
        if (index === maxIndex || index === minIndex) return 2;
        return 0;
    });

    const pointHoverRadius = data.map((_, index) => {
        if (index === maxIndex || index === minIndex) return 8;
        return 5;
    });

    const pointHoverBorderWidth = data.map((_, index) => {
        if (index === maxIndex || index === minIndex) return 2;
        return 1;
    });

    if (state.charts[code]) {
        state.charts[code].destroy();
        delete state.charts[code];
    }

    state.charts[code] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '涨跌幅 (%)',
                data: data,
                borderColor: lineColor,
                backgroundColor: `${lineColor}20`,
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointRadius: pointRadius,
                pointHoverRadius: pointHoverRadius,
                pointBackgroundColor: pointBackgroundColor,
                pointBorderColor: pointBorderColor,
                pointBorderWidth: pointBorderWidth,
                pointHoverBackgroundColor: pointBackgroundColor,
                pointHoverBorderColor: pointBorderColor,
                pointHoverBorderWidth: pointHoverBorderWidth
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = parseFloat(context.parsed.y).toFixed(2);
                            if (context.parsed.y >= 0) {
                                label = '+' + label;
                            }
                            label = label + '%';
                            
                            // 标注最高最低点
                            if (context.dataIndex === maxIndex) {
                                label += ' 📈 今日最高';
                            } else if (context.dataIndex === minIndex) {
                                label += ' 📉 今日最低';
                            }
                            
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45,
                        font: {
                            size: 10
                        }
                    }
                },
                y: {
                    display: true,
                    grace: '5%', // 在最大最小值基础上增加5%的空间
                    ticks: {
                        callback: function(value) {
                            return value.toFixed(2) + '%';
                        },
                        // 确保0值刻度总是显示
                        includeBounds: true
                    },
                    grid: {
                        color: function(context) {
                            // 0值线使用深色，其他网格线使用浅色
                            if (context.tick.value === 0) {
                                return 'rgba(100, 100, 100, 0.5)';
                            }
                            return 'rgba(0, 0, 0, 0.05)';
                        },
                        lineWidth: function(context) {
                            // 0值线稍粗一点
                            if (context.tick.value === 0) {
                                return 2;
                            }
                            return 1;
                        },
                        borderDash: function(context) {
                            // 0值线使用虚线
                            if (context.tick.value === 0) {
                                return [6, 4]; // 6px实线，4px间隔
                            }
                            return [];
                        }
                    },
                    // 确保y轴范围包含0值
                    afterDataLimits: function(axis) {
                        const range = axis.max - axis.min;
                        if (axis.max < 0) {
                            axis.max = 0;
                        } else if (axis.min > 0) {
                            axis.min = 0;
                        }
                        // 在顶部和底部留出一些空间
                        const padding = range * 0.1;
                        axis.max += padding;
                        axis.min -= padding;
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

// 绘制净值走势图表
function drawNetWorthChart(code) {
    
    const details = state.fundDetails[code];
    
    if (!details || !details.netWorthData || details.netWorthData.length === 0) {
        console.error(`[drawNetWorthChart] 基金 ${code} 没有净值数据`);
        return;
    }

    const ctx = document.getElementById(`net-worth-chart-${code}`);
    if (!ctx) {
        console.error(`[drawNetWorthChart] 找不到图表canvas元素: net-worth-chart-${code}`);
        return;
    }

    // 销毁旧图表
    if (state.charts[`net-worth-${code}`]) {
        state.charts[`net-worth-${code}`].destroy();
    }

    // 根据选择的时间范围筛选数据（按日历天数过滤）
    const rangeDays = state.chartRangeSelection[code] ?? 180;
    const rangeLabels = { 30: '近1月', 90: '近3月', 180: '近半年', 365: '近1年', 1095: '近三年', 0: '成立以来' };
    let recentData;
    if (rangeDays === 0) {
        recentData = details.netWorthData.slice();
    } else {
        const cutoffDate = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
        recentData = details.netWorthData.filter(item => item.x >= cutoffDate);
        if (recentData.length < 5) {
            const fallbackCount = { 30: 22, 90: 66, 180: 132, 365: 252, 1095: 756 }[rangeDays] || 132;
            recentData = details.netWorthData.slice(-fallbackCount);
        }
    }
    
    
    // 检查数据新鲜度：如果最后一个数据点距今超过3天且本次会话未刷新过，则触发后台刷新
    const lastDataTimestamp = recentData[recentData.length - 1].x;
    const lastDataDateObj = new Date(lastDataTimestamp);
    const daysSinceLastData = (Date.now() - lastDataDateObj.getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceLastData > 3 && !state.netWorthRefreshed.has(code)) {
        console.warn(`[drawNetWorthChart] 基金 ${code} 净值数据可能过期（最后数据: ${lastDataDateObj.toLocaleDateString('zh-CN')}），触发后台刷新`);
        state.netWorthRefreshed.add(code);
        localStorage.removeItem(`fundDetail_${code}`);
        fetchFundDetails(code, true);
    }
    
    // 提取日期和净值数据
    const firstDataDateObj = new Date(recentData[0].x);
    const labels = recentData.map(item => {
        const date = new Date(item.x);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    });
    // 用于图表标题显示的日期范围
    const dateRangeStr = `${firstDataDateObj.getMonth() + 1}/${firstDataDateObj.getDate()} ~ ${lastDataDateObj.getMonth() + 1}/${lastDataDateObj.getDate()}`;
    const netWorthValues = recentData.map(item => item.y);
    
    
    // 计算涨跌百分比（相比第一个数据点，从0%开始）
    const firstValue = netWorthValues[0];
    const lastValue = netWorthValues[netWorthValues.length - 1];
    const percentageValues = netWorthValues.map(v => ((v - firstValue) / firstValue) * 100);
    const isPositive = lastValue >= firstValue;
    const lineColor = isPositive ? '#ff4d4f' : '#00b96b';

    // 获取该基金的买卖交易记录，用于在图表上标注买入点、卖出点
    const fundPosition = state.positions[code];
    const buyTransactions = (fundPosition && fundPosition.transactions) ?
        fundPosition.transactions.filter(t => t.type === 'buy') : [];
    const sellTransactions = (fundPosition && fundPosition.transactions) ?
        fundPosition.transactions.filter(t => t.type === 'sell') : [];
    const buyPointData = new Array(recentData.length).fill(null);
    const sellPointData = new Array(recentData.length).fill(null);
    const buyTooltipInfo = {};
    const sellTooltipInfo = {};

    const dateIndexMap = {};
    recentData.forEach((item, index) => {
        const d = new Date(item.x);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        dateIndexMap[key] = index;
    });

    function matchTransToIndex(trans) {
        const effectiveStr = getTransEffectiveDate(trans);
        let matchIdx = dateIndexMap[effectiveStr];
        if (matchIdx === undefined) {
            const transTime = new Date(trans.tradeDate || trans.date).getTime();
            let minDiff = Infinity;
            recentData.forEach((item, index) => {
                const diff = Math.abs(new Date(item.x).getTime() - transTime);
                if (diff < minDiff && diff <= 3 * 24 * 60 * 60 * 1000) {
                    minDiff = diff;
                    matchIdx = index;
                }
            });
        }
        return matchIdx;
    }

    buyTransactions.forEach(trans => {
        const matchIdx = matchTransToIndex(trans);
        if (matchIdx !== undefined) {
            buyPointData[matchIdx] = percentageValues[matchIdx];
            if (!buyTooltipInfo[matchIdx]) buyTooltipInfo[matchIdx] = [];
            buyTooltipInfo[matchIdx].push(trans);
        }
    });
    sellTransactions.forEach(trans => {
        const matchIdx = matchTransToIndex(trans);
        if (matchIdx !== undefined) {
            sellPointData[matchIdx] = percentageValues[matchIdx];
            if (!sellTooltipInfo[matchIdx]) sellTooltipInfo[matchIdx] = [];
            sellTooltipInfo[matchIdx].push(trans);
        }
    });

    const hasBuyPoints = buyPointData.some(v => v !== null);
    const hasSellPoints = sellPointData.some(v => v !== null);

    // 调试：记录百分比数据的范围，以便排查刻度问题
    try {
        const minPerc = Math.min(...percentageValues);
        const maxPerc = Math.max(...percentageValues);
        if (code === '021534') {
            console.warn(`[drawNetWorthChart][DEBUG] 目标基金 ${code} 百分比范围: ${minPerc.toFixed(2)}% ~ ${maxPerc.toFixed(2)}%`);
        }

        // 根据数据范围动态计算 y 轴上下限，允许负值区间（不强制从0开始）
        var range = maxPerc - minPerc;
        var padding = 0;
        if (range === 0) {
            // 如果没有变化，设置一个小的绝对padding，保证图表可读
            padding = Math.max(Math.abs(maxPerc) * 0.05, 1);
        } else {
            padding = range * 0.12; // 留出12%空间
        }

        var yMin = minPerc - padding;
        var yMax = maxPerc + padding;
        // 兜底：确保 yMin 小于 yMax
        if (!(isFinite(yMin) && isFinite(yMax)) || yMin >= yMax) {
            yMin = Math.min(minPerc, 0) - 5;
            yMax = Math.max(maxPerc, 0) + 5;
        }
    } catch (e) {
        console.error('[drawNetWorthChart][DEBUG] 计算百分比范围出错', e);
        var yMin = 0;
        var yMax = 5;
    }

    state.charts[`net-worth-${code}`] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '涨跌幅',
                data: percentageValues,
                borderColor: lineColor,
                backgroundColor: `${lineColor}15`,
                borderWidth: 2,
                tension: 0.3,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHoverBackgroundColor: lineColor,
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2
            }].concat(hasBuyPoints ? [{
                label: '买入点',
                data: buyPointData,
                borderColor: 'transparent',
                backgroundColor: '#ef4444',
                pointRadius: buyPointData.map(v => v !== null ? 5 : 0),
                pointHoverRadius: buyPointData.map(v => v !== null ? 7 : 0),
                pointStyle: 'circle',
                pointBackgroundColor: '#ef4444',
                pointBorderColor: '#fff',
                pointBorderWidth: 1.5,
                showLine: false,
                fill: false,
                order: -1
            }] : []).concat(hasSellPoints ? [{
                label: '卖出点',
                data: sellPointData,
                borderColor: 'transparent',
                backgroundColor: '#3b82f6',
                pointRadius: sellPointData.map(v => v !== null ? 5 : 0),
                pointHoverRadius: sellPointData.map(v => v !== null ? 7 : 0),
                pointStyle: 'circle',
                pointBackgroundColor: '#3b82f6',
                pointBorderColor: '#fff',
                pointBorderWidth: 1.5,
                showLine: false,
                fill: false,
                order: -1
            }] : [])
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: hasBuyPoints || hasSellPoints,
                    labels: {
                        filter: function(item) {
                            return item.text === '买入点' || item.text === '卖出点';
                        },
                        usePointStyle: true,
                        font: { size: 11 },
                        padding: 10
                    },
                    position: 'top',
                    align: 'end'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    filter: function(tooltipItem) {
                        if ((tooltipItem.dataset.label === '买入点' || tooltipItem.dataset.label === '卖出点') && tooltipItem.parsed.y === null) {
                            return false;
                        }
                        return true;
                    },
                    callbacks: {
                        label: function(context) {
                            if (context.dataset.label === '买入点') {
                                if (context.parsed.y === null) return null;
                                const idx = context.dataIndex;
                                const infos = buyTooltipInfo[idx];
                                if (infos && infos.length > 0) {
                                    return infos.map(t => `▲ 买入 ${t.amount.toFixed(2)}｜净值 ${(t.netValue || 0).toFixed(4)}｜${t.shares.toFixed(2)}份`);
                                }
                                return '▲ 买入点';
                            }
                            if (context.dataset.label === '卖出点') {
                                if (context.parsed.y === null) return null;
                                const idx = context.dataIndex;
                                const infos = sellTooltipInfo[idx];
                                if (infos && infos.length > 0) {
                                    return infos.map(t => `● 卖出 ${(t.amount || 0).toFixed(2)}｜净值 ${(t.netValue || 0).toFixed(4)}｜${t.shares.toFixed(2)}份`);
                                }
                                return '● 卖出点';
                            }
                            return '涨跌幅：' + context.parsed.y.toFixed(2) + '%';
                        }
                    }
                },
                title: {
                    display: true,
                    text: `单位净值涨跌幅（${dateRangeStr}）`,
                    font: { size: 14, weight: 'bold' },
                    padding: { top: 4, bottom: 12 }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: { display: false },
                    ticks: { maxRotation: 45, minRotation: 45, font: { size: 10 }, maxTicksLimit: rangeDays === 0 ? 14 : rangeDays <= 30 ? 8 : rangeDays <= 90 ? 10 : rangeDays <= 365 ? 12 : 14 }
                },
                y: {
                    display: true,
                    position: 'left',
                    min: yMin,
                    max: yMax,
                    grace: '0%',
                    ticks: {
                        callback: function(value) { return value.toFixed(2) + '%'; },
                        font: { size: 11 }
                    },
                    grid: {
                        color: function(context) {
                            if (context.tick.value === 0) return 'rgba(100, 100, 100, 0.5)';
                            return 'rgba(0, 0, 0, 0.05)';
                        },
                        lineWidth: function(context) { return context.tick.value === 0 ? 2 : 1; },
                        borderDash: function(context) { return context.tick.value === 0 ? [6,4] : []; }
                    }
                }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false }
        }
    });
    
}

// 切换图表时间范围
function changeChartRange(code, days) {
    state.chartRangeSelection[code] = days;
    
    // 更新按钮选中状态（不重新渲染整个页面）
    const selector = document.getElementById(`chart-range-selector-${code}`);
    if (selector) {
        selector.querySelectorAll('.chart-range-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        // 根据 days 值找到对应按钮并激活
        const daysList = [30, 90, 180, 365, 1095, 0];
        const idx = daysList.indexOf(days);
        if (idx >= 0 && selector.children[idx]) {
            selector.children[idx].classList.add('active');
        }
    }
    
    // 重绘图表
    drawNetWorthChart(code);
}

// 判断是否在A股交易时段（工作日 9:15-15:05，留5分钟缓冲）
function isTradingTime() {
    const now = new Date();
    const day = now.getDay(); // 0=周日, 6=周六
    if (day === 0 || day === 6) return false;
    const hhmm = now.getHours() * 100 + now.getMinutes();
    return hhmm >= 915 && hhmm <= 1505;
}

// 获取轮询间隔：交易时段30秒，非交易时段5分钟
function getRefreshInterval() {
    return isTradingTime() ? 30000 : 300000;
}

let refreshTimer = null;
let refreshWatchdogTimer = null;

function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    const interval = getRefreshInterval();
    refreshTimer = setTimeout(() => {
        try {
            refreshAllFunds();
        } finally {
            // 即使刷新过程抛错也继续调度，避免轮询链路中断。
            scheduleRefresh();
        }
    }, interval);
}

function ensureRefreshWatchdog() {
    if (refreshWatchdogTimer) clearInterval(refreshWatchdogTimer);
    // 兜底机制：部分运行环境会出现 setTimeout 链路意外中断（或被长期节流）；
    // watchdog 定期自检，若超过预期周期未刷新，则主动恢复轮询并触发一次刷新。
    refreshWatchdogTimer = setInterval(function () {
        const now = Date.now();
        const last = state.lastAutoRefreshAt || 0;
        const expected = Math.max(getRefreshInterval() * 2, 90000);
        const stale = !last || (now - last > expected);
        if (!refreshTimer || stale) {
            refreshAllFunds();
            scheduleRefresh();
        }
    }, 10000);
}

// 手动刷新实际净值（晚间净值公布后使用，会清除缓存并重新拉取）
function refreshActualNav() {
    const codes = loadFundCodes();
    if (codes.length === 0) {
        showToast('暂无基金', 'info');
        return;
    }
    codes.forEach(code => localStorage.removeItem(`fundDetail_${code}`));
    delete window.r;
    codes.forEach(code => {
        delete state.fundDetails[code];
        if (state.fundsData[code]) {
            delete state.fundsData[code].actualNav;
            delete state.fundsData[code].actualNavDate;
            delete state.fundsData[code].actualNavPercentage;
            delete state.fundsData[code].actualNavJzrq;
        }
        fetchFundDetails(code);
    });
    scheduleRender();
    showToast('已触发刷新，请稍候查看实际净值', 'info');
}

// 刷新所有基金数据（定时刷新只获取实时估值；晚间或非交易日为显示实际净值会拉取详情）
function refreshAllFunds() {
    state.lastAutoRefreshAt = Date.now();
    const codes = loadFundCodes();
    const today = new Date();
    codes.forEach(code => {
        // 晚间 20:00 后且尚无实际净值时拉取详情；非交易日也拉取详情以便用最近一条实际净值替代估值
        const needDetails =
            (isAfterNavPublishTime() && !state.fundsData[code]?.actualNav) ||
            !isTradingDay(today);
        fetchFundData(code, !needDetails);
    });
}

// 迁移旧格式数据
function migrateOldPositionData() {
    let needsSave = false;
    Object.keys(state.positions).forEach(code => {
        const pos = state.positions[code];
        // 检查是否是旧格式 { shares, costPrice }
        if (pos && pos.shares && pos.costPrice && !pos.transactions) {
            const d = new Date();
            const tradeDate = toDateStr(d);
            state.positions[code] = {
                transactions: [{
                    type: 'buy',
                    date: d.toISOString(),
                    tradeDate,
                    beforeCutoff: true,
                    effectiveNavDate: tradeDate,
                    navSource: 'manual',
                    netValue: pos.costPrice,
                    amount: pos.shares * pos.costPrice,
                    fee: 0,
                    shares: pos.shares
                }]
            };
            needsSave = true;
        } else if (pos && pos.transactions) {
            pos.transactions.forEach(trans => {
                if (trans.tradeDate == null) {
                    const d = new Date(trans.date);
                    trans.tradeDate = toDateStr(d);
                    trans.beforeCutoff = true;
                    trans.effectiveNavDate = getEffectiveNavDate(trans.tradeDate, true);
                    trans.navSource = trans.navSource || 'manual';
                    needsSave = true;
                }
            });
        }
    });
    
    if (needsSave) {
        savePositions();
    }
}

// 检查备份提醒
function checkBackupReminder() {
    const codes = loadFundCodes();
    if (codes.length === 0) return; // 没有基金就不提醒

    const lastBackupDate = localStorage.getItem('lastBackupDate');
    const now = new Date();
    
    if (!lastBackupDate) {
        // 首次使用，7天后提醒
        localStorage.setItem('lastBackupDate', now.toISOString());
        return;
    }

    const lastBackup = new Date(lastBackupDate);
    const daysSinceBackup = Math.floor((now - lastBackup) / (1000 * 60 * 60 * 24));

    // 超过30天未备份，提醒用户
    if (daysSinceBackup >= 30) {
        setTimeout(() => {
            if (confirm(`💾 备份提醒\n\n已经 ${daysSinceBackup} 天没有备份数据了！\n\n为避免数据丢失，建议立即备份。\n\n点击"确定"立即导出备份文件`)) {
                exportData();
                localStorage.setItem('lastBackupDate', now.toISOString());
            } else {
                // 用户点了取消，7天后再提醒
                const remindDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                localStorage.setItem('lastBackupDate', remindDate.toISOString());
            }
        }, 2000); // 延迟2秒弹出，避免影响页面加载
    }
}

// 更新最后备份时间（在导出成功后调用）
function updateLastBackupDate() {
    localStorage.setItem('lastBackupDate', new Date().toISOString());
}

// ========== 初始化 ==========
function init() {
    observeModalActive();
    // 加载历史数据
    state.historyData = loadHistoryData();
    
    // 清理非当天的历史数据
    const today = new Date().toLocaleDateString('zh-CN');
    Object.keys(state.historyData).forEach(code => {
        if (state.historyData[code] && Array.isArray(state.historyData[code])) {
            state.historyData[code] = state.historyData[code].filter(item => item.date === today);
        }
    });
    saveHistoryData();
    
    // 加载持仓数据
    state.positions = loadPositions();
    
    // 迁移旧格式数据
    migrateOldPositionData();
    
    // 加载今日范围数据
    const rangeData = loadDailyRanges();
    state.dailyRanges = rangeData.ranges || {}
    
    // 加载排序设置
    loadSortOrder();
    
    // 检查备份提醒
    checkBackupReminder();
    
    // 检查同步提醒
    initSyncReminder();
    
    // 更新页脚同步状态
    updateFooterSyncStatus();
    
    // 加载基金列表（优先使用缓存）
    const cachedList = loadFundListCache();
    if (!cachedList || cachedList.length === 0) {
        // 如果没有缓存或缓存为空，立即获取
        fetchFundList();
    } else {
        // 有缓存，在后台检查更新
        setTimeout(() => {
            const cached = localStorage.getItem('fundListCache');
            if (cached) {
                const cacheData = JSON.parse(cached);
                const now = Date.now();
                const oneDay = 24 * 60 * 60 * 1000;
                // 如果缓存即将过期（超过20小时），在后台更新
                if (now - cacheData.timestamp > oneDay * 0.83) {
                    fetchFundList();
                }
            }
        }, 5000); // 延迟5秒后检查
    }
    
    // 加载已有基金的详细信息缓存（含已从列表删除但仍有持仓/交易记录的基金，供总览折线图回放）
    const codesForDetail = getOverviewFundCodes();
    codesForDetail.forEach(code => {
        const cached = localStorage.getItem(`fundDetail_${code}`);
        if (cached) {
            try {
                const cacheData = JSON.parse(cached);
                const now = Date.now();
                const oneDay = 24 * 60 * 60 * 1000;
                if (now - cacheData.timestamp < oneDay) {
                    state.fundDetails[code] = cacheData.data;
                }
            } catch (e) {
                console.error(`[init] 加载基金 ${code} 详细信息缓存失败`, e);
            }
        }
    });

    const codes = loadFundCodes();

    // 延后首屏渲染到下一帧，让骨架/布局先绘制，减少白屏与卡顿感
    requestAnimationFrame(function () {
        renderFunds();
        initDragSort();
        codes.forEach(code => { fetchFundData(code); });
        scheduleRefresh();
        ensureRefreshWatchdog();
    });

    // 为「仅存在于总览（已删除/清仓）但无净值历史」的基金拉取详情，使日历日期弹窗能显示这些基金
    setTimeout(function () {
        const overviewCodes = getOverviewFundCodes();
        const currentCodes = loadFundCodes();
        overviewCodes.forEach(function (code) {
            if (currentCodes.indexOf(code) >= 0) return; // 当前列表会由 fetchFundData 拉详情
            var details = state.fundDetails[code];
            if (details && details.netWorthData && details.netWorthData.length > 0) return; // 已有净值数据
            fetchFundDetails(code, true);
        });
    }, 4000);

    // 每天凌晨2点自动更新基金列表（用递归 setTimeout 替代 setInterval，避免后台标签页被节流后多次回调堆积）
    let twoAMTimer = null;
    function scheduleTwoAMCheck() {
        const now = new Date();
        if (now.getHours() === 2 && now.getMinutes() === 0) {
            fetchFundList();
        }
        if (!document.hidden) {
            twoAMTimer = setTimeout(scheduleTwoAMCheck, 60000);
        }
    }
    scheduleTwoAMCheck();

    // 标签页可见性：仅管理每日2点检查定时器；基金刷新由 scheduleRefresh + watchdog 统一维持
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
            if (twoAMTimer) {
                clearTimeout(twoAMTimer);
                twoAMTimer = null;
            }
        } else {
            if (!refreshTimer) scheduleRefresh();
            if (!twoAMTimer) scheduleTwoAMCheck();
        }
    });
}

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', init);

// 支持回车键添加基金
document.addEventListener('DOMContentLoaded', () => {
    // 点击页面其他位置关闭更多菜单
    document.addEventListener('click', (e) => {
        const backupControls = document.querySelector('.backup-controls');
        if (backupControls && !backupControls.contains(e.target)) {
            closeBackupMenu();
        }
    });

    const fundInput = document.getElementById('fundCodeInput');
    fundInput.addEventListener('keydown', handleFundInputKeydown);
    // 回车键添加基金（备选列表未展开或已通过 keydown 处理时不重复添加）
    fundInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addFund();
        }
    });

    // 输入时显示自动补全
    fundInput.addEventListener('input', (e) => {
        const keyword = e.target.value.trim();
        showAutocompleteSuggestions(keyword);
    });

    // 失去焦点时隐藏列表
    fundInput.addEventListener('blur', () => {
        hideAutocompleteList();
    });

    // 获得焦点时如果有内容则显示建议
    fundInput.addEventListener('focus', (e) => {
        const keyword = e.target.value.trim();
        if (keyword) {
            showAutocompleteSuggestions(keyword);
        }
    });

    // 初始申购实时计算份额
    ['initialNetValue', 'initialAmount', 'initialFee'].forEach(id => {
        document.getElementById(id).addEventListener('input', calcInitialShares);
    });

    // 买入实时计算份额
    ['buyNetValue', 'buyAmount', 'buyFee'].forEach(id => {
        document.getElementById(id).addEventListener('input', calcBuyShares);
    });

    // 卖出实时计算金额
    ['sellNetValue', 'sellShares', 'sellFee'].forEach(id => {
        document.getElementById(id).addEventListener('input', calcSellAmount);
    });

    // 点击模态框背景关闭（视为取消添加）
    document.getElementById('initialPurchaseModal').addEventListener('click', (e) => {
        if (e.target.id === 'initialPurchaseModal') {
            closeInitialPurchaseModal(true);
        }
    });

    document.getElementById('buyModal').addEventListener('click', (e) => {
        if (e.target.id === 'buyModal') {
            closeBuyModal();
        }
    });

    document.getElementById('sellModal').addEventListener('click', (e) => {
        if (e.target.id === 'sellModal') {
            closeSellModal();
        }
    });

    document.getElementById('transactionHistoryModal').addEventListener('click', (e) => {
        if (e.target.id === 'transactionHistoryModal') {
            closeTransactionHistoryModal();
        }
    });

    document.getElementById('cloudSettingsModal').addEventListener('click', (e) => {
        if (e.target.id === 'cloudSettingsModal') {
            closeCloudSettingsModal();
        }
    });

    document.getElementById('historicalProfitModal').addEventListener('click', (e) => {
        if (e.target.id === 'historicalProfitModal') {
            closeHistoricalProfitDetail();
        }
    });

    document.getElementById('holdingProfitModal').addEventListener('click', (e) => {
        if (e.target.id === 'holdingProfitModal') {
            closeHoldingProfitDetail();
        }
    });

    document.getElementById('dailyPnlDetailModal').addEventListener('click', (e) => {
        if (e.target.id === 'dailyPnlDetailModal') {
            closeDailyPnlDetailModal();
        }
    });

    document.getElementById('customConfirmModal').addEventListener('click', (e) => {
        if (e.target.id === 'customConfirmModal') {
            closeCustomConfirm(false);
        }
    });

    // 点击页面其他位置关闭自动补全列表
    document.addEventListener('click', (e) => {
        const autocompleteWrapper = document.querySelector('.autocomplete-wrapper');
        if (autocompleteWrapper && !autocompleteWrapper.contains(e.target)) {
            document.getElementById('autocompleteList').classList.remove('active');
        }
    });

    // 点击弹窗背景关闭基金详情弹窗
    document.getElementById('fundDetailModal').addEventListener('click', (e) => {
        if (e.target.id === 'fundDetailModal') {
            closeFundDetailModal();
        }
    });
});
