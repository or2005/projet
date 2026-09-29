 /**
 * ULTIMATE PRO - Main Application Script
 * ========================================
 * Professional Employee Management System
 * Version: 1.0.0
 * Author: Or Dadshev
 */

// ============================================
// APP STATE & CONFIG
// ============================================

const APP = {
    config: {
        storageKey: 'ultimate_pro_v2_data',
        schemaVersion: 4,
        maxStorage: 20 * 1024 * 1024,
        defaultPension: 6,
        defaultTravel: 25,
        workingDaysPerMonth: 22,
        regularHoursPerDay: 8
    },

    state: {
        currentUser: null,
        theme: localStorage.getItem('ultimate_pro_theme') || 'light',
        schemaVersion: 4,
        workplaces: [
            { id: 1, name: 'מקום עבודה ברירת מחדל', wage: 45 }
        ],
        shifts: [],
        deletedShifts: [],
        settings: {
            pension: 6,
            travel: 25,
            creditPoints: 2.25,
            employmentMode: 'employee',
            unlockPin: null,
            workplaces: []
        },
        profile: {
            name: '',
            email: '',
            phone: ''
        },
        notifications: []
    },

    charts: {},
    listenersAttached: false,
    saveTimer: null,
    hubProfile: null,
    hubClockTimer: null,
    hubWeatherTimer: null,
    analystRotationTimer: null,
    hubWeatherTask: null,
    hubFeedsLoaded: false
};

const SAFE_ROOM_KEY = 'ultimate_pro_safe_room_log';
const DEVELOPER_CONFIG_KEY = 'ultimate_pro_developer_config_v1';
const GOOGLE_LOGIN_PENDING_KEY = 'ultimate_pro_google_login_pending';
let developerEnterCount = 0;
let developerLastEnterAt = 0;
let developerConfig = null;
let developerBaseNavOrder = null;
let smartAnalystReport = null;
let smartAnalystInput = null;
let smartAnalystRotationIndex = 0;
let smartAnalystRefreshTimer = null;

// ============================================
// INITIALIZATION
// ============================================

window.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    const completeGoogleLogin = sessionStorage.getItem(GOOGLE_LOGIN_PENDING_KEY) === '1';
    sessionStorage.removeItem(GOOGLE_LOGIN_PENDING_KEY);
    await loadAppState();
    await loadHubProfile();
    APP.hubWeatherTask = PersonalApps.createCoalescedTask(
        refreshHubWeatherRequest,
        () => document.getElementById('hub-screen')?.classList.contains('active') === true
    );
    applyTheme();
    setCurrentMonth();
    setEmploymentMode(APP.state.settings.employmentMode || 'employee', false);
    relocateMonthlyEstimateCard();
    initializeDeveloperConfig();
    attachEventListeners();

    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('main-screen').classList.remove('active');
    document.getElementById('profile-setup-screen').classList.remove('active');
    document.getElementById('hub-screen').classList.remove('active');
    renderHubApps();

    if (completeGoogleLogin) {
        if (APP.hubProfile) {
            APP.state.currentUser = APP.hubProfile.name;
            enterPersonalHub();
        } else {
            const session = await window.electronAPI?.getGoogleCalendarStatus?.();
            document.getElementById('profile-setup-screen').classList.add('active');
            document.getElementById('setup-name').value = session?.account?.name || '';
            document.getElementById('setup-email').value = session?.account?.email || '';
        }
    } else {
        document.getElementById('login-screen').classList.add('active');
    }

    const versionEl = document.querySelector('.app-version');
    if (versionEl && window.appInfo) {
        versionEl.textContent = 'v' + (window.appInfo.version || '1.0.0');
    }
}

function relocateMonthlyEstimateCard() {
    const card = document.querySelector('.monthly-daily-card');
    const host = document.getElementById('monthly-estimate-host');
    if (card && host) host.appendChild(card);
}

function migrateState(data) {
    if (!data || typeof data !== 'object') return data;

    const next = { ...data };
    next.schemaVersion = APP.config.schemaVersion;
    next.settings = {
        pension: 6,
        travel: 25,
        creditPoints: 2.25,
        employmentMode: 'employee',
        unlockPin: null,
        workplaces: [],
        ...(data.settings || {})
    };

    // Preserve previous login code as PIN after upgrade from v2.0
    if (!next.settings.unlockPin && data.currentUser && String(data.currentUser).length >= 4) {
        next.settings.unlockPin = String(data.currentUser);
    }

    if (!next.workplaces || !next.workplaces.length) {
        next.workplaces = [
            { id: 1, name: 'מקום עבודה ברירת מחדל', wage: 45 }
        ];
    }

    if (!Array.isArray(next.shifts)) next.shifts = [];
    if (!Array.isArray(next.deletedShifts)) next.deletedShifts = [];
    if (!next.profile) next.profile = { name: '', email: '', phone: '' };
    if (!Array.isArray(next.notifications)) next.notifications = [];

    next.currentUser = null;

    return next;
}

async function loadAppState() {
    let data = null;

    try {
        if (window.electronAPI && window.electronAPI.loadData) {
            data = await window.electronAPI.loadData();
        }
    } catch (e) {
        console.warn('File storage load failed, falling back to localStorage', e);
    }

    if (!data) {
        const saved = localStorage.getItem(APP.config.storageKey);
        if (saved) {
            try {
                data = JSON.parse(saved);
                // Migrate localStorage → file on next save
                APP._needsFileMigration = true;
            } catch (e) {
                console.error('Error loading localStorage state:', e);
            }
        }
    }

    if (data) {
        const migrated = migrateState(data);
        APP.state = { ...APP.state, ...migrated, charts: undefined };
        delete APP.state.charts;
        if (migrated.theme) APP.state.theme = migrated.theme;
    }

    const visualRefreshKey = 'ultimate_pro_visual_refresh_v1';
    if (!localStorage.getItem(visualRefreshKey)) {
        APP.state.theme = 'light';
        localStorage.setItem('ultimate_pro_theme', 'light');
        localStorage.setItem(visualRefreshKey, '1');
    }
}

async function saveAppState() {
    try {
        const payload = {
            schemaVersion: APP.config.schemaVersion,
            theme: APP.state.theme,
            workplaces: APP.state.workplaces,
            shifts: APP.state.shifts,
            deletedShifts: (APP.state.deletedShifts || []).slice(0, 100),
            settings: APP.state.settings,
            profile: APP.state.profile,
            notifications: (APP.state.notifications || []).slice(0, 50)
        };

        const dataStr = JSON.stringify(payload);
        const size = new Blob([dataStr]).size;

        if (size > APP.config.maxStorage) {
            showNotification('גודל הנתונים גדול מדי. מחק משמרות ישנות.', 'warning');
            return false;
        }

        let savedToFile = false;
        if (window.electronAPI && window.electronAPI.saveData) {
            const result = await window.electronAPI.saveData(payload);
            savedToFile = result && result.ok !== false;
        }

        // Always keep localStorage as backup
        localStorage.setItem(APP.config.storageKey, dataStr);
        localStorage.setItem('ultimate_pro_theme', APP.state.theme);
        PersonalApps.driveSync?.markLocalDirty?.();

        if (!savedToFile && !window.electronAPI) {
            console.warn('Saved to localStorage only (no Electron file API)');
        }

        return true;
    } catch (e) {
        console.error('Error saving state:', e);
        showNotification('שגיאה בשמירת נתונים', 'error');
        return false;
    }
}

function scheduleSave() {
    clearTimeout(APP.saveTimer);
    APP.saveTimer = setTimeout(() => saveAppState(), 400);
}

function attachEventListeners() {
    if (APP.listenersAttached) return;
    APP.listenersAttached = true;

    document.addEventListener('keydown', (e) => {
        trackDeveloperShortcut(e);
        if (e.key === 'Escape') {
            closeShiftModal();
            closeWorkplaceModal();
            closeNotificationsPanel();
            closeDeveloperWorkbench();
            closeHubSettings();
        }
    });

    document.addEventListener('click', handleDeveloperAction);
    document.getElementById('setup-birth-date')?.addEventListener('input', updateProfileAgePreview);
    document.querySelectorAll('[data-employment-mode]').forEach(button => {
        button.addEventListener('click', () => setEmploymentMode(button.dataset.employmentMode));
    });

    const monthFilter = document.getElementById('filter-month');
    if (monthFilter) {
        monthFilter.addEventListener('change', renderDashboard);
    }

    const search = document.getElementById('global-search');
    if (search) {
        search.addEventListener('input', debounce(handleGlobalSearch, 200));
    }
}

function setCurrentMonth() {
    const el = document.getElementById('filter-month');
    if (!el) return;
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    el.value = `${year}-${month}`;
}

function setEmploymentMode(mode, persist = true) {
    const nextMode = mode === 'freelance' ? 'freelance' : 'employee';
    APP.state.settings.employmentMode = nextMode;
    document.querySelectorAll('[data-employment-mode]').forEach(button => {
        const active = button.dataset.employmentMode === nextMode;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
    });

    const plannerMode = document.getElementById('monthly-pay-type');
    if (plannerMode) {
        plannerMode.value = nextMode === 'freelance' ? 'exempt' : 'employee';
        updateMonthlyDailyCalculator();
    }

    if (persist) scheduleSave();
    renderDashboard();
}

// ============================================
// AUTHENTICATION
// ============================================

async function handleGoogleLogin(event) {
    event.preventDefault();
    const errorEl = document.getElementById('login-error');
    const button = document.getElementById('google-login-button');
    if (!errorEl || !button) return;
    if (handleGoogleLogin.pending) return handleGoogleLogin.pending;
    errorEl.textContent = '';

    if (!window.electronAPI?.signInGoogleCalendar) {
        errorEl.textContent = 'התחברות עם Google זמינה רק בגרסת המחשב.';
        return;
    }

    const idleLabel = button.innerHTML;
    const stopWatch = startLoginWatchdog(errorEl);
    handleGoogleLogin.pending = (async () => {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner"></i> מתחבר ל-Google...';
        try {
            const result = await window.electronAPI.signInGoogleCalendar();
            if (!result?.ok || !result.account?.email) throw new Error(result?.error || 'Google לא אימת חשבון. אפשר לנסות שוב.');
            sessionStorage.setItem(GOOGLE_LOGIN_PENDING_KEY, '1');
            window.location.reload();
        } catch (error) {
            errorEl.textContent = error?.message || 'לא ניתן להתחבר ל-Google כרגע.';
            button.disabled = false;
            button.innerHTML = idleLabel;
        } finally {
            stopWatch();
            handleGoogleLogin.pending = null;
        }
    })();
    return handleGoogleLogin.pending;
}

// The consent screen opens in the browser; keep the user informed instead of
// leaving a spinner with no feedback when the flow is still waiting on Google.
function startLoginWatchdog(errorEl) {
    const steps = [
        { after: 6000, text: 'נפתח חלון אישור של Google. אשר את הגישה ליומן ולגיבוי הפרטי.' },
        { after: 20000, text: 'עדיין ממתינים לאישור בחלון Google. האישור ניתן רק לאפליקציה הזו.' },
        { after: 45000, text: 'לא התקבל אישור מ־Google. אפשר לסגור את חלון Google ולנסות שוב.' }
    ];
    const timers = steps.map(step => setTimeout(() => {
        if (!errorEl.textContent) errorEl.textContent = step.text;
    }, step.after));
    return () => timers.forEach(clearTimeout);
}

function handleLogout() {
    if (confirm('להתנתק מהמערכת?')) {
        stopHubWidgets();
        closeHubSettings();
        APP.state.currentUser = null;
        APP.developerReturnTab = null;
        document.getElementById('main-screen').classList.remove('active');
        document.getElementById('finance-screen')?.classList.remove('active');
        document.getElementById('profile-setup-screen').classList.remove('active');
        document.getElementById('hub-screen').classList.remove('active');
        document.getElementById('login-screen').classList.add('active');
        document.getElementById('google-login-button')?.focus();
    }
}

async function loadHubProfile() {
    if (!window.electronAPI?.loadHubProfile) return null;
    try {
        const result = await window.electronAPI.loadHubProfile();
        if (result?.ok && result.profile) APP.hubProfile = result.profile;
        else if (result && !result.ok) console.warn('Secure profile is unavailable:', result.error);
    } catch (error) {
        console.warn('Secure profile could not be loaded', error);
    }
    return APP.hubProfile;
}

function updateProfileAgePreview() {
    const output = document.getElementById('setup-age');
    const age = PersonalApps.profile.calculateAge(document.getElementById('setup-birth-date')?.value);
    if (output) output.textContent = age === null || age < 0 ? 'יחושב מתאריך הלידה' : `${age} שנים`;
}

async function saveHubProfile(event) {
    event.preventDefault();
    const errorEl = document.getElementById('profile-setup-error');
    const profileDraft = {
        name: document.getElementById('setup-name').value,
        dateOfBirth: document.getElementById('setup-birth-date').value,
        idNumber: document.getElementById('setup-id-number').value,
        email: document.getElementById('setup-email').value,
        phone: document.getElementById('setup-phone').value
    };
    const validation = PersonalApps.profile.validateProfile(profileDraft);
    errorEl.textContent = Object.values(validation.errors)[0] || '';
    if (!validation.valid) return;
    if (!window.electronAPI?.saveHubProfile) {
        errorEl.textContent = 'שמירה מוצפנת זמינה רק ביישום שולחני.';
        return;
    }

    const result = await window.electronAPI.saveHubProfile(validation.values);
    if (!result?.ok) {
        errorEl.textContent = result?.error || 'לא ניתן לשמור את הפרופיל במחשב.';
        return;
    }

    APP.hubProfile = result.profile;
    APP.state.currentUser = result.profile.name;
    PersonalApps.driveSync?.markLocalDirty?.();
    document.getElementById('profile-setup-form').reset();
    document.getElementById('profile-setup-screen').classList.remove('active');
    enterPersonalHub();
}

function enterPersonalHub() {
    document.getElementById('profile-setup-screen').classList.remove('active');
    document.getElementById('main-screen').classList.remove('active');
    document.getElementById('hub-screen').classList.add('active');
    document.getElementById('hub-user-name').textContent = APP.hubProfile?.name || 'משתמש';
    document.getElementById('hub-version').textContent = window.appInfo?.version || '1.0.0';
    renderHubApps();
    renderHubSummary();
    startHubWidgets();
    PersonalApps.driveSync?.getLastBackupDate?.();
}

function renderHubApps() {
    const host = document.getElementById('hub-app-grid');
    if (!host || !window.PersonalApps?.registry) return;
    host.replaceChildren();

    const availableApps = PersonalApps.registry.filter(app => app.status === 'ready');
    availableApps.forEach(app => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `hub-app-card${app.status === 'planned' ? ' is-planned' : ''}`;
        button.dataset.appId = app.id;
        button.disabled = app.status !== 'ready';

        const icon = document.createElement('span');
        icon.className = `hub-app-icon ${app.id}`;
        const iconGlyph = document.createElement('i');
        iconGlyph.className = `fas ${app.icon}`;
        icon.appendChild(iconGlyph);

        const copy = document.createElement('span');
        copy.className = 'hub-app-copy';
        const title = document.createElement('strong');
        title.textContent = app.title;
        const description = document.createElement('span');
        description.textContent = app.description;
        copy.append(title, description);

        const action = document.createElement('span');
        action.className = 'hub-app-action';
        action.textContent = app.status === 'ready' ? 'פתיחה' : 'בהכנה';
        button.append(icon, copy, action);
        button.addEventListener('click', () => openPersonalApp(app.id));
        host.appendChild(button);
    });

    const count = document.getElementById('hub-app-count');
    if (count) count.textContent = `${availableApps.length} תוכנות`;
}

async function renderHubSummary() {
    const monthKey = getCurrentMonthKey();
    const totals = getMonthShiftTotals(monthKey);
    const formatMoney = value => new Intl.NumberFormat('he-IL', {
        style: 'currency', currency: 'ILS', maximumFractionDigits: 0
    }).format(Number.isFinite(value) ? value : 0);

    const hours = document.getElementById('hub-summary-hours');
    const salary = document.getElementById('hub-summary-salary');
    const budget = document.getElementById('hub-summary-budget');
    if (hours) hours.textContent = `${totals.hours.toFixed(1)} שעות`;
    if (salary) salary.textContent = formatMoney(calculateNetSalary(totals.gross));

    try {
        const financeSummary = await PersonalApps.financeApp?.getHomeSummary(monthKey);
        if (budget) budget.textContent = formatMoney(financeSummary?.remainingBudget || 0);
    } catch {
        if (budget) budget.textContent = 'לא זמין';
    }
    await refreshSmartAnalystWidgets();
}

function getMonthShiftTotals(month) {
    return filterShiftsByMonth(month).reduce((result, shift) => {
        const workplace = APP.state.workplaces.find(item => item.id === shift.workplaceId) || { wage: 0 };
        const calculation = calculateShiftForDisplay(shift, workplace);
        result.hours += calculation.hours;
        result.gross += calculation.total + Number(shift.tips || 0) + Number(shift.travel || 0);
        return result;
    }, { hours: 0, gross: 0 });
}

function openPersonalApp(appId) {
    const app = PersonalApps.registry.find(item => item.id === appId);
    if (!app || app.status !== 'ready') {
        showHubMessage('התוכנה הזו עדיין בהכנה.');
        return;
    }

    if (app.entry === 'finance') {
        stopHubWidgets();
        document.getElementById('hub-screen').classList.remove('active');
        document.getElementById('finance-screen').classList.add('active');
        PersonalApps.financeApp.open();
        return;
    }
    if (app.entry === 'calendar') {
        stopHubWidgets();
        openCalendarApp();
        return;
    }
    if (app.entry !== 'legacy') return;

    APP.state.currentUser = APP.hubProfile?.name || 'משתמש';
    document.getElementById('hub-screen').classList.remove('active');
    document.getElementById('main-screen').classList.add('active');
    document.getElementById('user-name').textContent = APP.state.currentUser;
    document.getElementById('dashboard-user-name').textContent = APP.state.currentUser;
    renderDashboard();
    populateWorkplaceSelects();
    renderWorkplacesList();
    updateNotificationBadge();
    document.querySelector('.app-main')?.scrollTo(0, 0);
}

function returnToHub(event) {
    if (event) event.preventDefault();
    if (!APP.state.currentUser) return;
    closeDeveloperWorkbench();
    document.getElementById('main-screen').classList.remove('active');
    document.getElementById('finance-screen')?.classList.remove('active');
    document.getElementById('calendar-screen')?.classList.remove('active');
    document.getElementById('hub-screen').classList.add('active');
    renderHubSummary();
    startHubWidgets();
}

function openCalendarApp() {
    document.getElementById('hub-screen').classList.remove('active');
    const screen = document.getElementById('calendar-screen');
    if (!screen) return;
    screen.classList.add('active');
    if (typeof PersonalApps?.calendar?.init === 'function') {
        PersonalApps.calendar.init();
        return;
    }
    if (typeof PersonalApps?.calendar?.renderCalendar === 'function') {
        PersonalApps.calendar.renderCalendar('calendar-root');
    }
}

function showHubMessage(message) {
    const output = document.getElementById('hub-message');
    if (!output) return;
    output.textContent = message;
    clearTimeout(APP.hubMessageTimer);
    APP.hubMessageTimer = setTimeout(() => { output.textContent = ''; }, 4500);
}

function startHubWidgets() {
    stopHubWidgets();
    updateHubClock();
    APP.hubClockTimer = setInterval(updateHubClock, 1000);
    refreshHubWeather();
    APP.hubWeatherTimer = setInterval(refreshHubWeather, 15 * 60 * 1000);
    clearInterval(APP.analystRotationTimer);
    APP.analystRotationTimer = setInterval(cycleSmartAnalystInsight, 9000);
    if (!APP.hubFeedsLoaded) {
        APP.hubFeedsLoaded = true;
        refreshDailyAdvice();
        refreshDailyFact();
    }
}

function stopHubWidgets() {
    clearInterval(APP.hubClockTimer);
    clearInterval(APP.hubWeatherTimer);
    APP.hubClockTimer = null;
    APP.hubWeatherTimer = null;
    clearInterval(APP.analystRotationTimer);
    APP.analystRotationTimer = null;
}

function updateHubClock() {
    const now = new Date();
    const time = document.getElementById('hub-clock');
    const date = document.getElementById('hub-date');
    const greeting = document.getElementById('hub-greeting');
    if (time) time.textContent = PersonalApps.clock.formatTime(now);
    if (date) date.textContent = PersonalApps.clock.formatDate(now);
    if (greeting) {
        const phrase = PersonalApps.clock.getGreeting(now);
        const icon = { 'בוקר טוב': '☀️', 'צהריים טובים': '🌤️', 'ערב טוב': '🌆', 'לילה טוב': '🌙' }[phrase] || '';
        greeting.textContent = `${phrase}, ${APP.hubProfile?.firstName || APP.hubProfile?.name?.split(' ')[0] || 'אור'} ${icon}`;
    }
    const hubUserName = document.getElementById('hub-user-name');
    if (hubUserName) {
        const fullName = APP.hubProfile?.name || 'משתמש';
        hubUserName.textContent = fullName.split(' ')[0] || fullName;
    }
}

function getHubWeatherCity() {
    return 'עפולה';
}

async function refreshHubWeather() {
    return APP.hubWeatherTask?.();
}

async function refreshHubWeatherRequest() {
    if (!document.getElementById('hub-screen')?.classList.contains('active')) return;
    const city = getHubWeatherCity();
    const temperature = document.getElementById('hub-weather-temperature');
    const description = document.getElementById('hub-weather-description');
    const cityLabel = document.getElementById('hub-weather-city');
    const icon = document.querySelector('.hub-weather-icon i');
    if (!temperature || !description || !cityLabel || !icon) return;

    const showFriendlyFallback = message => {
        temperature.textContent = '--°';
        description.textContent = message;
        cityLabel.textContent = city;
        icon.className = 'fas fa-cloud-sun';
    };
    cityLabel.textContent = city;
    description.textContent = 'מעדכן תחזית...';

    try {
        if (!window.electronAPI?.getWeather) {
            showFriendlyFallback('התחזית תופיע כשיהיה חיבור לרשת.');
            return;
        }
        const result = await window.electronAPI.getWeather(city);
        if (!result?.ok) {
            showFriendlyFallback('אין עדכון כרגע. ננסה שוב בהמשך.');
            return;
        }

        const weather = result.weather;
        const iconByCondition = {
            clear: 'fa-sun', clouds: 'fa-cloud-sun', rain: 'fa-cloud-rain',
            snow: 'fa-snowflake', thunderstorm: 'fa-cloud-bolt', mist: 'fa-smog'
        };
        document.getElementById('hub-weather-temperature').textContent = `${weather.temperature}°`;
        document.getElementById('hub-weather-description').textContent = weather.description;
        document.querySelector('.hub-weather-icon i').className = `fas ${iconByCondition[weather.condition] || 'fa-cloud'}`;
    } catch {
        showFriendlyFallback('התחזית נחה לרגע. נעדכן שוב בקרוב.');
    }
}

async function refreshDailyAdvice() {
    const output = document.getElementById('hub-advice-text');
    const button = document.getElementById('hub-advice-refresh');
    if (!output) return;
    button?.classList.add('is-spinning');
    try {
        const result = await window.electronAPI?.getDailyAdvice?.();
        output.textContent = result?.advice || 'צעד קטן ועקבי יכול לעשות שינוי גדול.';
    } catch {
        output.textContent = 'צעד קטן ועקבי יכול לעשות שינוי גדול.';
    } finally {
        button?.classList.remove('is-spinning');
    }
}

async function refreshDailyFact() {
    const output = document.getElementById('hub-fact-text');
    if (!output) return;
    try {
        const result = await window.electronAPI?.getDailyFact?.();
        output.textContent = result?.fact || 'היום הוא זמן טוב לגלות משהו חדש.';
    } catch {
        output.textContent = 'היום הוא זמן טוב לגלות משהו חדש.';
    }
}

function openHubSettings() {
    document.getElementById('hub-settings-error').textContent = '';
    const profile = APP.hubProfile || {};
    document.getElementById('hub-settings-name').value = profile.name || '';
    document.getElementById('hub-settings-birth-date').value = profile.dateOfBirth || '';
    document.getElementById('hub-settings-id-number').value = '';
    document.getElementById('hub-settings-email').value = profile.email || '';
    document.getElementById('hub-settings-phone').value = profile.phone || '';
    document.getElementById('hub-settings-modal').style.display = 'flex';
    document.getElementById('hub-settings-name').focus();
}

function closeHubSettings() {
    const modal = document.getElementById('hub-settings-modal');
    if (modal) modal.style.display = 'none';
}

async function saveHubSettings(event) {
    event.preventDefault();
    const errorEl = document.getElementById('hub-settings-error');
    errorEl.textContent = '';

    const profileDraft = {
        name: document.getElementById('hub-settings-name').value,
        dateOfBirth: document.getElementById('hub-settings-birth-date').value,
        idNumber: document.getElementById('hub-settings-id-number').value,
        email: document.getElementById('hub-settings-email').value,
        phone: document.getElementById('hub-settings-phone').value
    };
    const hasProfileData = Object.values(profileDraft).some(value => String(value || '').trim());
    const validation = hasProfileData ? PersonalApps.profile.validateProfile(profileDraft) : null;
    if (validation && !validation.valid) {
        errorEl.textContent = Object.values(validation.errors)[0];
        return;
    }

    if (!window.electronAPI?.saveHubProfile) {
        errorEl.textContent = 'שמירה מוצפנת זמינה רק ביישום שולחני.';
        return;
    }

    if (validation) {
        const profileResult = await window.electronAPI.saveHubProfile(validation.values);
        if (!profileResult?.ok) {
            errorEl.textContent = profileResult?.error || 'לא ניתן לשמור את הפרופיל.';
            return;
        }

        APP.hubProfile = profileResult.profile;
        PersonalApps.driveSync?.markLocalDirty?.();
        APP.state.currentUser = profileResult.profile.name;
        document.getElementById('hub-user-name').textContent = profileResult.profile.name;
        updateHubClock();
    }
    closeHubSettings();
    showHubMessage('ההגדרות נשמרו במחשב.');
}

async function openPersonalContact(type) {
    if (!window.electronAPI?.openPersonalContact) {
        showHubMessage('קיצורי הקשר זמינים מתוך יישום Electron.');
        return;
    }
    const result = await window.electronAPI.openPersonalContact(type);
    if (!result?.ok) showHubMessage(result?.error || 'לא ניתן לפתוח את אפליקציית הקשר.');
}

// ============================================
// NAVIGATION & TAB MANAGEMENT
// ============================================

function switchTab(tabName, event) {
    if (event) {
        event.preventDefault();
    }

    if (developerConfig?.tabSettings?.[tabName]?.hidden) return;

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
        } else if (tabName === 'smart-analyst') {
            setTimeout(runSmartAnalysis, 0);
        } else if (tabName === 'monthly-estimate') {
            setTimeout(updateMonthlyDailyCalculator, 0);
        } else if (tabName === 'payroll') {
            setTimeout(() => switchPayrollTab('audit'), 0);
        }
    }
}

function runSmartAnalysis() {
    const monthEl = document.getElementById('analyst-month');
    if (!monthEl) return;
    if (!monthEl.value) monthEl.value = getCurrentMonthKey();
    refreshSmartAnalystWidgets(monthEl.value).then(() => renderSmartAnalystPage(monthEl.value));
}

function scheduleSmartAnalystRefresh() {
    clearTimeout(smartAnalystRefreshTimer);
    smartAnalystRefreshTimer = setTimeout(() => refreshSmartAnalystWidgets(), 180);
}

async function collectSmartAnalystInput(monthKey = '') {
    const finance = await PersonalApps.financeApp?.getAnalystData?.();
    const shifts = (APP.state.shifts || []).map(shift => {
        const workplace = APP.state.workplaces.find(item => item.id === shift.workplaceId) || { wage: 0, name: '' };
        const calculation = calculateShiftForDisplay(shift, workplace);
        return {
            date: shift.date,
            hours: calculation.hours,
            gross: calculation.total + Number(shift.tips || 0) + Number(shift.travel || 0),
            workplace: workplace.name,
            payType: shift.payType
        };
    });
    const employmentMode = APP.state.settings?.employmentMode || 'employee';
    let netMultiplier = employmentMode === 'freelance' ? 0.85 : 0.88;
    const gross = shifts.reduce((sum, shift) => sum + shift.gross, 0);
    const monthGross = shifts.filter(shift => shift.date.startsWith(getCurrentMonthKey())).reduce((sum, shift) => sum + shift.gross, 0);
    const activeMonthCount = new Set(shifts.map(shift => shift.date.slice(0, 7))).size;
    const estimateGross = monthGross || (activeMonthCount ? gross / activeMonthCount : 0);
    if (estimateGross > 0 && employmentMode === 'freelance') {
        const deductions = AppUtils.TaxCalculator.calculateDeductions(estimateGross, 0, APP.state.settings.creditPoints ?? 2.25);
        netMultiplier = Math.max(0, estimateGross - deductions.total) / estimateGross;
    } else if (estimateGross > 0) {
        netMultiplier = calculateNetSalary(estimateGross) / estimateGross;
    }
    return {
        shifts,
        monthKey,
        transactions: finance?.transactions || [],
        recurring: finance?.recurring || [],
        accountBalance: finance?.accountBalance || 0,
        savingsRate: finance?.savingsRate ?? 10,
        calendarEvents: PersonalApps.calendar?.getAnalystEvents?.() || [],
        employmentMode,
        netMultiplier
    };
}

async function refreshSmartAnalystWidgets(monthKey = '') {
    const engine = PersonalApps.SmartAnalyst;
    if (!engine) return null;
    try {
        smartAnalystInput = await collectSmartAnalystInput(monthKey);
        smartAnalystReport = engine.analyze(smartAnalystInput);
        renderSmartAnalystBanner();
        renderSmartAnalystInlineWidgets();
        renderSmartAnalystDrawer();
        return smartAnalystReport;
    } catch (error) {
        console.warn('Smart analyst could not refresh:', error);
        setText('hub-analyst-insight', 'הניתוח לא זמין כרגע. הנתונים שלך נשארו שמורים כרגיל.');
        return null;
    }
}

function renderSmartAnalystBanner() {
    const host = document.getElementById('hub-analyst-insight');
    if (!host || !smartAnalystReport) return;
    const insights = smartAnalystReport.insights;
    const selected = insights.length ? insights[smartAnalystRotationIndex % insights.length] : null;
    host.textContent = selected?.text || 'כשתירשם פעילות, האנליסט יציג תחזיות ותובנות מבוססות על הנתונים שלך.';
    const banner = host.closest('.analyst-banner');
    if (banner) banner.dataset.level = selected?.level?.toLowerCase() || 'info';
}

function cycleSmartAnalystInsight() {
    if (!smartAnalystReport?.insights.length) return;
    smartAnalystRotationIndex = (smartAnalystRotationIndex + 1) % smartAnalystReport.insights.length;
    renderSmartAnalystBanner();
}

function renderSmartAnalystInlineWidgets() {
    if (!smartAnalystReport) return;
    const { summary, insights } = smartAnalystReport;
    const financeHost = document.getElementById('finance-analyst-insights');
    if (financeHost) {
        financeHost.replaceChildren();
        const warnings = insights.filter(item => item.level === 'WARNING');
        const dueDays = (smartAnalystInput?.recurring || []).map(rule => Number(rule.dueDay)).filter(day => day >= 1 && day <= 31).sort((a, b) => a - b);
        const textItems = warnings.length ? warnings.slice(0, 2).map(item => item.text) : ['לא זוהתה כרגע קפיצה חריגה בהוצאות.'];
        textItems.push(`תחזית תזרים סוף חודש: ${formatCurrency(summary.cashflowForecast)} (אומדן).`);
        if (dueDays.length) textItems.push(`ימי חיוב קבועים צפויים בחודש: ${[...new Set(dueDays)].slice(0, 4).join(', ')}.`);
        const misc = (smartAnalystInput?.transactions || []).filter(item => item.type === 'expense' && /אחר|שונות/.test(item.category) && item.date.startsWith(summary.month)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
        if (misc > 0) {
            const simulation = smartAnalystReport.whatIf({ reduceExpense: misc * 0.15 });
            const days = simulation.daysChange;
            textItems.push(`קיצוץ של 15% בהוצאות השונות (${formatCurrency(misc * 0.15)}) ${days !== null && days < 0 ? `יקדים את היעד בכ-${Math.abs(days)} ימים` : 'יגדיל את היתרה הצפויה'}.`);
        }
        textItems.forEach(text => financeHost.appendChild(makeAnalystText(text)));
    }

    const bestDay = summary.bestWeekday;
    const dayName = bestDay ? new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(new Date(2026, 0, 4 + bestDay.day)) : 'ממתין לנתונים';
    setText('payroll-analyst-best-day', bestDay ? `${dayName} · ${formatCurrency(bestDay.averageGross)} למשמרת` : 'הוסף משמרות החודש');
    setText('payroll-analyst-hourly', summary.trueNetHourly > 0 ? `${formatCurrency(summary.trueNetHourly)} לשעה` : '--');
    const capCopy = document.getElementById('payroll-analyst-cap-copy');
    const capMeter = document.querySelector('.analyst-cap-meter');
    const capFill = document.getElementById('payroll-analyst-cap-fill');
    const capMetric = document.querySelector('.analyst-cap-metric');
    if (capMetric) capMetric.hidden = smartAnalystInput?.employmentMode !== 'freelance';
    if (capCopy) capCopy.textContent = `${Math.round(summary.annualIncome).toLocaleString('he-IL')} / ${Math.round(summary.exemptCap).toLocaleString('he-IL')} ₪`;
    if (capMeter) {
        capMeter.setAttribute('aria-valuenow', String(Math.round(summary.capPercent)));
        capMeter.dataset.level = summary.capPercent >= 90 ? 'high' : summary.capPercent >= 70 ? 'medium' : 'low';
    }
    if (capFill) capFill.style.width = `${summary.capPercent}%`;
}

function makeAnalystText(text) {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    return paragraph;
}

function renderSmartAnalystDrawer() {
    const host = document.getElementById('analyst-drawer-content');
    if (!host || !smartAnalystReport) return;
    host.replaceChildren();
    const metrics = smartAnalystReport.summary;
    const metricList = document.createElement('div');
    metricList.className = 'analyst-drawer-metrics';
    [
        ['תחזית שכר מהמשמרות', formatCurrency(metrics.monthlyForecast)],
        ['שכר מתוכנן ביומן', formatCurrency(metrics.plannedGross)],
        ['שווי שעה נטו משוער', metrics.trueNetHourly ? `${formatCurrency(metrics.trueNetHourly)} לשעה` : 'דרושות משמרות'],
        ['תחזית יתרת סוף חודש', formatCurrency(metrics.cashflowForecast)]
    ].forEach(([label, value]) => {
        const item = document.createElement('div');
        item.className = 'analyst-drawer-metric';
        const title = document.createElement('span');
        title.textContent = label;
        const output = document.createElement('strong');
        output.textContent = value;
        item.append(title, output);
        metricList.appendChild(item);
    });
    host.appendChild(metricList);
    const heading = document.createElement('h3');
    heading.textContent = 'תובנות והמלצות';
    host.appendChild(heading);
    const insights = smartAnalystReport.insights.length ? smartAnalystReport.insights : [{ level: 'INFO', title: 'התחלה טובה', text: 'הוסף נתונים כדי לקבל ניתוח אישי.' }];
    insights.forEach(insight => {
        const item = document.createElement('article');
        item.className = `analyst-drawer-insight ${insight.level.toLowerCase()}`;
        const level = document.createElement('span');
        level.textContent = insight.level === 'WARNING' ? 'לבדיקה' : insight.level === 'SUCCESS' ? 'הישג' : 'תובנה';
        const title = document.createElement('strong');
        title.textContent = insight.title;
        const text = makeAnalystText(insight.text);
        item.append(level, title, text);
        host.appendChild(item);
    });
    const note = document.createElement('p');
    note.className = 'analyst-disclaimer';
    note.textContent = 'כל התחזיות והניכויים הם אומדנים מקומיים בלבד; הם אינם תחליף לנתוני תלוש, ייעוץ מס או יתרת בנק מעודכנת.';
    host.appendChild(note);
}

function renderSmartAnalystPage(month) {
    if (!smartAnalystReport) return;
    const { summary, insights } = smartAnalystReport;
    const score = summary.shifts ? Math.min(99, 45 + Math.round(summary.hours * 0.22) + summary.shifts * 2) : 0;
    setText('analyst-score', score ? `${score}/100` : '--');
    setText('analyst-score-label', score ? `${summary.shifts} משמרות ו-${summary.hours.toFixed(1)} שעות נכללו בחודש.` : 'הוסף לפחות 3 משמרות לתחזית אמינה.');
    setText('analyst-forecast', formatCurrency(summary.monthlyForecast));
    setText('analyst-forecast-copy', `${summary.plannedDays} ימי עבודה מתוכננים ביומן; התחזית היא אומדן.`);
    const health = document.getElementById('analyst-health');
    if (health) {
        health.replaceChildren();
        const icon = document.createElement('i');
        icon.className = `fas ${summary.shifts >= 3 ? 'fa-circle-check' : 'fa-circle-info'}`;
        const strong = document.createElement('strong');
        strong.textContent = summary.shifts >= 3 ? 'הניתוח מבוסס על נתונים' : 'ממתין לעוד נתונים';
        const copy = document.createElement('span');
        copy.textContent = `${summary.shifts} משמרות, ${smartAnalystReport.health.expenseHistory} הוצאות; החישוב מתבצע במחשב הזה.`;
        health.append(icon, strong, copy);
    }
    const asRows = items => items.map(item => [item.level === 'WARNING' ? 'fa-triangle-exclamation' : item.level === 'SUCCESS' ? 'fa-circle-check' : 'fa-lightbulb', item.title, item.text]);
    renderAnalystItems('analyst-recommendations', asRows(insights.filter(item => item.level !== 'WARNING')), 'mint', 'הוסף נתונים לקבלת המלצות אישיות.');
    renderAnalystItems('analyst-anomalies', asRows(insights.filter(item => item.level === 'WARNING')), 'coral', 'לא זוהו חריגות על סמך הנתונים הזמינים.');
    const shifts = APP.state.shifts.filter(shift => shift.date.startsWith(month));
    const rows = shifts.map(shift => calculateShiftForDisplay(shift, APP.state.workplaces.find(item => item.id === shift.workplaceId) || { wage: 0 }));
    renderAnalystChart(shifts, rows);
}

function openSmartAnalystDrawer() {
    const backdrop = document.getElementById('analyst-drawer-backdrop');
    if (!backdrop) return;
    backdrop.hidden = false;
    document.body.classList.add('analyst-drawer-open');
    if (!backdrop.dataset.escapeBound) {
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !backdrop.hidden) closeSmartAnalystDrawer();
        });
        backdrop.dataset.escapeBound = 'true';
    }
    refreshSmartAnalystWidgets();
    document.getElementById('analyst-drawer')?.focus();
}

function closeSmartAnalystDrawer(event) {
    const backdrop = document.getElementById('analyst-drawer-backdrop');
    if (!backdrop || (event && event.target !== backdrop)) return;
    backdrop.hidden = true;
    document.body.classList.remove('analyst-drawer-open');
}

function simulateSmartAnalyst(event) {
    event.preventDefault();
    if (!smartAnalystReport) return;
    const result = smartAnalystReport.whatIf({
        addExpense: Number(document.getElementById('analyst-sim-expense')?.value || 0),
        cancelShifts: Number(document.getElementById('analyst-sim-shifts')?.value || 0)
    });
    const difference = result.daysChange == null ? 'אין די נתונים כדי להעריך מתי היעד יושג.'
        : result.daysChange > 0 ? `היעד צפוי להידחות בכ-${result.daysChange} ימים.`
            : result.daysChange < 0 ? `היעד צפוי להקדים בכ-${Math.abs(result.daysChange)} ימים.` : 'לא צפוי שינוי במועד השגת היעד.';
    setText('analyst-simulation-result', `${difference} תחזית השכר המעודכנת: ${formatCurrency(result.monthlyForecast)}.`);
}

function getCurrentMonthKey() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function renderAnalystItems(id, items, tone, emptyText = '') {
    const host = document.getElementById(id);
    if (!host) return;
    host.replaceChildren();
    if (!items.length) {
        const empty = document.createElement('p');
        empty.className = 'muted-copy';
        empty.textContent = emptyText;
        host.appendChild(empty);
        return;
    }
    items.forEach(item => {
        const row = document.createElement('div');
        row.className = `recommendation-item ${tone}`;
        const icon = document.createElement('i');
        icon.className = `fas ${item[0]}`;
        const copy = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = item[1];
        const description = document.createElement('p');
        description.textContent = item[2];
        copy.append(title, description);
        row.append(icon, copy);
        host.appendChild(row);
    });
}

function renderAnalystChart(shifts, rows) {
    const canvas = document.getElementById('analystChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (APP.charts.analyst) APP.charts.analyst.destroy();
    const values = {};
    shifts.forEach((shift, index) => { values[shift.date] = (values[shift.date] || 0) + rows[index].hours; });
    APP.charts.analyst = new Chart(canvas, {
        type: 'bar',
        data: { labels: Object.keys(values), datasets: [{ label: 'שעות', data: Object.values(values), backgroundColor: '#9de7c5', borderRadius: 7 }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } }
    });
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function trackDeveloperShortcut(event) {
    if (event.key !== 'Enter' || event.repeat || !document.getElementById('main-screen')?.classList.contains('active')) return;
    if (event.target.closest?.('input, textarea, select, button, a, [contenteditable="true"]')) {
        developerEnterCount = 0;
        return;
    }
    if (document.getElementById('dev-workbench')) return;
    const now = Date.now();
    developerEnterCount = now - developerLastEnterAt > 4000 ? 1 : developerEnterCount + 1;
    developerLastEnterAt = now;
    if (developerEnterCount >= 8) {
        developerEnterCount = 0;
        event.preventDefault();
        openDeveloperWorkbench();
    }
}

function collectDeveloperNavSections() {
    const nav = document.querySelector('.sidebar-nav');
    if (!nav) return [];

    const sections = [];
    let currentSection = null;
    Array.from(nav.children).forEach(child => {
        if (child.classList.contains('nav-group')) {
            const items = child.nextElementSibling?.classList.contains('dev-nav-items')
                ? child.nextElementSibling
                : document.createElement('div');
            items.className = 'dev-nav-items';
            if (!items.parentElement) child.after(items);
            currentSection = { heading: child, container: items, items: [] };
            sections.push(currentSection);
        } else if (child.classList.contains('nav-item') && currentSection) {
            currentSection.container.appendChild(child);
            currentSection.items.push(child);
        }
    });

    sections.forEach((section, index) => {
        section.items = Array.from(section.container.querySelectorAll('.nav-item'));
        section.items.forEach(item => {
            item.dataset.devGroup = String(index);
            const label = item.querySelector('span');
            if (label && !label.dataset.devOriginalLabel) label.dataset.devOriginalLabel = label.textContent;
        });
    });
    return sections;
}

function getDashboardBlocks() {
    const dashboard = document.getElementById('tab-dashboard');
    if (!dashboard) return [];
    const candidates = [
        ['header', '.page-header', 'כותרת הדשבורד'],
        ['metrics', '.kpi-grid', 'כרטיסי מדדים'],
        ['charts', '.charts-grid', 'תרשימים'],
        ['shifts', ':scope > .card', 'טבלת משמרות']
    ];
    return candidates.map(([id, selector, label]) => {
        const element = dashboard.querySelector(selector);
        if (!element) return null;
        element.dataset.devBlock = id;
        element.dataset.devOriginalLabel = label;
        return { id, label, element };
    }).filter(Boolean);
}

function initializeDeveloperConfig() {
    const sections = collectDeveloperNavSections();
    const blocks = getDashboardBlocks();
    const currentNavOrder = sections.map(section => section.items.map(item => item.dataset.tab));
    if (!developerBaseNavOrder) developerBaseNavOrder = currentNavOrder.map(ids => [...ids]);
    const defaults = {
        version: 1,
        navOrder: developerBaseNavOrder.map(ids => [...ids]),
        tabSettings: {},
        dashboardOrder: blocks.map(block => block.id),
        dashboardSettings: {}
    };
    try {
        const saved = JSON.parse(localStorage.getItem(DEVELOPER_CONFIG_KEY) || 'null');
        if (saved && saved.version === 1) {
            const validTabIds = new Set(sections.flatMap(section => section.items.map(item => item.dataset.tab)));
            const validBlockIds = new Set(blocks.map(block => block.id));
            defaults.navOrder = defaults.navOrder.map((ids, index) => {
                const requested = Array.isArray(saved.navOrder?.[index]) ? saved.navOrder[index] : [];
                return [...requested.filter(id => ids.includes(id)), ...ids.filter(id => !requested.includes(id))];
            });
            defaults.dashboardOrder = Array.isArray(saved.dashboardOrder)
                ? [...saved.dashboardOrder.filter(id => validBlockIds.has(id)), ...defaults.dashboardOrder.filter(id => !saved.dashboardOrder.includes(id))]
                : defaults.dashboardOrder;
            validTabIds.forEach(id => {
                const item = saved.tabSettings?.[id];
                if (item) defaults.tabSettings[id] = {
                    label: typeof item.label === 'string' ? item.label.slice(0, 50) : '',
                    hidden: id !== 'dashboard' && item.hidden === true
                };
            });
            validBlockIds.forEach(id => {
                defaults.dashboardSettings[id] = { hidden: saved.dashboardSettings?.[id]?.hidden === true };
            });
        }
    } catch (error) {
        console.warn('Developer layout settings could not be loaded', error);
    }
    developerConfig = defaults;
    applyDeveloperConfig();
}

function getDeveloperTabLabel(item) {
    const label = item.querySelector('span');
    return label?.dataset.devOriginalLabel || label?.textContent || item.dataset.tab;
}

function getDeveloperConfigLabel(setting, fallback) {
    return setting?.label?.trim() || fallback;
}

function applyDeveloperConfig() {
    if (!developerConfig) return;
    const sections = collectDeveloperNavSections();
    sections.forEach((section, index) => {
        const defaultIds = section.items.map(item => item.dataset.tab);
        const requested = developerConfig.navOrder[index] || [];
        const orderedIds = [...requested.filter(id => defaultIds.includes(id)), ...defaultIds.filter(id => !requested.includes(id))];
        orderedIds.forEach(id => {
            const item = section.items.find(candidate => candidate.dataset.tab === id);
            const setting = developerConfig.tabSettings[id];
            if (!item) return;
            section.container.appendChild(item);
            item.classList.toggle('dev-config-hidden', setting?.hidden === true);
            const label = item.querySelector('span');
            if (label) label.textContent = getDeveloperConfigLabel(setting, getDeveloperTabLabel(item));
            const panel = document.getElementById(`tab-${id}`);
            panel?.classList.toggle('dev-config-hidden', setting?.hidden === true);
            const title = panel?.querySelector('.page-header h1, .about-header h1');
            if (title) {
                if (!title.dataset.devOriginalLabel) title.dataset.devOriginalLabel = title.textContent;
                title.textContent = getDeveloperConfigLabel(setting, title.dataset.devOriginalLabel);
            }
        });
    });

    const dashboard = document.getElementById('tab-dashboard');
    const blocks = getDashboardBlocks();
    const order = [...developerConfig.dashboardOrder.filter(id => blocks.some(block => block.id === id)), ...blocks.map(block => block.id).filter(id => !developerConfig.dashboardOrder.includes(id))];
    order.forEach(id => {
        const block = blocks.find(candidate => candidate.id === id);
        const setting = developerConfig.dashboardSettings[id];
        if (!block) return;
        dashboard.appendChild(block.element);
        block.element.classList.toggle('dev-config-hidden', setting?.hidden === true);
    });
}

function saveDeveloperConfig() {
    try {
        localStorage.setItem(DEVELOPER_CONFIG_KEY, JSON.stringify(developerConfig));
        const status = document.getElementById('dev-save-status');
        if (status) status.textContent = 'CONFIG SAVED LOCALLY';
    } catch (error) {
        const status = document.getElementById('dev-save-status');
        if (status) status.textContent = 'SAVE FAILED: LOCAL STORAGE UNAVAILABLE';
        console.error('Developer layout settings could not be saved', error);
    }
}

function createDeveloperRow({ id, label, group, hidden, kind }) {
    const row = document.createElement('div');
    row.className = 'dev-editor-row';
    row.dataset.devId = id;
    row.dataset.devKind = kind;
    if (group != null) row.dataset.devGroup = String(group);

    const title = document.createElement('input');
    title.className = 'dev-label-input';
    title.value = label;
    title.maxLength = 50;
    title.readOnly = kind === 'dashboard';
    title.setAttribute('aria-label', `שם תצוגה: ${label}`);
    row.appendChild(title);

    const controls = document.createElement('div');
    controls.className = 'dev-row-controls';
    if (kind === 'dashboard' || (kind === 'tab' && id !== 'dashboard')) {
        const hideLabel = document.createElement('label');
        hideLabel.className = 'dev-toggle';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = hidden;
        checkbox.dataset.devAction = 'toggle-hidden';
        checkbox.setAttribute('aria-label', `הסתרת ${label}`);
        hideLabel.append(checkbox, document.createTextNode('הסתר'));
        controls.appendChild(hideLabel);
    }
    ['up', 'down'].forEach(direction => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dev-move-btn';
        button.dataset.devAction = `move-${direction}`;
        button.title = direction === 'up' ? 'הזז למעלה' : 'הזז למטה';
        button.setAttribute('aria-label', button.title);
        button.innerHTML = `<i class="fas fa-arrow-${direction}"></i>`;
        controls.appendChild(button);
    });
    row.appendChild(controls);
    return row;
}

function renderDeveloperWorkbench() {
    const navHost = document.getElementById('dev-navigation-list');
    const dashboardHost = document.getElementById('dev-dashboard-list');
    if (!navHost || !dashboardHost) return;
    navHost.replaceChildren();
    dashboardHost.replaceChildren();

    collectDeveloperNavSections().forEach((section, groupIndex) => {
        const heading = document.createElement('h3');
        heading.className = 'dev-group-heading';
        heading.textContent = section.heading.textContent;
        navHost.appendChild(heading);
        const order = developerConfig.navOrder[groupIndex] || [];
        order.forEach(id => {
            const item = section.items.find(candidate => candidate.dataset.tab === id);
            if (!item) return;
            const setting = developerConfig.tabSettings[id];
            navHost.appendChild(createDeveloperRow({
                id,
                label: getDeveloperConfigLabel(setting, getDeveloperTabLabel(item)),
                group: groupIndex,
                hidden: setting?.hidden === true,
                kind: 'tab'
            }));
        });
    });

    const blocks = getDashboardBlocks();
    const orderedBlocks = [...developerConfig.dashboardOrder, ...blocks.map(block => block.id).filter(id => !developerConfig.dashboardOrder.includes(id))];
    orderedBlocks.forEach(id => {
        const block = blocks.find(candidate => candidate.id === id);
        if (!block) return;
        dashboardHost.appendChild(createDeveloperRow({
            id,
            label: block.label,
            hidden: developerConfig.dashboardSettings[id]?.hidden === true,
            kind: 'dashboard'
        }));
    });
}

function openDeveloperWorkbench() {
    if (document.getElementById('dev-workbench')) return;
    const overlay = document.createElement('div');
    overlay.id = 'dev-workbench';
    overlay.className = 'dev-workbench-overlay';
    overlay.innerHTML = `<div class="dev-workbench-shell"><header class="dev-workbench-header"><div class="dev-brand"><span class="dev-mark">UP</span><div><span class="dev-eyebrow">ULTIMATE PRO // DESIGN CONSOLE</span><h1>סביבת מפתחים</h1></div></div><div class="dev-header-actions"><span id="dev-save-status">CONFIG READY</span><button type="button" class="dev-close-btn" data-dev-action="close" aria-label="סגירה" title="סגירה">×</button></div></header><div class="dev-statusline"><span><i class="fas fa-circle"></i> LOCAL SESSION</span><span>LAYOUT ENGINE 1.0</span><span>1989 TERMINAL MODE</span></div><main class="dev-workbench-main"><section class="dev-editor-panel"><div class="dev-panel-heading"><span class="dev-section-index">01</span><div><h2>תפריט ועמודים</h2><p>שינוי שמות, הסתרה וסדר פריטי התפריט.</p></div></div><div id="dev-navigation-list" class="dev-editor-list"></div></section><section class="dev-editor-panel"><div class="dev-panel-heading"><span class="dev-section-index">02</span><div><h2>מבנה לוח הבקרה</h2><p>סידור מחדש והסתרת אזורים בדשבורד.</p></div></div><div id="dev-dashboard-list" class="dev-editor-list"></div></section><section class="dev-editor-panel dev-tools-panel"><div class="dev-panel-heading"><span class="dev-section-index">03</span><div><h2>תחזוקה וכלים</h2><p>גיבוי הגדרות, בדיקת תקינות וייצוא מצב.</p></div></div><div class="dev-tool-actions"><button type="button" class="dev-command-btn" data-dev-action="export-config"><i class="fas fa-file-export"></i> ייצוא הגדרות</button><button type="button" class="dev-command-btn" data-dev-action="import-config"><i class="fas fa-file-import"></i> ייבוא הגדרות</button><button type="button" class="dev-command-btn" data-dev-action="diagnostics"><i class="fas fa-stethoscope"></i> בדיקת מערכת</button><button type="button" class="dev-command-btn" data-dev-action="snapshot"><i class="fas fa-box-archive"></i> Snapshot נתונים</button><button type="button" class="dev-command-btn dev-command-danger" data-dev-action="reset">איפוס התאמות</button><input id="dev-config-file" type="file" accept="application/json,.json" hidden></div><pre id="dev-diagnostics-output" class="dev-output">SYSTEM READY\nLocal configuration is isolated from payroll data.</pre><div class="dev-activity"><div class="dev-activity-heading">יומן פעולות מקומי</div><div id="dev-activity-log" class="dev-activity-list"></div></div></section></main><footer class="dev-workbench-footer"><span>ההגדרות נשמרות במכשיר הזה בלבד.</span><span>ESC // CLOSE</span></footer></div>`;
    document.body.appendChild(overlay);
    renderDeveloperWorkbench();
    renderSafeRoomLog();
    addSafeRoomLog('כניסה לסביבת מפתחים');
}

function closeDeveloperWorkbench() {
    const workbench = document.getElementById('dev-workbench');
    if (!workbench) return;
    workbench.remove();
    addSafeRoomLog('יציאה מסביבת מפתחים');
}

function moveDeveloperItem(row, direction) {
    const { devKind: kind, devId: id, devGroup: group } = row.dataset;
    if (kind === 'dashboard') {
        const index = developerConfig.dashboardOrder.indexOf(id);
        const nextIndex = index + (direction === 'up' ? -1 : 1);
        if (index < 0 || nextIndex < 0 || nextIndex >= developerConfig.dashboardOrder.length) return;
        [developerConfig.dashboardOrder[index], developerConfig.dashboardOrder[nextIndex]] = [developerConfig.dashboardOrder[nextIndex], developerConfig.dashboardOrder[index]];
    } else {
        const order = developerConfig.navOrder[Number(group)];
        const index = order.indexOf(id);
        const nextIndex = index + (direction === 'up' ? -1 : 1);
        if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
        [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
    }
    applyDeveloperConfig();
    saveDeveloperConfig();
    renderDeveloperWorkbench();
}

function exportDeveloperConfig() {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(developerConfig, null, 2)], { type: 'application/json' }));
    link.download = `ultimate-pro-layout-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
}

async function importDeveloperConfig(file) {
    try {
        const imported = JSON.parse(await file.text());
        if (!imported || imported.version !== 1 || !Array.isArray(imported.navOrder) || !Array.isArray(imported.dashboardOrder)) {
            throw new Error('Unsupported configuration format');
        }
        localStorage.setItem(DEVELOPER_CONFIG_KEY, JSON.stringify(imported));
        initializeDeveloperConfig();
        renderDeveloperWorkbench();
        document.getElementById('dev-save-status').textContent = 'CONFIG IMPORTED';
        addSafeRoomLog('יובאו הגדרות סביבת מפתחים');
    } catch (error) {
        document.getElementById('dev-save-status').textContent = 'IMPORT FAILED: INVALID CONFIG';
        console.error('Developer layout settings could not be imported', error);
    }
}

function handleDeveloperAction(event) {
    const actionControl = event.target.closest('[data-dev-action]');
    if (!actionControl) return;
    const action = actionControl.dataset.devAction;
    const row = actionControl.closest('.dev-editor-row');
    if (action === 'close') closeDeveloperWorkbench();
    if (action === 'move-up' || action === 'move-down') moveDeveloperItem(row, action.slice(5));
    if (action === 'toggle-hidden' && row) {
        const { devKind: kind, devId: id } = row.dataset;
        if (kind === 'tab') {
            developerConfig.tabSettings[id] = { ...developerConfig.tabSettings[id], hidden: actionControl.checked };
            if (actionControl.checked && document.getElementById(`tab-${id}`)?.classList.contains('active')) switchTab('dashboard');
        } else {
            developerConfig.dashboardSettings[id] = { hidden: actionControl.checked };
        }
        applyDeveloperConfig();
        saveDeveloperConfig();
    }
    if (action === 'export-config') exportDeveloperConfig();
    if (action === 'import-config') document.getElementById('dev-config-file')?.click();
    if (action === 'diagnostics') runSafeDiagnostics();
    if (action === 'snapshot') exportSafeSnapshot();
    if (action === 'reset' && confirm('לאפס את כל שינויי הממשק לברירת המחדל?')) {
        localStorage.removeItem(DEVELOPER_CONFIG_KEY);
        initializeDeveloperConfig();
        renderDeveloperWorkbench();
        addSafeRoomLog('אופסו התאמות הממשק');
    }
}

document.addEventListener('change', event => {
    if (event.target.id === 'dev-config-file' && event.target.files?.[0]) importDeveloperConfig(event.target.files[0]);
    if (event.target.matches('#dev-workbench .dev-label-input')) {
        const row = event.target.closest('.dev-editor-row');
        if (!row) return;
        const { devKind: kind, devId: id } = row.dataset;
        if (kind === 'tab') {
            developerConfig.tabSettings[id] = { ...developerConfig.tabSettings[id], label: event.target.value.trim().slice(0, 50) };
        }
        applyDeveloperConfig();
        saveDeveloperConfig();
    }
});

function readSafeRoomLog() {
    try { return JSON.parse(localStorage.getItem(SAFE_ROOM_KEY) || '[]'); } catch (_) { return []; }
}

function addSafeRoomLog(message) {
    const log = [{ message, at: new Date().toISOString() }, ...readSafeRoomLog()].slice(0, 40);
    localStorage.setItem(SAFE_ROOM_KEY, JSON.stringify(log));
    renderSafeRoomLog();
}

function renderSafeRoomLog() {
    const host = document.getElementById('dev-activity-log');
    if (!host) return;
    host.replaceChildren();
    readSafeRoomLog().slice(0, 6).forEach(item => {
        const row = document.createElement('div');
        row.className = 'safe-log-row';
        const message = document.createElement('strong');
        message.textContent = item.message;
        const timestamp = document.createElement('span');
        timestamp.textContent = new Date(item.at).toLocaleString('he-IL');
        row.append(message, timestamp);
        host.appendChild(row);
    });
    if (!host.childElementCount) host.textContent = 'אין פעולות עדיין.';
}

function runSafeDiagnostics() {
    const checks = [
        ['State object', !!APP.state],
        ['Workplaces', Array.isArray(APP.state.workplaces)],
        ['Shifts', Array.isArray(APP.state.shifts)],
        ['Local storage', !!window.localStorage],
        ['Chart engine', typeof Chart !== 'undefined']
    ];
    const passed = checks.filter(check => check[1]).length;
    const output = document.getElementById('dev-diagnostics-output');
    if (output) output.textContent = [`ULTIMATE PRO DIAGNOSTICS`, `Timestamp: ${new Date().toISOString()}`, `Result: ${passed}/${checks.length} checks passed`, '', ...checks.map(check => `${check[1] ? 'PASS' : 'FAIL'}  ${check[0]}`)].join('\n');
    addSafeRoomLog(`הרצת בדיקות: ${passed}/${checks.length} עברו`);
}

function exportSafeSnapshot() {
    const snapshot = { exportedAt: new Date().toISOString(), appVersion: '1.0.0', schemaVersion: APP.config.schemaVersion, developerConfig, state: APP.state, safeRoomLog: readSafeRoomLog() };
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
    link.download = `ultimate-pro-snapshot-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    addSafeRoomLog('יוצא snapshot מלא');
}

function switchAnalyticsTab(section, event) {
    const sections = document.querySelectorAll('.analytics-section');
    sections.forEach(s => s.classList.remove('active'));

    const buttons = document.querySelectorAll('#tab-analytics .tab-btn');
    buttons.forEach(b => b.classList.remove('active'));

    const trigger = event?.currentTarget || document.querySelector(`#tab-analytics .tab-btn[data-section="${section}"]`);
    if (trigger) trigger.classList.add('active');

    const target = document.getElementById(`analytics-${section}`);
    if (target) target.classList.add('active');

    setTimeout(() => {
        if (section === 'trends') renderTrendsChart();
        if (section === 'comparison') renderComparison();
    }, 0);
}

function switchPayrollTab(section, event) {
    const sections = document.querySelectorAll('.payroll-section');
    sections.forEach(s => s.classList.remove('active'));

    const buttons = document.querySelectorAll('#tab-payroll .tab-btn');
    buttons.forEach(b => b.classList.remove('active'));

    const trigger = event?.currentTarget || document.querySelector(`#tab-payroll .tab-btn[data-section="${section}"]`);
    if (trigger) trigger.classList.add('active');

    const target = document.getElementById(`payroll-${section}`);
    if (target) target.classList.add('active');
    if (section === 'calculator') updateMonthlyDailyCalculator();
}

function switchInsuranceTab(section, event) {
    const sections = document.querySelectorAll('.insurance-section');
    sections.forEach(s => s.classList.remove('active'));

    const buttons = document.querySelectorAll('#tab-insurance .tab-btn');
    buttons.forEach(b => b.classList.remove('active'));

    const trigger = event?.currentTarget || document.querySelector(`#tab-insurance .tab-btn[data-section="${section}"]`);
    if (trigger) trigger.classList.add('active');

    const target = document.getElementById(`insurance-${section}`);
    if (target) target.classList.add('active');
}

// ============================================
// UI UTILITIES
// ============================================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const screen = document.getElementById('main-screen');
    if (!sidebar || !screen) return;

    const collapsed = !sidebar.classList.contains('collapsed');
    sidebar.classList.toggle('collapsed', collapsed);
    screen.classList.toggle('sidebar-collapsed', collapsed);
}

function closeUserMenu() {
    const menu = document.getElementById('user-menu');
    if (menu) menu.style.display = 'none';
}

function toggleTheme() {
    const body = document.body;
    const isDark = body.classList.contains('dark-mode');
    const themeIcon = document.getElementById('theme-icon');

    if (isDark) {
        body.classList.remove('dark-mode');
        body.classList.add('light-mode');
        APP.state.theme = 'light';
        if (themeIcon) themeIcon.className = 'fas fa-sun';
    } else {
        body.classList.remove('light-mode');
        body.classList.add('dark-mode');
        APP.state.theme = 'dark';
        if (themeIcon) themeIcon.className = 'fas fa-moon';
    }

    localStorage.setItem('ultimate_pro_theme', APP.state.theme);
    saveAppState();
}

function applyTheme() {
    const body = document.body;
    const themeIcon = document.getElementById('theme-icon');
    if (APP.state.theme === 'light') {
        body.classList.remove('dark-mode');
        body.classList.add('light-mode');
        if (themeIcon) themeIcon.className = 'fas fa-sun';
    } else {
        body.classList.add('dark-mode');
        body.classList.remove('light-mode');
        if (themeIcon) themeIcon.className = 'fas fa-moon';
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
    if (!APP.state.notifications) APP.state.notifications = [];
    APP.state.notifications.unshift({
        id: Date.now(),
        message,
        type,
        timestamp: new Date().toISOString(),
        read: false
    });
    APP.state.notifications = APP.state.notifications.slice(0, 50);
    updateNotificationBadge();

    let host = document.getElementById('toast-host');
    if (!host) {
        host = document.createElement('div');
        host.id = 'toast-host';
        host.style.cssText = 'position:fixed;bottom:24px;left:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:360px;';
        document.body.appendChild(host);
    }

    const toast = document.createElement('div');
    const colors = { info: '#3b82f6', success: '#22c55e', warning: '#f59e0b', error: '#ef4444' };
    toast.style.cssText = `background:var(--card-bg,#1e293b);color:var(--text,#fff);border-right:4px solid ${colors[type] || colors.info};padding:12px 16px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.35);font-family:inherit;`;
    toast.textContent = message;
    host.appendChild(toast);
    setTimeout(() => toast.remove(), 4200);

    if (typeof NotificationSystem !== 'undefined' && NotificationSystem.add) {
        try { NotificationSystem.add(message, type, 0); } catch (_) { /* ignore */ }
    }
}

function showUndoNotification(message, undoAction) {
    let host = document.getElementById('toast-host');
    if (!host) {
        host = document.createElement('div');
        host.id = 'toast-host';
        host.style.cssText = 'position:fixed;bottom:24px;left:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:360px;';
        document.body.appendChild(host);
    }
    const toast = document.createElement('div');
    toast.className = 'undo-toast';
    toast.innerHTML = `<span>${message}</span><button class="btn btn-sm btn-secondary">בטל</button>`;
    toast.querySelector('button').addEventListener('click', () => {
        undoAction();
        toast.remove();
    });
    host.appendChild(toast);
    setTimeout(() => toast.remove(), 15000);
}

function updateNotificationBadge() {
    const badge = document.getElementById('notification-count');
    if (!badge) return;
    const unread = (APP.state.notifications || []).filter(n => !n.read).length;
    badge.textContent = String(unread);
    badge.style.display = unread > 0 ? 'inline-flex' : 'none';
}

function showNotifications() {
    let panel = document.getElementById('notifications-panel');
    if (panel) {
        panel.remove();
        return;
    }

    panel = document.createElement('div');
    panel.id = 'notifications-panel';
    panel.className = 'notification-panel';

    const items = APP.state.notifications || [];
    const content = items.length === 0
        ? '<p class="notification-empty">אין התראות</p>'
        : items.map(n => `
            <div class="notification-item notification-${n.type || 'info'}">
                <div class="notification-text">${n.message}</div>
                <small>${new Date(n.timestamp).toLocaleString('he-IL')}</small>
            </div>`).join('');

    panel.innerHTML = `
        <div class="notification-header">
            <strong>התראות</strong>
            <button class="btn btn-sm btn-secondary" onclick="closeNotificationsPanel()">סגור</button>
        </div>
        <div class="notification-list">${content}</div>
    `;
    document.body.appendChild(panel);
}

function closeNotificationsPanel() {
    const panel = document.getElementById('notifications-panel');
    if (panel) panel.remove();
}

function handleGlobalSearch() {
    const q = (document.getElementById('global-search').value || '').trim().toLowerCase();
    if (!q) {
        renderDashboard();
        return;
    }

    const monthFilter = document.getElementById('filter-month').value;
    let shifts = filterShiftsByMonth(monthFilter);
    shifts = shifts.filter(s => {
        const wp = APP.state.workplaces.find(w => w.id === s.workplaceId) || { name: '' };
        return (
            (s.date || '').includes(q) ||
            (s.notes || '').toLowerCase().includes(q) ||
            (wp.name || '').toLowerCase().includes(q) ||
            (s.startTime || '').includes(q) ||
            (s.endTime || '').includes(q)
        );
    });

    renderDashboardWithShifts(shifts);
}

function toggleUserMenu() {
    const menu = document.getElementById('user-menu');
    if (!menu) return;
    const nextState = menu.style.display === 'none' ? 'block' : 'none';
    menu.style.display = nextState;
}

document.addEventListener('click', (event) => {
    const userButton = event.target.closest('.btn-user');
    const menu = document.getElementById('user-menu');
    if (!menu) return;

    if (!userButton && !menu.contains(event.target)) {
        menu.style.display = 'none';
    }
});

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
    renderDashboardWithShifts(shifts);
}

function renderDashboardWithShifts(shifts) {
    if (shifts.length === 0) {
        document.getElementById('shifts-tbody').innerHTML =
            '<tr><td colspan="6">אין משמרות. לחץ על «הוסף משמרת» כדי להתחיל.</td></tr>';
        updateKPIs(0, 0, 0, 0);
        scheduleSmartAnalystRefresh();
        return;
    }

    let totalHours = 0;
    let totalGross = 0;
    let totalOvertime = 0;
    const rows = [];

    shifts.forEach(shift => {
        const workplace = APP.state.workplaces.find(w => w.id === shift.workplaceId) || { name: 'לא ידוע', wage: 0 };
        const calc = calculateShiftForDisplay(shift, workplace);
        const extras = (shift.tips || 0) + (shift.travel || 0);

        totalHours += calc.hours;
        totalGross += calc.total + extras;
        totalOvertime += calc.overtimeHours;

        const row = `
            <tr>
                <td>${shift.date}</td>
                <td><span class="badge-workplace">${workplace.name}</span></td>
                <td>${shift.payType === 'daily' ? 'יום עבודה' : `${shift.startTime} - ${shift.endTime}`}</td>
                <td>${calc.hours.toFixed(2)}</td>
                <td><strong>₪${(calc.total + extras).toFixed(2)}</strong></td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="editShift(${shift.id})" title="עריכה">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="deleteShift(${shift.id})" title="מחיקה">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
        rows.push(row);
    });

    document.getElementById('shifts-tbody').innerHTML = rows.join('');
    updateKPIs(totalHours, totalGross, totalOvertime, calculateNetSalary(totalGross));
    scheduleSmartAnalystRefresh();
}

function calculateShiftForDisplay(shift, workplace = {}) {
    if (shift.payType === 'daily') {
        const dailyWage = Math.max(0, Number(shift.dailyWage) || 0);
        return { hours: 0, regularHours: 0, overtimeHours: 0, overtime125Hours: 0, overtime150Hours: 0, baseEarn: dailyWage, overtimeEarn: 0, total: dailyWage };
    }
    return AppUtils.OvertimeCalculator.calculateFullShift(
        shift.startTime, shift.endTime, shift.breakMinutes, workplace.wage, shift.dayType
    );
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
    const pension = APP.state.settings.pension || 6;
    const credits = APP.state.settings.creditPoints != null ? APP.state.settings.creditPoints : 2.25;
    if (APP.state.settings.employmentMode === 'freelance') {
        const deductions = AppUtils.TaxCalculator.calculateDeductions(gross, 0, credits);
        return Math.max(0, gross - deductions.total);
    }
    const result = AppUtils.TaxCalculator.calculateNetSalary(gross, pension, credits, 'monthly');
    return result.net;
}

async function syncCurrentSalaryToFinance() {
    const month = document.getElementById('filter-month')?.value || getCurrentMonthKey();
    const totals = getMonthShiftTotals(month);
    if (!filterShiftsByMonth(month).length) {
        showNotification('אין משמרות בחודש שנבחר לסנכרון.', 'warning');
        return;
    }
    if (typeof PersonalApps.financeApp?.syncSalaryIncome !== 'function') {
        showNotification('מחשבון ההכנסות אינו זמין כרגע.', 'error');
        return;
    }

    const saved = await PersonalApps.financeApp.syncSalaryIncome(calculateNetSalary(totals.gross), month);
    if (saved) showNotification('השכר החודשי סונכרן להכנסות. סנכרון חוזר יעדכן את אותה רשומה.', 'success');
    else showNotification('לא ניתן היה לסנכרן את השכר החודשי.', 'error');
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
            const calc = calculateShiftForDisplay(shift, wp);
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
                label: 'שכר חודשי (₪)',
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
                    title: { display: true, text: 'שכר (₪)' }
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
                label: 'שעות עבודה',
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
                    title: { display: true, text: 'שעות' }
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
        showNotification('אין עדיין נתונים לניתוח. הוסף משמרות תחילה.', 'info');
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
                label: 'שכר חודשי',
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
                    title: { display: true, text: 'שכר (₪)' }
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
        showNotification('נא להזין גם שעות וגם שכר', 'warning');
        return;
    }

    const month = document.getElementById('filter-month').value;
    const shifts = filterShiftsByMonth(month);
    
    let systemHours = 0;
    let systemGross = 0;

    shifts.forEach(s => {
        const wp = APP.state.workplaces.find(w => w.id === s.workplaceId) || { wage: 0 };
        const calc = calculateShiftForDisplay(s, wp);
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
    const credits = APP.state.settings.creditPoints != null ? APP.state.settings.creditPoints : 2.25;

    const result = AppUtils.TaxCalculator.calculateNetSalary(gross, pension, credits, 'monthly');
    
    const breakdown = `
        <h4>פירוט שכר (אומדן חודשי)</h4>
        <div class="breakdown-item">
            <span>ברוטו:</span>
            <strong>₪${result.gross.toFixed(2)}</strong>
        </div>
        <div class="breakdown-item">
            <span>מס הכנסה (אחרי נק. זיכוי):</span>
            <strong>₪${result.breakdown.incomeTax.toFixed(2)}</strong>
        </div>
        <div class="breakdown-item">
            <span>נקודות זיכוי (${credits}):</span>
            <strong>₪${result.breakdown.taxCredits.toFixed(2)}</strong>
        </div>
        <div class="breakdown-item">
            <span>ביטוח לאומי:</span>
            <strong>₪${result.breakdown.nationalInsurance.toFixed(2)}</strong>
        </div>
        <div class="breakdown-item">
            <span>מס בריאות:</span>
            <strong>₪${result.breakdown.healthInsurance.toFixed(2)}</strong>
        </div>
        <div class="breakdown-item">
            <span>פנסיה עובד (${pension}%):</span>
            <strong>₪${result.breakdown.employeePension.toFixed(2)}</strong>
        </div>
        <hr style="border-color: var(--border); margin: 12px 0;">
        <div class="breakdown-item" style="font-size: 1.1em; font-weight: bold;">
            <span>נטו משוער:</span>
            <strong style="color: var(--success);">₪${result.net.toFixed(2)}</strong>
        </div>
        <p style="font-size:.85em;opacity:.7;margin-top:8px;">אומדן בלבד, אינו מחליף תלוש רשמי</p>
    `;

    document.getElementById('calc-breakdown').innerHTML = breakdown;
}

function updateMonthlyDailyCalculator() {
    const resultHost = document.getElementById('monthly-pay-result');
    if (!resultHost) return;

    const monthInput = document.getElementById('monthly-pay-month');
    if (!monthInput.value) {
        monthInput.value = getCurrentMonthKey();
    }

    const dailyRate = Math.max(0, Number(document.getElementById('monthly-pay-daily').value) || 0);
    const pension = Math.max(0, Number(document.getElementById('monthly-pay-pension').value) || 0);
    const credits = Math.max(0, Number(document.getElementById('monthly-pay-credits').value) || 0);
    const selectedDays = new Set(Array.from(document.querySelectorAll('.monthly-pay-day:checked')).map(input => Number(input.value)));
    const excludedDates = new Set((document.getElementById('monthly-pay-excluded').value || '').split(',').map(value => value.trim()).filter(Boolean));
    const [year, month] = monthInput.value.split('-').map(Number);
    const daysInMonth = year && month ? new Date(year, month, 0).getDate() : 0;
    const includedDates = [];

    for (let day = 1; day <= daysInMonth; day++) {
        const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const weekday = new Date(year, month - 1, day).getDay();
        if (selectedDays.has(weekday) && !excludedDates.has(date)) includedDates.push(date);
    }

    const gross = dailyRate * includedDates.length;
    const employee = AppUtils.TaxCalculator.calculateNetSalary(gross, pension, credits, 'monthly');
    const exemptSelfEmployedDeductions = AppUtils.TaxCalculator.calculateDeductions(gross, 0, credits);
    const exemptSelfEmployedNet = Math.max(0, gross - exemptSelfEmployedDeductions.total);
    const calculationType = document.getElementById('monthly-pay-type')?.value || 'compare';

    if (!dailyRate || !daysInMonth) {
        resultHost.innerHTML = '<p class="muted-copy">בחר חודש והזן סכום יומי כדי לראות תוצאה.</p>';
        return;
    }

    const employeeCard = `<div class="monthly-pay-result-card employee"><span>שכיר רגיל</span><strong>${formatCurrency(employee.net)}</strong><small>ברוטו ${formatCurrency(gross)} · ניכויים ${formatCurrency(employee.totalDeductions)}</small></div>`;
    const exemptCard = `<div class="monthly-pay-result-card self-employed"><span>עצמאי / פרילנסר עוסק פטור</span><strong>${formatCurrency(exemptSelfEmployedNet)}</strong><small>הכנסה ${formatCurrency(gross)} · מסים/ביטוח ${formatCurrency(exemptSelfEmployedDeductions.total)} · ללא מע״מ</small></div>`;
    const resultCards = calculationType === 'employee' ? employeeCard : calculationType === 'exempt' ? exemptCard : employeeCard + exemptCard;

    resultHost.innerHTML = `
        <div class="monthly-pay-summary"><strong>${includedDates.length} ימי עבודה</strong><span>${monthInput.value}</span><span>${excludedDates.size} תאריכים מוחרגים</span></div>
        <div class="monthly-pay-results-grid">${resultCards}</div>
        <p class="calculator-disclaimer">אומדן בלבד. עוסק פטור אינו פטור ממס הכנסה או ביטוח לאומי, והחישוב אינו מחליף ייעוץ מקצועי.</p>
    `;
}

// ============================================
// TAX PLANNING
// ============================================

function calculateTaxBenefit() {
    const credits = Number(document.getElementById('tax-credits').value);
    const value = credits * AppUtils.TaxCalculator.CREDIT_POINT_VALUE;
    
    const html = `
        <div class="result-detail">
            <p><strong>נקודות זיכוי:</strong> ${credits}</p>
            <p><strong>הטבה חודשית משוערת:</strong> ₪${value.toFixed(2)}</p>
            <p><strong>הטבה שנתית משוערת:</strong> ₪${(value * 12).toFixed(2)}</p>
        </div>
    `;
    
    document.getElementById('tax-credits-result').innerHTML = html;
}

function calculateTaxes() {
    const income = Number(document.getElementById('tax-income').value);
    const result = AppUtils.TaxCalculator.calculateNetSalary(income, 6, 2.25, 'annual');
    
    const html = `
        <div class="result-detail">
            <p><strong>הכנסה שנתית:</strong> ₪${income.toFixed(2)}</p>
            <p><strong>מס הכנסה (אומדן):</strong> ₪${result.breakdown.incomeTax.toFixed(2)}</p>
            <p><strong>סה״כ ניכויים:</strong> ₪${result.breakdown.total.toFixed(2)}</p>
            <p><strong>נטו שנתי משוער:</strong> ₪${result.net.toFixed(2)}</p>
            <p><strong>נטו חודשי משוער:</strong> ₪${(result.net / 12).toFixed(2)}</p>
            <p style="font-size:.85em;opacity:.7;">מחושב לפי 12 חודשים שווים. זהו אומדן בלבד</p>
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
            <p><strong>הפקדת עובד (חודשי):</strong> ₪${result.employeeContribution.toFixed(2)}</p>
            <p><strong>הפקדת מעסיק (חודשי):</strong> ₪${result.employerContribution.toFixed(2)}</p>
            <p><strong>סה״כ הפקדה חודשית:</strong> ₪${result.totalMonthly.toFixed(2)}</p>
            <p><strong>יתרה מצטברת:</strong> ₪${result.accumulatedBalance.toFixed(2)}</p>
            <p><strong>פנסיה חודשית משוערת:</strong> ₪${result.projectedMonthlyPension.toFixed(2)}</p>
            <p><strong>פנסיה שנתית משוערת:</strong> ₪${result.projectedAnnualPension.toFixed(2)}</p>
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
            <p><strong>שכר חודשי:</strong> ₪${salary.toFixed(2)}</p>
            <p><strong>מס בריאות משוער:</strong> ₪${premium.toFixed(2)}</p>
            <p><strong>שנתי משוער:</strong> ₪${(premium * 12).toFixed(2)}</p>
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
        <h4>פירוט פיצויים וזכויות (אומדן)</h4>
        <div class="result-detail">
            <p><strong>שכר יומי:</strong> ₪${result.dailyWage.toFixed(2)}</p>
            <p><strong>שנות ותק:</strong> ${years}</p>
            <hr>
            <p><strong>פיצויי פיטורים:</strong> ₪${result.severance.toFixed(2)}</p>
            <p><strong>ימי חופשה:</strong> ${result.vacationDays}</p>
            <p><strong>תשלום חופשה:</strong> ₪${result.vacationPay.toFixed(2)}</p>
            <p><strong>ימי הבראה:</strong> ${result.recuperationDays}</p>
            <p><strong>דמי הבראה:</strong> ₪${result.recuperationPay.toFixed(2)}</p>
            <hr>
            <p style="font-size: 1.1em;"><strong>סה״כ משוער:</strong> <span style="color: var(--success); font-size: 1.2em;">₪${result.totalCompensation.toFixed(2)}</span></p>
            <p style="font-size:.85em;opacity:.7;">${result.disclaimer}</p>
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
        opt.textContent = `${wp.name} (₪${wp.wage}/שעה)`;
        select.appendChild(opt);
    });
}

function updateShiftPayMode() {
    const payType = document.getElementById('shift-pay-type')?.value || 'hourly';
    const dailyGroup = document.getElementById('daily-wage-group');
    const dailyInput = document.getElementById('shift-daily-wage');
    const hourlyFields = document.querySelectorAll('.shift-hourly-field');
    const isDaily = payType === 'daily';

    if (dailyGroup) dailyGroup.style.display = isDaily ? 'block' : 'none';
    if (dailyInput) dailyInput.required = isDaily;
    hourlyFields.forEach(field => {
        field.style.display = isDaily ? 'none' : '';
        field.querySelectorAll('input, select').forEach(input => {
            input.required = !isDaily && (input.id === 'shift-start' || input.id === 'shift-end');
            input.disabled = isDaily;
        });
    });
}

function openShiftModal(shiftId = null) {
    const modal = document.getElementById('shift-modal');
    modal.style.display = 'flex';
    document.getElementById('shift-date').value = new Date().toISOString().split('T')[0];

    if (shiftId) {
        const shift = APP.state.shifts.find(s => s.id === shiftId);
        if (shift) {
            document.getElementById('shift-modal-title').textContent = 'עריכת משמרת';
            document.getElementById('shift-id').value = shift.id;
            document.getElementById('shift-workplace').value = shift.workplaceId;
            document.getElementById('shift-date').value = shift.date;
            document.getElementById('shift-pay-type').value = shift.payType || 'hourly';
            document.getElementById('shift-daily-wage').value = shift.dailyWage || '';
            document.getElementById('shift-start').value = shift.startTime;
            document.getElementById('shift-end').value = shift.endTime;
            document.getElementById('shift-break').value = shift.breakMinutes;
            document.getElementById('shift-daytype').value = shift.dayType;
            document.getElementById('shift-tips').value = shift.tips;
            document.getElementById('shift-travel').value = shift.travel;
            document.getElementById('shift-notes').value = shift.notes || '';
        }
    } else {
        document.getElementById('shift-modal-title').textContent = 'הוספת משמרת';
        document.getElementById('shift-form').reset();
        document.getElementById('shift-id').value = '';
    }
    updateShiftPayMode();
}

function closeShiftModal() {
    document.getElementById('shift-modal').style.display = 'none';
}

function saveShift(event) {
    event.preventDefault();

    const id = document.getElementById('shift-id').value || Date.now();
    const payType = document.getElementById('shift-pay-type').value || 'hourly';
    const dailyWage = Number(document.getElementById('shift-daily-wage').value) || 0;
    const startTime = document.getElementById('shift-start').value;
    const endTime = document.getElementById('shift-end').value;

    if (payType === 'daily' && dailyWage <= 0) {
        showNotification('נא להזין סכום יומי', 'warning');
        return;
    }
    if (payType === 'hourly' && (!startTime || !endTime)) {
        showNotification('נא להזין שעת התחלה וסיום', 'warning');
        return;
    }

    const shiftData = {
        id,
        workplaceId: Number(document.getElementById('shift-workplace').value),
        date: document.getElementById('shift-date').value,
        payType,
        dailyWage: payType === 'daily' ? dailyWage : 0,
        startTime: payType === 'daily' ? '' : startTime,
        endTime: payType === 'daily' ? '' : endTime,
        breakMinutes: payType === 'daily' ? 0 : Number(document.getElementById('shift-break').value) || 0,
        dayType: payType === 'daily' ? 'regular' : (document.getElementById('shift-daytype').value || 'regular'),
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
    showNotification('המשמרת נשמרה', 'success');
}

function editShift(id) {
    openShiftModal(id);
}

function deleteShift(id) {
    const shift = APP.state.shifts.find(s => s.id === id);
    if (shift && confirm('להעביר את המשמרת לפח? אפשר לבטל את הפעולה במשך 15 שניות.')) {
        APP.state.shifts = APP.state.shifts.filter(s => s.id !== id);
        APP.state.deletedShifts = [{ ...shift, deletedAt: new Date().toISOString() }, ...(APP.state.deletedShifts || [])].slice(0, 100);
        saveAppState();
        renderDashboard();
        showUndoNotification('המשמרת הועברה לפח', () => restoreDeletedShift(shift.id));
    }
}

function restoreDeletedShift(id) {
    const index = (APP.state.deletedShifts || []).findIndex(shift => shift.id === id);
    if (index < 0) return;
    const [shift] = APP.state.deletedShifts.splice(index, 1);
    delete shift.deletedAt;
    APP.state.shifts.push(shift);
    saveAppState();
    renderDashboard();
    showNotification('המשמרת שוחזרה', 'success');
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
            document.getElementById('workplace-modal-title').textContent = 'עריכת מקום עבודה';
            document.getElementById('workplace-id').value = wp.id;
            document.getElementById('workplace-name').value = wp.name;
            document.getElementById('workplace-rate').value = wp.wage;
        }
    } else {
        document.getElementById('workplace-modal-title').textContent = 'הוספת מקום עבודה';
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
        showNotification('נתוני מקום העבודה לא תקינים', 'error');
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
    showNotification('מקום העבודה נשמר', 'success');
}

function deleteWorkplace(id) {
    if (APP.state.workplaces.length <= 1) {
        showNotification('חובה להשאיר לפחות מקום עבודה אחד', 'warning');
        return;
    }
    
    if (confirm('למחוק את מקום העבודה?')) {
        APP.state.workplaces = APP.state.workplaces.filter(w => w.id !== id);
        saveAppState();
        populateWorkplaceSelects();
        renderWorkplacesList();
        showNotification('מקום העבודה נמחק', 'success');
    }
}

// ============================================
// EXTENDED REPORTING ENGINE
// ============================================

function generateMonthlyReport() {
    const month = document.getElementById('filter-month').value;
    const shifts = filterShiftsByMonth(month);
    
    if (shifts.length === 0) {
        showNotification('אין משמרות בחודש שנבחר', 'warning');
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
    
    showNotification('הדוח נוצר בהצלחה', 'success');
}

function generateYearlyReport() {
    const year = new Date().getFullYear();
    const report = AppExtended.ReportingEngine.generateYearlyReport(year.toString(), APP.state);
    
    if (report.yearSummary.totalShifts === 0) {
        showNotification('אין משמרות לשנה זו', 'warning');
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
    
    showNotification('דוח שנתי נוצר', 'success');
}

function generateTaxReport() {
    const year = Number(document.getElementById('tax-report-year').value) || new Date().getFullYear();
    const report = AppExtended.ReportingEngine.generateTaxReport(year.toString(), APP.state);
    
    const html = `
        <div class="report-preview">
            <h3>דוח מס לשנת ${year}</h3>
            <div class="result-detail">
                <p><strong>הכנסה מעבודה:</strong> ₪${report.employmentIncome.toFixed(2)}</p>
                <p><strong>ברוטו:</strong> ₪${report.grossIncome.toFixed(2)}</p>
                <p><strong>מס הכנסה:</strong> ₪${report.deductions.incomeTax.toFixed(2)}</p>
                <p><strong>ביטוח לאומי:</strong> ₪${report.deductions.nationalInsurance.toFixed(2)}</p>
                <p><strong>מס בריאות:</strong> ₪${report.deductions.healthInsurance.toFixed(2)}</p>
                <p><strong>פנסיה:</strong> ₪${report.deductions.pensionContribution.toFixed(2)}</p>
                <p><strong>סה״כ ניכויים:</strong> ₪${report.deductions.totalDeductions.toFixed(2)}</p>
                <p><strong>נטו:</strong> ₪${report.netIncome.toFixed(2)}</p>
                <p><strong>שיעור מס אפקטיבי:</strong> ${report.effectiveTaxRate}</p>
                <p style="font-size:.85em;opacity:.7;">אומדן בלבד, אינו דוח רשמי</p>
            </div>
        </div>
    `;
    
    document.getElementById('tax-report-result').innerHTML = html;
    showNotification('דוח מס נוצר', 'success');
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
        showNotification('הנתונים יוצאו כגיבוי JSON', 'success');
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
        showNotification('הנתונים יוצאו כ־CSV', 'success');
    } catch (e) {
        showNotification('Error exporting CSV: ' + e.message, 'danger');
    }
}

function exportPDF() {
    try {
        const element = document.getElementById('main-screen');
        if (!element || typeof html2pdf === 'undefined') {
            showNotification('ייצוא PDF אינו זמין', 'warning');
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
        showNotification('ייצוא PDF התחיל', 'success');
    } catch (e) {
        showNotification('Error exporting PDF: ' + e.message, 'danger');
    }
}

function exportShiftsPDF() {
    const month = document.getElementById('filter-month')?.value || getCurrentMonthKey();
    const shifts = filterShiftsByMonth(month);
    if (!shifts.length) {
        showNotification('אין משמרות לייצוא בחודש שנבחר', 'warning');
        return;
    }
    if (typeof html2pdf === 'undefined') {
        showNotification('ייצוא PDF אינו זמין', 'warning');
        return;
    }

    const safe = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const rows = shifts.map(shift => {
        const workplace = APP.state.workplaces.find(item => item.id === shift.workplaceId) || { name: 'לא ידוע', wage: 0 };
        const calc = calculateShiftForDisplay(shift, workplace);
        const extras = Number(shift.tips || 0) + Number(shift.travel || 0);
        return `<tr><td>${safe(shift.date)}</td><td>${safe(workplace.name)}</td><td>${shift.payType === 'daily' ? 'יום עבודה' : `${safe(shift.startTime)} - ${safe(shift.endTime)}`}</td><td>${calc.hours.toFixed(2)}</td><td>₪${(calc.total + extras).toFixed(2)}</td></tr>`;
    }).join('');
    const report = document.createElement('div');
    report.dir = 'rtl';
    report.style.cssText = 'position:fixed;left:-10000px;top:0;width:760px;padding:36px;background:#fff;color:#15251e;font-family:Segoe UI,Arial,sans-serif;';
    report.innerHTML = `<h1 style="margin:0 0 8px;">דוח משמרות</h1><p style="color:#5b7168;">חודש: ${safe(month)} · ${shifts.length} משמרות</p><table style="width:100%;border-collapse:collapse;margin-top:24px;font-size:13px;"><thead><tr style="background:#e8f2ec;"><th style="padding:10px;text-align:right;">תאריך</th><th style="padding:10px;text-align:right;">מקום עבודה</th><th style="padding:10px;text-align:right;">שעות / סוג</th><th style="padding:10px;text-align:right;">שעות</th><th style="padding:10px;text-align:right;">סה״כ</th></tr></thead><tbody>${rows}</tbody></table><p style="margin-top:28px;color:#73867d;font-size:11px;">המסמך הופק מ־Ultimate Pro. חישובי השכר הם אומדן בלבד.</p>`;
    document.body.appendChild(report);

    html2pdf().set({
        margin: 10,
        filename: `ultimate_pro_shifts_${month}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, backgroundColor: '#ffffff' },
        jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
    }).from(report).save().then(() => {
        report.remove();
        showNotification('דוח המשמרות יוצא ל־PDF', 'success');
    }).catch(error => {
        report.remove();
        showNotification(`ייצוא PDF נכשל: ${error.message}`, 'error');
    });
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
    const creditsEl = document.getElementById('setting-credits');
    const pinEl = document.getElementById('setting-pin');

    APP.state.settings.travel = travel;
    APP.state.settings.pension = pension;
    if (creditsEl) {
        APP.state.settings.creditPoints = Number(creditsEl.value) || 2.25;
    }
    if (pinEl && pinEl.value.trim().length >= 4) {
        APP.state.settings.unlockPin = pinEl.value.trim();
        pinEl.value = '';
        showNotification('קוד הגישה עודכן', 'success');
    }

    saveAppState();
    showNotification('ההגדרות נשמרו', 'success');
}

function saveProfile() {
    const nameEl = document.getElementById('profile-fullname');
    const emailEl = document.getElementById('profile-email');
    const phoneEl = document.getElementById('profile-phone');

    const name = nameEl ? nameEl.value.trim() : (APP.state.profile.name || '');
    const email = emailEl ? emailEl.value.trim() : '';
    const phone = phoneEl ? phoneEl.value.trim() : '';

    if (email && !AppUtils.Utils.validateEmail(email)) {
        showNotification('כתובת אימייל לא תקינה', 'warning');
        return;
    }

    APP.state.profile = { name, email, phone };
    if (name) {
        const userNameEl = document.getElementById('user-name');
        const dashNameEl = document.getElementById('dashboard-user-name');
        const profileHeading = document.getElementById('profile-name');
        if (userNameEl) userNameEl.textContent = name;
        if (dashNameEl) dashNameEl.textContent = name;
        if (profileHeading && profileHeading.tagName === 'H2') profileHeading.textContent = name;
    }
    saveAppState();
    showNotification('הפרופיל נשמר', 'success');
}

function resetAllData() {
    if (confirm('פעולה זו תמחק את כל הנתונים. להמשיך?')) {
        if (confirm('אישור אחרון: לא ניתן לשחזר את הנתונים!')) {
            APP.state.shifts = [];
            APP.state.deletedShifts = [];
            APP.state.workplaces = [{ id: 1, name: 'מקום עבודה ברירת מחדל', wage: 45 }];
            APP.state.settings = {
                pension: 6,
                travel: 25,
                creditPoints: 2.25,
                unlockPin: APP.state.settings.unlockPin || null,
                workplaces: []
            };
            APP.state.profile = { name: '', email: '', phone: '' };
            APP.state.notifications = [];

            saveAppState();
            renderDashboard();
            showNotification('כל הנתונים אופסו', 'warning');
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
        showNotification('אין נתונים לניתוח', 'info');
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
        showNotification('גיבוי ידני נוצר', 'success');
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
                showNotification('הנתונים שוחזרו מהגיבוי', 'success');
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
                showNotification('הנתונים יובאו בהצלחה', 'success');
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
        showNotification('הנתונים נשמרו', 'success');
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
setInterval(() => {
    if (APP.state.currentUser) saveAppState();
}, 5 * 60 * 1000);

// Initialize theme on page load (do not render dashboard before login)
window.addEventListener('load', () => {
    applyTheme();
    setCurrentMonth();
});

function renderWorkplacesList() {
    const list = document.getElementById('workplaces-list');
    if (!list) return;

    list.innerHTML = APP.state.workplaces.map(wp => `
        <div class="workplace-item">
            <div>
                <h4>${wp.name}</h4>
                <p>₪${wp.wage}/שעה</p>
            </div>
            <div class="item-actions">
                <button class="btn btn-sm btn-secondary" onclick="openWorkplaceModal(${wp.id})">עריכה</button>
                <button class="btn btn-sm btn-danger" onclick="deleteWorkplace(${wp.id})">מחיקה</button>
            </div>
        </div>
    `).join('');
}

function deleteWorkplace(id) {
    if (APP.state.workplaces.length <= 1) {
        showNotification('חובה להשאיר לפחות מקום עבודה אחד', 'warning');
        return;
    }
    
    if (confirm('למחוק את מקום העבודה?')) {
        APP.state.workplaces = APP.state.workplaces.filter(w => w.id !== id);
        saveAppState();
        populateWorkplaceSelects();
        renderWorkplacesList();
        showNotification('מקום העבודה נמחק', 'success');
    }
}

// ============================================
// REPORTS & EXPORTS
// ============================================

function generateMonthlyReport() {
    const month = document.getElementById('filter-month').value;
    showNotification('יוצר דוח חודשי...', 'info');
    // Report generation logic would go here
}

function generateYearlyReport() {
    showNotification('יוצר דוח שנתי...', 'info');
}

function generateTaxReport() {
    const year = Number(document.getElementById('tax-report-year').value);
    showNotification(`Generating tax report for ${year}...`, 'info');
}

function exportDataJSON() {
    const dataStr = JSON.stringify(APP.state, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    downloadFile(dataBlob, `ultimate_pro_data_${new Date().toISOString().split('T')[0]}.json`);
    showNotification('הנתונים יוצאו כ־JSON', 'success');
}

function exportDataCSV() {
    let csv = 'Date,Workplace,Start,End,Hours,Salary\n';
    APP.state.shifts.forEach(s => {
        const wp = APP.state.workplaces.find(w => w.id === s.workplaceId) || { name: 'Unknown' };
        csv += `${s.date},${wp.name},${s.startTime},${s.endTime}\n`;
    });
    
    const csvBlob = new Blob([csv], { type: 'text/csv' });
    downloadFile(csvBlob, `ultimate_pro_shifts_${new Date().toISOString().split('T')[0]}.csv`);
    showNotification('הנתונים יוצאו כ־CSV', 'success');
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
// SETTINGS HELPERS (v2.1)
// ============================================

function exportAllData() {
    exportDataJSON();
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const migrated = migrateState(data);
            APP.state.workplaces = migrated.workplaces;
            APP.state.shifts = migrated.shifts;
            APP.state.settings = { ...APP.state.settings, ...migrated.settings };
            APP.state.profile = migrated.profile || APP.state.profile;
            await saveAppState();
            renderDashboard();
            populateWorkplaceSelects();
            renderWorkplacesList();
            showNotification('הנתונים יובאו בהצלחה', 'success');
        } catch (err) {
            showNotification('ייבוא נכשל: קובץ לא תקין', 'error');
            console.error(err);
        }
    };
    input.click();
}

function resetAll() {
    resetAllData();
}

function openContactForm() {
    showNotification('לפניות: עדכן פרטים בפרופיל או ייצא דוח מהמסך דוחות', 'info');
}
