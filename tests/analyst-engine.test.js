const assert = require('node:assert/strict');
const SmartAnalyst = require('../src/renderer/shared/analystEngine');

const report = SmartAnalyst.analyze({
    now: new Date(2026, 8, 20, 12),
    employmentMode: 'freelance',
    netMultiplier: 0.88,
    savingsRate: 10,
    accountBalance: 2500,
    shifts: [
        { date: '2026-09-02', hours: 8, gross: 500 },
        { date: '2026-09-08', hours: 8, gross: 600 },
        { date: '2026-09-15', hours: 8, gross: 700 }
    ],
    calendarEvents: [{ date: '2026-09-25', title: 'משמרת ערב' }],
    transactions: [
        { date: '2026-01-02', amount: 125000, type: 'income', category: 'עסק' },
        { date: '2026-09-10', amount: 1000, type: 'income', category: 'משכורת', source: 'salary-sync' },
        { date: '2026-06-01', amount: 200, type: 'expense', category: 'מזון' },
        { date: '2026-08-01', amount: 300, type: 'expense', category: 'מזון' },
        { date: '2026-09-12', amount: 900, type: 'expense', category: 'שונות' }
    ],
    recurring: [{ type: 'expense', amount: 250, dueDay: 29, startMonth: '2026-01', intervalMonths: 1 }]
});

assert.equal(report.summary.shifts, 3);
assert.equal(report.summary.plannedDays, 1);
assert.equal(report.summary.plannedGross, 600);
assert.equal(report.summary.monthlyForecast, 2400);
assert.equal(report.summary.trueNetHourly, 66);
assert.ok(report.insights.some(item => item.title.includes('תקרת עוסק')));
assert.ok(report.insights.some(item => item.title.includes('סנכרון שכר')));
assert.ok(report.insights.some(item => item.title.includes('מזון')));
assert.ok(report.insights.some(item => item.title.includes('מחיר ההוצאה')));
assert.ok(report.summary.cashflowForecast < 3100);

const scenario = report.whatIf({ addExpense: 500, cancelShifts: 1 });
assert.equal(scenario.monthlyForecast, 1800);
assert.ok(scenario.saved < report.summary.saved);

const empty = SmartAnalyst.analyze({ now: new Date(2026, 8, 20), shifts: [], transactions: [] });
assert.equal(empty.summary.trueNetHourly, 0);
assert.ok(empty.insights.some(item => item.text.includes('לפחות 3 משמרות')));
assert.equal(SmartAnalyst.DEFAULT_EXEMPT_CAP, 120000);
assert.equal(SmartAnalyst.normalize({ transactions: [{ date: '2026-02-30', amount: 10 }] }).transactions.length, 0);

console.log('Smart analyst engine tests passed.');
