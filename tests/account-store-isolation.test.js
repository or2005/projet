const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ProfileStore } = require('../src/main/services/profile-store');
const { FinanceStore } = require('../src/main/services/finance-store');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultimate-pro-account-stores-'));
let accountId = 'google-sub-a';
const app = { getPath: () => root };
const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(value).toString('base64'),
    decryptString: value => Buffer.from(value.toString(), 'base64').toString()
};
const profileStore = new ProfileStore({ app, safeStorage, getAccountId: () => accountId });
const financeStore = new FinanceStore({ app, safeStorage, getAccountId: () => accountId });
const financeA = {
    accounts: [{ id: 'a-checking', name: 'חשבון משתמש א', type: 'checking', openingBalance: 0 }],
    transactions: [], recurring: [], budgets: { total: 0, categories: {} }
};
const financeB = {
    accounts: [{ id: 'b-checking', name: 'חשבון משתמש ב', type: 'checking', openingBalance: 0 }],
    transactions: [], recurring: [], budgets: { total: 0, categories: {} }
};

try {
    const pathA = profileStore.getProfilePath();
    const financePathA = financeStore.getPath();
    assert.equal(profileStore.save({ name: 'משתמש א', dateOfBirth: '1990-01-01', idNumber: '', email: 'a@example.com', phone: '' }).ok, true);
    assert.equal(financeStore.save(financeA).ok, true);

    accountId = 'google-sub-b';
    assert.notEqual(profileStore.getProfilePath(), pathA);
    assert.notEqual(financeStore.getPath(), financePathA);
    assert.equal(profileStore.load().profile, null);
    assert.equal(financeStore.load().data, null);
    assert.equal(profileStore.save({ name: 'משתמש ב', dateOfBirth: '1992-02-02', idNumber: '', email: 'b@example.com', phone: '' }).ok, true);
    assert.equal(financeStore.save(financeB).ok, true);

    accountId = 'google-sub-a';
    assert.equal(profileStore.load().profile.email, 'a@example.com');
    assert.equal(financeStore.load().data.accounts[0].name, 'חשבון משתמש א');
} finally {
    fs.rmSync(root, { recursive: true, force: true });
}

console.log('Per-account profile and finance store isolation tests passed.');
