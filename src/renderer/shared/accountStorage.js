(function registerAccountStorage(root) {
    const MIGRATION_KEY = 'ultimate_pro_account_storage_migrated_v1';
    const ACCOUNT_PREFIX = 'ultimate_pro_account_';

    function createScopedStorage(storage, namespace) {
        const safeNamespace = String(namespace || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '');
        const prefix = `${ACCOUNT_PREFIX}${safeNamespace}_`;
        const isNamespaced = key => String(key).startsWith(ACCOUNT_PREFIX);

        if (safeNamespace !== 'anonymous' && storage.getItem(MIGRATION_KEY) !== '1') {
            const legacyKeys = [];
            for (let index = 0; index < storage.length; index += 1) {
                const key = storage.key(index);
                if (key && key !== MIGRATION_KEY && !isNamespaced(key)) legacyKeys.push(key);
            }
            legacyKeys.forEach(key => {
                const targetKey = `${prefix}${key}`;
                if (storage.getItem(targetKey) === null) storage.setItem(targetKey, storage.getItem(key));
                storage.removeItem(key);
            });
            storage.setItem(MIGRATION_KEY, '1');
        }

        function keys() {
            const scoped = [];
            for (let index = 0; index < storage.length; index += 1) {
                const key = storage.key(index);
                if (key?.startsWith(prefix)) scoped.push(key.slice(prefix.length));
            }
            return scoped;
        }

        return Object.freeze({
            get length() { return keys().length; },
            key(index) { return keys()[index] ?? null; },
            getItem(key) { return storage.getItem(prefix + String(key)); },
            setItem(key, value) { storage.setItem(prefix + String(key), String(value)); },
            removeItem(key) { storage.removeItem(prefix + String(key)); },
            clear() { keys().forEach(key => storage.removeItem(prefix + key)); }
        });
    }

    if (root.localStorage && root.appInfo) {
        const scoped = createScopedStorage(root.localStorage, root.appInfo.accountNamespace);
        try {
            Object.defineProperty(root, 'localStorage', { configurable: true, value: scoped });
        } catch {
            root.localStorage = scoped;
        }
    }

    if (typeof module !== 'undefined' && module.exports) module.exports = { createScopedStorage, MIGRATION_KEY };
}(typeof window !== 'undefined' ? window : globalThis));
