/**
 * ULTIMATE PRO - Main Application Script
 * ========================================
 * Professional Employee Management System
 * Version: 2.0.0
 * Author: Or Dadshev
 */

// ============================================
// APP STATE & CONFIG
// ============================================

const APP = {
    config: {
        password: '327806279',
        storageKey: 'ultimate_pro_v2_data',
        maxStorage: 20 * 1024 * 1024,
        defaultPension: 6,
        defaultTravel: 25,
        workingDaysPerMonth: 22,
        regualrHoursPerDay: 8
    },

    state: {
        currentUser: null,
        theme: localStorage.getItem('ultimate_pro_theme') || 'dark',
        workplaces: [
            { id: 1, name: 'Default Workplace', wage: 45 }
        ],
        shifts: [],
        settings: {
            pension: 6,
            travel: 25,
            workplaces: []
        },
        profile: {
            name: '',
            email: '',
            phone: ''
        }
    },

    charts: {}
};

// ============================================
// INITIALIZATION
// ============================================

window.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    loadAppState();
    applyTheme();
    setCurrentMonth();
    attachEventListeners();
    
    document.getElementById('login-screen').classList.add('active');
    document.getElementById('main-screen').classList.remove('active');
}

function loadAppState() {
    const saved = localStorage.getItem(APP.config.storageKey);
    if (saved) {
        try {
            const data = JSON.parse(saved);
            APP.state = { ...APP.state, ...data };
        } catch (e) {
            console.error('Error loading state:', e);
        }
    }
}

function saveAppState() {
    try {
        const dataStr = JSON.stringify(APP.state);
        const size = new Blob([dataStr]).size;
        
        if (size > APP.config.maxStorage) {
            showNotification('Data size too large. Please delete old shifts.', 'warning');
            return false;
        }
        
        localStorage.setItem(APP.config.storageKey, dataStr);
        return true;
    } catch (e) {
        console.error('Error saving state:', e);
        return false;
    }
}

function attachEventListeners() {
    document.getElementById('id-number').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeShiftModal();
            closeWorkplaceModal();
        }
    });

    document.getElementById('filter-month').addEventListener('change', renderDashboard);
}

function setCurrentMonth() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    document.getElementById('filter-month').value = `${year}-${month}`;
}

// ============================================
// AUTHENTICATION
// ============================================

function handleLogin() {
    const input = document.getElementById('id-number').value.trim();
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';

    if (!input) {
        errorEl.textContent = 'Please enter your ID or employee code';
        return;
    }

    if (input.length < 2) {
        errorEl.textContent = 'ID must be at least 2 characters';
        return;
    }

    if (input !== APP.config.password && input.length < 9) {
        errorEl.textContent = 'Invalid ID number';
        return;
    }

    APP.state.currentUser = input;
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('main-screen').classList.add('active');
    document.getElementById('user-name').textContent = input.substring(0, 4) + '****';
    document.getElementById('dashboard-user-name').textContent = input.substring(0, 4) + '****';
    
    initializeApp();
    renderDashboard();
    populateWorkplaceSelects();
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        APP.state.currentUser = null;
        document.getElementById('id-number').value = '';
        document.getElementById('main-screen').classList.remove('active');
        document.getElementById('login-screen').classList.add('active');
    }
}

// ============================================
// NAVIGATION & TAB MANAGEMENT
// ============================================

function switchTab(tabName, event) {
    if (event) {
        event.preventDefault();
    }

    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(t => t.classList.remove('active'));
    
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.tab === tabName) {
            item.classList.add('active');
        }
    });

    const tab = document.getElementById(`tab-${tabName}`);
    if (tab) {
        tab.classList.add('active');

        if (tabName === 'dashboard') {
            setTimeout(renderDashboard, 0);
        } else if (tabName === 'analytics') {
            setTimeout(renderAnalytics, 0);
        } else if (tabName === 'payroll') {
            setTimeout(() => switchPayrollTab('audit'), 0);
        }
    }
}

function switchAnalyticsTab(section) {
    const sections = document.querySelectorAll('.analytics-section');
    sections.forEach(s => s.classList.remove('active'));
    
    const buttons = document.querySelectorAll('#tab-analytics .tab-btn');
    buttons.forEach(b => b.classList.remove('active'));
    
    event.currentTarget.classList.add('active');
    document.getElementById(`analytics-${section}`).classList.add('active');
    
    setTimeout(() => {
        if (section === 'trends') renderTrendsChart();
        if (section === 'comparison') renderComparison();
    }, 0);
}

function switchPayrollTab(section) {
    const sections = document.querySelectorAll('.payroll-section');
    sections.forEach(s => s.classList.remove('active'));
    
    const buttons = document.querySelectorAll('#tab-payroll .tab-btn');
    buttons.forEach(b => b.classList.remove('active'));
    
    if (event) event.currentTarget.classList.add('active');
    document.getElementById(`payroll-${section}`).classList.add('active');
}

function switchInsuranceTab(section) {
    const sections = document.querySelectorAll('.insurance-section');
    sections.forEach(s => s.classList.remove('active'));
    
    const buttons = document.querySelectorAll('#tab-insurance .tab-btn');
    buttons.forEach(b => b.classList.remove('active'));
    
    if (event) event.currentTarget.classList.add('active');
    document.getElementById(`insurance-${section}`).classList.add('active');
}

// ============================================
// UI UTILITIES
// ============================================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
}

function toggleTheme() {
    const body = document.body;
    const isDark = body.classList.contains('dark-mode');
    
    if (isDark) {
        body.classList.remove('dark-mode');
        body.classList.add('light-mode');
        APP.state.theme = 'light';
        document.getElementById('theme-icon').className = 'fas fa-sun';
    } else {
        body.classList.remove('light-mode');
        body.classList.add('dark-mode');
        APP.state.theme = 'dark';
        document.getElementById('theme-icon').className = 'fas fa-moon';
    }
    
    localStorage.setItem('ultimate_pro_theme', APP.state.theme);
    saveAppState();
}

function applyTheme() {
    const body = document.body;
    if (APP.state.theme === 'light') {
        body.classList.remove('dark-mode');
        body.classList.add('light-mode');
        document.getElementById('theme-icon').className = 'fas fa-sun';
    } else {
        body.classList.add('dark-mode');
        body.classList.remove('light-mode');
        document.getElementById('theme-icon').className = 'fas fa-moon';
    }
}

function setTheme(theme) {
    const body = document.body;
    if (theme === 'light') {
        body.classList.remove('dark-mode');
        body.classList.add('light-mode');
        APP.state.theme = 'light';
    } else if (theme === 'dark') {
        body.classList.remove('light-mode');
        body.classList.add('dark-mode');
        APP.state.theme = 'dark';
    }
    localStorage.setItem('ultimate_pro_theme', APP.state.theme);
}

function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
}

function toggleUserMenu() {
    const menu = document.getElementById('user-menu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function toggleFAQ(element) {
    const answer = element.nextElementSibling;
    const icon = element.querySelector('i');
    
    answer.style.display = answer.style.display === 'none' ? 'block' : 'none';
    icon.classList.toggle('fa-chevron-down');
    icon.classList.toggle('fa-chevron-up');
}

// ============================================
// DASHBOARD
// ============================================

function renderDashboard() {
    const monthFilter = document.getElementById('filter-month').value;
    const shifts = filterShiftsByMonth(monthFilter);
    
    if (shifts.length === 0) {
        document.getElementById('shifts-tbody').innerHTML = '<tr><td colspan="8">No shifts recorded. Click "Add Shift" to get started.</td></tr>';
        updateKPIs(0, 0, 0, 0);
        return;
    }

    let totalHours = 0;
    let totalGross = 0;
    let totalOvertime = 0;
    const rows = [];

    shifts.forEach(shift => {
        const workplace = APP.state.workplaces.find(w => w.id === shift.workplaceId) || { name: 'Unknown', wage: 0 };
        const calc = AppUtils.OvertimeCalculator.calculateFullShift(
            shift.startTime, shift.endTime, shift.breakMinutes, workplace.wage, shift.dayType
        );

        totalHours += calc.hours;
        totalGross += calc.total;
        totalOvertime += calc.overtimeHours;

        const row = `
            <tr>
                <td>${shift.date}</td>
                <td>${workplace.name}</td>
                <td>${shift.startTime} - ${shift.endTime}</td>
                <td>${calc.hours.toFixed(2)}</td>
                <td>₪${calc.baseEarn.toFixed(2)}</td>
                <td>₪${calc.overtimeEarn.toFixed(2)}</td>
                <td><strong>₪${calc.total.toFixed(2)}</strong></td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="editShift(${shift.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="deleteShift(${shift.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
        rows.push(row);
    });

    document.getElementById('shifts-tbody').innerHTML = rows.join('');
    updateKPIs(totalHours, totalGross, totalOvertime, calculateNetSalary(totalGross));
    
    renderCharts(shifts);
}

function filterShiftsByMonth(month) {
    if (!month) return APP.state.shifts;
    return APP.state.shifts.filter(s => s.date.startsWith(month));
}

function updateKPIs(hours, gross, overtime, net) {
    document.getElementById('kpi-hours').textContent = hours.toFixed(2);
    document.getElementById('kpi-gross').textContent = `₪${gross.toFixed(0)}`;
    document.getElementById('kpi-net').textContent = `₪${net.toFixed(0)}`;
    document.getElementById('kpi-overtime').textContent = overtime.toFixed(2);
}

function calculateNetSalary(gross) {
    const deductions = AppUtils.TaxCalculator.calculateDeductions(gross, APP.state.settings.pension);
    return gross - deductions.total;
}

function renderCharts(shifts) {
    const monthFilter = document.getElementById('filter-month').value;
    const last6Months = getLast6Months();
    const salaryByMonth = {};
    const hoursByMonth = {};

    last6Months.forEach(month => {
        salaryByMonth[month] = 0;
        hoursByMonth[month] = 0;
    });

    shifts.forEach(shift => {
        const month = shift.date.substring(0, 7);
        if (month in salaryByMonth) {
            const wp = APP.state.workplaces.find(w => w.id === shift.workplaceId) || { wage: 0 };
            const calc = AppUtils.OvertimeCalculator.calculateFullShift(
                shift.startTime, shift.endTime, shift.breakMinutes, wp.wage, shift.dayType
            );
            salaryByMonth[month] += calc.total;
            hoursByMonth[month] += calc.hours;
        }
    });

    createSalaryChart(last6Months, salaryByMonth);
    createHoursChart(last6Months, hoursByMonth);
}

function getLast6Months() {
    const months = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        months.push(month);
    }
    
    return months;
}

function createSalaryChart(labels, data) {
    const ctx = document.getElementById('salaryChart');
    if (!ctx) return;

    if (APP.charts.salary) {
        APP.charts.salary.destroy();
    }

    APP.charts.salary = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(m => new Date(m + '-01').toLocaleDateString('he-IL', { year: '2-digit', month: 'short' })),
            datasets: [{
                label: 'Monthly Salary (₪)',
                data: labels.map(m => data[m] || 0),
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4,
                fill: true,
                pointRadius: 6,
                pointBackgroundColor: '#3b82f6',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: true, position: 'top' }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Salary (₪)' }
                }
            }
        }
    });
}

function createHoursChart(labels, data) {
    const ctx = document.getElementById('hoursChart');
    if (!ctx) return;

    if (APP.charts.hours) {
        APP.charts.hours.destroy();
    }

    APP.charts.hours = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.map(m => new Date(m + '-01').toLocaleDateString('he-IL', { year: '2-digit', month: 'short' })),
            datasets: [{
                label: 'Hours Worked',
                data: labels.map(m => data[m] || 0),
                backgroundColor: [
                    '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899'
                ],
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: true }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Hours' }
                }
            }
        }
    });
}

// ============================================
// ANALYTICS
// ============================================

function renderAnalytics() {
    const shifts = APP.state.shifts;
    
    if (shifts.length === 0) {
        showNotification('No data to analyze yet. Add some shifts first.', 'info');
        return;
    }

    const stats = AppUtils.Analytics.getHourlyStats(shifts, APP.state.workplaces);
    
    document.getElementById('stat-avg-daily').textContent = (stats.totalHours / Math.max(1, shifts.length)).toFixed(2);
    document.getElementById('stat-avg-rate').textContent = `₪${(shifts.reduce((sum, s) => {
        const wp = APP.state.workplaces.find(w => w.id === s.workplaceId) || { wage: 0 };
        return sum + wp.wage;
    }, 0) / shifts.length).toFixed(2)}`;
    
    document.getElementById('stat-total-ot').textContent = shifts.reduce((sum, s) => {
        const calc = AppUtils.OvertimeCalculator.calculateFullShift(
            s.startTime, s.endTime, s.breakMinutes, 
            (APP.state.workplaces.find(w => w.id === s.workplaceId) || { wage: 0 }).wage,
            s.dayType
        );
        return sum + calc.overtimeHours;
    }, 0).toFixed(2) + 'h';
    
    document.getElementById('stat-workplace-count').textContent = APP.state.workplaces.length;
}

function renderTrendsChart() {
    const trends = AppUtils.Analytics.getSalaryTrends(APP.state.shifts, APP.state.workplaces);
    const months = Object.keys(trends).sort().slice(-12);
    
    const ctx = document.getElementById('trendsChart');
    if (!ctx) return;

    if (APP.charts.trends) {
        APP.charts.trends.destroy();
    }

    APP.charts.trends = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months.map(m => new Date(m + '-01').toLocaleDateString('he-IL', { year: 'numeric', month: 'long' })),
            datasets: [{
                label: 'Monthly Salary',
                data: months.map(m => trends[m] || 0),
                borderColor: '#22c55e',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Salary (₪)' }
                }
            }
        }
    });
}

function renderComparison() {
    const trends = AppUtils.Analytics.getSalaryTrends(APP.state.shifts, APP.state.workplaces);
    const months = Object.keys(trends).sort().slice(-6);
    
    const rows = months.map((m, i) => {
        const current = trends[m] || 0;
        const previous = i > 0 ? (trends[months[i-1]] || 0) : current;
        const change = ((current - previous) / previous * 100).toFixed(1);
        const arrow = change >= 0 ? '📈' : '📉';
        
        return `
            <tr>
                <td>${m}</td>
                <td>${current.toFixed(2)}</td>
                <td>₪${current.toFixed(0)}</td>
                <td><span class="${change >= 0 ? 'text-success' : 'text-danger'}">${arrow} ${change}%</span></td>
            </tr>
        `;
    }).join('');

    document.getElementById('comparison-tbody').innerHTML = rows;
}

// ============================================
// PAYROLL
// ============================================

function auditPayslip() {
    const auditHours = Number(document.getElementById('audit-hours').value);
    const auditGross = Number(document.getElementById('audit-gross').value);

    if (!auditHours || !auditGross) {
        showNotification('Please enter both hours and salary', 'warning');
        return;
    }

    const month = document.getElementById('filter-month').value;
    const shifts = filterShiftsByMonth(month);
    
    let systemHours = 0;
    let systemGross = 0;

    shifts.forEach(s => {
        const wp = APP.state.workplaces.find(w => w.id === s.workplaceId) || { wage: 0 };
        const calc = AppUtils.OvertimeCalculator.calculateFullShift(
            s.startTime, s.endTime, s.breakMinutes, wp.wage, s.dayType
        );
        systemHours += calc.hours;
        systemGross += calc.total;
    });

    const hourDiff = Math.abs(auditHours - systemHours);
    const grossDiff = Math.abs(auditGross - systemGross);

    let html = `<h4><i class="fas fa-check-double"></i> Audit Results</h4><hr>`;
    
    if (hourDiff < 1) {
        html += `<p style="color: #22c55e;"><i class="fas fa-check"></i> Hours match!</p>`;
    } else {
        html += `<p style="color: #ef4444;"><i class="fas fa-warning"></i> Hours difference: ${hourDiff.toFixed(2)}</p>`;
    }

    if (grossDiff < 100) {
        html += `<p style="color: #22c55e;"><i class="fas fa-check"></i> Salary verified!</p>`;
    } else {
        html += `<p style="color: #ef4444;"><i class="fas fa-warning"></i> Salary difference: ₪${grossDiff.toFixed(2)}</p>`;
    }

    document.getElementById('audit-results').innerHTML = html;
}

function calculateSalaryComponents() {
    const gross = Number(document.getElementById('calc-gross').value);
    const pension = Number(document.getElementById('calc-pension').value);

    const result = AppUtils.TaxCalculator.calculateNetSalary(gross, pension);
    
    const breakdown = `
        <h4>Salary Breakdown</h4>
        <div class="breakdown-item">
            <span>Gross Salary:</span>
            <strong>₪${result.gross.toFixed(2)}</strong>
        </div>
        <div class="breakdown-item">
            <span>Income Tax:</span>
            <strong>₪${result.breakdown.incomeTax.toFixed(2)}</strong>
        </div>
        <div class="breakdown-item">
            <span>National Insurance (3.45%):</span>
            <strong>₪${result.breakdown.nationalInsurance.toFixed(2)}</strong>
        </div>
        <div class="breakdown-item">
            <span>Health Insurance (3.1%):</span>
            <strong>₪${result.breakdown.healthInsurance.toFixed(2)}</strong>
        </div>
        <div class="breakdown-item">
            <span>Pension Contribution (${pension}%):</span>
            <strong>₪${result.breakdown.employeePension.toFixed(2)}</strong>
        </div>
        <hr style="border-color: var(--border); margin: 12px 0;">
        <div class="breakdown-item" style="font-size: 1.1em; font-weight: bold;">
            <span>Net Salary:</span>
            <strong style="color: var(--success);">₪${result.net.toFixed(2)}</strong>
        </div>
    `;

    document.getElementById('calc-breakdown').innerHTML = breakdown;
}

// ============================================
// TAX PLANNING
// ============================================

function calculateTaxBenefit() {
    const credits = Number(document.getElementById('tax-credits').value);
    const value = credits * 278;
    
    const html = `
        <div class="result-detail">
            <p><strong>Tax Credits:</strong> ${credits}</p>
            <p><strong>Monthly Benefit:</strong> ₪${value.toFixed(2)}</p>
            <p><strong>Annual Benefit:</strong> ₪${(value * 12).toFixed(2)}</p>
        </div>
    `;
    
    document.getElementById('tax-credits-result').innerHTML = html;
}

function calculateTaxes() {
    const income = Number(document.getElementById('tax-income').value);
    const result = AppUtils.TaxCalculator.calculateNetSalary(income, 6);
    
    const html = `
        <div class="result-detail">
            <p><strong>Annual Income:</strong> ₪${income.toFixed(2)}</p>
            <p><strong>Income Tax:</strong> ₪${result.breakdown.incomeTax.toFixed(2)}</p>
            <p><strong>Total Deductions:</strong> ₪${result.breakdown.total.toFixed(2)}</p>
            <p><strong>Annual Net:</strong> ₪${result.net.toFixed(2)}</p>
            <p><strong>Monthly Net:</strong> ₪${(result.net / 12).toFixed(2)}</p>
        </div>
    `;
    
    document.getElementById('tax-calculation-result').innerHTML = html;
}

// ============================================
// PENSION CALCULATIONS
// ============================================

function calculatePensionProjection() {
    const salary = Number(document.getElementById('pension-salary').value);
    const rate = Number(document.getElementById('pension-employee').value);
    const years = Number(document.getElementById('pension-years').value);

    const result = AppUtils.PensionCalculator.projectedPension(salary, rate, 6, years);

    const html = `
        <div class="result-detail">
            <p><strong>Employee Contribution (Monthly):</strong> ₪${result.employeeContribution.toFixed(2)}</p>
            <p><strong>Employer Contribution (Monthly):</strong> ₪${result.employerContribution.toFixed(2)}</p>
            <p><strong>Total Monthly Contribution:</strong> ₪${result.totalMonthly.toFixed(2)}</p>
            <p><strong>Accumulated Balance:</strong> ₪${result.accumulatedBalance.toFixed(2)}</p>
            <p><strong>Projected Monthly Pension:</strong> ₪${result.projectedMonthlyPension.toFixed(2)}</p>
            <p><strong>Projected Annual Pension:</strong> ₪${result.projectedAnnualPension.toFixed(2)}</p>
        </div>
    `;

    document.getElementById('pension-result').innerHTML = html;
}

// ============================================
// INSURANCE CALCULATIONS
// ============================================

function calculateHealthInsurance() {
    const salary = Number(document.getElementById('health-salary').value);
    const premium = (salary * 3.1) / 100;

    const html = `
        <div class="result-detail">
            <p><strong>Monthly Salary:</strong> ₪${salary.toFixed(2)}</p>
            <p><strong>Health Insurance Premium (3.1%):</strong> ₪${premium.toFixed(2)}</p>
            <p><strong>Annual Premium:</strong> ₪${(premium * 12).toFixed(2)}</p>
        </div>
    `;

    document.getElementById('health-result').innerHTML = html;
}

// ============================================
// COMPENSATION CALCULATIONS
// ============================================

function calculateCompensation() {
    const salary = Number(document.getElementById('comp-salary').value);
    const years = Number(document.getElementById('comp-years').value);
    const workdays = Number(document.getElementById('comp-workdays').value);

    const result = AppUtils.SeveranceCalculator.fullCompensationDetails(salary, years, workdays);

    const html = `
        <h4>Compensation Package Details</h4>
        <div class="result-detail">
            <p><strong>Daily Wage:</strong> ₪${result.dailyWage.toFixed(2)}</p>
            <p><strong>Years of Service:</strong> ${years}</p>
            <hr>
            <p><strong>Severance Pay:</strong> ₪${result.severance.toFixed(2)}</p>
            <p><strong>Vacation Days:</strong> ${result.vacationDays} days</p>
            <p><strong>Vacation Pay:</strong> ₪${result.vacationPay.toFixed(2)}</p>
            <p><strong>Recuperation Days:</strong> ${result.recuperationDays} days</p>
            <p><strong>Recuperation Pay:</strong> ₪${result.recuperationPay.toFixed(2)}</p>
            <hr>
            <p style="font-size: 1.1em;"><strong>TOTAL COMPENSATION:</strong> <span style="color: var(--success); font-size: 1.2em;">₪${result.totalCompensation.toFixed(2)}</span></p>
        </div>
    `;

    document.getElementById('comp-results').innerHTML = html;
}

// ============================================
// SHIFTS MANAGEMENT
// ============================================

function populateWorkplaceSelects() {
    const select = document.getElementById('shift-workplace');
    select.innerHTML = '';
    
    APP.state.workplaces.forEach(wp => {
        const opt = document.createElement('option');
        opt.value = wp.id;
        opt.textContent = `${wp.name} (₪${wp.wage}/hour)`;
        select.appendChild(opt);
    });
}

function openShiftModal(shiftId = null) {
    const modal = document.getElementById('shift-modal');
    modal.style.display = 'flex';
    document.getElementById('shift-date').value = new Date().toISOString().split('T')[0];

    if (shiftId) {
        const shift = APP.state.shifts.find(s => s.id === shiftId);
        if (shift) {
            document.getElementById('shift-modal-title').textContent = 'Edit Shift';
            document.getElementById('shift-id').value = shift.id;
            document.getElementById('shift-workplace').value = shift.workplaceId;
            document.getElementById('shift-date').value = shift.date;
            document.getElementById('shift-start').value = shift.startTime;
            document.getElementById('shift-end').value = shift.endTime;
            document.getElementById('shift-break').value = shift.breakMinutes;
            document.getElementById('shift-daytype').value = shift.dayType;
            document.getElementById('shift-tips').value = shift.tips;
            document.getElementById('shift-travel').value = shift.travel;
            document.getElementById('shift-notes').value = shift.notes || '';
        }
    } else {
        document.getElementById('shift-modal-title').textContent = 'Add Shift';
        document.getElementById('shift-form').reset();
        document.getElementById('shift-id').value = '';
    }
}

function closeShiftModal() {
    document.getElementById('shift-modal').style.display = 'none';
}

function saveShift(event) {
    event.preventDefault();

    const id = document.getElementById('shift-id').value || Date.now();
    const shiftData = {
        id,
        workplaceId: Number(document.getElementById('shift-workplace').value),
        date: document.getElementById('shift-date').value,
        startTime: document.getElementById('shift-start').value,
        endTime: document.getElementById('shift-end').value,
        breakMinutes: Number(document.getElementById('shift-break').value) || 0,
        dayType: document.getElementById('shift-daytype').value || 'regular',
        tips: Number(document.getElementById('shift-tips').value) || 0,
        travel: Number(document.getElementById('shift-travel').value) || 0,
        notes: document.getElementById('shift-notes').value || ''
    };

    const existingIndex = APP.state.shifts.findIndex(s => s.id == id);
    if (existingIndex >= 0) {
        APP.state.shifts[existingIndex] = shiftData;
    } else {
        APP.state.shifts.push(shiftData);
    }

    saveAppState();
    closeShiftModal();
    renderDashboard();
    showNotification('Shift saved successfully', 'success');
}

function editShift(id) {
    openShiftModal(id);
}

function deleteShift(id) {
    if (confirm('Are you sure you want to delete this shift?')) {
        APP.state.shifts = APP.state.shifts.filter(s => s.id !== id);
        saveAppState();
        renderDashboard();
        showNotification('Shift deleted', 'success');
    }
}

// ============================================
// WORKPLACES MANAGEMENT
// ============================================

function openWorkplaceModal(wpId = null) {
    const modal = document.getElementById('workplace-modal');
    modal.style.display = 'flex';

    if (wpId) {
        const wp = APP.state.workplaces.find(w => w.id === wpId);
        if (wp) {
            document.getElementById('workplace-modal-title').textContent = 'Edit Workplace';
            document.getElementById('workplace-id').value = wp.id;
            document.getElementById('workplace-name').value = wp.name;
            document.getElementById('workplace-rate').value = wp.wage;
        }
    } else {
        document.getElementById('workplace-modal-title').textContent = 'Add Workplace';
        document.getElementById('workplace-form').reset();
        document.getElementById('workplace-id').value = '';
    }
}

function closeWorkplaceModal() {
    document.getElementById('workplace-modal').style.display = 'none';
}

function saveWorkplace(event) {
    event.preventDefault();

    const id = Number(document.getElementById('workplace-id').value) || Date.now();
    const name = document.getElementById('workplace-name').value.trim();
    const rate = Number(document.getElementById('workplace-rate').value);

    if (!name || rate <= 0) {
        showNotification('Invalid workplace data', 'error');
        return;
    }

    const wpIndex = APP.state.workplaces.findIndex(w => w.id === id);
    if (wpIndex >= 0) {
        APP.state.workplaces[wpIndex] = { id, name, wage: rate };
    } else {
        APP.state.workplaces.push({ id, name, wage: rate });
    }

    saveAppState();
    closeWorkplaceModal();
    populateWorkplaceSelects();
    renderWorkplacesList();
    showNotification('Workplace saved successfully', 'success');
}

function deleteWorkplace(id) {
    if (APP.state.workplaces.length <= 1) {
        showNotification('Must keep at least one workplace', 'warning');
        return;
    }
    
    if (confirm('Delete this workplace?')) {
        APP.state.workplaces = APP.state.workplaces.filter(w => w.id !== id);
        saveAppState();
        populateWorkplaceSelects();
        renderWorkplacesList();
        showNotification('Workplace deleted', 'success');
    }
}

// ============================================
// EXTENDED REPORTING ENGINE
// ============================================

function generateMonthlyReport() {
    const month = document.getElementById('filter-month').value;
    const shifts = filterShiftsByMonth(month);
    
    if (shifts.length === 0) {
        showNotification('No shifts for selected month', 'warning');
        return;
    }

    const report = AppExtended.ReportingEngine.generateMonthlyReport(month, APP.state);
    displayMonthlyReportPreview(report);
}

function displayMonthlyReportPreview(report) {
    const summary = report.summary;
    const html = `
        <div class="report-preview">
            <h3>Monthly Report - ${report.month}</h3>
            <div class="report-stats">
                <div class="stat-item">
                    <span>Total Shifts:</span>
                    <strong>${summary.totalShifts}</strong>
                </div>
                <div class="stat-item">
                    <span>Total Hours:</span>
                    <strong>${summary.totalHours.toFixed(2)}</strong>
                </div>
                <div class="stat-item">
                    <span>Gross Salary:</span>
                    <strong>₪${summary.totalGross.toFixed(2)}</strong>
                </div>
                <div class="stat-item">
                    <span>Net Salary:</span>
                    <strong>₪${summary.totalNet.toFixed(2)}</strong>
                </div>
                <div class="stat-item">
                    <span>Deductions:</span>
                    <strong>₪${summary.totalDeductions.toFixed(2)}</strong>
                </div>
            </div>
        </div>
    `;
    
    showNotification('Report generated successfully', 'success');
}

function generateYearlyReport() {
    const year = new Date().getFullYear();
    const report = AppExtended.ReportingEngine.generateYearlyReport(year.toString(), APP.state);
    
    if (report.yearSummary.totalShifts === 0) {
        showNotification('No shifts recorded for this year', 'warning');
        return;
    }

    const summary = report.yearSummary;
    const html = `
        <div class="report-preview">
            <h3>Yearly Report - ${year}</h3>
            <div class="report-stats">
                <div class="stat-item">
                    <span>Total Shifts:</span>
                    <strong>${summary.totalShifts}</strong>
                </div>
                <div class="stat-item">
                    <span>Total Hours:</span>
                    <strong>${summary.totalHours.toFixed(2)}</strong>
                </div>
                <div class="stat-item">
                    <span>Gross Income:</span>
                    <strong>₪${summary.totalGross.toFixed(2)}</strong>
                </div>
                <div class="stat-item">
                    <span>Total Tax:</span>
                    <strong>₪${summary.totalTax.toFixed(2)}</strong>
                </div>
                <div class="stat-item">
                    <span>Net Income:</span>
                    <strong>₪${summary.totalNet.toFixed(2)}</strong>
                </div>
                <div class="stat-item">
                    <span>Avg Monthly Gross:</span>
                    <strong>₪${summary.averageMonthlyGross.toFixed(2)}</strong>
                </div>
            </div>
        </div>
    `;
    
    showNotification('Yearly report generated', 'success');
}

function generateTaxReport() {
    const year = Number(document.getElementById('tax-report-year').value) || new Date().getFullYear();
    const report = AppExtended.ReportingEngine.generateTaxReport(year.toString(), APP.state);
    
    const html = `
        <div class="report-preview">
            <h3>Tax Report - ${year}</h3>
            <div class="result-detail">
                <p><strong>Employment Income:</strong> ₪${report.employmentIncome.toFixed(2)}</p>
                <p><strong>Gross Income:</strong> ₪${report.grossIncome.toFixed(2)}</p>
                <p><strong>Income Tax:</strong> ₪${report.deductions.incomeTax.toFixed(2)}</p>
                <p><strong>National Insurance:</strong> ₪${report.deductions.nationalInsurance.toFixed(2)}</p>
                <p><strong>Health Insurance:</strong> ₪${report.deductions.healthInsurance.toFixed(2)}</p>
                <p><strong>Pension Contribution:</strong> ₪${report.deductions.pensionContribution.toFixed(2)}</p>
                <p><strong>Total Deductions:</strong> ₪${report.deductions.totalDeductions.toFixed(2)}</p>
                <p><strong>Net Income:</strong> ₪${report.netIncome.toFixed(2)}</p>
                <p><strong>Effective Tax Rate:</strong> ${report.effectiveTaxRate}</p>
            </div>
        </div>
    `;
    
    showNotification('Tax report generated', 'success');
}

// ============================================
// ADVANCED EXPORT OPTIONS
// ============================================

function exportDataJSON() {
    try {
        const backup = AppExtended.BackupManager.createBackup(APP.state);
        const dataStr = JSON.stringify(backup, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        downloadFile(dataBlob, `ultimate_pro_backup_${new Date().toISOString().split('T')[0]}.json`);
        showNotification('Data exported as JSON backup', 'success');
    } catch (e) {
        showNotification('Error exporting data: ' + e.message, 'danger');
    }
}

function exportDataCSV() {
    try {
        const csv = AppExtended.ReportingEngine.generateCSV(APP.state.shifts, 
            AppExtended.ShiftCalculations.calculateMonthSummary(APP.state.shifts, APP.state.workplaces)
        );
        const csvBlob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        downloadFile(csvBlob, `ultimate_pro_shifts_${new Date().toISOString().split('T')[0]}.csv`);
        showNotification('Data exported as CSV', 'success');
    } catch (e) {
        showNotification('Error exporting CSV: ' + e.message, 'danger');
    }
}

function exportPDF() {
    try {
        const element = document.getElementById('main-screen');
        if (!element || typeof html2pdf === 'undefined') {
            showNotification('PDF export not available', 'warning');
            return;
        }

        const options = {
            margin: 10,
            filename: `ultimate_pro_report_${new Date().toISOString().split('T')[0]}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
        };

        html2pdf().set(options).from(element).save();
        showNotification('PDF export started', 'success');
    } catch (e) {
        showNotification('Error exporting PDF: ' + e.message, 'danger');
    }
}

function downloadFile(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
}

// ============================================
// SETTINGS & PROFILE
// ============================================

function saveSettings() {
    const travel = Number(document.getElementById('setting-travel').value) || 0;
    const pension = Number(document.getElementById('setting-pension').value) || 6;

    APP.state.settings.travel = travel;
    APP.state.settings.pension = pension;
    
    saveAppState();
    showNotification('Settings saved', 'success');
}

function saveProfile() {
    const name = document.getElementById('profile-name').value.trim();
    const email = document.getElementById('profile-email').value.trim();
    const phone = document.getElementById('profile-phone').value.trim();

    if (!name || !email) {
        showNotification('Name and email are required', 'warning');
        return;
    }

    if (!AppUtils.Utils.validateEmail(email)) {
        showNotification('Invalid email address', 'warning');
        return;
    }

    APP.state.profile = { name, email, phone };
    saveAppState();
    showNotification('Profile saved', 'success');
}

function resetAllData() {
    if (confirm('This will delete ALL data including shifts and settings. This action cannot be undone. Are you absolutely sure?')) {
        if (confirm('Are you REALLY sure? This will delete everything!')) {
            APP.state.shifts = [];
            APP.state.workplaces = [{ id: 1, name: 'Default Workplace', wage: 45 }];
            APP.state.settings = { pension: 6, travel: 25 };
            APP.state.profile = { name: '', email: '', phone: '' };
            
            saveAppState();
            renderDashboard();
            showNotification('All data has been reset', 'warning');
        }
    }
}

// ============================================
// VALIDATION & ERROR HANDLING
// ============================================

function validateShiftInput() {
    const date = document.getElementById('shift-date').value;
    const start = document.getElementById('shift-start').value;
    const end = document.getElementById('shift-end').value;

    if (!date || !start || !end) {
        return { valid: false, message: 'All time fields are required' };
    }

    const startMin = AppUtils.Utils.timeToMinutes(start);
    const endMin = AppUtils.Utils.timeToMinutes(end);
    const duration = endMin > startMin ? endMin - startMin : (endMin + 24 * 60 - startMin);

    if (duration < 60) {
        return { valid: false, message: 'Shift must be at least 1 hour' };
    }

    if (duration > 16 * 60) {
        return { valid: false, message: 'Shift cannot exceed 16 hours' };
    }

    return { valid: true };
}

function validateWorkplaceInput() {
    const name = document.getElementById('workplace-name').value.trim();
    const rate = Number(document.getElementById('workplace-rate').value);

    if (!name || name.length < 2) {
        return { valid: false, message: 'Workplace name must be at least 2 characters' };
    }

    if (!rate || rate <= 0) {
        return { valid: false, message: 'Hourly rate must be positive' };
    }

    if (rate > 1000) {
        return { valid: false, message: 'Hourly rate seems unrealistic' };
    }

    return { valid: true };
}

// ============================================
// ANALYTICS & STATISTICS
// ============================================

function renderAdvancedAnalytics() {
    const shifts = APP.state.shifts;
    
    if (shifts.length === 0) {
        showNotification('No data available for analysis', 'info');
        return;
    }

    const workLifeBalance = AppExtended.AdvancedAnalytics.calculateWorkLifeBalance(shifts);
    const patterns = AppExtended.AdvancedAnalytics.identifyPatterns(shifts);
    const predicted = AppExtended.AdvancedAnalytics.predictEarnings(shifts, APP.state.workplaces, 
        new Date().toISOString().split('T')[0].substring(0, 7)
    );

    let html = `
        <div class="analytics-results">
            <h3>Work-Life Balance Analysis</h3>
            <div class="stat-item">
                <span>Days Worked:</span>
                <strong>${workLifeBalance.daysWorked}</strong>
            </div>
            <div class="stat-item">
                <span>Days Off:</span>
                <strong>${workLifeBalance.daysOff}</strong>
            </div>
            <div class="stat-item">
                <span>Work to Life Ratio:</span>
                <strong>${workLifeBalance.workToLifeRatio}</strong>
            </div>
            <div class="stat-item">
                <span>Average Shifts Per Week:</span>
                <strong>${workLifeBalance.averageShiftsPerWeek}</strong>
            </div>
            
            <h3 style="margin-top: 20px;">Day Patterns</h3>
    `;

    Object.entries(patterns).forEach(([day, data]) => {
        html += `
            <div class="stat-item">
                <span>${day}:</span>
                <strong>${data.count} shifts, ${data.totalHours.toFixed(1)}h</strong>
            </div>
        `;
    });

    html += `
            <h3 style="margin-top: 20px;">Earnings Prediction</h3>
            <div class="stat-item">
                <span>Predicted Monthly Earnings:</span>
                <strong>₪${predicted.toFixed(2)}</strong>
            </div>
        </div>
    `;

    const resultsDiv = document.getElementById('advanced-analytics-results');
    if (resultsDiv) {
        resultsDiv.innerHTML = html;
    }
}

// ============================================
// BACKUP & RESTORE SYSTEM
// ============================================

function createManualBackup() {
    try {
        const backup = AppExtended.BackupManager.createBackup(APP.state);
        const backupStr = JSON.stringify(backup, null, 2);
        const backupBlob = new Blob([backupStr], { type: 'application/json' });
        downloadFile(backupBlob, `ultimate_pro_manual_backup_${new Date().toISOString().replace(/:/g, '-')}.json`);
        showNotification('Manual backup created', 'success');
    } catch (e) {
        showNotification('Error creating backup: ' + e.message, 'danger');
    }
}

function restoreFromBackup() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.addEventListener('load', function(e) {
            try {
                const backup = JSON.parse(e.target.result);
                AppExtended.BackupManager.restoreBackup(backup, APP.state);
                saveAppState();
                renderDashboard();
                showNotification('Data restored from backup', 'success');
            } catch (err) {
                showNotification('Error restoring backup: ' + err.message, 'danger');
            }
        });

        reader.readAsText(file);
    });

    fileInput.click();
}

// ============================================
// MODAL & DIALOG MANAGEMENT
// ============================================

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
    }
}

function handleModalClick(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}

// Add global modal close handler
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', handleModalClick);
    });
});

// ============================================
// SEARCH & FILTER FUNCTIONS
// ============================================

function searchShifts(query) {
    if (!query) {
        renderDashboard();
        return;
    }

    const filtered = APP.state.shifts.filter(shift => {
        const wp = APP.state.workplaces.find(w => w.id === shift.workplaceId);
        return shift.date.includes(query) || 
               (wp && wp.name.toLowerCase().includes(query.toLowerCase()));
    });

    const rows = filtered.map(shift => {
        const workplace = APP.state.workplaces.find(w => w.id === shift.workplaceId) || { name: 'Unknown' };
        const calc = AppUtils.OvertimeCalculator.calculateFullShift(
            shift.startTime, shift.endTime, shift.breakMinutes, workplace.wage, shift.dayType
        );

        return `
            <tr>
                <td>${shift.date}</td>
                <td>${workplace.name}</td>
                <td>${shift.startTime} - ${shift.endTime}</td>
                <td>${calc.hours.toFixed(2)}</td>
                <td>₪${calc.total.toFixed(2)}</td>
            </tr>
        `;
    }).join('');

    document.getElementById('shifts-tbody').innerHTML = rows;
}

// ============================================
// PRINT & DOCUMENT FUNCTIONS
// ============================================

function printDashboard() {
    window.print();
}

function printAnalytics() {
    window.print();
}

// ============================================
// DATA IMPORT/EXPORT UTILITIES
// ============================================

function importDataFromFile() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,.json';
    
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.addEventListener('load', function(e) {
            try {
                if (file.name.endsWith('.json')) {
                    const data = JSON.parse(e.target.result);
                    Object.assign(APP.state, data);
                } else if (file.name.endsWith('.csv')) {
                    parseCSVImport(e.target.result);
                }
                
                saveAppState();
                renderDashboard();
                showNotification('Data imported successfully', 'success');
            } catch (err) {
                showNotification('Error importing data: ' + err.message, 'danger');
            }
        });

        reader.readAsText(file);
    });

    fileInput.click();
}

function parseCSVImport(csvContent) {
    const lines = csvContent.split('\n');
    const shifts = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const [date, workplace, start, end] = lines[i].split(',');
        if (date && workplace && start && end) {
            shifts.push({
                id: Date.now() + i,
                workplaceId: 1,
                date: date.trim(),
                startTime: start.trim(),
                endTime: end.trim(),
                breakMinutes: 0,
                dayType: 'regular'
            });
        }
    }

    APP.state.shifts.push(...shifts);
}

// ============================================
// PERFORMANCE MONITORING
// ============================================

const PerformanceMonitor = {
    metrics: {},

    startMeasure(name) {
        this.metrics[name] = performance.now();
    },

    endMeasure(name) {
        if (this.metrics[name]) {
            const duration = performance.now() - this.metrics[name];
            console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
            return duration;
        }
        return 0;
    },

    logMemoryUsage() {
        if (performance.memory) {
            const used = (performance.memory.usedJSHeapSize / 1048576).toFixed(2);
            const limit = (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2);
            console.log(`[Memory] Used: ${used}MB / Limit: ${limit}MB`);
        }
    }
};

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveAppState();
        showNotification('Data saved', 'success');
    }
    
    // Ctrl/Cmd + E for export
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        exportDataJSON();
    }

    // Ctrl/Cmd + N for new shift
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        openShiftModal();
    }
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatCurrency(amount) {
    return `₪${parseFloat(amount).toFixed(2)}`;
}

function formatDate(dateString) {
    return new Date(dateString + 'T00:00:00').toLocaleDateString('he-IL');
}

function getMonthName(monthString) {
    const [year, month] = monthString.split('-');
    return new Date(year, parseInt(month) - 1).toLocaleDateString('he-IL', { year: 'numeric', month: 'long' });
}

function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
    };
}

// ============================================
// INITIALIZATION & BOOTSTRAP
// ============================================

// Schedule auto-save every 5 minutes
setInterval(saveAppState, 5 * 60 * 1000);

// Schedule auto-backup daily
AppExtended.BackupManager.scheduleAutoBackup(APP.state, 60);

// Initialize theme on page load
window.addEventListener('load', () => {
    applyTheme();
    setCurrentMonth();
    renderDashboard();
});

function renderWorkplacesList() {
    const list = document.getElementById('workplaces-list');
    if (!list) return;

    list.innerHTML = APP.state.workplaces.map(wp => `
        <div class="workplace-item">
            <div>
                <h4>${wp.name}</h4>
                <p>₪${wp.wage}/hour</p>
            </div>
            <div class="item-actions">
                <button class="btn btn-sm btn-secondary" onclick="openWorkplaceModal(${wp.id})">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteWorkplace(${wp.id})">Delete</button>
            </div>
        </div>
    `).join('');
}

function deleteWorkplace(id) {
    if (APP.state.workplaces.length <= 1) {
        showNotification('Must keep at least one workplace', 'warning');
        return;
    }
    
    if (confirm('Delete this workplace?')) {
        APP.state.workplaces = APP.state.workplaces.filter(w => w.id !== id);
        saveAppState();
        populateWorkplaceSelects();
        renderWorkplacesList();
        showNotification('Workplace deleted', 'success');
    }
}

// ============================================
// REPORTS & EXPORTS
// ============================================

function generateMonthlyReport() {
    const month = document.getElementById('filter-month').value;
    showNotification('Generating monthly report...', 'info');
    // Report generation logic would go here
}

function generateYearlyReport() {
    showNotification('Generating yearly report...', 'info');
}

function generateTaxReport() {
    const year = Number(document.getElementById('tax-report-year').value);
    showNotification(`Generating tax report for ${year}...`, 'info');
}

function exportDataJSON() {
    const dataStr = JSON.stringify(APP.state, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    downloadFile(dataBlob, `ultimate_pro_data_${new Date().toISOString().split('T')[0]}.json`);
    showNotification('Data exported as JSON', 'success');
}

function exportDataCSV() {
    let csv = 'Date,Workplace,Start,End,Hours,Salary\n';
    APP.state.shifts.forEach(s => {
        const wp = APP.state.workplaces.find(w => w.id === s.workplaceId) || { name: 'Unknown' };
        csv += `${s.date},${wp.name},${s.startTime},${s.endTime}\n`;
    });
    
    const csvBlob = new Blob([csv], { type: 'text/csv' });
    downloadFile(csvBlob, `ultimate_pro_shifts_${new Date().toISOString().split('T')[0]}.csv`);
    showNotification('Data exported as CSV', 'success');
}

function exportShiftsCSV() {
    exportDataCSV();
}

function downloadFile(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
}

// ============================================
// SETTINGS
// ============================================

function saveSettings() {
    const travel = Number(document.getElementById('setting-travel').value) || 0;
    const pension = Number(document.getElementById('setting-pension').value) || 6;

    APP.state.settings.travel = travel;
    APP.state.settings.pension = pension;

    saveAppState();
    showNotification('Settings saved', 'success');
}

function saveProfile() {
    APP.state.profile.name = document.getElementById('profile-fullname').value;
    APP.state.profile.email = document.getElementById('profile-email').value;
    APP.state.profile.phone = document.getElementById('profile-phone').value;

    saveAppState();
    showNotification('Profile saved', 'success');
}

function exportAllData() {
    exportDataJSON();
}

function importData() {
    // File input implementation
}

function resetAll() {
    if (confirm('⚠️ This will DELETE all your data! Are you sure?')) {
        if (confirm('Last warning: Your data cannot be recovered!')) {
            APP.state.shifts = [];
            localStorage.removeItem(APP.config.storageKey);
            location.reload();
        }
    }
}

function openContactForm() {
    // Contact form implementation
}

function showNotifications() {
    // Notifications panel implementation
}
