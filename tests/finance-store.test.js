const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { FinanceStore } = require('../src/main/services/finance-store.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultimate-pro-finance-'));
const app = { getPath: () => root };
const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(value).toString('base64'),
    decryptString: value => Buffer.from(value.toString(), 'base64').toString()
};
const validData = {
    accounts: [{ id: 'bank', name: 'בנק', type: 'checking', openingBalance: 0 }],
    transactions: [{ id: 'income', date: '2026-01-01', type: 'income', amount: 100, accountId: 'bank' }],
    recurring: [],
    budgets: { total: 0, categories: {} },
    customCategories: { income: [], expense: [] }
};

try {
    const store = new FinanceStore({ app, safeStorage });
    assert.equal(store.load().data, null);
    assert.equal(store.save(validData).ok, true);
    assert.equal(store.load().data.transactions[0].amount, 100);
    assert.equal(fs.readFileSync(store.getPath(), 'utf8').includes('income'), false);
    assert.equal(store.save({ ...validData, transactions: [{ ...validData.transactions[0], amount: -100 }] }).ok, false);

    const unavailableStore = new FinanceStore({ app, safeStorage: { isEncryptionAvailable: () => false } });
    assert.equal(unavailableStore.save(validData).ok, false);
} finally {
    fs.rmSync(root, { recursive: true, force: true });
}

console.log('Finance store tests passed.');