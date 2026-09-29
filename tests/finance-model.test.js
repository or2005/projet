const assert = require('node:assert/strict');
const finance = require('../src/renderer/apps/finance/finance-model.js');

assert.equal(finance.dateInMonth('2026-02', 31), '2026-02-28');
assert.equal(finance.shiftMonth('2026-01', -1), '2025-12');

const installments = finance.expandInstallments({
    id: 'purchase', date: '2026-01-31', type: 'expense', amount: 100, accountId: 'card', category: 'קניות'
}, 3, (() => { let nextId = 0; return () => `id-${nextId++}`; })());
assert.deepEqual(installments.map(item => item.date), ['2026-01-31', '2026-02-28', '2026-03-31']);
assert.equal(installments.reduce((sum, item) => sum + item.amount, 0), 100);
assert.equal(installments[0].amount, 33.33);
assert.equal(installments[2].amount, 33.34);

const recurringRule = {
    id: 'rent', type: 'expense', amount: 4000, category: 'דיור וחשבונות',
    accountId: 'bank', dueDay: 31, startMonth: '2026-01', intervalMonths: 1
};
assert.equal(finance.createRecurringOccurrence(recurringRule, '2026-02').date, '2026-02-28');
assert.equal(finance.getRecurringOccurrences([recurringRule], [], '2026-02').length, 1);
assert.equal(finance.getRecurringOccurrences([recurringRule], [{ recurringRuleId: 'rent', occurrenceMonth: '2026-02' }], '2026-02').length, 0);

const transactions = [
    { id: 'salary', date: '2026-01-01', type: 'income', amount: 10000, accountId: 'bank', category: 'משכורת' },
    { id: 'food', date: '2026-01-02', type: 'expense', amount: 1500, accountId: 'card', category: 'מזון וקניות' },
    { id: 'refund', date: '2026-01-03', type: 'refund', amount: 200, accountId: 'card', category: 'מזון וקניות' },
    { id: 'transfer', date: '2026-01-04', type: 'transfer', amount: 1000, accountId: 'bank', toAccountId: 'cash' },
    { id: 'old', date: '2025-12-30', type: 'expense', amount: 500, accountId: 'bank', category: 'מזון וקניות' }
];
const summary = finance.calculateMonthSummary(transactions, '2026-01', [
    { id: 'bank', openingBalance: 0 }, { id: 'card', openingBalance: 0 }, { id: 'cash', openingBalance: 0 }
]);
assert.equal(summary.totals.income, 10000);
assert.equal(summary.totals.expenses, 1500);
assert.equal(summary.totals.refunds, 200);
assert.equal(summary.totals.netExpenses, 1300);
assert.equal(summary.totals.remaining, 8700);
assert.equal(summary.accountBalances.find(item => item.id === 'bank').balance, 8500);
assert.equal(summary.accountBalances.find(item => item.id === 'cash').balance, 1000);
assert.equal(summary.previousTotals.expenses, 500);
assert.equal(summary.categories['מזון וקניות'], 1300);

assert.deepEqual(finance.budgetStatus(1000, 1200), { limit: 1000, spent: 1200, remaining: -200, percent: 120, exceeded: true });
assert.deepEqual(finance.calculateSavingsGoal(10000, 7500, 20), {
    rate: 20, target: 2000, saved: 2500, remaining: 0, progress: 100
});
assert.deepEqual(finance.calculateSavingsGoal(5000, 6000, 10), {
    rate: 10, target: 500, saved: 0, remaining: 500, progress: 0
});
assert.equal(finance.calculateSavingsGoal(5000, 1000, 200).rate, 100);
assert.equal(finance.escapeCsv('Coffee, "large"'), '"Coffee, ""large"""');
const backup = {
    format: 'ultimate-pro-finance', schemaVersion: 1,
    accounts: [{ id: 'bank', name: 'בנק', type: 'checking', openingBalance: 0 }],
    transactions: [{ id: 'income', date: '2026-01-01', type: 'income', amount: 100, accountId: 'bank' }],
    recurring: [], budgets: { total: 0, categories: {} }
};
assert.equal(finance.validateBackup(backup).valid, true);
assert.equal(finance.validateBackup({ ...backup, transactions: [{ ...backup.transactions[0], amount: -2 }] }).valid, false);
assert.equal(finance.validateBackup({ ...backup, transactions: [{ ...backup.transactions[0], date: '2026-02-30' }] }).valid, false);
assert.equal(finance.validateBackup({ ...backup, transactions: [{ ...backup.transactions[0], accountId: 'missing' }] }).valid, false);
assert.equal(finance.validateBackup({ ...backup, format: 'other' }).valid, false);

console.log('Finance model tests passed.');