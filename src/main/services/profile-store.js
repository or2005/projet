const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateProfile } = require('../../renderer/shared/profile.js');

class ProfileStore {
    constructor({ app, safeStorage, fileSystem = fs, pathModule = path, getAccountId = () => '' }) {
        this.app = app;
        this.safeStorage = safeStorage;
        this.fileSystem = fileSystem;
        this.pathModule = pathModule;
        this.getAccountId = getAccountId;
    }

    getProfilePath() {
        const accountId = this.getAccountId();
        if (accountId) {
            const accountKey = crypto.createHash('sha256').update(String(accountId)).digest('hex');
            return this.pathModule.join(this.app.getPath('userData'), 'accounts', accountKey, 'personal-profile.bin');
        }
        return this.pathModule.join(this.app.getPath('userData'), 'personal-profile.bin');
    }

    save(profile) {
        const result = validateProfile(profile);
        if (!result.valid) return { ok: false, errors: result.errors };
        if (!this.safeStorage.isEncryptionAvailable()) {
            return { ok: false, error: 'הצפנה מקומית אינה זמינה במערכת הזו.' };
        }

        const values = result.values;
        const previous = values.idNumber ? null : this.load();
        const storedProfile = {
            name: values.name,
            dateOfBirth: values.dateOfBirth,
            idNumber: values.idNumber || (previous?.ok ? previous.profile?.idNumber : '') || '',
            email: values.email,
            phone: values.phone
        };

        try {
            const filePath = this.getProfilePath();
            this.fileSystem.mkdirSync(this.pathModule.dirname(filePath), { recursive: true });
            const temporaryPath = `${filePath}.${process.pid}.tmp`;
            this.fileSystem.writeFileSync(temporaryPath, this.safeStorage.encryptString(JSON.stringify(storedProfile)));
            this.fileSystem.renameSync(temporaryPath, filePath);
            return { ok: true, profile: { ...storedProfile, age: values.age } };
        } catch (error) {
            console.error('Personal profile could not be saved securely', error);
            return { ok: false, error: 'שמירת הפרופיל המוצפן נכשלה.' };
        }
    }

    load() {
        const filePath = this.getProfilePath();
        if (!this.fileSystem.existsSync(filePath)) return { ok: true, profile: null };
        if (!this.safeStorage.isEncryptionAvailable()) {
            return { ok: false, error: 'הצפנת הפרופיל אינה זמינה במערכת הזו.' };
        }

        try {
            const encrypted = this.fileSystem.readFileSync(filePath);
            const profile = JSON.parse(this.safeStorage.decryptString(encrypted));
            const result = validateProfile(profile);
            if (!result.valid) return { ok: false, error: 'הפרופיל השמור אינו תקין.' };
            return { ok: true, profile: result.values };
        } catch (error) {
            console.error('Personal profile could not be read', error);
            return { ok: false, error: 'לא ניתן לקרוא את הפרופיל המוצפן.' };
        }
    }

    clear() {
        try {
            this.fileSystem.rmSync(this.getProfilePath(), { force: true });
            return { ok: true };
        } catch (error) {
            console.error('Personal profile could not be cleared', error);
            return { ok: false, error: 'ניקוי הפרופיל לאחר שחזור נכשל.' };
        }
    }
}

module.exports = { ProfileStore };