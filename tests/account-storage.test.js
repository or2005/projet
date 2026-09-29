const assert = require('node:assert/strict');
const { createScopedStorage, MIGRATION_KEY } = require('../src/renderer/shared/accountStorage');

class MemoryStorage {
    constructor(initial = {}) { this.values = new Map(Object.entries(initial)); }
    get length() { return this.values.size; }
    key(index) { return [...this.values.keys()][index] ?? null; }
    getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; }
    setItem(key, value) { this.values.set(String(key), String(value)); }
    removeItem(key) { this.values.delete(String(key)); }
}

const native = new MemoryStorage({
    'ultimate_pro_v2_data': '{"shifts":[]}',
    'ultimate_pro_theme': 'dark'
});
const accountA = createScopedStorage(native, 'google-user-a-hash');
assert.equal(accountA.getItem('ultimate_pro_theme'), 'dark');
assert.equal(accountA.length, 2);
accountA.setItem('ultimate_pro_calendar_events_v1', '[]');

const accountB = createScopedStorage(native, 'google-user-b-hash');
assert.equal(accountB.length, 0);
assert.equal(accountB.getItem('ultimate_pro_theme'), null);
accountB.setItem('ultimate_pro_theme', 'light');
assert.equal(accountA.getItem('ultimate_pro_theme'), 'dark');
assert.equal(accountB.getItem('ultimate_pro_theme'), 'light');

accountA.clear();
assert.equal(accountA.length, 0);
assert.equal(accountB.getItem('ultimate_pro_theme'), 'light');
assert.equal(native.getItem(MIGRATION_KEY), '1');

console.log('Account storage isolation tests passed.');
