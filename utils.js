/**
 * ULTIMATE PRO - Employee Shift & Salary Management System
 * ========================================================
 * Advanced JavaScript Utilities & Calculations Module
 * Author: Or Dadshev
 * Version: 2.0.0
 * 
 * This module contains utility functions, advanced calculations,
 * and helper methods for the application.
 */

// ============================================
// UTILITIES & HELPERS
// ============================================

/**
 * Utility functions library
 */
const Utils = {
    /**
     * Format currency with Israeli Shekel
     */
    formatCurrency(amount) {
        return new Intl.NumberFormat('he-IL', {
            style: 'currency',
            currency: 'ILS',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    },

    /**
     * Format date to Hebrew format
     */
    formatDate(date, format = 'DD/MM/YYYY') {
        if (typeof date === 'string') date = new Date(date);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        
        const formats = {
            'DD/MM/YYYY': `${day}/${month}/${year}`,
            'YYYY-MM-DD': `${year}-${month}-${day}`,
            'MMM DD': `${['ינו','פבר','מרץ','אפר','מאי','יונ','יולי','אוג','ספט','אוק','נוב','דצמ'][date.getMonth()]} ${day}`
        };
        
        return formats[format] || formats['DD/MM/YYYY'];
    },

    /**
     * Parse time string to minutes
     */
    timeToMinutes(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    },

    /**
     * Convert minutes to time string
     */
    minutesToTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    },

    /**
     * Calculate hours between two times
     */
    calculateHoursBetween(startTime, endTime) {
        const start = this.timeToMinutes(startTime);
        const end = this.timeToMinutes(endTime);
        let diff = end - start;
        if (diff < 0) diff += 24 * 60;
        return diff / 60;
    },

    /**
     * Generate unique ID
     */
    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    },

    /**
     * Deep clone object
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * Validate email
     */
    validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },

    /**
     * Validate Israeli ID number
     */
    validateIdNumber(id) {
        id = String(id).padStart(9, '0');
        if (!/^\d{9}$/.test(id)) return false;
        
        let checksum = 0;
        for (let i = 0; i < 9; i++) {
            let digit = parseInt(id[i]);
            if (i % 2 === 0) digit *= 2;
            if (digit > 9) digit -= 9;
            checksum += digit;
        }
        return checksum % 10 === 0;
    },

    /**
     * Format percentage
     */
    formatPercent(value, decimals = 2) {
        return `${(value * 100).toFixed(decimals)}%`;
    },

    /**
     * Calculate percentage
     */
    percentage(part, total) {
        return total === 0 ? 0 : (part / total) * 100;
    },

    /**
     * Sort array by property
     */
    sortBy(array, prop, order = 'asc') {
        return [...array].sort((a, b) => {
            const aVal = a[prop];
            const bVal = b[prop];
            return order === 'asc' ? 
                (aVal > bVal ? 1 : -1) : 
                (aVal < bVal ? 1 : -1);
        });
    },

    /**
     * Group array by property
     */
    groupBy(array, prop) {
        return array.reduce((groups, item) => {
            const key = item[prop];
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
            return groups;
        }, {});
    },

    /**
     * Sum array property
     */
    sum(array, prop) {
        return array.reduce((total, item) => total + (prop ? item[prop] : item), 0);
    },

    /**
     * Average of array property
     */
    average(array, prop) {
        return array.length === 0 ? 0 : this.sum(array, prop) / array.length;
    },

    /**
     * Debounce function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Throttle function
     */
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
};

// ============================================
// ADVANCED TAX CALCULATIONS
// ============================================

const TaxCalculator = {
    /**
     * Approximate monthly income-tax brackets (withholding model, 2026).
     * Estimates only — not an official payslip.
     */
    TAX_BRACKETS: [
        { from: 0, to: 6330, rate: 0.10 },
        { from: 6330, to: 9080, rate: 0.14 },
        { from: 9080, to: 15240, rate: 0.20 },
        { from: 15240, to: 27420, rate: 0.31 },
        { from: 27420, to: 43200, rate: 0.35 },
        { from: 43200, Infinity, rate: 0.49 }
    ],

    /** Monthly value of one tax credit point (approx.) */
    CREDIT_POINT_VALUE: 242,

    /** Legacy map kept for UI helpers (points → monthly ₪) */
    TAX_CREDITS: {
        0: 0,
        1: 242,
        2: 484,
        2.25: 544.5,
        3: 726,
        4: 968
    },

    /** National Insurance thresholds (approx. monthly, employed) */
    NI_REDUCED_CEILING: 7522,
    NI_MAX_INSURABLE: 50695,
    NI_RATE_REDUCED: 0.004,
    NI_RATE_FULL: 0.07,
    HEALTH_RATE_REDUCED: 0.031,
    HEALTH_RATE_FULL: 0.05,

    /**
     * Progressive income tax on a monthly gross amount (before credit points).
     */
    calculateProgressiveTax(monthlyGross) {
        let tax = 0;
        let remaining = Math.max(0, Number(monthlyGross) || 0);

        for (const bracket of this.TAX_BRACKETS) {
            if (remaining <= 0) break;
            const bracketSize = bracket.to - bracket.from;
            const taxableInBracket = Math.min(remaining, bracketSize);
            tax += taxableInBracket * bracket.rate;
            remaining -= taxableInBracket;
        }

        return tax;
    },

    calculateNationalInsurance(monthlyGross) {
        const taxable = Math.min(Math.max(0, monthlyGross), this.NI_MAX_INSURABLE);
        if (taxable <= this.NI_REDUCED_CEILING) {
            return taxable * this.NI_RATE_REDUCED;
        }
        return this.NI_REDUCED_CEILING * this.NI_RATE_REDUCED
            + (taxable - this.NI_REDUCED_CEILING) * this.NI_RATE_FULL;
    },

    calculateHealthInsurance(monthlyGross) {
        const taxable = Math.min(Math.max(0, monthlyGross), this.NI_MAX_INSURABLE);
        if (taxable <= this.NI_REDUCED_CEILING) {
            return taxable * this.HEALTH_RATE_REDUCED;
        }
        return this.NI_REDUCED_CEILING * this.HEALTH_RATE_REDUCED
            + (taxable - this.NI_REDUCED_CEILING) * this.HEALTH_RATE_FULL;
    },

    /**
     * Monthly deductions for a monthly gross salary.
     * @param {number} monthlyGross
     * @param {number} pensionRate employee pension %
     * @param {number} creditPoints tax credit points (default resident ~2.25)
     */
    calculateDeductions(monthlyGross, pensionRate = 6, creditPoints = 2.25) {
        const gross = Math.max(0, Number(monthlyGross) || 0);
        const rawTax = this.calculateProgressiveTax(gross);
        const taxCredits = (Number(creditPoints) || 0) * this.CREDIT_POINT_VALUE;
        const incomeTax = Math.max(0, rawTax - taxCredits);
        const employeePension = (gross * (Number(pensionRate) || 0)) / 100;
        const nationalInsurance = this.calculateNationalInsurance(gross);
        const healthInsurance = this.calculateHealthInsurance(gross);
        const total = incomeTax + employeePension + nationalInsurance + healthInsurance;

        return {
            incomeTax,
            incomeTaxBeforeCredits: rawTax,
            taxCredits,
            employeePension,
            nationalInsurance,
            healthInsurance,
            total
        };
    },

    /**
     * Net from monthly gross (default). Pass period: 'annual' for yearly income.
     */
    calculateNetSalary(grossSalary, pensionRate = 6, credits = 2.25, period = 'monthly') {
        const gross = Math.max(0, Number(grossSalary) || 0);

        if (period === 'annual') {
            const monthly = gross / 12;
            const monthlyResult = this.calculateNetSalary(monthly, pensionRate, credits, 'monthly');
            return {
                gross,
                totalDeductions: monthlyResult.totalDeductions * 12,
                net: monthlyResult.net * 12,
                breakdown: {
                    ...monthlyResult.breakdown,
                    incomeTax: monthlyResult.breakdown.incomeTax * 12,
                    incomeTaxBeforeCredits: monthlyResult.breakdown.incomeTaxBeforeCredits * 12,
                    taxCredits: monthlyResult.breakdown.taxCredits * 12,
                    employeePension: monthlyResult.breakdown.employeePension * 12,
                    nationalInsurance: monthlyResult.breakdown.nationalInsurance * 12,
                    healthInsurance: monthlyResult.breakdown.healthInsurance * 12,
                    total: monthlyResult.breakdown.total * 12
                }
            };
        }

        const deductions = this.calculateDeductions(gross, pensionRate, credits);
        return {
            gross,
            totalDeductions: deductions.total,
            net: gross - deductions.total,
            breakdown: { ...deductions }
        };
    }
};

// ============================================
// PENSION CALCULATIONS
// ============================================

const PensionCalculator = {
    /**
     * Calculate pension accumulation
     */
    calculatePensionAccumulation(monthlyContribution, yearsWorked, annualReturn = 0.04) {
        let balance = 0;
        const months = yearsWorked * 12;
        const monthlyReturn = Math.pow(1 + annualReturn, 1/12) - 1;

        for (let i = 0; i < months; i++) {
            balance = (balance + monthlyContribution) * (1 + monthlyReturn);
        }

        return balance;
    },

    /**
     * Calculate pension from accumulated balance
     */
    calculateMonthlyPension(accumulatedBalance, lifeExpectancy = 35 * 12) {
        return accumulatedBalance / lifeExpectancy;
    },

    /**
     * Calculate employer pension contribution
     */
    calculateEmployerPension(grossSalary, employerRate = 6) {
        return (grossSalary * employerRate) / 100;
    },

    /**
     * Full pension projection
     */
    projectedPension(monthlyGross, employeeRate = 6, employerRate = 6.5, yearsWorked = 1) {
        const employeeContribution = (monthlyGross * employeeRate) / 100;
        const employerContribution = (monthlyGross * employerRate) / 100;
        const totalMonthly = employeeContribution + employerContribution;

        const accumulated = this.calculatePensionAccumulation(totalMonthly, yearsWorked);
        const monthlyPension = this.calculateMonthlyPension(accumulated);

        return {
            employeeContribution,
            employerContribution,
            totalMonthly,
            accumulatedBalance: accumulated,
            projectedMonthlyPension: monthlyPension,
            projectedAnnualPension: monthlyPension * 12
        };
    }
};

// ============================================
// SEVERANCE & COMPENSATION CALCULATIONS
// ============================================

const SeveranceCalculator = {
    /**
     * Severance under Israeli Severance Pay Law: ~1 monthly salary per year.
     */
    calculateSeverance(monthlyGross, yearsWorked) {
        const years = Math.max(0, Number(yearsWorked) || 0);
        return Math.max(0, Number(monthlyGross) || 0) * years;
    },

    /**
     * Annual vacation days (approx. 5-day work week, Annual Vacation Law).
     */
    calculateVacationDays(yearsWorked) {
        const years = Math.max(0, Number(yearsWorked) || 0);
        if (years <= 0) return 0;
        if (years < 1) return Math.max(1, Math.ceil(16 * years));
        if (years <= 5) return 16;
        if (years === 6) return 18;
        if (years === 7) return 19;
        if (years === 8) return 20;
        if (years === 9) return 21;
        if (years === 10) return 22;
        return Math.min(28, 22 + Math.floor(years - 10));
    },

    calculateVacationPay(dailyWage, yearsWorked) {
        return dailyWage * this.calculateVacationDays(yearsWorked);
    },

    /**
     * Recuperation (הבראה) days by seniority — common extension-order scale.
     */
    calculateRecuperationDays(yearsWorked) {
        const years = Math.max(0, Number(yearsWorked) || 0);
        if (years < 1) return 0;
        if (years < 2) return 5;
        if (years <= 3) return 6;
        if (years <= 10) return 7;
        if (years <= 15) return 8;
        if (years <= 19) return 9;
        return 10;
    },

    calculateRecuperation(dailyWage, yearsWorked = 1) {
        return dailyWage * this.calculateRecuperationDays(yearsWorked);
    },

    fullCompensationDetails(monthlyGross, yearsWorked, workingDaysPerMonth = 22) {
        const daysPerMonth = workingDaysPerMonth || 22;
        const dailyWage = (Number(monthlyGross) || 0) / daysPerMonth;
        const severance = this.calculateSeverance(monthlyGross, yearsWorked);
        const vacationDays = this.calculateVacationDays(yearsWorked);
        const recuperationDays = this.calculateRecuperationDays(yearsWorked);
        const vacationPay = dailyWage * vacationDays;
        const recuperationPay = dailyWage * recuperationDays;

        return {
            dailyWage,
            severance,
            vacationDays,
            vacationPay,
            recuperationDays,
            recuperationPay,
            totalCompensation: severance + vacationPay + recuperationPay,
            disclaimer: 'אומדן בלבד — לא מחליף ייעוץ משפטי או תלוש רשמי'
        };
    }
};

// ============================================
// OVERTIME & HOURS CALCULATIONS
// ============================================

const OvertimeCalculator = {
    /**
     * Hours of Work and Rest Law (simplified hourly model):
     * - Regular day: first 8h @ 100%, next 2h OT @ 125%, beyond @ 150%
     * - Friday: industry-style 125% on regular hours; OT on base rates
     * - Saturday / holiday: 150% on all hours
     */
    calculateOvertimePay(ot125Hours, ot150Hours, hourlyRate) {
        return ot125Hours * hourlyRate * 1.25 + ot150Hours * hourlyRate * 1.5;
    },

    /** @deprecated use calculateOvertimePay — kept for compatibility */
    calculateOvertime(regularHours, overtimeHours, hourlyRate, overtimeMultiplier = 1.25) {
        return overtimeHours * hourlyRate * overtimeMultiplier;
    },

    getWeekendMultiplier(dayOfWeek) {
        const multipliers = {
            0: 1.0,
            1: 1.0,
            2: 1.0,
            3: 1.0,
            4: 1.0,
            5: 1.25,
            6: 1.5
        };
        return multipliers[dayOfWeek] || 1.0;
    },

    getHolidayMultiplier(isHoliday, isWeekend = false) {
        if (isHoliday) return 1.5;
        if (isWeekend) return 1.5;
        return 1.0;
    },

    calculateBreakDeduction(breakMinutes, hourlyRate) {
        return (breakMinutes / 60) * hourlyRate;
    },

    calculateFullShift(startTime, endTime, breakMinutes, hourlyRate, dayType = 'regular') {
        const rate = Math.max(0, Number(hourlyRate) || 0);
        const hours = Utils.calculateHoursBetween(startTime, endTime);
        const breakHours = (Number(breakMinutes) || 0) / 60;
        const netHours = Math.max(0, hours - breakHours);
        const type = (dayType || 'regular').toLowerCase();

        if (type === 'saturday' || type === 'holiday') {
            const total = netHours * rate * 1.5;
            return {
                hours: netHours,
                regularHours: netHours,
                overtimeHours: 0,
                overtime125Hours: 0,
                overtime150Hours: 0,
                breakMinutes: Number(breakMinutes) || 0,
                multiplier: 1.5,
                baseEarn: total,
                overtimeEarn: 0,
                total
            };
        }

        const fridayMult = type === 'friday' ? 1.25 : 1.0;
        const regularHours = Math.min(netHours, 8);
        const overtimeTotal = Math.max(0, netHours - 8);
        const overtime125Hours = Math.min(overtimeTotal, 2);
        const overtime150Hours = Math.max(0, overtimeTotal - 2);

        const baseEarn = regularHours * rate * fridayMult;
        const overtimeEarn = overtime125Hours * rate * 1.25 + overtime150Hours * rate * 1.5;
        const total = baseEarn + overtimeEarn;

        return {
            hours: netHours,
            regularHours,
            overtimeHours: overtimeTotal,
            overtime125Hours,
            overtime150Hours,
            breakMinutes: Number(breakMinutes) || 0,
            multiplier: fridayMult,
            baseEarn,
            overtimeEarn,
            total
        };
    }
};

// ============================================
// STATISTICAL CALCULATIONS
// ============================================

const Analytics = {
    /**
     * Calculate average salary
     */
    averageSalary(shifts, workplaces) {
        if (shifts.length === 0) return 0;
        const total = shifts.reduce((sum, shift) => {
            const wp = workplaces.find(w => w.id === shift.workplaceId) || { wage: 0 };
            const calc = OvertimeCalculator.calculateFullShift(
                shift.startTime, shift.endTime, shift.breakMinutes, wp.wage, shift.dayType
            );
            return sum + calc.total;
        }, 0);
        return total / shifts.length;
    },

    /**
     * Calculate salary trends
     */
    getSalaryTrends(shifts, workplaces, months = 3) {
        const grouped = Utils.groupBy(shifts, 'date');
        const trends = {};

        Object.keys(grouped).forEach(date => {
            const monthKey = date.substring(0, 7); // YYYY-MM
            if (!trends[monthKey]) trends[monthKey] = 0;
            
            grouped[date].forEach(shift => {
                const wp = workplaces.find(w => w.id === shift.workplaceId) || { wage: 0 };
                const calc = OvertimeCalculator.calculateFullShift(
                    shift.startTime, shift.endTime, shift.breakMinutes, wp.wage, shift.dayType
                );
                trends[monthKey] += calc.total;
            });
        });

        return trends;
    },

    /**
     * Calculate hourly statistics
     */
    getHourlyStats(shifts, workplaces) {
        if (shifts.length === 0) {
            return { totalHours: 0, avgHours: 0, maxHours: 0, minHours: 0 };
        }

        const hours = shifts.map(shift => {
            return Utils.calculateHoursBetween(shift.startTime, shift.endTime) - (shift.breakMinutes / 60);
        });

        return {
            totalHours: Utils.sum(hours),
            avgHours: Utils.average(hours),
            maxHours: Math.max(...hours),
            minHours: Math.min(...hours),
            variance: this.calculateVariance(hours)
        };
    },

    /**
     * Calculate variance
     */
    calculateVariance(values) {
        const mean = Utils.average(values);
        const squareDiffs = values.map(v => Math.pow(v - mean, 2));
        return Utils.average(squareDiffs);
    },

    /**
     * Calculate standard deviation
     */
    standardDeviation(values) {
        return Math.sqrt(this.calculateVariance(values));
    },

    /**
     * Predict next month salary
     */
    predictNextMonth(shifts, workplaces, currentMonth) {
        const monthTrends = this.getSalaryTrends(shifts, workplaces);
        const months = Object.keys(monthTrends).sort();
        
        if (months.length < 2) return monthTrends[months[0]] || 0;

        const last3Months = months.slice(-3).map(m => monthTrends[m]);
        const avgGrowth = (last3Months[last3Months.length - 1] - last3Months[0]) / (last3Months.length - 1);
        
        return Math.max(0, last3Months[last3Months.length - 1] + avgGrowth);
    }
};

// ============================================
// EXPORT
// ============================================

const AppUtilsExport = { Utils, TaxCalculator, PensionCalculator, SeveranceCalculator, OvertimeCalculator, Analytics };

if (typeof window !== 'undefined') {
    window.AppUtils = AppUtilsExport;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppUtilsExport;
}
