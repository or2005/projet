const assert = require('node:assert/strict');
const { DashboardFeedService, ADVICE_FALLBACK, FACT_FALLBACK } = require('../src/main/services/dashboard-feed-service.js');

async function run() {
    const requested = [];
    const service = new DashboardFeedService({
        fetchImpl: async url => {
            requested.push(String(url));
            if (String(url).includes('adviceslip')) {
                return { ok: true, json: async () => ({ slip: { advice: 'Make time for a short walk.' } }) };
            }
            return { ok: true, json: async () => ({ text: 'Honey never spoils.' }) };
        }
    });

    assert.deepEqual(await service.getAdvice(), { ok: true, advice: 'Make time for a short walk.' });
    assert.deepEqual(await service.getDailyFact(), { ok: true, fact: 'Honey never spoils.' });
    assert.equal(requested.includes('https://api.adviceslip.com/advice'), true);
    assert.equal(requested.includes('https://uselessfacts.jsph.pl/api/v2/facts/today?language=en'), true);

    const offline = new DashboardFeedService({ fetchImpl: async () => { throw new Error('offline'); } });
    assert.deepEqual(await offline.getAdvice(), { ok: false, advice: ADVICE_FALLBACK });
    assert.deepEqual(await offline.getDailyFact(), { ok: false, fact: FACT_FALLBACK });

    const invalidPayload = new DashboardFeedService({ fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
    assert.deepEqual(await invalidPayload.getAdvice(), { ok: false, advice: ADVICE_FALLBACK });
    assert.deepEqual(await invalidPayload.getDailyFact(), { ok: false, fact: FACT_FALLBACK });

    assert.equal(require('../src/main/services/dashboard-feed-service.js').safeText("The `best` way to keep going."), "The 'best' way to keep going.");

    console.log('Dashboard feed tests passed.');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
