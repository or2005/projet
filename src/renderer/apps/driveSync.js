(function registerDriveSync(root) {
    const BACKUP_DATE_KEY = 'ultimate_pro_drive_backup_date';
    const LOCAL_DIRTY_KEY = 'ultimate_pro_drive_local_modified_at';
    const SYNC_DEBOUNCE_MS = 30000;
    let busy = false;
    let currentUpload = null;
    let autoSyncTimer = null;

    function getStatusElement() {
        return document.getElementById('drive-backup-status');
    }

    function setStatus(message, tone = '') {
        const status = getStatusElement();
        if (status) {
            status.textContent = message;
            status.dataset.tone = tone;
        }
        const indicator = document.getElementById('drive-sync-indicator');
        if (!indicator) return;
        if (message.includes('מסנכרן שינויים')) {
            indicator.textContent = 'מסנכרן לענן...';
            indicator.dataset.tone = 'syncing';
            indicator.hidden = false;
        } else if (tone === 'success' && (message.includes('מסונכרן לענן') || message.includes('הגיבוי האחרון נערך'))) {
            indicator.textContent = 'מסונכרן לענן ✓';
            indicator.dataset.tone = 'success';
            indicator.hidden = false;
        } else {
            indicator.hidden = true;
        }
    }

    function showToast(message, tone = 'success') {
        const toast = document.getElementById('drive-backup-toast');
        if (!toast) return;
        toast.textContent = message;
        toast.dataset.tone = tone;
        toast.hidden = false;
        clearTimeout(showToast.timer);
        showToast.timer = setTimeout(() => { toast.hidden = true; }, 5000);
    }

    function setBusy(value, action = '') {
        busy = value;
        const upload = document.getElementById('drive-backup-upload');
        const restore = document.getElementById('drive-backup-restore');
        [upload, restore].filter(Boolean).forEach(button => {
            button.disabled = value;
            button.classList.toggle('is-loading', value && button.dataset.action === action);
        });
        if (upload) upload.innerHTML = value && action === 'upload'
            ? '<i class="fas fa-spinner"></i><span>מגבה ל-Drive...</span>'
            : '<i class="fab fa-google-drive"></i><span>גבה עכשיו לענן</span>';
        if (restore) restore.innerHTML = value && action === 'restore'
            ? '<i class="fas fa-spinner"></i><span>משחזר נתונים...</span>'
            : '<i class="fas fa-cloud-arrow-down"></i><span>שחזר נתונים</span>';
    }

    function collectLocalStorage() {
        const snapshot = Object.create(null);
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (!key || key === BACKUP_DATE_KEY || key === LOCAL_DIRTY_KEY) continue;
            snapshot[key] = localStorage.getItem(key) || '';
        }
        return snapshot;
    }

    function restoreLocalStorage(snapshot) {
        if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new Error('הגדרות הממשק בקובץ הגיבוי אינן תקינות.');
        const previous = collectLocalStorage();
        try {
            localStorage.clear();
            Object.entries(snapshot).forEach(([key, value]) => {
                if (typeof value !== 'string') throw new Error('ערך לא תקין בקובץ הגיבוי.');
                localStorage.setItem(key, value);
            });
            return previous;
        } catch (error) {
            localStorage.clear();
            Object.entries(previous).forEach(([key, value]) => localStorage.setItem(key, value));
            throw error;
        }
    }

    async function reconnectForDrive() {
        setStatus('נדרש אישור Google לתיקיית הגיבוי הפרטית. פותח התחברות...');
        const result = await window.electronAPI.signInGoogleCalendar();
        if (!result?.ok) throw new Error(result?.error || 'אישור Google לא הושלם.');
        if (result.accountChanged) {
            window.location.reload();
            throw new Error('חשבון Google הוחלף. המערכת נטענת מחדש עבור החשבון החדש.');
        }
    }

    async function uploadBackupToDrive(options = {}) {
        const quiet = options?.quiet === true;
        if (busy) return currentUpload || { ok: false, error: 'הסנכרון כבר פועל.' };
        if (!window.electronAPI?.uploadDriveBackup) return { ok: false };
        const dirtyAtStart = localStorage.getItem(LOCAL_DIRTY_KEY);
        setBusy(true, 'upload');
        setStatus(quiet ? 'מסנכרן שינויים לענן...' : 'אוסף נתונים מהמערכת ומעלה גיבוי...');
        currentUpload = (async () => {
            try {
                let result = await window.electronAPI.uploadDriveBackup(collectLocalStorage());
                if (!result?.ok && !quiet && (result?.code === 'missing-scope' || result?.code === 'not-connected')) {
                    await reconnectForDrive();
                    result = await window.electronAPI.uploadDriveBackup(collectLocalStorage());
                }
                if (!result?.ok) throw new Error(result?.error || 'הגיבוי ל-Google Drive נכשל.');
                localStorage.setItem(BACKUP_DATE_KEY, result.modifiedTime);
                const dirtyAfterUpload = localStorage.getItem(LOCAL_DIRTY_KEY);
                if (dirtyAfterUpload === dirtyAtStart) {
                    localStorage.removeItem(LOCAL_DIRTY_KEY);
                    setStatus(quiet ? 'מסונכרן לענן ✓' : `מסונכרן לענן ✓ · הגיבוי האחרון נערך ב-${formatDate(result.modifiedTime)}.`, 'success');
                } else {
                    clearTimeout(autoSyncTimer);
                    autoSyncTimer = setTimeout(() => uploadBackupToDrive({ quiet: true }), SYNC_DEBOUNCE_MS);
                    setStatus('הגיבוי הושלם. שינויים חדשים ממתינים לסנכרון.', 'success');
                }
                if (!quiet) showToast('הגיבוי נשמר בתיקיית האפליקציה הפרטית ב-Google Drive.');
                return result;
            } catch (error) {
                const message = error?.message || 'הגיבוי נכשל.';
                setStatus(quiet ? 'הנתונים נשמרו במחשב. הסנכרון לענן ינסה שוב כשיתאפשר.' : message, quiet ? '' : 'error');
                if (!quiet) showToast(message, 'error');
                return { ok: false, error: message };
            } finally {
                currentUpload = null;
                setBusy(false);
            }
        })();
        return currentUpload;
    }

    async function restoreBackupFromDrive() {
        if (busy || !window.electronAPI?.downloadDriveBackup) return { ok: false };
        if (!window.confirm('השחזור יחליף את נתוני השכר, הכספים, הפרופיל והיומן המקומיים בנתוני הגיבוי. להמשיך?')) return { ok: false, cancelled: true };
        setBusy(true, 'restore');
        setStatus('מוריד ובודק את קובץ הגיבוי...');
        let previousLocalStorage = null;
        try {
            let downloaded = await window.electronAPI.downloadDriveBackup();
            if (!downloaded?.ok && (downloaded?.code === 'missing-scope' || downloaded?.code === 'not-connected')) {
                await reconnectForDrive();
                downloaded = await window.electronAPI.downloadDriveBackup();
            }
            if (!downloaded?.ok) throw new Error(downloaded?.error || 'לא ניתן להוריד את הגיבוי.');

            const restoredLocalState = { ...downloaded.backup.localStorage };
            restoredLocalState[BACKUP_DATE_KEY] = downloaded.backup.createdAt || new Date().toISOString();
            previousLocalStorage = restoreLocalStorage(restoredLocalState);
            const restored = await window.electronAPI.restoreDriveBackup(downloaded.backup);
            if (!restored?.ok) throw new Error(restored?.error || 'השחזור המקומי נכשל.');
            showToast('הנתונים שוחזרו. המערכת תיטען מחדש.');
            setStatus('השחזור הושלם.');
            setTimeout(() => window.location.reload(), 700);
            return restored;
        } catch (error) {
            if (previousLocalStorage) {
                try { restoreLocalStorage(previousLocalStorage); } catch (rollbackError) {
                    console.error('Local storage restore rollback failed:', rollbackError);
                }
            }
            setStatus(error?.message || 'שחזור הנתונים נכשל.', 'error');
            showToast(error?.message || 'שחזור הנתונים נכשל.', 'error');
            return { ok: false, error: error?.message || 'שחזור הנתונים נכשל.' };
        } finally {
            setBusy(false);
        }
    }

    function formatDate(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'לא ידוע';
        return new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    }

    async function getLastBackupDate() {
        if (!window.electronAPI?.getLastDriveBackupDate) return null;
        try {
            const status = await window.electronAPI.getDriveBackupStatus();
            if (!status?.connected) {
                setStatus('חבר את חשבון Google בעת לחיצה על גיבוי הענן.');
                return null;
            }
            if (!status.driveEnabled) {
                setStatus('נדרש אישור גישה נוסף לתיקיית הגיבוי ב-Google.');
                return null;
            }
            const result = await window.electronAPI.getLastDriveBackupDate();
            if (!result?.ok) {
                setStatus(result?.error || 'לא ניתן לבדוק את הגיבוי האחרון.', 'error');
                return null;
            }
            if (!result.exists) {
                setStatus('עדיין לא נשמר גיבוי בענן.');
                return null;
            }
            setStatus(`מסונכרן לענן ✓ · הגיבוי האחרון נערך ב-${result.date}.`, 'success');
            return result.date;
        } catch (error) {
            setStatus(error?.message || 'סטטוס הגיבוי אינו זמין כרגע.', 'error');
            return null;
        }
    }

    function markLocalDirty() {
        localStorage.setItem(LOCAL_DIRTY_KEY, new Date().toISOString());
        setStatus('נשמר במחשב. הסנכרון לענן יתבצע אוטומטית בעוד 30 שניות.');
        clearTimeout(autoSyncTimer);
        autoSyncTimer = setTimeout(() => uploadBackupToDrive({ quiet: true }), SYNC_DEBOUNCE_MS);
    }

    async function autoSyncOnStartup() {
        if (!window.electronAPI?.getDriveBackupStatus) return null;
        try {
            const status = await window.electronAPI.getDriveBackupStatus();
            if (!status?.connected) {
                setStatus('הגיבוי בענן אינו מחובר. אפשר להתחבר בעת לחיצה על גיבוי.');
                return null;
            }
            if (!status.driveEnabled) {
                setStatus('נדרש אישור גישה לתיקיית הגיבוי. אפשר לאשר בעת לחיצה על גיבוי.');
                return null;
            }
            const remote = await window.electronAPI.getLastDriveBackupDate();
            if (!remote?.ok || !remote.exists) {
                setStatus(remote?.error || 'עדיין לא נשמר גיבוי בענן.');
                return null;
            }
            const cloudTime = Date.parse(remote.modifiedTime);
            const localBackupTime = Date.parse(localStorage.getItem(BACKUP_DATE_KEY) || '') || 0;
            const localDirtyTime = Date.parse(localStorage.getItem(LOCAL_DIRTY_KEY) || '') || 0;
            if (!Number.isFinite(cloudTime)) return null;

            if (cloudTime > Math.max(localBackupTime, localDirtyTime)) {
                setStatus('נמצא גיבוי חדש יותר. מעדכן נתונים בשקט...');
                const downloaded = await window.electronAPI.downloadDriveBackup();
                if (!downloaded?.ok) throw new Error(downloaded?.error || 'לא ניתן להוריד גיבוי חדש.');
                const state = { ...downloaded.backup.localStorage, [BACKUP_DATE_KEY]: remote.modifiedTime };
                const previous = restoreLocalStorage(state);
                const restored = await window.electronAPI.restoreDriveBackup(downloaded.backup);
                if (!restored?.ok) {
                    restoreLocalStorage(previous);
                    throw new Error(restored?.error || 'עדכון הנתונים המקומיים נכשל.');
                }
                setStatus('הנתונים עודכנו מהגיבוי בענן.');
                setTimeout(() => window.location.reload(), 500);
                return { ok: true, restored: true };
            }

            if (localDirtyTime > cloudTime) {
                clearTimeout(autoSyncTimer);
                autoSyncTimer = setTimeout(() => uploadBackupToDrive({ quiet: true }), 1000);
                setStatus('נמצאו שינויים מקומיים שטרם סונכרנו.');
                return { ok: true, uploadPending: true };
            }
            setStatus(`מסונכרן לענן ✓ ${formatDate(remote.modifiedTime)}`, 'success');
            return { ok: true, restored: false };
        } catch (error) {
            setStatus(error?.message || 'בדיקת הסנכרון האוטומטי נכשלה.', 'error');
            return { ok: false, error: error?.message || 'בדיקת הסנכרון נכשלה.' };
        }
    }

    async function flushAutoSync() {
        clearTimeout(autoSyncTimer);
        if (currentUpload) return currentUpload;
        if (!localStorage.getItem(LOCAL_DIRTY_KEY)) return { ok: true, skipped: true };
        return uploadBackupToDrive({ quiet: true });
    }

    function init() {
        const upload = document.getElementById('drive-backup-upload');
        const restore = document.getElementById('drive-backup-restore');
        if (!upload || upload.dataset.bound) return;
        upload.addEventListener('click', uploadBackupToDrive);
        restore?.addEventListener('click', restoreBackupFromDrive);
        upload.dataset.bound = 'true';
        autoSyncOnStartup();
        getLastBackupDate().catch(error => setStatus(error?.message || 'סטטוס הגיבוי אינו זמין.', 'error'));
    }

    root.PersonalApps = root.PersonalApps || {};
    root.PersonalApps.driveSync = Object.freeze({ init, uploadBackupToDrive, restoreBackupFromDrive, getLastBackupDate, autoSyncOnStartup, markLocalDirty, flushAutoSync });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
}(window));
