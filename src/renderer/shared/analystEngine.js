(function registerSmartAnalyst(root) {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const DEFAULT_EXEMPT_CAP = 120000;
    const WORK_EVENT_PATTERN = /משמרת|עבודה|work|shift/i;
    const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    function dateKey(date) {
        const value = date instanceof Date ? date : new Date(date);
        if (Number.isNaN(value.getTime())) return '';
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }

    function validDate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
        const year = Number(value.slice(0, 4));
        const month = Number(value.slice(5, 7));
        const day = Number(value.slice(8, 10));
        if (month < 1 || month > 12 || day < 1) return false;
        const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        return day <= (month === 2 && leapYear ? 29 : MONTH_LENGTHS[month - 1]);
    }

    function number(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function daysBetween(start, end) {
        return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / DAY_MS));
    }

    function normalize(input = {}) {
        const now = input.now instanceof Date ? new Date(input.now) : new Date(input.now || Date.now());
        const shifts = (Array.isArray(input.shifts) ? input.shifts : []).filter(item => validDate(item.date)).map(item => ({
            date: item.date,
            hours: Math.max(0, number(item.hours)),
            gross: Math.max(0, number(item.gross ?? item.total)),
            workplace: String(item.workplace || ''),
            payType: item.payType === 'daily' ? 'daily' : 'hourly'
        }));
        const transactions = (Array.isArray(input.transactions) ? input.transactions : []).filter(item => validDate(item.date)).map(item => ({
            date: item.date,
            amount: Math.max(0, number(item.amount)),
            type: ['income', 'expense', 'refund', 'transfer'].includes(item.type) ? item.type : 'expense',
            category: String(item.category || 'אחר'),
            source: String(item.source || ''),
            recurringRuleId: String(item.recurringRuleId || '')
        }));
        const calendarEvents = (Array.isArray(input.calendarEvents) ? input.calendarEvents : []).filter(item => validDate(item.date)).map(item => ({
            date: item.date,
            title: String(item.title || ''),
            gross: Math.max(0, number(item.gross)),
            hours: Math.max(0, number(item.hours)),
            plannedWork: item.plannedWork === true || WORK_EVENT_PATTERN.test(String(item.title || ''))
        }));
        const recurring = (Array.isArray(input.recurring) ? input.recurring : []).filter(item => item && item.active !== false && item.type === 'expense');
        return {
            now,
            shifts,
            transactions,
            calendarEvents,
            recurring,
            accountBalance: number(input.accountBalance),
            employmentMode: input.employmentMode === 'freelance' ? 'freelance' : 'employee',
            netMultiplier: Math.max(0, Math.min(1, input.netMultiplier === undefined
                ? (input.employmentMode === 'freelance' ? 0.85 : 0.88)
                : number(input.netMultiplier))),
            savingsRate: Math.max(0, Math.min(100, number(input.savingsRate ?? 10))),
            exemptCap: Math.max(1, number(input.exemptCap) || DEFAULT_EXEMPT_CAP),
            month: /^\d{4}-\d{2}$/.test(String(input.monthKey || ''))
                ? input.monthKey
                : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        };
    }

    function analyze(input = {}) {
        const data = normalize(input);
        const { now, month, shifts, transactions, calendarEvents } = data;
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        const todayKey = dateKey(now);
        const monthEndKey = dateKey(monthEnd);
        const monthShifts = [];
        const weekdayGross = new Map();
        const weekdayByDate = new Map();
        let shiftHours = 0;
        let shiftGross = 0;
        let totalHours = 0;
        let grossAllTime = 0;
        shifts.forEach(item => {
            totalHours += item.hours;
            grossAllTime += item.gross;
            if (!item.date.startsWith(month)) return;
            monthShifts.push(item);
            shiftHours += item.hours;
            shiftGross += item.gross;
            let weekday = weekdayByDate.get(item.date);
            if (weekday === undefined) {
                weekday = new Date(`${item.date}T12:00:00`).getDay();
                weekdayByDate.set(item.date, weekday);
            }
            const current = weekdayGross.get(weekday) || { total: 0, count: 0 };
            current.total += item.gross;
            current.count += 1;
            weekdayGross.set(weekday, current);
        });
        const averageShiftGross = shifts.length ? grossAllTime / shifts.length : 0;
        const trueNetHourly = totalHours > 0 ? grossAllTime * data.netMultiplier / totalHours : 0;
        const futureWorkEvents = month === todayKey.slice(0, 7)
            ? calendarEvents.filter(item => item.plannedWork && item.date > todayKey && item.date <= monthEndKey)
            : [];
        const plannedGross = futureWorkEvents.reduce((sum, item) => sum + (item.gross || averageShiftGross), 0);
        const monthlyForecast = shiftGross + plannedGross;
        const since60Key = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 59));
        const previous60Key = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 119));
        const annualStart = `${now.getFullYear()}-01-01`;
        const categoryWindows = new Map();
        let income = 0;
        let expenses = 0;
        let refunds = 0;
        let syncedSalary = 0;
        let annualIncome = 0;
        let recentVariable = 0;
        let largestExpense = null;
        transactions.forEach(item => {
            if (item.date.startsWith(month)) {
                if (item.type === 'income') {
                    income += item.amount;
                    if (item.source === 'salary-sync' || /משכורת/.test(item.category)) syncedSalary += item.amount;
                }
                if (item.type === 'expense') {
                    expenses += item.amount;
                    if (!largestExpense || item.amount > largestExpense.amount) largestExpense = item;
                }
                if (item.type === 'refund') refunds += item.amount;
            }
            if (item.type === 'income' && item.date >= annualStart && item.date <= todayKey) annualIncome += item.amount;
            if (item.type !== 'expense') return;
            if (item.date >= since60Key && item.date <= todayKey) {
                if (!item.recurringRuleId) recentVariable += item.amount;
                const amounts = categoryWindows.get(item.category) || { current: 0, previous: 0 };
                amounts.current += item.amount;
                categoryWindows.set(item.category, amounts);
            } else if (item.date >= previous60Key && item.date < since60Key) {
                const amounts = categoryWindows.get(item.category) || { current: 0, previous: 0 };
                amounts.previous += item.amount;
                categoryWindows.set(item.category, amounts);
            }
        });
        const saved = Math.max(0, income - expenses + refunds);
        const savingTarget = income * data.savingsRate / 100;
        const expectedNetSalary = monthlyForecast * data.netMultiplier;
        const salarySyncGap = Math.max(0, expectedNetSalary - syncedSalary);
        const insights = [];
        const anomalies = [];

        if (monthShifts.length < 3) {
            insights.push({ level: 'INFO', title: 'עוד קצת נתונים לתחזית', text: 'כדי לבנות תחזית שכר יציבה, רשום לפחות 3 משמרות.' });
        }
        if (futureWorkEvents.length && shifts.length >= 3) {
            insights.push({ level: 'INFO', title: 'הכנסה מתוכננת ביומן', text: `${futureWorkEvents.length} ימי עבודה עתידיים רשומים עד סוף החודש. השכר המתוכנן לפי ממוצע המשמרות הוא כ-${Math.round(plannedGross).toLocaleString('he-IL')} ₪.` });
        }
        if (monthShifts.length && syncedSalary > 0 && salarySyncGap > Math.max(250, expectedNetSalary * 0.1)) {
            insights.push({ level: 'WARNING', title: 'כדאי לבדוק סנכרון שכר', text: `נרשמו משמרות בשווי נטו מוערך של כ-${Math.round(expectedNetSalary).toLocaleString('he-IL')} ₪, אך ברשומות המשכורת נמצאו ${Math.round(syncedSalary).toLocaleString('he-IL')} ₪.` });
        } else if (monthShifts.length && !syncedSalary && expectedNetSalary > 0) {
            insights.push({ level: 'INFO', title: 'השכר עוד לא סונכרן', text: 'יש משמרות החודש, אך לא נמצאה רשומת משכורת מסונכרנת בכספים.' });
        }
        if (income > 0 && saved >= savingTarget && savingTarget > 0) {
            insights.push({ level: 'SUCCESS', title: 'יעד החיסכון הושג', text: `היתרה הנוכחית גבוהה מיעד החיסכון של ${Math.round(savingTarget).toLocaleString('he-IL')} ₪.` });
        }

        categoryWindows.forEach(({ current, previous }, category) => {
            if (previous >= 100 && current > previous * 1.25) {
                anomalies.push({ level: 'WARNING', title: `עלייה בהוצאות: ${category}`, text: `ההוצאה ב-60 הימים האחרונים עלתה בכ-${Math.round((current / previous - 1) * 100)}% לעומת 60 הימים שקדמו להם.` });
            }
        });

        if (largestExpense && trueNetHourly > 0 && largestExpense.amount >= 250) {
            insights.push({ level: 'INFO', title: 'מחיר ההוצאה בזמן עבודה', text: `הוצאה של ${Math.round(largestExpense.amount).toLocaleString('he-IL')} ₪ בקטגוריית ${largestExpense.category} שקולה לכ-${(largestExpense.amount / trueNetHourly).toFixed(1)} שעות עבודה נטו משוערות.` });
        }

        const yearDays = (new Date(now.getFullYear() + 1, 0, 1) - new Date(now.getFullYear(), 0, 1)) / DAY_MS;
        const elapsedDays = Math.max(1, Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(now.getFullYear(), 0, 1)) / DAY_MS) + 1);
        const annualPace = annualIncome / elapsedDays * yearDays;
        const capPercent = Math.min(100, annualIncome / data.exemptCap * 100);
        if (data.employmentMode === 'freelance' && (annualPace >= data.exemptCap || capPercent >= 80)) {
            insights.push({ level: 'WARNING', title: 'מעקב תקרת עוסק פטור', text: `ההכנסות מתחילת השנה הן ${Math.round(annualIncome).toLocaleString('he-IL')} ₪ (${Math.round(capPercent)}% מהתקרה). בקצב הנוכחי התחזית השנתית היא כ-${Math.round(annualPace).toLocaleString('he-IL')} ₪.` });
        }

        const remainingDays = month === dateKey(now).slice(0, 7)
            ? Math.max(0, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate())
            : 0;
        const estimatedFutureExpenses = data.recurring.filter(rule => {
            const startMonth = String(rule.startMonth || '').slice(0, 7);
            const interval = Math.max(1, Math.floor(number(rule.intervalMonths) || 1));
            const monthsSinceStart = startMonth ? (now.getFullYear() - Number(startMonth.slice(0, 4))) * 12 + now.getMonth() + 1 - Number(startMonth.slice(5, 7)) : 0;
            const dueDay = Math.max(1, Math.min(31, Math.floor(number(rule.dueDay) || 1)));
            return (!startMonth || (startMonth <= month && monthsSinceStart >= 0 && monthsSinceStart % interval === 0))
                && dueDay >= now.getDate();
        }).reduce((sum, rule) => sum + number(rule.amount), 0) + recentVariable / 60 * remainingDays;
        const cashflowForecast = data.accountBalance + plannedGross * data.netMultiplier - estimatedFutureExpenses;
        const bestWeekday = [...weekdayGross.entries()].sort((a, b) => b[1].total / b[1].count - a[1].total / a[1].count)[0];

        return {
            generatedAt: now.toISOString(),
            summary: { month, shifts: monthShifts.length, hours: shiftHours, gross: shiftGross, plannedDays: futureWorkEvents.length, plannedGross, monthlyForecast, income, expenses, saved, savingTarget, salarySyncGap, trueNetHourly, annualIncome, annualPace, exemptCap: data.exemptCap, capPercent, cashflowForecast, bestWeekday: bestWeekday ? { day: bestWeekday[0], averageGross: bestWeekday[1].total / bestWeekday[1].count } : null },
            insights: [...insights, ...anomalies],
            health: { shiftHistory: shifts.length, expenseHistory: transactions.filter(item => item.type === 'expense').length, enoughShiftHistory: shifts.length >= 3 },
            whatIf: (scenario = {}) => simulate(data, { monthlyForecast, income, expenses, refunds, saved, savingTarget, trueNetHourly }, scenario)
        };
    }

    function simulate(data, current, scenario = {}) {
        const addedExpense = Math.max(0, number(scenario.addExpense));
        const reducedExpense = Math.max(0, number(scenario.reduceExpense));
        const cancelledShifts = Math.max(0, Math.floor(number(scenario.cancelShifts)));
        const averageGross = data.shifts.length ? data.shifts.reduce((sum, item) => sum + item.gross, 0) / data.shifts.length : 0;
        const newForecast = Math.max(0, current.monthlyForecast - cancelledShifts * averageGross);
        const newExpenses = Math.max(0, current.expenses + addedExpense - reducedExpense);
        const newSaved = Math.max(0, current.saved - addedExpense + reducedExpense);
        const target = current.savingTarget;
        const monthDays = Math.max(1, new Date(data.now.getFullYear(), data.now.getMonth() + 1, 0).getDate());
        const oldDailySave = Math.max(1, (current.income - current.expenses + current.refunds) / monthDays);
        const newDailySave = Math.max(0, (current.income - newExpenses + current.refunds) / monthDays);
        const daysToTarget = (remaining, daily) => remaining <= 0 ? 0 : daily > 0 ? Math.ceil(remaining / daily) : null;
        const currentDays = daysToTarget(Math.max(0, target - current.saved), oldDailySave);
        const scenarioDays = daysToTarget(Math.max(0, target - newSaved), newDailySave);
        return {
            monthlyForecast: newForecast,
            saved: newSaved,
            savingTarget: target,
            daysToTarget: scenarioDays,
            daysChange: currentDays == null || scenarioDays == null ? null : scenarioDays - currentDays,
            trueNetHourly: current.trueNetHourly
        };
    }

    const SmartAnalyst = Object.freeze({ analyze, normalize, DEFAULT_EXEMPT_CAP });
    root.PersonalApps = root.PersonalApps || {};
    root.PersonalApps.SmartAnalyst = SmartAnalyst;
    if (typeof module !== 'undefined' && module.exports) module.exports = SmartAnalyst;
}(typeof window !== 'undefined' ? window : globalThis));
