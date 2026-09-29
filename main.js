const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { ProfileStore } = require('./src/main/services/profile-store');
const { WeatherService } = require('./src/main/services/weather-service');
const { FinanceStore } = require('./src/main/services/finance-store');
const { DashboardFeedService } = require('./src/main/services/dashboard-feed-service');
const { GoogleCalendarService } = require('./src/main/services/google-calendar-service');
const { DriveSyncService } = require('./src/main/services/driveSync');

const APP_VERSION = '1.0.0';
let mainWindow = null;
let allowWindowCloseAfterSync = false;
let allowAppQuitAfterSync = false;
let finalBackupPromise = null;
let activeGoogleAccount = null;
const profileStore = new ProfileStore({ app, safeStorage, getAccountId: () => activeGoogleAccount?.sub || '' });
const weatherService = new WeatherService();
const financeStore = new FinanceStore({ app, safeStorage, getAccountId: () => activeGoogleAccount?.sub || '' });
const dashboardFeed = new DashboardFeedService();
const googleCalendarService = new GoogleCalendarService({
    app,
    safeStorage,
    openExternal: target => shell.openExternal(target)
});
const driveSyncService = new DriveSyncService({
    googleCalendarService,
    app,
    profileStore,
    financeStore,
    getSalaryState: () => readJsonSafe(getDataPath(), null),
    saveSalaryState: data => writeJsonSafe(getDataPath(), data),
    appVersion: APP_VERSION
});

function getAccountStorageDirectory(accountId = activeGoogleAccount?.sub) {
    if (!accountId) return null;
    const accountKey = crypto.createHash('sha256').update(String(accountId)).digest('hex');
    return path.join(app.getPath('userData'), 'accounts', accountKey);
}

function getAccountSessionPath() {
    return path.join(app.getPath('userData'), 'active-google-account.bin');
}

function getLegacyMigrationPath() {
    return path.join(app.getPath('userData'), 'google-account-migration.json');
}

function migrateLegacyDataToAccount(accountId) {
    const marker = readJsonSafe(getLegacyMigrationPath());
    if (marker?.ownerHash) return;
    const directory = getAccountStorageDirectory(accountId);
    const targets = [
        path.join(directory, 'ultimate-pro-data.json'),
        path.join(directory, 'personal-profile.bin'),
        path.join(directory, 'personal-finance.bin')
    ];
    const legacy = [getLegacyDataPath(), getLegacyProfilePath(), getLegacyFinancePath()];
    if (targets.some(filePath => fs.existsSync(filePath))) {
        writeJsonSafe(getLegacyMigrationPath(), {
            ownerHash: crypto.createHash('sha256').update(String(accountId)).digest('hex'),
            migratedAt: new Date().toISOString(),
            migrated: false
        });
        return;
    }
    const available = legacy.map((filePath, index) => fs.existsSync(filePath) ? [filePath, targets[index]] : null).filter(Boolean);
    if (available.length) {
        fs.mkdirSync(directory, { recursive: true });
        available.forEach(([source, target]) => fs.copyFileSync(source, target));
    }
    writeJsonSafe(getLegacyMigrationPath(), {
        ownerHash: crypto.createHash('sha256').update(String(accountId)).digest('hex'),
        migratedAt: new Date().toISOString(),
        migrated: available.length > 0
    });
}

function setActiveGoogleAccount(account) {
    if (!account || typeof account.sub !== 'string' || !account.sub) return false;
    activeGoogleAccount = {
        sub: account.sub,
        email: String(account.email || ''),
        name: String(account.name || '')
    };
    if (safeStorage.isEncryptionAvailable()) {
        const sessionPath = getAccountSessionPath();
        fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
        fs.writeFileSync(sessionPath, safeStorage.encryptString(JSON.stringify(activeGoogleAccount)));
    }
    migrateLegacyDataToAccount(activeGoogleAccount.sub);
    return true;
}

function restoreActiveGoogleAccount() {
    try {
        const tokenAccount = googleCalendarService.loadTokens()?.account;
        if (tokenAccount?.sub) {
            activeGoogleAccount = tokenAccount;
            migrateLegacyDataToAccount(tokenAccount.sub);
            return;
        }
        const sessionPath = getAccountSessionPath();
        if (!fs.existsSync(sessionPath) || !safeStorage.isEncryptionAvailable()) return;
        const account = JSON.parse(safeStorage.decryptString(fs.readFileSync(sessionPath)));
        if (account?.sub) {
            activeGoogleAccount = account;
            migrateLegacyDataToAccount(account.sub);
        }
    } catch (error) {
        console.warn('Google account session could not be restored:', error);
    }
}

restoreActiveGoogleAccount();

function isTrustedRenderer(event) {
    return !!mainWindow && event.sender === mainWindow.webContents;
}

function getLegacyDataPath() {
    return path.join(app.getPath('userData'), 'ultimate-pro-data.json');
}

function getLegacyProfilePath() {
    return path.join(app.getPath('userData'), 'personal-profile.bin');
}

function getLegacyFinancePath() {
    return path.join(app.getPath('userData'), 'personal-finance.bin');
}

function getDataPath(accountId = activeGoogleAccount?.sub) {
    const directory = getAccountStorageDirectory(accountId);
    return directory
        ? path.join(directory, 'ultimate-pro-data.json')
        : getLegacyDataPath();
}

function getBoundsPath() {
    return path.join(app.getPath('userData'), 'window-bounds.json');
}

function readJsonSafe(filePath, fallback = null) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (err) {
        console.error('Failed to read', filePath, err);
    }
    return fallback;
}

function writeJsonSafe(filePath, data) {
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error('Failed to write', filePath, err);
        return false;
    }
}

function flushDriveBackupBeforeQuit() {
    if (finalBackupPromise) return finalBackupPromise;
    if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve();
    finalBackupPromise = mainWindow.webContents.executeJavaScript(
        'window.PersonalApps?.driveSync?.flushAutoSync?.()'
    ).catch(error => {
        console.warn('Final Drive backup could not complete:', error);
    });
    return finalBackupPromise;
}

function createWindow() {
    const { screen } = require('electron');
    const display = screen.getPrimaryDisplay().workAreaSize;
    const savedBounds = readJsonSafe(getBoundsPath(), null);

    const defaultWidth = Math.min(Math.max(Math.floor(display.width * 0.92), 1100), display.width);
    const defaultHeight = Math.min(Math.max(Math.floor(display.height * 0.92), 750), display.height);

    const useSaved = savedBounds
        && savedBounds.width >= 900
        && savedBounds.height >= 600
        && savedBounds.width >= display.width * 0.55;

    const windowOptions = {
        width: useSaved ? savedBounds.width : defaultWidth,
        height: useSaved ? savedBounds.height : defaultHeight,
        minWidth: 900,
        minHeight: 650,
        show: false,
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js'),
            sandbox: true
        }
    };

    if (useSaved && savedBounds.x != null && savedBounds.y != null) {
        windowOptions.x = savedBounds.x;
        windowOptions.y = savedBounds.y;
    }

    mainWindow = new BrowserWindow(windowOptions);
    mainWindow.loadFile('index.html');
    mainWindow.setMenuBarVisibility(false);

    mainWindow.once('ready-to-show', () => {
        if (!useSaved) {
            mainWindow.maximize();
        }
        mainWindow.show();
    });

    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('close', () => {
        if (!mainWindow) return;
        if (!mainWindow.isMaximized()) {
            writeJsonSafe(getBoundsPath(), mainWindow.getBounds());
        } else {
            writeJsonSafe(getBoundsPath(), { maximized: true, ...mainWindow.getBounds() });
        }
    });

    mainWindow.on('close', event => {
        if (allowWindowCloseAfterSync) return;
        event.preventDefault();
        flushDriveBackupBeforeQuit().finally(() => {
            allowWindowCloseAfterSync = true;
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
        });
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

ipcMain.handle('storage:load', () => readJsonSafe(getDataPath(), null));

ipcMain.handle('storage:save', (_event, data) => {
    if (!data || typeof data !== 'object') {
        return { ok: false, error: 'Invalid payload' };
    }
    const ok = writeJsonSafe(getDataPath(), data);
    return { ok };
});

ipcMain.handle('profile:load', (event) => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'גישה נדחתה.' };
    return profileStore.load();
});

ipcMain.handle('profile:save', (event, profile) => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'גישה נדחתה.' };
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
        return { ok: false, error: 'פרטי הפרופיל אינם תקינים.' };
    }
    return profileStore.save(profile);
});

ipcMain.handle('weather:get', (event, city) => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'גישה נדחתה.' };
    return weatherService.getWeather(city);
});

ipcMain.handle('dashboard:advice', (event) => {
    if (!isTrustedRenderer(event)) return { ok: false, advice: 'צעד קטן ועקבי יכול לעשות שינוי גדול.' };
    return dashboardFeed.getAdvice();
});

ipcMain.handle('dashboard:fact', (event) => {
    if (!isTrustedRenderer(event)) return { ok: false, fact: 'היום הוא זמן טוב לגלות משהו חדש.' };
    return dashboardFeed.getDailyFact();
});

ipcMain.handle('google-calendar:status', event => {
    if (!isTrustedRenderer(event)) return { connected: false };
    return googleCalendarService.getStatus();
});

ipcMain.handle('google-calendar:sign-in', async event => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'גישה נדחתה.' };
    const previousAccountId = activeGoogleAccount?.sub || '';
    const result = await googleCalendarService.signIn();
    if (result?.ok && !setActiveGoogleAccount(result.account)) {
        return { ok: false, error: 'לא ניתן לאמת את חשבון Google.' };
    }
    if (!result?.ok) return result;
    const { sub: _privateSubject, ...publicAccount } = result.account;
    return {
        ...result,
        account: publicAccount,
        accountChanged: Boolean(previousAccountId && previousAccountId !== result.account.sub)
    };
});

ipcMain.handle('google-calendar:sign-out', event => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'גישה נדחתה.' };
    return googleCalendarService.signOut();
});

ipcMain.handle('google-calendar:list-events', (event, range) => {
    if (!isTrustedRenderer(event) || !range || typeof range !== 'object' || Array.isArray(range)) {
        return { ok: false, error: 'בקשת היומן אינה תקינה.' };
    }
    return googleCalendarService.listEvents(range);
});

ipcMain.handle('google-calendar:create-event', (event, details) => {
    if (!isTrustedRenderer(event) || !details || typeof details !== 'object' || Array.isArray(details)) {
        return { ok: false, error: 'פרטי האירוע אינם תקינים.' };
    }
    return googleCalendarService.createEvent(details);
});

ipcMain.handle('google-calendar:update-event', (event, details) => {
    if (!isTrustedRenderer(event) || !details || typeof details !== 'object' || Array.isArray(details)) {
        return { ok: false, error: 'פרטי האירוע אינם תקינים.' };
    }
    return googleCalendarService.updateEvent(details.id, details.event);
});

ipcMain.handle('finance:load', (event) => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'גישה נדחתה.' };
    return financeStore.load();
});

ipcMain.handle('finance:save', (event, data) => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'גישה נדחתה.' };
    return financeStore.save(data);
});

ipcMain.handle('drive-backup:status', event => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'גישה נדחתה.' };
    return driveSyncService.getDriveStatus();
});

ipcMain.handle('drive-backup:last-date', event => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'גישה נדחתה.' };
    return driveSyncService.getLastBackupDate();
});

ipcMain.handle('drive-backup:upload', (event, localStorageSnapshot) => {
    if (!isTrustedRenderer(event) || !localStorageSnapshot || typeof localStorageSnapshot !== 'object' || Array.isArray(localStorageSnapshot)) {
        return { ok: false, error: 'נתוני הגיבוי אינם תקינים.' };
    }
    return driveSyncService.uploadBackupToDrive(localStorageSnapshot);
});

ipcMain.handle('drive-backup:download', event => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'גישה נדחתה.' };
    return driveSyncService.getBackupFromDrive();
});

ipcMain.handle('drive-backup:restore', (event, backup) => {
    if (!isTrustedRenderer(event) || !backup || typeof backup !== 'object' || Array.isArray(backup)) {
        return { ok: false, error: 'קובץ הגיבוי אינו תקין.' };
    }
    return driveSyncService.restoreBackupFromDrive(backup);
});

ipcMain.handle('contact:open', async (event, type) => {
    if (!isTrustedRenderer(event) || !['email', 'whatsapp'].includes(type)) {
        return { ok: false, error: 'גישה נדחתה.' };
    }
    const result = profileStore.load();
    if (!result.ok || !result.profile) return { ok: false, error: 'יש להשלים תחילה את הפרופיל.' };

    let target;
    if (type === 'email') {
        if (!result.profile.email) return { ok: false, error: 'הוסף כתובת דוא״ל בפרופיל.' };
        target = `mailto:${result.profile.email}?subject=${encodeURIComponent('הודעה מ־Ultimate Pro')}&body=${encodeURIComponent('שלום,\n\n')}`;
    } else {
        const digits = result.profile.phone.replace(/\D/g, '');
        const internationalNumber = digits.startsWith('0') ? `972${digits.slice(1)}` : digits;
        if (internationalNumber.length < 9 || internationalNumber.length > 15) {
            return { ok: false, error: 'הוסף מספר טלפון תקין בפרופיל.' };
        }
        target = `https://wa.me/${internationalNumber}?text=${encodeURIComponent('שלום,')}`;
    }

    try {
        await shell.openExternal(target);
        return { ok: true };
    } catch (error) {
        console.error('Personal contact app could not be opened', error);
        return { ok: false, error: 'לא ניתן לפתוח את אפליקציית הקשר.' };
    }
});

ipcMain.handle('app:version', () => APP_VERSION);

ipcMain.handle('window:get-bounds', () => {
    return mainWindow ? mainWindow.getBounds() : null;
});

ipcMain.handle('window:set-bounds', (_event, bounds) => {
    if (mainWindow && bounds) {
        mainWindow.setBounds(bounds);
        writeJsonSafe(getBoundsPath(), bounds);
        return true;
    }
    return false;
});

ipcMain.on('account:namespace', event => {
    if (!isTrustedRenderer(event) || !activeGoogleAccount?.sub) {
        event.returnValue = 'anonymous';
        return;
    }
    event.returnValue = crypto.createHash('sha256').update(activeGoogleAccount.sub).digest('hex');
});

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', event => {
    if (allowAppQuitAfterSync) return;
    if (!mainWindow || mainWindow.isDestroyed()) {
        allowAppQuitAfterSync = true;
        return;
    }
    event.preventDefault();
    flushDriveBackupBeforeQuit().finally(() => {
        allowAppQuitAfterSync = true;
        allowWindowCloseAfterSync = true;
        app.quit();
    });
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});
