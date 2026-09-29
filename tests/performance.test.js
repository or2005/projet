const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const finance = require('../src/renderer/apps/finance/finance-model.js');
const SmartAnalyst = require('../src/renderer/shared/analystEngine.js');
const AppUtils = require('../utils.js');

function measureMedian(task, warmups = 2, samples = 9) {
    const timings = [];
    for (let index = 0; index < warmups + samples; index += 1) {
        const start = performance.now();
        task();
        if (index >= warmups) timings.push(performance.now() - start);
    }
    timings.sort((left, right) => left - right);
    return timings[Math.floor(timings.length / 2)];
}

const accounts = Array.from({ length: 30 }, (_unused, index) => ({
    id: `account-${index}`,
    openingBalance: 1000
}));
const transactions = Array.from({ length: 10000 }, (_unused, index) => ({
    id: `transaction-${index}`,
    date: `2026-09-${String(index % 30 + 1).padStart(2, '0')}`,
    type: ['income', 'expense', 'refund', 'transfer'][index % 4],
    amount: index % 100 + 1,
    accountId: `account-${index % accounts.length}`,
    toAccountId: `account-${(index + 1) % accounts.length}`,
    category: `category-${index % 12}`
}));
const shifts = Array.from({ length: 3000 }, (_unused, index) => ({
    date: `2026-09-${String(index % 30 + 1).padStart(2, '0')}`,
    hours: 8,
    gross: 400
}));

const financeMs = measureMedian(() => finance.calculateMonthSummary(transactions, '2026-09', accounts));
const analystMs = measureMedian(() => SmartAnalyst.analyze({
    now: new Date(2026, 8, 29),
    shifts,
    transactions: transactions.slice(0, 3000)
}));
const overtimeMs = measureMedian(() => {
    for (let index = 0; index < 10000; index += 1) {
        AppUtils.OvertimeCalculator.calculateFullShift('09:00', '17:30', 30, 50, 'regular');
    }
});

console.log(`Finance summary (10k transactions, 30 accounts): ${financeMs.toFixed(2)} ms`);
console.log(`Smart analyst (3k transactions and shifts): ${analystMs.toFixed(2)} ms`);
console.log(`Overtime calculations (10k shifts): ${overtimeMs.toFixed(2)} ms`);

assert.ok(financeMs < 100, 'Finance summary exceeded the 100 ms performance budget.');
assert.ok(analystMs < 75, 'Smart analyst exceeded the 75 ms performance budget.');
assert.ok(overtimeMs < 150, 'Overtime calculations exceeded the 150 ms performance budget.');

console.log('Performance checks passed.');
