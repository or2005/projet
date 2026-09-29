(function registerFinanceModel(root) {
    const CATEGORIES = Object.freeze({
        income: Object.freeze(['משכורת', 'הכנסה נוספת', 'החזר', 'קצבה', 'מתנה', 'אחר']),
        expense: Object.freeze(['מזון וקניות', 'דיור וחשבונות', 'תחבורה', 'בריאות', 'קניות', 'בילוי', 'מנויים', 'הלוואות', 'אחר'])
    });

    function amount(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : 0;
    }

    function monthKey(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    }

    function shiftMonth(value, amountToShift) {
        const [year, month] = value.split('-').map(Number);
        const target = new Date(year, month - 1 + amountToShift, 1);
        return monthKey(target);
    }

    function dateInMonth(month, day) {
        const [year, monthNumber] = month.split('-').map(Number);
        const lastDay = new Date(year, monthNumber, 0).getDate();
        const date = new Date(year, monthNumber - 1, Math.min(Math.max(1, Number(day) || 1), lastDay));
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function expandInstallments(transaction, count, createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`) {
        const installmentCount = Math.max(1, Math.min(48, Math.floor(Number(count) || 1)));
        const total = amount(transaction.amount);
        if (installmentCount === 1) return [{ ...transaction, amount: total }];

        const totalCents = Math.round(total * 100);
        const baseCents = Math.floor(totalCents / installmentCount);
        let allocatedCents = 0;
        const installmentGroupId = createId();
        const [year, month, day] = transaction.date.split('-').map(Number);
        const sourceDate = new Date(year, month - 1, day);

        return Array.from({ length: installmentCount }, (_unused, index) => {
            const installmentDate = new Date(sourceDate.getFullYear(), sourceDate.getMonth() + index, 1);
            const dueDate = dateInMonth(monthKey(installmentDate), day);
            const cents = index === installmentCount - 1 ? totalCents - allocatedCents : baseCents;
            allocatedCents += cents;
            return {
                ...transaction,
                id: index === 0 ? transaction.id : createId(),
                date: dueDate,
                amount: cents / 100,
                installmentGroupId,
                installmentIndex: index + 1,
                installmentCount
            };
        });
    }

    function createRecurringOccurrence(rule, month) {
        const startMonth = rule.startMonth || String(rule.createdAt || '').slice(0, 7);
        if (!startMonth || month < startMonth) return null;
        const monthsSinceStart = (Number(month.slice(0, 4)) - Number(startMonth.slice(0, 4))) * 12
            + Number(month.slice(5, 7)) - Number(startMonth.slice(5, 7));
        const interval = Math.max(1, Math.floor(Number(rule.intervalMonths) || 1));
        if (monthsSinceStart % interval !== 0) return null;
        return {
            id: `${rule.id}:${month}`,
            date: dateInMonth(month, rule.dueDay),
            type: rule.type,
            amount: amount(rule.amount),
            category: rule.category,
            description: rule.description || '',
            accountId: rule.accountId,
            recurringRuleId: rule.id,
            occurrenceMonth: month
        };
    }

    function getRecurringOccurrences(rules, transactions, month) {
        const existingRules = new Set(transactions
            .filter(item => item.occurrenceMonth === month)
            .map(item => item.recurringRuleId));
        return rules
            .filter(rule => rule.active !== false && !existingRules.has(rule.id))
            .map(rule => createRecurringOccurrence(rule, month))
            .filter(Boolean);
    }

    function calculateMonthSummary(transactions, month, accounts = []) {
        const previousMonth = shiftMonth(month, -1);
        const current = [];
        const previous = [];
        const currentTotals = { income: 0, expenses: 0, refunds: 0, transfers: 0 };
        const previousTotals = { income: 0, expenses: 0, refunds: 0, transfers: 0 };
        const categories = {};
        const balances = new Map(accounts.map(account => [account.id, amount(account.openingBalance)]));

        const addMonthlyTransaction = (totals, item, includeCategories) => {
            const value = amount(item.amount);
            if (item.type === 'income') totals.income += value;
            else if (item.type === 'expense') totals.expenses += value;
            else if (item.type === 'refund') totals.refunds += value;
            else if (item.type === 'transfer') totals.transfers += value;

            if (includeCategories && (item.type === 'expense' || item.type === 'refund')) {
                categories[item.category] = amount((categories[item.category] || 0) + (item.type === 'refund' ? -value : value));
            }
        };

        transactions.forEach(item => {
            const date = String(item.date);
            if (date.startsWith(month)) {
                current.push(item);
                addMonthlyTransaction(currentTotals, item, true);
            } else if (date.startsWith(previousMonth)) {
                previous.push(item);
                addMonthlyTransaction(previousTotals, item, false);
            }

            const value = amount(item.amount);
            if (item.type === 'transfer') {
                if (balances.has(item.accountId)) {
                    balances.set(item.accountId, balances.get(item.accountId) - value);
                    if (item.toAccountId !== item.accountId && balances.has(item.toAccountId)) {
                        balances.set(item.toAccountId, balances.get(item.toAccountId) + value);
                    }
                } else if (balances.has(item.toAccountId)) {
                    balances.set(item.toAccountId, balances.get(item.toAccountId) + value);
                }
            } else if (balances.has(item.accountId)) {
                if (item.type === 'income' || item.type === 'refund') balances.set(item.accountId, balances.get(item.accountId) + value);
                else if (item.type === 'expense') balances.set(item.accountId, balances.get(item.accountId) - value);
            }
        });

        const summarize = totals => {
            const income = amount(totals.income);
            const expenses = amount(totals.expenses);
            const refunds = amount(totals.refunds);
            const transfers = amount(totals.transfers);
            const netExpenses = amount(expenses - refunds);
            return { income, expenses, refunds, netExpenses, remaining: amount(income - netExpenses), transfers };
        };
        const totals = summarize(currentTotals);
        const previousSummary = summarize(previousTotals);
        const accountBalances = accounts.map(account => ({ ...account, balance: amount(balances.get(account.id)) }));

        return { month, current, totals, previousTotals: previousSummary, categories, accountBalances };
    }

    function budgetStatus(budget, spent) {
        const limit = amount(budget);
        const actual = amount(spent);
        return {
            limit,
            spent: actual,
            remaining: amount(limit - actual),
            percent: limit > 0 ? Math.round(actual / limit * 100) : 0,
            exceeded: limit > 0 && actual > limit
        };
    }

    function calculateSavingsGoal(income, expenses, percentage) {
        const rate = Math.max(0, Math.min(100, Number(percentage) || 0));
        const totalIncome = Math.max(0, amount(income));
        const saved = Math.max(0, amount(totalIncome - amount(expenses)));
        const target = amount(totalIncome * rate / 100);
        const remaining = Math.max(0, amount(target - saved));
        return {
            rate,
            target,
            saved,
            remaining,
            progress: target > 0 ? Math.min(100, Math.round(saved / target * 100)) : 0
        };
    }

    function escapeCsv(value) {
        const text = String(value ?? '');
        return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }

    function validateBackup(payload) {
        if (!payload || payload.format !== 'ultimate-pro-finance' || payload.schemaVersion !== 1
            || !Array.isArray(payload.accounts) || !Array.isArray(payload.transactions)
            || !Array.isArray(payload.recurring) || !payload.budgets || typeof payload.budgets !== 'object') {
            return { valid: false, error: 'מבנה קובץ הגיבוי אינו מוכר.' };
        }

        const accountIds = new Set();
        for (const account of payload.accounts) {
            if (!account || typeof account.id !== 'string' || !account.id || typeof account.name !== 'string'
                || !account.name.trim() || !Number.isFinite(Number(account.openingBalance)) || accountIds.has(account.id)) {
                return { valid: false, error: 'רשימת החשבונות בקובץ אינה תקינה.' };
            }
            accountIds.add(account.id);
        }

        const transactionIds = new Set();
        const validTypes = new Set(['income', 'expense', 'refund', 'transfer']);
        for (const item of payload.transactions) {
            if (!item || typeof item.id !== 'string' || !validTypes.has(item.type)
                || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.date || ''))
                || !Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0
                || !accountIds.has(item.accountId)
                || transactionIds.has(item.id)
                || (item.type === 'transfer' && (!accountIds.has(item.toAccountId) || item.accountId === item.toAccountId))) {
                return { valid: false, error: 'אחת התנועות בקובץ אינה תקינה.' };
            }
            const [year, month, day] = item.date.split('-').map(Number);
            const date = new Date(year, month - 1, day);
            if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
                return { valid: false, error: 'אחת התנועות בקובץ מכילה תאריך לא תקין.' };
            }
            transactionIds.add(item.id);
        }

        const recurringIds = new Set();
        for (const rule of payload.recurring) {
            if (!rule || typeof rule.id !== 'string' || !['income', 'expense'].includes(rule.type)
                || !Number.isFinite(Number(rule.amount)) || Number(rule.amount) <= 0
                || !accountIds.has(rule.accountId) || !/^\d{4}-\d{2}$/.test(String(rule.startMonth || ''))
                || !Number.isInteger(Number(rule.dueDay)) || Number(rule.dueDay) < 1 || Number(rule.dueDay) > 31
                || recurringIds.has(rule.id)) {
                return { valid: false, error: 'אחד הכללים החוזרים בקובץ אינו תקין.' };
            }
            recurringIds.add(rule.id);
        }

        if (!Number.isFinite(Number(payload.budgets.total || 0)) || Number(payload.budgets.total || 0) < 0
            || !payload.budgets.categories || typeof payload.budgets.categories !== 'object') {
            return { valid: false, error: 'התקציבים בקובץ אינם תקינים.' };
        }
        if (payload.budgets.savingsRate !== undefined
            && (!Number.isFinite(Number(payload.budgets.savingsRate))
                || Number(payload.budgets.savingsRate) < 0 || Number(payload.budgets.savingsRate) > 100)) {
            return { valid: false, error: 'אחוז יעד החיסכון בקובץ אינו תקין.' };
        }
        if (Object.values(payload.budgets.categories).some(value => !Number.isFinite(Number(value)) || Number(value) < 0)) {
            return { valid: false, error: 'אחד מתקציבי הקטגוריות בקובץ אינו תקין.' };
        }
        if (payload.customCategories !== undefined
            && (!payload.customCategories || !Array.isArray(payload.customCategories.income)
                || !Array.isArray(payload.customCategories.expense)
                || [...payload.customCategories.income, ...payload.customCategories.expense].some(category => typeof category !== 'string' || category.length > 40))) {
            return { valid: false, error: 'הקטגוריות האישיות בקובץ אינן תקינות.' };
        }
        return { valid: true };
    }

    const model = Object.freeze({ CATEGORIES, amount, monthKey, shiftMonth, dateInMonth, expandInstallments, createRecurringOccurrence, getRecurringOccurrences, calculateMonthSummary, budgetStatus, calculateSavingsGoal, escapeCsv, validateBackup });
    root.PersonalApps = root.PersonalApps || {};
    root.PersonalApps.finance = model;

    if (typeof module !== 'undefined' && module.exports) module.exports = model;
}(typeof window !== 'undefined' ? window : globalThis));