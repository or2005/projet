/**
 * Ultimate Pro 2.1 — pay calculator regression tests
 * Run: npm test
 */
const path = require('path');
const {
    OvertimeCalculator,
    TaxCalculator,
    SeveranceCalculator
} = require(path.join(__dirname, '..', 'utils.js'));

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (cond) {
        passed++;
        console.log('  OK  ', msg);
    } else {
        failed++;
        console.error(' FAIL ', msg);
    }
}

function almost(a, b, eps = 0.02) {
    return Math.abs(a - b) <= eps;
}

console.log('\nOvertimeCalculator');
{
    const r = OvertimeCalculator.calculateFullShift('08:00', '18:00', 0, 40, 'regular');
    // 10h: 8 regular + 2 OT@125%
    assert(almost(r.hours, 10), '10 net hours');
    assert(almost(r.regularHours, 8), '8 regular hours');
    assert(almost(r.overtime125Hours, 2), '2 hours at 125%');
    assert(almost(r.overtime150Hours, 0), '0 hours at 150%');
    assert(almost(r.baseEarn, 8 * 40), 'base = 8*40');
    assert(almost(r.overtimeEarn, 2 * 40 * 1.25), 'OT earn = 2*40*1.25');
}

{
    const r = OvertimeCalculator.calculateFullShift('08:00', '20:00', 0, 50, 'regular');
    // 12h: 8 + 2@125 + 2@150
    assert(almost(r.overtime125Hours, 2), '12h shift: 2h @125%');
    assert(almost(r.overtime150Hours, 2), '12h shift: 2h @150%');
    assert(almost(r.overtimeEarn, 2 * 50 * 1.25 + 2 * 50 * 1.5), 'OT pay split 125/150');
}

{
    const r = OvertimeCalculator.calculateFullShift('08:00', '16:00', 0, 40, 'saturday');
    assert(almost(r.total, 8 * 40 * 1.5), 'Saturday all hours @150%');
}

console.log('\nTaxCalculator (monthly)');
{
    const d = TaxCalculator.calculateDeductions(10000, 6, 2.25);
    assert(d.incomeTax >= 0, 'income tax non-negative');
    assert(d.taxCredits === 2.25 * TaxCalculator.CREDIT_POINT_VALUE, 'credit points valued correctly');
    assert(d.nationalInsurance < 10000 * 0.07, 'NI not flat 7% on all');
    assert(d.employeePension === 600, 'pension 6% of 10000');
}

{
    const monthly = TaxCalculator.calculateNetSalary(12000, 6, 2.25, 'monthly');
    const annual = TaxCalculator.calculateNetSalary(12000 * 12, 6, 2.25, 'annual');
    assert(almost(annual.net, monthly.net * 12, 1), 'annual ≈ 12 × monthly');
}

console.log('\nSeveranceCalculator');
{
    assert(almost(SeveranceCalculator.calculateSeverance(10000, 3), 30000), 'severance = salary × years');
    assert(SeveranceCalculator.calculateVacationDays(3) === 16, 'vacation years 1-5 = 16');
    assert(SeveranceCalculator.calculateVacationDays(6) === 18, 'vacation year 6 = 18');
    assert(SeveranceCalculator.calculateRecuperationDays(1) === 5, 'havraa year 1 = 5');
    assert(SeveranceCalculator.calculateRecuperationDays(12) === 8, 'havraa years 11-15 = 8');
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
