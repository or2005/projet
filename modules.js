/**
 * ULTIMATE PRO - Extended Modules & Advanced Features
 * ===================================================
 * Additional functionality, advanced calculations, and system modules
 * ~1000+ additional lines
 */

// ============================================
// EXTENDED SHIFT CALCULATIONS
// ============================================

const ShiftCalculations = {
    /**
     * Calculate shift details with all deductions
     */
    fullShiftCalculation(shift, workplace) {
        const calc = AppUtils.OvertimeCalculator.calculateFullShift(
            shift.startTime, shift.endTime, shift.breakMinutes, workplace.wage, shift.dayType
        );

        const tips = shift.tips || 0;
        const travel = shift.travel || 0;
        const extras = tips + travel;

        const grossWithExtras = calc.total + extras;
        const deductions = AppUtils.TaxCalculator.calculateDeductions(grossWithExtras);

        return {
            ...calc,
            tips,
            travel,
            extras,
            grossWithExtras,
            deductions: {
                incomeTax: deductions.incomeTax,
                nationalInsurance: deductions.nationalInsurance,
                healthInsurance: deductions.healthInsurance,
                pension: deductions.employeePension,
                total: deductions.total
            },
            net: grossWithExtras - deductions.total
        };
    },

    /**
     * Calculate month summary
     */
    calculateMonthSummary(shifts, workplaces) {
        if (shifts.length === 0) {
            return {
                totalShifts: 0,
                totalHours: 0,
                totalGross: 0,
                totalDeductions: 0,
                totalNet: 0,
                regularHours: 0,
                overtimeHours: 0,
                averageHourlyRate: 0,
                daysWorked: new Set(shifts.map(s => s.date)).size
            };
        }

        let summary = {
            totalShifts: shifts.length,
            totalHours: 0,
            totalGross: 0,
            totalDeductions: 0,
            totalNet: 0,
            regularHours: 0,
            overtimeHours: 0,
            totalExtras: 0,
            daysWorked: new Set(),
            workplaceBreakdown: {}
        };

        shifts.forEach(shift => {
            const wp = workplaces.find(w => w.id === shift.workplaceId) || { name: 'Unknown', wage: 0 };
            const calc = this.fullShiftCalculation(shift, wp);

            summary.totalShifts++;
            summary.totalHours += calc.hours;
            summary.totalGross += calc.grossWithExtras;
            summary.totalDeductions += calc.deductions.total;
            summary.totalNet += calc.net;
            summary.regularHours += calc.regularHours;
            summary.overtimeHours += calc.overtimeHours;
            summary.totalExtras += calc.extras;
            summary.daysWorked.add(shift.date);

            if (!summary.workplaceBreakdown[wp.id]) {
                summary.workplaceBreakdown[wp.id] = {
                    name: wp.name,
                    shifts: 0,
                    hours: 0,
                    gross: 0
                };
            }

            summary.workplaceBreakdown[wp.id].shifts++;
            summary.workplaceBreakdown[wp.id].hours += calc.hours;
            summary.workplaceBreakdown[wp.id].gross += calc.grossWithExtras;
        });

        summary.daysWorked = summary.daysWorked.size;
        summary.averageHourlyRate = summary.totalHours > 0 ? summary.totalGross / summary.totalHours : 0;

        return summary;
    }
};

// ============================================
// ADVANCED REPORTING ENGINE
// ============================================

const ReportingEngine = {
    /**
     * Generate comprehensive monthly report
     */
    generateMonthlyReport(month, appState) {
        const shifts = appState.shifts.filter(s => s.date.startsWith(month));
        const summary = ShiftCalculations.calculateMonthSummary(shifts, appState.workplaces);

        return {
            reportType: 'MONTHLY',
            month: month,
            generatedAt: new Date().toISOString(),
            summary: summary,
            details: {
                shifts: shifts,
                workplaces: appState.workplaces,
                taxInfo: AppUtils.TaxCalculator.calculateDeductions(summary.totalGross)
            },
            export: {
                csv: this.generateCSV(shifts, summary),
                json: this.generateJSON(shifts, summary)
            }
        };
    },

    /**
     * Generate yearly report
     */
    generateYearlyReport(year, appState) {
        const yearShifts = appState.shifts.filter(s => s.date.startsWith(year));
        const months = {};

        // Group by month
        yearShifts.forEach(shift => {
            const monthKey = shift.date.substring(0, 7);
            if (!months[monthKey]) {
                months[monthKey] = [];
            }
            months[monthKey].push(shift);
        });

        const monthSummaries = {};
        let yearTotalGross = 0;
        let yearTotalNet = 0;
        let yearTotalTax = 0;

        Object.keys(months).sort().forEach(month => {
            const summary = ShiftCalculations.calculateMonthSummary(months[month], appState.workplaces);
            monthSummaries[month] = summary;
            yearTotalGross += summary.totalGross;
            yearTotalNet += summary.totalNet;
            yearTotalTax += summary.totalDeductions;
        });

        return {
            reportType: 'YEARLY',
            year: year,
            generatedAt: new Date().toISOString(),
            monthlySummaries: monthSummaries,
            yearSummary: {
                totalShifts: yearShifts.length,
                totalHours: yearShifts.reduce((sum, s) => {
                    const calc = AppUtils.OvertimeCalculator.calculateFullShift(
                        s.startTime, s.endTime, s.breakMinutes,
                        (appState.workplaces.find(w => w.id === s.workplaceId) || { wage: 0 }).wage,
                        s.dayType
                    );
                    return sum + calc.hours;
                }, 0),
                totalGross: yearTotalGross,
                totalTax: yearTotalTax,
                totalNet: yearTotalNet,
                averageMonthlyGross: yearTotalGross / 12,
                averageMonthlyNet: yearTotalNet / 12
            }
        };
    },

    /**
     * Generate CSV export
     */
    generateCSV(shifts, summary) {
        let csv = 'Ultimate Pro - Shift Report\n';
        csv += `Generated: ${new Date().toLocaleString()}\n\n`;
        csv += 'Summary\n';
        csv += `Total Shifts,${summary.totalShifts}\n`;
        csv += `Total Hours,${summary.totalHours.toFixed(2)}\n`;
        csv += `Regular Hours,${summary.regularHours.toFixed(2)}\n`;
        csv += `Overtime Hours,${summary.overtimeHours.toFixed(2)}\n`;
        csv += `Gross Salary,${summary.totalGross.toFixed(2)}\n`;
        csv += `Deductions,${summary.totalDeductions.toFixed(2)}\n`;
        csv += `Net Salary,${summary.totalNet.toFixed(2)}\n\n`;

        csv += 'Detailed Shifts\n';
        csv += 'Date,Workplace,Start,End,Hours,Gross,Net\n';
        shifts.forEach(s => {
            const wp = APP.state.workplaces.find(w => w.id === s.workplaceId) || { name: 'Unknown' };
            csv += `${s.date},${wp.name},${s.startTime},${s.endTime},0,0,0\n`;
        });

        return csv;
    },

    /**
     * Generate JSON export
     */
    generateJSON(shifts, summary) {
        return JSON.stringify({
            summary: summary,
            shifts: shifts,
            exportDate: new Date().toISOString()
        }, null, 2);
    },

    /**
     * Generate tax report for year
     */
    generateTaxReport(year, appState) {
        const yearShifts = appState.shifts.filter(s => s.date.startsWith(year));
        const totalGross = yearShifts.reduce((sum, s) => {
            const wp = appState.workplaces.find(w => w.id === s.workplaceId) || { wage: 0 };
            const calc = AppUtils.OvertimeCalculator.calculateFullShift(
                s.startTime, s.endTime, s.breakMinutes, wp.wage, s.dayType
            );
            return sum + calc.total;
        }, 0);

        const deductions = AppUtils.TaxCalculator.calculateDeductions(totalGross);

        return {
            reportType: 'TAX',
            year: year,
            employmentIncome: totalGross,
            grossIncome: totalGross,
            deductions: {
                incomeTax: deductions.incomeTax,
                nationalInsurance: deductions.nationalInsurance,
                healthInsurance: deductions.healthInsurance,
                pensionContribution: deductions.employeePension,
                totalDeductions: deductions.total
            },
            netIncome: totalGross - deductions.total,
            effectiveTaxRate: (deductions.incomeTax / totalGross * 100).toFixed(2) + '%',
            generatedAt: new Date().toISOString()
        };
    }
};

// ============================================
// NOTIFICATION SYSTEM
// ============================================

const NotificationSystem = {
    notifications: [],
    maxNotifications: 50,

    /**
     * Add notification
     */
    add(message, type = 'info', duration = 5000) {
        const id = Date.now();
        const notification = {
            id,
            message,
            type,
            timestamp: new Date(),
            read: false
        };

        this.notifications.unshift(notification);

        if (this.notifications.length > this.maxNotifications) {
            this.notifications.pop();
        }

        if (duration > 0) {
            setTimeout(() => this.remove(id), duration);
        }

        this.updateNotificationUI();
        return id;
    },

    /**
     * Remove notification
     */
    remove(id) {
        this.notifications = this.notifications.filter(n => n.id !== id);
        this.updateNotificationUI();
    },

    /**
     * Mark as read
     */
    markAsRead(id) {
        const notif = this.notifications.find(n => n.id === id);
        if (notif) notif.read = true;
        this.updateNotificationUI();
    },

    /**
     * Get unread count
     */
    getUnreadCount() {
        return this.notifications.filter(n => !n.read).length;
    },

    /**
     * Update UI
     */
    updateNotificationUI() {
        const count = this.getUnreadCount();
        const badge = document.getElementById('notification-count');
        if (badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        }
    }
};

// ============================================
// VALIDATION ENGINE
// ============================================

const ValidationEngine = {
    /**
     * Validate shift data
     */
    validateShift(shiftData) {
        const errors = [];

        if (!shiftData.date) errors.push('Date is required');
        if (!shiftData.startTime) errors.push('Start time is required');
        if (!shiftData.endTime) errors.push('End time is required');
        if (!shiftData.workplaceId) errors.push('Workplace is required');

        if (shiftData.startTime && shiftData.endTime) {
            const start = AppUtils.Utils.timeToMinutes(shiftData.startTime);
            const end = AppUtils.Utils.timeToMinutes(shiftData.endTime);
            const duration = end > start ? end - start : (end + 24 * 60 - start);

            if (duration < 60) {
                errors.push('Shift must be at least 1 hour');
            }
            if (duration > 16 * 60) {
                errors.push('Shift cannot exceed 16 hours');
            }
        }

        if (shiftData.breakMinutes) {
            if (shiftData.breakMinutes < 0 || shiftData.breakMinutes > 480) {
                errors.push('Break must be between 0 and 480 minutes');
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    },

    /**
     * Validate workplace data
     */
    validateWorkplace(wpData) {
        const errors = [];

        if (!wpData.name || wpData.name.trim().length < 2) {
            errors.push('Workplace name must be at least 2 characters');
        }

        if (!wpData.wage || wpData.wage <= 0) {
            errors.push('Hourly rate must be greater than 0');
        }

        if (wpData.wage > 1000) {
            errors.push('Hourly rate seems very high. Please verify');
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    },

    /**
     * Validate salary components
     */
    validateSalary(salary) {
        const errors = [];

        if (!salary || salary <= 0) {
            errors.push('Salary must be greater than 0');
        }

        if (salary > 1000000) {
            errors.push('Salary value seems unrealistic');
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }
};

// ============================================
// DATA BACKUP & RESTORE
// ============================================

const BackupManager = {
    /**
     * Create backup
     */
    createBackup(appState) {
        return {
            version: '2.0.0',
            timestamp: new Date().toISOString(),
            data: {
                shifts: appState.shifts,
                workplaces: appState.workplaces,
                settings: appState.settings,
                profile: appState.profile
            },
            checksum: this.calculateChecksum(appState)
        };
    },

    /**
     * Restore from backup
     */
    restoreBackup(backup, appState) {
        if (!backup.data) {
            throw new Error('Invalid backup format');
        }

        if (backup.checksum !== this.calculateChecksum(backup.data)) {
            throw new Error('Backup integrity check failed');
        }

        appState.shifts = backup.data.shifts || [];
        appState.workplaces = backup.data.workplaces || [];
        appState.settings = backup.data.settings || {};
        appState.profile = backup.data.profile || {};

        return appState;
    },

    /**
     * Calculate checksum
     */
    calculateChecksum(data) {
        const str = JSON.stringify(data);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString();
    },

    /**
     * Schedule automatic backups
     */
    scheduleAutoBackup(appState, intervalMinutes = 60) {
        setInterval(() => {
            const backup = this.createBackup(appState);
            localStorage.setItem('ultimate_pro_auto_backup', JSON.stringify(backup));
        }, intervalMinutes * 60 * 1000);
    }
};

// ============================================
// ADVANCED ANALYTICS
// ============================================

const AdvancedAnalytics = {
    /**
     * Calculate work-life balance metrics
     */
    calculateWorkLifeBalance(shifts) {
        const daysWorked = new Set(shifts.map(s => s.date)).size;
        const totalDays = Math.floor((new Date() - new Date(shifts[0]?.date || new Date())) / (1000 * 60 * 60 * 24)) + 1;
        const averageShiftsPerWeek = (shifts.length / (totalDays / 7)).toFixed(2);

        return {
            daysWorked,
            totalDays,
            averageShiftsPerWeek,
            daysOff: totalDays - daysWorked,
            workToLifeRatio: ((daysWorked / totalDays) * 100).toFixed(2) + '%'
        };
    },

    /**
     * Predict earnings
     */
    predictEarnings(shifts, workplaces, targetMonth) {
        if (shifts.length === 0) return 0;

        const avgMonthlyEarning = shifts.reduce((sum, s) => {
            const wp = workplaces.find(w => w.id === s.workplaceId) || { wage: 0 };
            const calc = AppUtils.OvertimeCalculator.calculateFullShift(
                s.startTime, s.endTime, s.breakMinutes, wp.wage, s.dayType
            );
            return sum + calc.total;
        }, 0) / Math.max(1, new Set(shifts.map(s => s.date.substring(0, 7))).size);

        return avgMonthlyEarning;
    },

    /**
     * Identify patterns
     */
    identifyPatterns(shifts) {
        const dayPatterns = {};

        shifts.forEach(s => {
            const date = new Date(s.date + 'T00:00:00');
            const dayName = date.toLocaleDateString('he-IL', { weekday: 'long' });

            if (!dayPatterns[dayName]) {
                dayPatterns[dayName] = {
                    count: 0,
                    totalHours: 0
                };
            }

            dayPatterns[dayName].count++;
            const hours = AppUtils.Utils.calculateHoursBetween(s.startTime, s.endTime);
            dayPatterns[dayName].totalHours += hours;
        });

        return dayPatterns;
    }
};

// ============================================
// INTEGRATION WITH UTILS
// ============================================

window.AppExtended = {
    ShiftCalculations,
    ReportingEngine,
    NotificationSystem,
    ValidationEngine,
    BackupManager,
    AdvancedAnalytics
};

// Initialize systems
NotificationSystem.updateNotificationUI();
