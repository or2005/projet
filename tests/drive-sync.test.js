const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DriveSyncService, BACKUP_FILE_NAME, BACKUP_FORMAT } = require('../src/main/services/driveSync');

async function run() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultimate-pro-drive-sync-'));
    const filePaths = {
        salary: path.join(root, 'salary.json'),
        finance: path.join(root, 'finance.bin'),
        profile: path.join(root, 'profile.bin')
    };
    let salary = {
        schemaVersion: 4,
        workplaces: [{ id: 1, name: 'מקום עבודה', wage: 50 }],
        shifts: [{ id: 1, date: '2026-09-01' }],
        settings: { employmentMode: 'employee' }
    };
    let finance = { schemaVersion: 1, accounts: [], transactions: [], recurring: [], budgets: { total: 0, categories: {} } };
    let profile = { name: 'משתמשת', dateOfBirth: '1990-01-01', idNumber: '123456789', email: 'test@example.com', phone: '' };
    let backupFile = null;
    const files = [];
    const uploadMethods = [];
    const google = {
        hasScope: () => true,
        getStatus: async () => ({ connected: true, driveEnabled: true }),
        authorizedRequest: async url => {
            const parsed = new URL(url);
            if (parsed.pathname === '/drive/v3/files') {
                assert.equal(parsed.searchParams.get('spaces'), 'appDataFolder');
                assert.match(parsed.searchParams.get('q'), /'appDataFolder' in parents/);
                return { files: files.slice().sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime)) };
            }
            if (parsed.pathname.startsWith('/drive/v3/files/')) return backupFile;
            throw new Error(`Unexpected Drive request: ${parsed}`);
        },
        authorizedFetch: async (url, options) => {
            const parsed = new URL(url);
            uploadMethods.push(options.method);
            if (parsed.hostname === 'www.googleapis.com') {
                if (options.method === 'POST') {
                    const metadata = JSON.parse(options.body);
                    assert.deepEqual(metadata.parents, ['appDataFolder']);
                    assert.equal(metadata.name, BACKUP_FILE_NAME);
                }
                return { headers: { get: name => name.toLowerCase() === 'location' ? 'https://upload.googleapis.com/session' : null } };
            }
            assert.equal(parsed.hostname, 'upload.googleapis.com');
            backupFile = JSON.parse(options.body);
            const now = new Date().toISOString();
            if (!files.length) files.push({ id: 'backup-file', name: BACKUP_FILE_NAME, modifiedTime: now });
            else files[0].modifiedTime = now;
            return { json: async () => ({ id: 'backup-file', name: BACKUP_FILE_NAME, modifiedTime: now }) };
        }
    };
    const financeStore = {
        fileSystem: fs,
        getPath: () => filePaths.finance,
        load: () => ({ ok: true, data: finance }),
        save: data => {
            finance = JSON.parse(JSON.stringify(data));
            fs.writeFileSync(filePaths.finance, JSON.stringify(finance));
            return { ok: true };
        }
    };
    const profileStore = {
        fileSystem: fs,
        getProfilePath: () => filePaths.profile,
        load: () => ({ ok: true, profile }),
        save: data => {
            profile = { ...data };
            fs.writeFileSync(filePaths.profile, JSON.stringify(profile));
            return { ok: true, profile };
        },
        clear: () => {
            profile = null;
            fs.rmSync(filePaths.profile, { force: true });
            return { ok: true };
        }
    };
    const service = new DriveSyncService({
        googleCalendarService: google,
        app: { getPath: () => root },
        profileStore,
        financeStore,
        getSalaryState: () => salary,
        saveSalaryState: data => {
            salary = JSON.parse(JSON.stringify(data));
            fs.writeFileSync(filePaths.salary, JSON.stringify(salary));
            return true;
        },
        appVersion: '1.0.0'
    });

    try {
        const upload = await service.uploadBackupToDrive({
            ultimate_pro_theme: 'dark',
            ultimate_pro_calendar_events_v1: JSON.stringify([{ title: 'פגישה', date: '2026-09-15' }])
        });
        assert.equal(upload.ok, true);
        assert.equal(backupFile.format, BACKUP_FORMAT);
        assert.equal(backupFile.salary.shifts.length, 1);
        assert.equal(backupFile.finance.transactions.length, 0);
        assert.equal(backupFile.profile.idNumber, '123456789');
        assert.equal(backupFile.calendarEvents[0].title, 'פגישה');
        assert.deepEqual(uploadMethods, ['POST', 'PUT']);

        const update = await service.uploadBackupToDrive({ ultimate_pro_theme: 'light' });
        assert.equal(update.ok, true);
        assert.deepEqual(uploadMethods.slice(-2), ['PATCH', 'PUT']);
        assert.equal((await service.getLastBackupDate()).exists, true);

        const downloaded = await service.getBackupFromDrive();
        assert.equal(downloaded.ok, true);
        salary = { ...salary, shifts: [] };
        finance = { ...finance, transactions: [{ id: 'changed' }] };
        const restored = await service.restoreBackupFromDrive(downloaded.backup);
        assert.equal(restored.ok, true);
        assert.equal(salary.shifts.length, 1);
        assert.equal(finance.transactions.length, 0);
        assert.equal(profile.idNumber, '123456789');

        const invalid = await service.restoreBackupFromDrive({ ...downloaded.backup, format: 'bad' });
        assert.equal(invalid.ok, false);
        assert.equal(salary.shifts.length, 1);
        const invalidDate = await service.restoreBackupFromDrive({
            ...downloaded.backup,
            salary: { ...downloaded.backup.salary, shifts: [{ id: 2, date: '2026-02-30' }] }
        });
        assert.equal(invalidDate.ok, false);
        assert.equal(salary.shifts.length, 1);

        google.hasScope = () => false;
        const unauthorized = await service.uploadBackupToDrive({});
        assert.equal(unauthorized.ok, false);
        assert.equal(unauthorized.code, 'missing-scope');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }

    console.log('Drive sync service tests passed.');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
