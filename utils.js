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
     * Israeli tax brackets 2026
     */
    TAX_BRACKETS: [
        { from: 0, to: 6330, rate: 0.10 },
        { from: 6330, to: 9080, rate: 0.14 },
        { from: 9080, to: 15240, rate: 0.20 },
        { from: 15240, to: 27420, rate: 0.31 },
        { from: 27420, to: 43200, rate: 0.35 },
        { from: 43200, Infinity, rate: 0.49 }
    ],

    TAX_CREDITS: {
        0: 0,
        1: 278,
        2: 556,
        2.25: 625,
        3: 834,
        4: 1112
    },

    /**
     * Calculate progressive tax
     */
    calculateProgressiveTax(grossSalary) {
        let tax = 0;
        let remaining = grossSalary;

        for (let bracket of this.TAX_BRACKETS) {
            if (remaining <= 0) break;
            const bracketSize = bracket.to - bracket.from;
            const taxableInBracket = Math.min(remaining, bracketSize);
            tax += taxableInBracket * bracket.rate;
            remaining -= taxableInBracket;
        }

        return tax;
    },

    /**
     * Calculate total deductions
     */
    calculateDeductions(grossSalary, pensionRate = 6, healthInsurance = 0) {
        const incomeTax = this.calculateProgressiveTax(grossSalary);
        const employeePension = (grossSalary * pensionRate) / 100;
        const nationalInsurance = (grossSalary * 3.45) / 100;
        const healthIns = healthInsurance || (grossSalary * 3.1) / 100;

        return {
            incomeTax,
            employeePension,
            nationalInsurance,
            healthInsurance: healthIns,
            total: incomeTax + employeePension + nationalInsurance + healthIns
        };
    },

    /**
     * Calculate net salary
     */
    calculateNetSalary(grossSalary, pensionRate = 6, credits = 0) {
        const deductions = this.calculateDeductions(grossSalary, pensionRate);
        const creditValue = (credits * this.TAX_CREDITS[2.25]) / 100;
        const adjustedTax = Math.max(0, deductions.incomeTax - creditValue);
        
        return {
            gross: grossSalary,
            totalDeductions: deductions.total - deductions.incomeTax + adjustedTax,
            net: grossSalary - (deductions.total - deductions.incomeTax + adjustedTax),
            breakdown: {
                ...deductions,
                incomeTax: adjustedTax,
                taxCredits: creditValue
            }
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
    projectedPension(monthlyGross, employeeRate = 6, employerRate = 6, yearsWorked = 1) {
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
     * Calculate severance pay
     */
    calculateSeverance(monthlyGross, yearsWorked) {
        let multiplier;

        if (yearsWorked < 1) {
            multiplier = yearsWorked; // Proportional
        } else if (yearsWorked === 1) {
            multiplier = 1;
        } else if (yearsWorked <= 15) {
            multiplier = 1.5;
        } else {
            multiplier = 2;
        }

        return monthlyGross * multiplier;
    },

    /**
     * Calculate vacation days
     */
    calculateVacationDays(yearsWorked) {
        return Math.max(11, Math.min(22, 11 + Math.floor((yearsWorked - 1) / 2)));
    },

    /**
     * Calculate vacation pay
     */
    calculateVacationPay(dailyWage, yearsWorked) {
        const days = this.calculateVacationDays(yearsWorked);
        return dailyWage * days;
    },

    /**
     * Calculate recuperation days (Hbra'ah)
     */
    calculateRecuperation(dailyWage) {
        const days = 5;
        return dailyWage * days;
    },

    /**
     * Calculate compensation details
     */
    fullCompensationDetails(monthlyGross, yearsWorked, workingDaysPerMonth = 22) {
        const dailyWage = monthlyGross / workingDaysPerMonth;
        const severance = this.calculateSeverance(monthlyGross, yearsWorked);
        const vacation = this.calculateVacationPay(dailyWage, yearsWorked);
        const recuperation = this.calculateRecuperation(dailyWage);

        return {
            dailyWage,
            severance,
            vacationDays: this.calculateVacationDays(yearsWorked),
            vacationPay: vacation,
            recuperationDays: 5,
            recuperationPay: recuperation,
            totalCompensation: severance + vacation + recuperation
        };
    }
};

// ============================================
// OVERTIME & HOURS CALCULATIONS
// ============================================

const OvertimeCalculator = {
    /**
     * Calculate overtime pay
     */
    calculateOvertime(regularHours, overtimeHours, hourlyRate, overtimeMultiplier = 1.25) {
        return (overtimeHours * hourlyRate * overtimeMultiplier);
    },

    /**
     * Calculate weekend multiplier
     */
    getWeekendMultiplier(dayOfWeek) {
        // 5 = Friday, 6 = Saturday, 0 = Sunday
        const multipliers = {
            0: 1.3,  // Sunday
            1: 1.0,  // Monday
            2: 1.0,  // Tuesday
            3: 1.0,  // Wednesday
            4: 1.0,  // Thursday
            5: 1.25, // Friday
            6: 1.5   // Saturday
        };
        return multipliers[dayOfWeek] || 1.0;
    },

    /**
     * Calculate holiday multiplier
     */
    getHolidayMultiplier(isHoliday, isWeekend = false) {
        if (isHoliday) return 1.5;
        if (isWeekend) return 1.5;
        return 1.0;
    },

    /**
     * Calculate break deduction
     */
    calculateBreakDeduction(breakMinutes, hourlyRate) {
        const breakHours = breakMinutes / 60;
        return breakHours * hourlyRate;
    },

    /**
     * Full shift calculation
     */
    calculateFullShift(startTime, endTime, breakMinutes, hourlyRate, dayType = 'regular') {
        const hours = Utils.calculateHoursBetween(startTime, endTime);
        const breakHours = breakMinutes / 60;
        const netHours = Math.max(0, hours - breakHours);
        
        const regularHours = Math.min(netHours, 8);
        const overtimeHours = Math.max(0, netHours - 8);

        const multiplier = dayType === 'saturday' ? 1.5 : (dayType === 'friday' ? 1.25 : 1.0);
        
        const baseEarn = regularHours * hourlyRate * multiplier;
        const overtimeEarn = overtimeHours * hourlyRate * 1.25 * multiplier;
        const total = baseEarn + overtimeEarn;

        return {
            hours: netHours,
            regularHours,
            overtimeHours,
            breakMinutes,
            multiplier,
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

window.AppUtils = { Utils, TaxCalculator, PensionCalculator, SeveranceCalculator, OvertimeCalculator, Analytics };
