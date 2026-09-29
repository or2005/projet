(function registerCoalescedTask(root) {
    function createCoalescedTask(task, isActive = () => true) {
        let running = null;
        let pending = false;

        return function run(...args) {
            if (!isActive()) return Promise.resolve();
            if (running) {
                pending = true;
                return running;
            }

            const cycle = async () => {
                let result;
                do {
                    pending = false;
                    result = await task(...args);
                } while (pending && isActive());
                return result;
            };

            const current = cycle();
            running = current;
            return current.finally(() => {
                if (running === current) running = null;
            });
        };
    }

    root.PersonalApps = root.PersonalApps || {};
    root.PersonalApps.createCoalescedTask = createCoalescedTask;
    if (typeof module !== 'undefined' && module.exports) module.exports = { createCoalescedTask };
}(typeof window !== 'undefined' ? window : globalThis));