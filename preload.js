const { contextBridge, ipcRenderer } = require('electron');
const accountNamespace = ipcRenderer.sendSync('account:namespace');

const ALLOWED_INVOKE = new Set([
    'storage:load',
    'storage:save',
    'app:version',
    'window:get-bounds',
    'window:set-bounds',
    'profile:load',
    'profile:save',
    'weather:get',
    'dashboard:advice',
    'dashboard:fact',
    'google-calendar:status',
    'google-calendar:sign-in',
    'google-calendar:sign-out',
    'google-calendar:list-events',
    'google-calendar:create-event',
    'google-calendar:update-event',
    'finance:load',
    'finance:save',
    'drive-backup:status',
    'drive-backup:last-date',
    'drive-backup:upload',
    'drive-backup:download',
    'drive-backup:restore',
    'contact:open'
]);

function invoke(channel, data) {
    if (!ALLOWED_INVOKE.has(channel)) {
        return Promise.reject(new Error('IPC channel not allowed'));
    }
    return ipcRenderer.invoke(channel, data);
}

contextBridge.exposeInMainWorld('electronAPI', {
    loadData: () => invoke('storage:load'),
    saveData: (data) => invoke('storage:save', data),
    getAppVersion: () => invoke('app:version'),
    getWindowBounds: () => invoke('window:get-bounds'),
    setWindowBounds: (bounds) => invoke('window:set-bounds', bounds),
    loadHubProfile: () => invoke('profile:load'),
    saveHubProfile: (profile) => invoke('profile:save', profile),
    getWeather: (city) => invoke('weather:get', city),
    getDailyAdvice: () => invoke('dashboard:advice'),
    getDailyFact: () => invoke('dashboard:fact'),
    getGoogleCalendarStatus: () => invoke('google-calendar:status'),
    signInGoogleCalendar: () => invoke('google-calendar:sign-in'),
    signOutGoogleCalendar: () => invoke('google-calendar:sign-out'),
    listGoogleCalendarEvents: (range) => invoke('google-calendar:list-events', range),
    createGoogleCalendarEvent: (event) => invoke('google-calendar:create-event', event),
    updateGoogleCalendarEvent: (details) => invoke('google-calendar:update-event', details),
    loadFinanceData: () => invoke('finance:load'),
    saveFinanceData: (data) => invoke('finance:save', data),
    getDriveBackupStatus: () => invoke('drive-backup:status'),
    getLastDriveBackupDate: () => invoke('drive-backup:last-date'),
    uploadDriveBackup: (localStorageSnapshot) => invoke('drive-backup:upload', localStorageSnapshot),
    downloadDriveBackup: () => invoke('drive-backup:download'),
    restoreDriveBackup: backup => invoke('drive-backup:restore', backup),
    openPersonalContact: (type) => invoke('contact:open', type),
    /** @deprecated use named methods — channel allowlist only */
    invokeDialog: (channel, data) => invoke(channel, data)
});

contextBridge.exposeInMainWorld('appInfo', {
    version: '1.0.0',
    name: 'Ultimate Pro Shift Manager',
    schemaVersion: 4,
    accountNamespace
});
