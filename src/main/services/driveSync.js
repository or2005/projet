const path = require('path');
const { validateProfile } = require('../../renderer/shared/profile.js');
const { validateBackup: validateFinanceBackup } = require('../../renderer/apps/finance/finance-model.js');

const BACKUP_FILE_NAME = 'ultimate_pro_backup.json';
const BACKUP_FORMAT = 'ultimate-pro-backup';
const BACKUP_SCHEMA_VERSION = 1;
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const LOCAL_DIRTY_KEY = 'ultimate_pro_drive_local_modified_at';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const MAX_BACKUP_BYTES = 45 * 1024 * 1024;

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidISODate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function emptySalaryState() {
    return {
        schemaVersion: 4,
        theme: 'light',
        workplaces: [{ id: 1, name: 'מקום עבודה ברירת מחדל', wage: 45 }],
        shifts: [],
        deletedShifts: [],
        settings: { pension: 6, travel: 25, creditPoints: 2.25, employmentMode: 'employee', unlockPin: null, workplaces: [] },
        profile: { name: '', email: '', phone: '' },
        notifications: []
    };
}

function emptyFinanceState() {
    return {
        schemaVersion: 1,
        accounts: [
            { id: 'checking', name: 'חשבון בנק', type: 'checking', openingBalance: 0 },
            { id: 'cash', name: 'מזומן', type: 'cash', openingBalance: 0 }
        ],
        transactions: [],
        recurring: [],
        budgets: { total: 0, categories: {}, savingsRate: 10 },
        customCategories: { income: [], expense: [] }
    };
}

class DriveSyncService {
    constructor({ googleCalendarService, app, profileStore, financeStore, getSalaryState, saveSalaryState, appVersion, fileSystem = require('fs'), pathModule = path }) {
        this.googleCalendarService = googleCalendarService;
        this.app = app;
        this.profileStore = profileStore;
        this.financeStore = financeStore;
        this.getSalaryState = getSalaryState;
        this.saveSalaryState = saveSalaryState;
        this.appVersion = appVersion;
        this.fileSystem = fileSystem;
        this.pathModule = pathModule;
    }

    getDriveStatus() {
        const status = this.googleCalendarService.getStatus();
        return Promise.resolve(status).then(result => ({
            connected: Boolean(result?.connected),
            driveEnabled: Boolean(result?.driveEnabled || this.googleCalendarService.hasScope(DRIVE_SCOPE))
        }));
    }

    requireDriveScope() {
        if (!this.googleCalendarService.hasScope(DRIVE_SCOPE)) {
            const error = new Error('יש להתחבר מחדש ל-Google כדי לאשר גישה לתיקיית גיבוי האפליקציה.');
            error.code = 'missing-scope';
            throw error;
        }
    }

    async listBackupFiles() {
        this.requireDriveScope();
        const url = new URL(DRIVE_FILES_URL);
        url.searchParams.set('q', `name = '${BACKUP_FILE_NAME}' and 'appDataFolder' in parents and trashed = false`);
        url.searchParams.set('spaces', 'appDataFolder');
        url.searchParams.set('pageSize', '10');
        url.searchParams.set('orderBy', 'modifiedTime desc');
        url.searchParams.set('fields', 'files(id,name,modifiedTime,mimeType)');
        const result = await this.googleCalendarService.authorizedRequest(url);
        return Array.isArray(result.files) ? result.files : [];
    }

    getSalaryPath() {
        return this.pathModule.join(this.app.getPath('userData'), 'ultimate-pro-data.json');
    }

    normalizeLocalStorage(input) {
        if (!isPlainObject(input)) throw new Error('נתוני הדפדפן לגיבוי אינם תקינים.');
        const values = Object.create(null);
        Object.entries(input).forEach(([key, value]) => {
            if (typeof key !== 'string' || key.length > 200 || typeof value !== 'string') return;
            if (key === 'ultimate_pro_drive_backup_date' || key === LOCAL_DIRTY_KEY) return;
            values[key] = value;
        });
        return values;
    }

    async createBackup(localStorageSnapshot) {
        const localStorage = this.normalizeLocalStorage(localStorageSnapshot);
        const salary = this.getSalaryState();
        const financeResult = this.financeStore.load();
        if (!financeResult?.ok) throw new Error(financeResult?.error || 'לא ניתן לקרוא את נתוני הכספים.');
        const profileResult = this.profileStore.load();
        if (!profileResult?.ok) throw new Error(profileResult?.error || 'לא ניתן לקרוא את הפרופיל המאובטח.');
        let calendarEvents = [];
        try {
            const rawEvents = localStorage.ultimate_pro_calendar_events_v1;
            const parsedEvents = rawEvents ? JSON.parse(rawEvents) : [];
            if (Array.isArray(parsedEvents)) calendarEvents = parsedEvents;
        } catch {
            throw new Error('נתוני היומן המקומיים אינם תקינים.');
        }

        return {
            format: BACKUP_FORMAT,
            schemaVersion: BACKUP_SCHEMA_VERSION,
            appVersion: this.appVersion,
            createdAt: new Date().toISOString(),
            salary: isPlainObject(salary) ? salary : emptySalaryState(),
            finance: financeResult.data || emptyFinanceState(),
            profile: profileResult.profile || null,
            calendarEvents,
            localStorage
        };
    }

    async beginUpload(fileId, content) {
        const bytes = Buffer.byteLength(content, 'utf8');
        if (bytes > MAX_BACKUP_BYTES) throw new Error('קובץ הגיבוי גדול מדי להעלאה.');
        const url = new URL(fileId ? `${DRIVE_UPLOAD_URL}/${encodeURIComponent(fileId)}` : DRIVE_UPLOAD_URL);
        url.searchParams.set('uploadType', 'resumable');
        url.searchParams.set('fields', 'id,name,modifiedTime');
        const metadata = fileId ? undefined : { name: BACKUP_FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' };
        const headers = {
            'X-Upload-Content-Type': 'application/json',
            'X-Upload-Content-Length': String(bytes)
        };
        if (metadata) headers['Content-Type'] = 'application/json; charset=UTF-8';
        const response = await this.googleCalendarService.authorizedFetch(url, {
            method: fileId ? 'PATCH' : 'POST',
            headers,
            ...(metadata ? { body: JSON.stringify(metadata) } : {})
        });
        const sessionUrl = response.headers?.get?.('location');
        if (!sessionUrl) throw new Error('Google Drive לא החזיר כתובת להעלאת הגיבוי.');
        const parsedSessionUrl = new URL(sessionUrl);
        if (parsedSessionUrl.protocol !== 'https:'
            || (parsedSessionUrl.hostname !== 'googleapis.com' && !parsedSessionUrl.hostname.endsWith('.googleapis.com'))) {
            throw new Error('כתובת ההעלאה שהוחזרה מ-Google אינה בטוחה.');
        }
        const uploadResponse = await this.googleCalendarService.authorizedFetch(sessionUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
                'Content-Length': String(bytes),
                'Content-Range': `bytes 0-${bytes - 1}/${bytes}`
            },
            body: content
        });
        return uploadResponse.json();
    }

    async uploadBackupToDrive(localStorageSnapshot) {
        try {
            const backup = await this.createBackup(localStorageSnapshot);
            const content = JSON.stringify(backup);
            const existingFiles = await this.listBackupFiles();
            const file = await this.beginUpload(existingFiles[0]?.id || '', content);
            return {
                ok: true,
                fileName: BACKUP_FILE_NAME,
                modifiedTime: file.modifiedTime || new Date().toISOString(),
                size: Buffer.byteLength(content, 'utf8')
            };
        } catch (error) {
            return { ok: false, code: error.code || '', error: error?.message || 'הגיבוי ל-Google Drive נכשל.' };
        }
    }

    async getLastBackupDate() {
        try {
            const files = await this.listBackupFiles();
            const file = files[0];
            if (!file) return { ok: true, exists: false, date: '' };
            const date = new Date(file.modifiedTime);
            if (Number.isNaN(date.getTime())) return { ok: false, error: 'תאריך הגיבוי מ-Google Drive אינו תקין.' };
            return {
                ok: true,
                exists: true,
                modifiedTime: file.modifiedTime,
                date: new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
            };
        } catch (error) {
            return { ok: false, code: error.code || '', error: error?.message || 'לא ניתן לבדוק את תאריך הגיבוי.' };
        }
    }

    async downloadBackup() {
        const files = await this.listBackupFiles();
        if (!files.length) {
            const error = new Error('לא נמצא גיבוי של Ultimate Pro בחשבון Google Drive הזה.');
            error.code = 'not-found';
            throw error;
        }
        const file = await this.googleCalendarService.authorizedRequest(`${DRIVE_FILES_URL}/${encodeURIComponent(files[0].id)}?alt=media`);
        if (!isPlainObject(file) || file.format !== BACKUP_FORMAT || file.schemaVersion !== BACKUP_SCHEMA_VERSION) {
            throw new Error('קובץ הגיבוי אינו בפורמט מוכר או שמספר הגרסה אינו נתמך.');
        }
        return file;
    }

    async getBackupFromDrive() {
        try {
            const backup = await this.downloadBackup();
            const validation = this.validateRestoreBackup(backup);
            return validation.valid ? { ok: true, backup } : { ok: false, error: validation.error };
        } catch (error) {
            return { ok: false, code: error.code || '', error: error?.message || 'לא ניתן להוריד את הגיבוי.' };
        }
    }

    validateRestoreBackup(backup) {
        if (!isPlainObject(backup) || backup.format !== BACKUP_FORMAT || backup.schemaVersion !== BACKUP_SCHEMA_VERSION
            || !isPlainObject(backup.salary) || !Array.isArray(backup.salary.shifts) || !Array.isArray(backup.salary.workplaces)
            || !isPlainObject(backup.salary.settings) || !isPlainObject(backup.finance)
            || !isPlainObject(backup.localStorage) || !Array.isArray(backup.calendarEvents)) {
            return { valid: false, error: 'מבנה קובץ הגיבוי אינו שלם או אינו תקין.' };
        }
        const financeResult = validateFinanceBackup({ ...backup.finance, format: 'ultimate-pro-finance', schemaVersion: 1 });
        if (!financeResult.valid) return financeResult;
        const workplacesValid = backup.salary.workplaces.every(workplace => workplace
            && (typeof workplace.id === 'string' || Number.isFinite(Number(workplace.id)))
            && typeof workplace.name === 'string'
            && Number.isFinite(Number(workplace.wage)));
        const shiftsValid = backup.salary.shifts.every(shift => shift && isValidISODate(shift.date)
            && (shift.payType === undefined || ['hourly', 'daily'].includes(shift.payType)));
        const validModes = new Set(['employee', 'freelance']);
        if (!workplacesValid || !shiftsValid || !validModes.has(backup.salary.settings.employmentMode || 'employee')) {
            return { valid: false, error: 'נתוני השכר בקובץ הגיבוי אינם תקינים.' };
        }
        if (backup.profile !== null) {
            const profileResult = validateProfile(backup.profile);
            if (!profileResult.valid) return { valid: false, error: 'הפרופיל בקובץ הגיבוי אינו תקין.' };
        }
        if (Object.entries(backup.localStorage).some(([key, value]) => typeof key !== 'string' || key.length > 200 || typeof value !== 'string')) {
            return { valid: false, error: 'הגדרות הממשק בקובץ הגיבוי אינן תקינות.' };
        }
        if (Buffer.byteLength(JSON.stringify(backup), 'utf8') > MAX_BACKUP_BYTES) {
            return { valid: false, error: 'קובץ הגיבוי גדול מדי לשחזור.' };
        }
        if (backup.calendarEvents.some(item => !item || typeof item.title !== 'string' || !isValidISODate(item.date))) {
            return { valid: false, error: 'אירועי היומן בקובץ הגיבוי אינם תקינים.' };
        }
        if (backup.calendarEvents.length > 20000 || backup.salary.shifts.length > 200000) {
            return { valid: false, error: 'הגיבוי מכיל יותר מדי רשומות.' };
        }
        return { valid: true };
    }

    captureFile(filePath, fileSystem) {
        return fileSystem.existsSync(filePath) ? fileSystem.readFileSync(filePath) : null;
    }

    restoreFile(filePath, contents, fileSystem) {
        if (contents === null) {
            fileSystem.rmSync(filePath, { force: true });
            return;
        }
        fileSystem.mkdirSync(this.pathModule.dirname(filePath), { recursive: true });
        fileSystem.writeFileSync(filePath, contents);
    }

    async restoreBackupFromDrive(backupInput) {
        let snapshots;
        try {
            const backup = backupInput || await this.downloadBackup();
            const validation = this.validateRestoreBackup(backup);
            if (!validation.valid) return { ok: false, error: validation.error };

            const financeStore = this.financeStore;
            const profileStore = this.profileStore;
            const fs = financeStore.fileSystem || profileStore.fileSystem || this.fileSystem;
            const salaryPath = this.getSalaryPath();
            const financePath = financeStore.getPath();
            const profilePath = profileStore.getProfilePath();
            snapshots = [salaryPath, financePath, profilePath].map(filePath => [filePath, this.captureFile(filePath, fs)]);

            const salarySaved = this.saveSalaryState(backup.salary);
            if (!salarySaved) throw new Error('שחזור נתוני השכר נכשל.');
            const financeSaved = financeStore.save(backup.finance);
            if (!financeSaved?.ok) throw new Error(financeSaved?.error || 'שחזור נתוני הכספים נכשל.');
            const profileSaved = backup.profile ? profileStore.save(backup.profile) : profileStore.clear();
            if (!profileSaved?.ok) throw new Error(profileSaved?.error || 'שחזור הפרופיל נכשל.');
            return { ok: true, backup, restoredAt: new Date().toISOString() };
        } catch (error) {
            if (snapshots) {
                const fs = this.financeStore.fileSystem || this.profileStore.fileSystem || this.fileSystem;
                for (const [filePath, contents] of snapshots) {
                    try {
                        this.restoreFile(filePath, contents, fs);
                    } catch (rollbackError) {
                        console.error('Drive restore rollback failed:', rollbackError);
                    }
                }
            }
            return { ok: false, code: error.code || '', error: error?.message || 'שחזור הנתונים מ-Google Drive נכשל.' };
        }
    }
}

module.exports = {
    DriveSyncService,
    BACKUP_FILE_NAME,
    BACKUP_FORMAT,
    BACKUP_SCHEMA_VERSION,
    DRIVE_SCOPE,
    MAX_BACKUP_BYTES
};
