const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ProfileStore } = require('../src/main/services/profile-store.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultimate-pro-profile-'));
const app = { getPath: () => root };
const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`encrypted:${value}`),
    decryptString: value => value.toString().replace(/^encrypted:/, '')
};

try {
    const store = new ProfileStore({ app, safeStorage });
    assert.equal(store.load().profile, null);

    const saved = store.save({ name: 'אור', dateOfBirth: '2000-09-28', idNumber: '12345678', email: 'or@example.com' });
    assert.equal(saved.ok, true);
    assert.equal(saved.profile.age, new Date().getFullYear() - 2000 - (new Date() < new Date(`${new Date().getFullYear()}-09-28`) ? 1 : 0));
    assert.equal(store.load().profile.email, 'or@example.com');
    assert.equal(fs.readFileSync(store.getProfilePath(), 'utf8').startsWith('encrypted:'), true);
    assert.equal(store.save({ name: 'אור', dateOfBirth: '2000-09-28', email: 'new@example.com' }).ok, true);
    assert.equal(store.load().profile.idNumber, '12345678');
    assert.equal(store.save({ name: '', dateOfBirth: '2000-01-01' }).ok, false);

    const unavailable = new ProfileStore({ app, safeStorage: { isEncryptionAvailable: () => false } });
    assert.equal(unavailable.save({ name: 'אור', dateOfBirth: '2000-09-28' }).ok, false);
} finally {
    fs.rmSync(root, { recursive: true, force: true });
}

console.log('Profile store tests passed.');