const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateBackup } = require('../../renderer/apps/finance/finance-model.js');

const MAX_FINANCE_BYTES = 20 * 1024 * 1024;

class FinanceStore {
    constructor({ app, safeStorage, fileSystem = fs, pathModule = path, getAccountId = () => '' }) {
        this.app = app;
        this.safeStorage = safeStorage;
        this.fileSystem = fileSystem;
        this.pathModule = pathModule;
        this.getAccountId = getAccountId;
    }

    getPath() {
        const accountId = this.getAccountId();
        if (accountId) {
            const accountKey = crypto.createHash('sha256').update(String(accountId)).digest('hex');
            return this.pathModule.join(this.app.getPath('userData'), 'accounts', accountKey, 'personal-finance.bin');
        }
        return this.pathModule.join(this.app.getPath('userData'), 'personal-finance.bin');
    }

    load() {
        const filePath = this.getPath();
        if (!this.fileSystem.existsSync(filePath)) return { ok: true, data: null };
        if (!this.safeStorage.isEncryptionAvailable()) return { ok: false, error: 'הצפנת הכספים אינה זמינה במחשב.' };

        try {
            const encrypted = this.fileSystem.readFileSync(filePath);
            const data = JSON.parse(this.safeStorage.decryptString(encrypted));
            const validation = validateBackup({ ...data, format: 'ultimate-pro-finance', schemaVersion: 1 });
            return validation.valid ? { ok: true, data } : { ok: false, error: 'קובץ הכספים השמור אינו תקין.' };
        } catch (error) {
            console.error('Finance data could not be loaded securely', error);
            return { ok: false, error: 'לא ניתן לקרוא את קובץ הכספים המוצפן.' };
        }
    }

    save(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            return { ok: false, error: 'מבנה נתוני הכספים אינו תקין.' };
        }
        const validation = validateBackup({ ...data, format: 'ultimate-pro-finance', schemaVersion: 1 });
        if (!validation.valid) return { ok: false, error: validation.error };
        if (!this.safeStorage.isEncryptionAvailable()) return { ok: false, error: 'הצפנת הכספים אינה זמינה במחשב.' };

        try {
            const serialized = JSON.stringify(data);
            if (Buffer.byteLength(serialized, 'utf8') > MAX_FINANCE_BYTES) {
                return { ok: false, error: 'קובץ הכספים גדול מדי.' };
            }
            const filePath = this.getPath();
            this.fileSystem.mkdirSync(this.pathModule.dirname(filePath), { recursive: true });
            const temporaryPath = `${filePath}.${process.pid}.tmp`;
            this.fileSystem.writeFileSync(temporaryPath, this.safeStorage.encryptString(serialized));
            this.fileSystem.renameSync(temporaryPath, filePath);
            return { ok: true };
        } catch (error) {
            console.error('Finance data could not be saved securely', error);
            return { ok: false, error: 'שמירת נתוני הכספים נכשלה.' };
        }
    }
}

module.exports = { FinanceStore };