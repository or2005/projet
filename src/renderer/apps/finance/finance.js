(function registerFinanceApp(root) {
    const MODEL = root.PersonalApps.finance;
    const labels = { income: 'הכנסה', expense: 'הוצאה', refund: 'החזר', transfer: 'העברה' };
    let state = createEmptyState();
    let stateLoadError = '';
    let saveQueue = Promise.resolve();
    let editingId = null;
    const stateReady = loadState();

    function createId() {
        return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function createEmptyState() {
        return {
            schemaVersion: 1,
            accounts: [
                { id: 'checking', name: 'חשבון בנק', type: 'checking', openingBalance: 0 },
                { id: 'cash', name: 'מזומן', type: 'cash', openingBalance: 0 }
            ],
            transactions: [],
            recurring: [],
            budgets: { total: 0, categories: {} },
                budgets: { total: 0, categories: {}, savingsRate: 10 },
            customCategories: { income: [], expense: [] }
        };
    }

    async function loadState() {
        try {
            if (!window.electronAPI?.loadFinanceData) throw new Error('Finance storage is available only in Electron.');
            const result = await window.electronAPI.loadFinanceData();
            if (!result?.ok) throw new Error(result?.error || 'Finance data could not be loaded.');
            if (!result.data) return;
            const defaults = createEmptyState();
            state = {
                ...defaults,
                ...result.data,
                budgets: { ...defaults.budgets, ...(result.data.budgets || {}) },
                customCategories: result.data.customCategories || { income: [], expense: [] }
            };
        } catch (error) {
            stateLoadError = error.message;
        }
    }

    function saveState() {
        const snapshot = JSON.parse(JSON.stringify(state));
        const save = () => window.electronAPI.saveFinanceData(snapshot);
        saveQueue = saveQueue.then(save, save).then(result => {
            const status = document.getElementById('finance-save-status');
            if (!result?.ok) {
                if (status) status.textContent = result?.error || 'השמירה נכשלה';
                showMessage(result?.error || 'לא ניתן לשמור את הנתונים במחשב.');
                return false;
            }
            root.PersonalApps.driveSync?.markLocalDirty?.();
            if (status) status.textContent = 'נשמר במחשב';
            return true;
        }).catch(error => {
            const status = document.getElementById('finance-save-status');
            if (status) status.textContent = 'השמירה נכשלה';
            showMessage('לא ניתן לשמור את הנתונים במחשב.');
            return false;
        });
        return saveQueue;
    }

    function currentMonth() {
        return document.getElementById('finance-month')?.value || MODEL.monthKey();
    }

    function getCategories(type) {
        const categoryType = type === 'income' ? 'income' : 'expense';
        return [...MODEL.CATEGORIES[categoryType], ...(state.customCategories[categoryType] || [])];
    }

    function populateCategorySelect(select, type, selected = '') {
        const categories = getCategories(type);
        select.replaceChildren();
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            select.appendChild(option);
        });
        if (selected && !categories.includes(selected)) {
            const option = document.createElement('option');
            option.value = selected;
            option.textContent = selected;
            select.appendChild(option);
        }
        if (selected) select.value = selected;
    }

    function populateAccountSelect(select, selected = '', excludeId = '') {
        select.replaceChildren();
        state.accounts.filter(account => account.id !== excludeId).forEach(account => {
            const option = document.createElement('option');
            option.value = account.id;
            option.textContent = account.name;
            select.appendChild(option);
        });
        if (selected && state.accounts.some(account => account.id === selected && account.id !== excludeId)) select.value = selected;
    }

    function ensureRecurringForMonth(month) {
        const additions = MODEL.getRecurringOccurrences(state.recurring, state.transactions, month);
        if (!additions.length) return;
        state.transactions.push(...additions);
        saveState();
    }

    async function open() {
        const screen = document.getElementById('finance-screen');
        if (!screen) return;
        const monthInput = document.getElementById('finance-month');
        if (!monthInput.value) monthInput.value = MODEL.monthKey();
        screen.classList.add('active');
        await stateReady;
        if (stateLoadError) {
            showMessage(`לא ניתן לפתוח את הנתונים: ${stateLoadError}`);
            return;
        }
        render();
    }

    async function getHomeSummary(month = MODEL.monthKey()) {
        await stateReady;
        if (stateLoadError) return null;
        const summary = MODEL.calculateMonthSummary(state.transactions, month, state.accounts);
        const budget = MODEL.budgetStatus(state.budgets.total, summary.totals.netExpenses);
        return {
            remainingBudget: budget.limit ? budget.remaining : summary.totals.remaining
        };
    }

    async function getAnalystData() {
        await stateReady;
        if (stateLoadError) return null;
        const today = localDateKey();
        const balances = new Map(state.accounts.map(account => [account.id, MODEL.amount(account.openingBalance)]));
        state.transactions.filter(item => item.date <= today).forEach(item => {
            const amount = MODEL.amount(item.amount);
            if (item.type === 'transfer') {
                balances.set(item.accountId, MODEL.amount((balances.get(item.accountId) || 0) - amount));
                balances.set(item.toAccountId, MODEL.amount((balances.get(item.toAccountId) || 0) + amount));
            } else if (item.type === 'income' || item.type === 'refund') {
                balances.set(item.accountId, MODEL.amount((balances.get(item.accountId) || 0) + amount));
            } else if (item.type === 'expense') {
                balances.set(item.accountId, MODEL.amount((balances.get(item.accountId) || 0) - amount));
            }
        });
        return {
            transactions: state.transactions.map(item => ({ ...item })),
            recurring: state.recurring.map(item => ({ ...item })),
            accountBalance: [...balances.values()].reduce((total, balance) => total + balance, 0),
            savingsRate: state.budgets.savingsRate ?? 10
        };
    }

    async function syncSalaryIncome(netAmount, month) {
        await stateReady;
        if (stateLoadError) return false;
        const amount = MODEL.amount(netAmount);
        if (amount <= 0 || !/^\d{4}-\d{2}$/.test(String(month || ''))) return false;
        const account = state.accounts.find(item => item.type === 'checking') || state.accounts[0];
        if (!account) return false;

        const existing = state.transactions.find(item => item.source === 'salary-sync' && item.sourceMonth === month);
        const transaction = {
            id: existing?.id || createId(),
            date: `${month}-01`,
            type: 'income',
            amount,
            category: 'משכורת',
            description: `שכר נטו משוער · ${month}`,
            accountId: account.id,
            source: 'salary-sync',
            sourceMonth: month
        };
        if (existing) Object.assign(existing, transaction);
        else state.transactions.push(transaction);

        const saved = await saveState();
        if (saved && document.getElementById('finance-screen')?.classList.contains('active')) render();
        return saved;
    }

    function close() {
        document.getElementById('finance-screen')?.classList.remove('active');
        if (typeof root.returnToHub === 'function') root.returnToHub();
    }

    function render() {
        const month = currentMonth();
        ensureRecurringForMonth(month);
        const summary = MODEL.calculateMonthSummary(state.transactions, month, state.accounts);
        renderSummary(summary);
        renderSavingsTarget(summary);
        renderBudget(summary);
        renderAccounts(summary.accountBalances);
        renderCategories(summary);
        renderTransactions(summary.current);
        renderRecurringRules();
        document.getElementById('finance-month-label').textContent = formatMonth(month);
        document.getElementById('finance-save-status').textContent = 'נתונים נשמרים במחשב הזה';
        root.scheduleSmartAnalystRefresh?.();
    }

    function formatMonth(month) {
        const [year, monthNumber] = month.split('-').map(Number);
        return new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(new Date(year, monthNumber - 1, 1));
    }

    function formatMoney(value) {
        return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(value || 0);
    }

    function renderSummary(summary) {
        document.getElementById('finance-income-total').textContent = formatMoney(summary.totals.income);
        document.getElementById('finance-expense-total').textContent = formatMoney(summary.totals.netExpenses);
        document.getElementById('finance-remaining-total').textContent = formatMoney(summary.totals.remaining);
        document.getElementById('finance-income-change').textContent = comparisonText(summary.totals.income, summary.previousTotals.income);
        document.getElementById('finance-expense-change').textContent = comparisonText(summary.totals.netExpenses, summary.previousTotals.netExpenses);
        document.getElementById('finance-refunds-total').textContent = summary.totals.refunds ? `כולל ${formatMoney(summary.totals.refunds)} החזרים` : 'ללא החזרים החודש';
    }

    function renderSavingsTarget(summary) {
        const input = document.getElementById('finance-savings-percent');
        const progress = document.querySelector('.finance-savings-progress');
        const fill = document.getElementById('finance-savings-progress-fill');
        const status = document.getElementById('finance-savings-status');
        const remaining = document.getElementById('finance-savings-remaining');
        if (!input || !progress || !fill || !status || !remaining) return;

        const rate = Math.max(0, Math.min(100, Number(input.value) || 0));
        const goal = MODEL.calculateSavingsGoal(summary.totals.income, summary.totals.netExpenses, rate);
        progress.setAttribute('aria-valuenow', String(goal.progress));
        fill.style.width = `${goal.progress}%`;
        status.textContent = summary.totals.income
            ? `${formatMoney(goal.saved)} נחסכו מתוך ${formatMoney(goal.target)}`
            : 'הזן הכנסה כדי לחשב יעד';
        remaining.textContent = goal.target && goal.remaining === 0
            ? 'היעד הושג'
            : `${formatMoney(goal.remaining)} ליעד`;
    }

    function comparisonText(current, previous) {
        if (!previous) return current ? 'אין נתוני השוואה לחודש הקודם' : 'אין תנועות עדיין';
        const percent = Math.round((current - previous) / Math.abs(previous) * 100);
        if (!percent) return 'ללא שינוי מהחודש הקודם';
        return `${Math.abs(percent)}% ${percent > 0 ? 'יותר' : 'פחות'} מהחודש הקודם`;
    }

    function renderBudget(summary) {
        const total = MODEL.budgetStatus(state.budgets.total, summary.totals.netExpenses);
        const totalHost = document.getElementById('finance-total-budget');
        totalHost.replaceChildren();
        if (!total.limit) {
            totalHost.appendChild(makeText('p', 'לא הוגדר תקציב חודשי.', 'finance-empty-copy'));
        } else {
            totalHost.appendChild(makeText('div', `${formatMoney(total.spent)} מתוך ${formatMoney(total.limit)}`, 'finance-budget-caption'));
            totalHost.appendChild(makeProgress(total.percent, total.exceeded));
            totalHost.appendChild(makeText('small', total.exceeded ? `חריגה של ${formatMoney(Math.abs(total.remaining))}` : `נותרו ${formatMoney(total.remaining)}`, total.exceeded ? 'finance-over-budget' : 'finance-muted'));
        }

        const budgetHost = document.getElementById('finance-category-budgets');
        budgetHost.replaceChildren();
        const expenseCategories = [...new Set([...getCategories('expense'), ...Object.keys(summary.categories)])];
        const configured = expenseCategories.filter(category => Number(state.budgets.categories[category]) > 0);
        if (!configured.length) {
            budgetHost.appendChild(makeText('p', 'אפשר להגדיר תקציב לפי קטגוריה בהגדרות התקציב.', 'finance-empty-copy'));
            return;
        }
        configured.forEach(category => {
            const item = MODEL.budgetStatus(state.budgets.categories[category], summary.categories[category] || 0);
            const row = document.createElement('div');
            row.className = 'finance-category-budget-row';
            const header = document.createElement('div');
            header.className = 'finance-budget-row-heading';
            header.append(makeText('strong', category), makeText('span', `${formatMoney(item.spent)} / ${formatMoney(item.limit)}`));
            row.append(header, makeProgress(item.percent, item.exceeded));
            budgetHost.appendChild(row);
        });
    }

    function makeProgress(percent, exceeded = false) {
        const track = document.createElement('div');
        track.className = `finance-progress${exceeded ? ' exceeded' : ''}`;
        track.setAttribute('role', 'progressbar');
        track.setAttribute('aria-valuenow', String(Math.min(percent, 100)));
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', '100');
        const fill = document.createElement('span');
        fill.style.width = `${Math.max(0, Math.min(percent, 100))}%`;
        track.appendChild(fill);
        return track;
    }

    function renderAccounts(accounts) {
        const host = document.getElementById('finance-accounts-list');
        host.replaceChildren();
        accounts.forEach(account => {
            const card = document.createElement('article');
            card.className = 'finance-account-card';
            const details = document.createElement('div');
            details.className = 'finance-account-details';
            details.append(makeText('span', account.name), makeText('strong', formatMoney(account.balance)));
            card.appendChild(details);
            const hasTransactions = state.transactions.some(item => item.accountId === account.id || item.toAccountId === account.id)
                || state.recurring.some(item => item.accountId === account.id);
            if (!hasTransactions) card.appendChild(makeButton('הסרת חשבון', 'fa-trash', () => removeAccount(account.id)));
            host.appendChild(card);
        });
    }

    function renderRecurringRules() {
        const host = document.getElementById('finance-recurring-list');
        if (!host) return;
        host.replaceChildren();
        if (!state.recurring.length) return;

        const heading = document.createElement('div');
        heading.className = 'finance-panel-heading';
        heading.append(makeText('h2', 'תנועות קבועות'), makeText('span', `${state.recurring.length} כללים`, 'finance-muted'));
        host.appendChild(heading);
        const list = document.createElement('div');
        list.className = 'finance-recurring-items';
        state.recurring.forEach(rule => {
            const row = document.createElement('div');
            row.className = `finance-recurring-item${rule.active === false ? ' inactive' : ''}`;
            const text = document.createElement('div');
            text.append(makeText('strong', rule.description || rule.category), makeText('small', `${labels[rule.type]} · יום ${rule.dueDay} · ${formatMonth(rule.startMonth)}`, 'finance-row-note'));
            const amountText = makeText('strong', formatMoney(rule.amount));
            const controls = document.createElement('div');
            controls.className = 'finance-recurring-actions';
            const toggle = makeButton(rule.active === false ? 'הפעלה' : 'השהיה', rule.active === false ? 'fa-play' : 'fa-pause', () => toggleRecurring(rule.id));
            const remove = makeButton('הסרת כלל', 'fa-trash', () => removeRecurring(rule.id));
            controls.append(toggle, remove);
            row.append(text, amountText, controls);
            list.appendChild(row);
        });
        host.appendChild(list);
    }

    function toggleRecurring(id) {
        const rule = state.recurring.find(item => item.id === id);
        if (!rule) return;
        rule.active = rule.active === false;
        saveState();
        render();
    }

    function removeRecurring(id) {
        const rule = state.recurring.find(item => item.id === id);
        if (!rule || !confirm('הסרת הכלל תעצור יצירת תנועות עתידיות. תנועות שכבר נוצרו יישארו. להמשיך?')) return;
        state.recurring = state.recurring.filter(item => item.id !== id);
        saveState();
        render();
    }

    function removeAccount(id) {
        const account = state.accounts.find(item => item.id === id);
        if (!account || !confirm(`להסיר את החשבון "${account.name}"?`)) return;
        state.accounts = state.accounts.filter(item => item.id !== id);
        saveState();
        render();
    }

    function renderCategories(summary) {
        const host = document.getElementById('finance-category-list');
        host.replaceChildren();
        const entries = Object.entries(summary.categories).filter(([_category, total]) => total > 0).sort((a, b) => b[1] - a[1]);
        const maxValue = Math.max(1, ...entries.map(([_category, total]) => total));
        if (!entries.length) {
            host.appendChild(makeText('p', 'כשתירשם הוצאה, החלוקה לפי קטגוריה תופיע כאן.', 'finance-empty-copy'));
            return;
        }
        entries.slice(0, 6).forEach(([category, total]) => {
            const row = document.createElement('div');
            row.className = 'finance-category-row';
            const label = document.createElement('div');
            label.className = 'finance-budget-row-heading';
            label.append(makeText('span', category), makeText('strong', formatMoney(total)));
            const bar = makeProgress(Math.round(total / maxValue * 100));
            row.append(label, bar);
            host.appendChild(row);
        });
    }

    function renderTransactions(transactions) {
        const body = document.getElementById('finance-transactions-body');
        body.replaceChildren();
        const query = document.getElementById('finance-search').value.trim().toLocaleLowerCase('he');
        const typeFilter = document.getElementById('finance-type-filter').value;
        const categoryFilter = document.getElementById('finance-category-filter').value;
        const accountFilter = document.getElementById('finance-account-filter').value;
        const accounts = new Map(state.accounts.map(account => [account.id, account.name]));
        const filtered = transactions.filter(item => {
            const textMatches = !query || `${item.description} ${item.category}`.toLocaleLowerCase('he').includes(query);
            return textMatches
                && (!typeFilter || item.type === typeFilter)
                && (!categoryFilter || item.category === categoryFilter)
                && (!accountFilter || item.accountId === accountFilter || item.toAccountId === accountFilter);
        }).sort((a, b) => b.date.localeCompare(a.date));

        const filterCategory = document.getElementById('finance-category-filter');
        const oldCategory = filterCategory.value;
        filterCategory.replaceChildren(makeOption('', 'כל הקטגוריות'));
        [...new Set([...getCategories('income'), ...getCategories('expense')])].forEach(category => filterCategory.appendChild(makeOption(category, category)));
        if ([...filterCategory.options].some(option => option.value === oldCategory)) filterCategory.value = oldCategory;
        const filterAccount = document.getElementById('finance-account-filter');
        const oldAccount = filterAccount.value;
        filterAccount.replaceChildren(makeOption('', 'כל החשבונות'));
        state.accounts.forEach(account => filterAccount.appendChild(makeOption(account.id, account.name)));
        if ([...filterAccount.options].some(option => option.value === oldAccount)) filterAccount.value = oldAccount;

        if (!filtered.length) {
            const row = document.createElement('tr');
            const cell = makeText('td', transactions.length ? 'לא נמצאו תנועות לפי הסינון.' : 'אין תנועות בחודש הזה. אפשר להתחיל מהוספת הכנסה או הוצאה.');
            cell.colSpan = 6;
            row.appendChild(cell);
            body.appendChild(row);
            return;
        }

        filtered.forEach(item => {
            const row = document.createElement('tr');
            const date = makeText('td', formatDate(item.date));
            const description = document.createElement('td');
            description.append(makeText('strong', item.description || item.category));
            if (item.installmentCount > 1) description.appendChild(makeText('small', `תשלום ${item.installmentIndex} מתוך ${item.installmentCount}`, 'finance-row-note'));
            if (item.recurringRuleId) description.appendChild(makeText('small', 'תנועה מחזורית', 'finance-row-note'));
            const category = makeText('td', item.type === 'transfer' ? 'העברה פנימית' : item.category);
            const account = makeText('td', item.type === 'transfer'
                ? `${accounts.get(item.accountId) || ''} ← ${accounts.get(item.toAccountId) || ''}`
                : accounts.get(item.accountId) || 'חשבון שהוסר');
            const value = makeText('td', `${item.type === 'income' || item.type === 'refund' ? '+' : item.type === 'expense' ? '−' : ''}${formatMoney(item.amount)}`, `finance-amount ${item.type}`);
            const actions = document.createElement('td');
            actions.className = 'finance-row-actions';
            const edit = makeButton('עריכה', 'fa-pen', () => editTransaction(item.id));
            const remove = makeButton('מחיקה', 'fa-trash', () => deleteTransaction(item.id));
            actions.append(edit, remove);
            row.append(date, description, category, account, value, actions);
            body.appendChild(row);
        });
    }

    function formatDate(value) {
        const [year, month, day] = value.split('-').map(Number);
        return new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(year, month - 1, day));
    }

    function localDateKey(date = new Date()) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function makeText(tag, text, className = '') {
        const element = document.createElement(tag);
        element.textContent = text;
        if (className) element.className = className;
        return element;
    }

    function makeOption(value, label) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
    }

    function makeButton(label, icon, action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'finance-icon-button';
        button.title = label;
        button.setAttribute('aria-label', label);
        const glyph = document.createElement('i');
        glyph.className = `fas ${icon}`;
        button.appendChild(glyph);
        button.addEventListener('click', action);
        return button;
    }

    function showMessage(text) {
        const status = document.getElementById('finance-message');
        status.textContent = text;
        clearTimeout(showMessage.timer);
        showMessage.timer = setTimeout(() => { status.textContent = ''; }, 4500);
    }

    function openTransaction(transaction = null) {
        editingId = transaction?.id || null;
        const form = document.getElementById('finance-transaction-form');
        form.reset();
        document.getElementById('finance-transaction-title').textContent = transaction ? 'עריכת תנועה' : 'תנועה חדשה';
        document.getElementById('finance-transaction-id').value = transaction?.id || '';
        document.getElementById('finance-transaction-type').value = transaction?.type || 'expense';
        document.getElementById('finance-transaction-amount').value = transaction?.amount || '';
        document.getElementById('finance-transaction-date').value = transaction?.date || localDateKey();
        document.getElementById('finance-transaction-description').value = transaction?.description || '';
        document.getElementById('finance-installment-count').value = transaction?.installmentCount || 1;
        document.getElementById('finance-form-error').textContent = '';
        populateAccountSelect(document.getElementById('finance-account-select'), transaction?.accountId || state.accounts[0]?.id || '');
        populateAccountSelect(document.getElementById('finance-transfer-account-select'), transaction?.toAccountId || '', transaction?.accountId || '');
        updateTransactionTypeFields(transaction?.category);
        document.getElementById('finance-transaction-modal').style.display = 'flex';
        document.getElementById('finance-transaction-description').focus();
    }

    function updateTransactionTypeFields(category = '') {
        const type = document.getElementById('finance-transaction-type').value;
        const isTransfer = type === 'transfer';
        document.getElementById('finance-category-group').hidden = isTransfer;
        document.getElementById('finance-transfer-account-group').hidden = !isTransfer;
        document.getElementById('finance-installment-group').hidden = isTransfer || type === 'transfer';
        document.getElementById('finance-account-label').textContent = type === 'income' ? 'אל החשבון' : 'מהחשבון';
        populateCategorySelect(document.getElementById('finance-category-select'), type === 'income' ? 'income' : 'expense', category);
        const source = document.getElementById('finance-account-select').value;
        populateAccountSelect(document.getElementById('finance-transfer-account-select'), '', source);
    }

    function editTransaction(id) {
        const transaction = state.transactions.find(item => item.id === id);
        if (!transaction) return;
        if (transaction.recurringRuleId) {
            showMessage('אפשר לערוך את התנועה החודשית. הכלל החוזר לא ישתנה.');
        }
        openTransaction(transaction);
    }

    function deleteTransaction(id) {
        const transaction = state.transactions.find(item => item.id === id);
        if (!transaction || !confirm('למחוק את התנועה הזו?')) return;
        if (transaction.installmentGroupId) {
            state.transactions = state.transactions.filter(item => item.installmentGroupId !== transaction.installmentGroupId);
        } else {
            state.transactions = state.transactions.filter(item => item.id !== id);
        }
        saveState();
        render();
    }

    function saveTransaction(event) {
        event.preventDefault();
        const type = document.getElementById('finance-transaction-type').value;
        const total = MODEL.amount(document.getElementById('finance-transaction-amount').value);
        const date = document.getElementById('finance-transaction-date').value;
        const accountId = document.getElementById('finance-account-select').value;
        const toAccountId = document.getElementById('finance-transfer-account-select').value;
        const error = document.getElementById('finance-form-error');
        error.textContent = '';

        if (!date || !Number.isFinite(Date.parse(`${date}T12:00:00`))) error.textContent = 'נא לבחור תאריך תקין.';
        else if (total <= 0) error.textContent = 'הסכום צריך להיות גדול מאפס.';
        else if (!accountId) error.textContent = 'יש ליצור חשבון לפני הוספת תנועה.';
        else if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) error.textContent = 'בחר חשבון יעד שונה מחשבון המקור.';
        if (error.textContent) return;

        const prior = editingId ? state.transactions.find(item => item.id === editingId) : null;
        const transaction = {
            id: prior?.id || createId(),
            date,
            type,
            amount: total,
            category: type === 'transfer' ? 'העברה פנימית' : document.getElementById('finance-category-select').value,
            description: document.getElementById('finance-transaction-description').value.trim(),
            accountId,
            ...(type === 'transfer' ? { toAccountId } : {})
        };

        if (prior?.recurringRuleId) transaction.recurringRuleId = prior.recurringRuleId;
        if (prior?.occurrenceMonth) transaction.occurrenceMonth = prior.occurrenceMonth;

        if (prior?.installmentGroupId) {
            const installmentCount = Number(document.getElementById('finance-installment-count').value) || prior.installmentCount;
            state.transactions = state.transactions.filter(item => item.installmentGroupId !== prior.installmentGroupId);
            state.transactions.push(...MODEL.expandInstallments(transaction, installmentCount));
        } else if (prior) {
            state.transactions = state.transactions.map(item => item.id === prior.id ? transaction : item);
        } else {
            const count = type === 'expense' || type === 'income'
                ? Number(document.getElementById('finance-installment-count').value) || 1
                : 1;
            state.transactions.push(...MODEL.expandInstallments(transaction, count));
        }

        saveState();
        closeModal('finance-transaction-modal');
        render();
    }

    function openAccountDialog() {
        document.getElementById('finance-account-form').reset();
        document.getElementById('finance-account-error').textContent = '';
        document.getElementById('finance-account-modal').style.display = 'flex';
        document.getElementById('finance-account-name').focus();
    }

    function saveAccount(event) {
        event.preventDefault();
        const name = document.getElementById('finance-account-name').value.trim();
        const openingBalance = MODEL.amount(document.getElementById('finance-account-opening').value || 0);
        if (!name) {
            document.getElementById('finance-account-error').textContent = 'נא להזין שם לחשבון.';
            return;
        }
        state.accounts.push({
            id: createId(),
            name,
            type: document.getElementById('finance-account-type').value,
            openingBalance
        });
        saveState();
        closeModal('finance-account-modal');
        render();
    }

    function openBudgetDialog() {
        document.getElementById('finance-budget-form').reset();
        document.getElementById('finance-budget-total').value = state.budgets.total || '';
        const host = document.getElementById('finance-budget-fields');
        host.replaceChildren();
        getCategories('expense').forEach(category => {
            const wrapper = document.createElement('div');
            wrapper.className = 'finance-budget-input-row';
            const label = document.createElement('label');
            label.textContent = category;
            const input = document.createElement('input');
            input.className = 'form-control';
            input.type = 'number';
            input.min = '0';
            input.step = '1';
            input.dataset.budgetCategory = category;
            input.value = state.budgets.categories[category] || '';
            wrapper.append(label, input);
            host.appendChild(wrapper);
        });
        document.getElementById('finance-budget-modal').style.display = 'flex';
    }

    function saveBudgets(event) {
        event.preventDefault();
        const categories = {};
        document.querySelectorAll('[data-budget-category]').forEach(input => {
            const value = MODEL.amount(input.value);
            if (value > 0) categories[input.dataset.budgetCategory] = value;
        });
        state.budgets = {
            ...state.budgets,
            total: MODEL.amount(document.getElementById('finance-budget-total').value),
            categories
        };
        saveState();
        closeModal('finance-budget-modal');
        render();
    }

    function addCategory(event) {
        event.preventDefault();
        const kind = document.getElementById('finance-category-kind').value;
        const input = document.getElementById('finance-category-name');
        const name = input.value.trim();
        if (!name || name.length > 40) return;
        const existing = getCategories(kind);
        if (existing.some(category => category.toLocaleLowerCase('he') === name.toLocaleLowerCase('he'))) {
            showMessage('הקטגוריה הזו כבר קיימת.');
            return;
        }
        state.customCategories[kind].push(name);
        input.value = '';
        saveState();
        render();
        showMessage(`הקטגוריה "${name}" נוספה.`);
    }

    function openRecurringDialog() {
        document.getElementById('finance-recurring-form').reset();
        document.getElementById('finance-recurring-start').value = currentMonth();
        document.getElementById('finance-recurring-type').value = 'expense';
        populateAccountSelect(document.getElementById('finance-recurring-account'), state.accounts[0]?.id || '');
        populateCategorySelect(document.getElementById('finance-recurring-category'), 'expense');
        document.getElementById('finance-recurring-modal').style.display = 'flex';
    }

    function saveRecurring(event) {
        event.preventDefault();
        const rule = {
            id: createId(),
            type: document.getElementById('finance-recurring-type').value,
            amount: MODEL.amount(document.getElementById('finance-recurring-amount').value),
            category: document.getElementById('finance-recurring-category').value,
            description: document.getElementById('finance-recurring-description').value.trim(),
            accountId: document.getElementById('finance-recurring-account').value,
            dueDay: Number(document.getElementById('finance-recurring-day').value),
            intervalMonths: Number(document.getElementById('finance-recurring-interval').value),
            startMonth: document.getElementById('finance-recurring-start').value,
            active: true
        };
        if (rule.amount <= 0 || !rule.accountId || !rule.startMonth) {
            document.getElementById('finance-recurring-error').textContent = 'בדוק את הסכום, החשבון ותאריך ההתחלה.';
            return;
        }
        state.recurring.push(rule);
        saveState();
        closeModal('finance-recurring-modal');
        render();
        showMessage('החיוב הקבוע נוסף. התנועה תופיע בחודש המתאים.');
    }

    function exportCsv() {
        const month = currentMonth();
        const columns = ['תאריך', 'סוג', 'תיאור', 'קטגוריה', 'חשבון', 'סכום'];
        const accountNames = new Map(state.accounts.map(account => [account.id, account.name]));
        const rows = state.transactions.filter(item => String(item.date).startsWith(month)).map(item => [
            item.date,
            labels[item.type] || item.type,
            item.description,
            item.category,
            accountNames.get(item.accountId) || '',
            item.amount
        ]);
        const csv = '\uFEFF' + [columns, ...rows].map(row => row.map(MODEL.escapeCsv).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `ultimate-pro-finance-${month}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    function exportBackup() {
        const backup = {
            format: 'ultimate-pro-finance',
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            accounts: state.accounts,
            transactions: state.transactions,
            recurring: state.recurring,
            budgets: state.budgets,
            customCategories: state.customCategories
        };
        const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `ultimate-pro-finance-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    async function importBackup(file) {
        try {
            const backup = JSON.parse(await file.text());
            const validation = MODEL.validateBackup(backup);
            if (!validation.valid) {
                showMessage(validation.error);
                return;
            }
            const approved = confirm(`הגיבוי כולל ${backup.accounts.length} חשבונות ו־${backup.transactions.length} תנועות. שחזור יחליף את נתוני תוכנת הכספים בלבד. להמשיך?`);
            if (!approved) return;
            state = {
                schemaVersion: 1,
                accounts: backup.accounts,
                transactions: backup.transactions,
                recurring: backup.recurring,
                budgets: { total: 0, categories: {}, savingsRate: 10, ...backup.budgets },
                customCategories: backup.customCategories && typeof backup.customCategories === 'object'
                    ? backup.customCategories
                    : { income: [], expense: [] }
            };
            saveState();
            render();
            showMessage('נתוני תוכנת הכספים שוחזרו. נתוני השכר לא שונו.');
        } catch (error) {
            showMessage('קובץ הגיבוי לא תקין או שלא ניתן לקרוא אותו.');
        }
    }

    function closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.style.display = 'none';
    }

    function handleFinanceClick(event) {
        const actionControl = event.target.closest('[data-finance-action]');
        if (!actionControl) return;
        const action = actionControl.dataset.financeAction;
        if (action === 'add') openTransaction();
        if (action === 'account') openAccountDialog();
        if (action === 'budget') openBudgetDialog();
        if (action === 'recurring') openRecurringDialog();
        if (action === 'export') exportCsv();
        if (action === 'backup') exportBackup();
        if (action === 'import') document.getElementById('finance-backup-file')?.click();
        if (action === 'close-transaction') closeModal('finance-transaction-modal');
        if (action === 'close-account') closeModal('finance-account-modal');
        if (action === 'close-budget') closeModal('finance-budget-modal');
        if (action === 'close-recurring') closeModal('finance-recurring-modal');
    }

    function init() {
        const monthInput = document.getElementById('finance-month');
        if (!monthInput) return;
        monthInput.value = MODEL.monthKey();
        document.getElementById('finance-savings-percent').value = String(state.budgets.savingsRate ?? 10);
        const savingsRateInput = document.getElementById('finance-savings-percent');
        savingsRateInput.addEventListener('input', () => {
            const summary = MODEL.calculateMonthSummary(state.transactions, currentMonth(), state.accounts);
            renderSavingsTarget(summary);
        });
        savingsRateInput.addEventListener('change', () => {
            state.budgets.savingsRate = Math.max(0, Math.min(100, Number(savingsRateInput.value) || 0));
            saveState();
            render();
        });
        document.getElementById('finance-add-button').addEventListener('click', () => openTransaction());
        document.getElementById('finance-month').addEventListener('change', render);
        document.getElementById('finance-search').addEventListener('input', render);
        ['finance-type-filter', 'finance-category-filter', 'finance-account-filter'].forEach(id => document.getElementById(id).addEventListener('change', render));
        document.getElementById('finance-transaction-type').addEventListener('change', () => updateTransactionTypeFields());
        document.getElementById('finance-account-select').addEventListener('change', () => updateTransactionTypeFields());
        document.getElementById('finance-recurring-type').addEventListener('change', event => populateCategorySelect(document.getElementById('finance-recurring-category'), event.target.value));
        document.getElementById('finance-transaction-form').addEventListener('submit', saveTransaction);
        document.getElementById('finance-account-form').addEventListener('submit', saveAccount);
        document.getElementById('finance-budget-form').addEventListener('submit', saveBudgets);
        document.getElementById('finance-recurring-form').addEventListener('submit', saveRecurring);
        document.getElementById('finance-category-form').addEventListener('submit', addCategory);
        document.getElementById('finance-screen').addEventListener('click', handleFinanceClick);
        document.getElementById('finance-backup-file').addEventListener('change', event => {
            if (event.target.files?.[0]) importBackup(event.target.files[0]);
            event.target.value = '';
        });
        stateReady.then(() => {
            if (document.getElementById('finance-screen')?.classList.contains('active')) render();
        });
    }

    root.PersonalApps = root.PersonalApps || {};
    root.PersonalApps.financeApp = Object.freeze({ open, close, render, getHomeSummary, getAnalystData, syncSalaryIncome, init });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
}(window));