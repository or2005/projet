const assert = require('node:assert/strict');
const { WeatherService, getWeatherCondition, getWeatherErrorMessage, normalizeCity, normalizeWeatherResponse } = require('../src/main/services/weather-service.js');
const { createCoalescedTask } = require('../src/renderer/shared/coalesced-task.js');

assert.equal(normalizeCity(' עפולה '), 'עפולה');
assert.equal(normalizeCity(''), null);
assert.equal(normalizeCity('<script>'), null);
assert.deepEqual(getWeatherCondition(0), { condition: 'clear', description: 'בהיר' });
assert.deepEqual(getWeatherCondition(61), { condition: 'rain', description: 'גשום' });
assert.deepEqual(getWeatherCondition(95), { condition: 'thunderstorm', description: 'סופות רעמים' });
assert.match(getWeatherErrorMessage(503), /נח לרגע/);

const normalized = normalizeWeatherResponse({
    current_weather: { temperature: 24.6, weathercode: 2, windspeed: 8.4 }
}, 'עפולה');
assert.deepEqual(normalized, {
    city: 'עפולה', temperature: 25, description: 'מעונן חלקית',
    humidity: null, windSpeed: 8.4, condition: 'clouds'
});
assert.equal(normalizeWeatherResponse({ current_weather: { weathercode: 0 } }, 'עפולה'), null);

async function testCoalescedRefresh() {
    let calls = 0;
    let releaseFirst;
    let active = true;
    const refresh = createCoalescedTask(() => {
        calls += 1;
        if (calls === 1) return new Promise(resolve => { releaseFirst = resolve; });
        return Promise.resolve();
    }, () => active);

    const initial = refresh();
    await Promise.resolve();
    const manual = refresh();
    const repeated = refresh();
    assert.equal(calls, 1);
    releaseFirst();
    await Promise.all([initial, manual, repeated]);
    assert.equal(calls, 2);
    active = false;
    await refresh();
    assert.equal(calls, 2);
}

async function runServiceTests() {
    let requestedUrl;
    const service = new WeatherService({
        fetchImpl: async url => {
            requestedUrl = new URL(url);
            return {
                ok: true,
                status: 200,
                json: async () => ({ current_weather: { temperature: 22.4, weathercode: 0, windspeed: 3.2 } })
            };
        }
    });

    const result = await service.getWeather('עפולה');
    assert.equal(result.ok, true);
    assert.equal(result.weather.city, 'עפולה');
    assert.equal(result.weather.temperature, 22);
    assert.equal(requestedUrl.href, 'https://api.open-meteo.com/v1/forecast?latitude=32.61&longitude=35.29&current_weather=true');
    assert.equal(requestedUrl.searchParams.has('appid'), false);

    const unavailable = new WeatherService({ fetchImpl: async () => ({ ok: false, status: 503 }) });
    assert.match((await unavailable.getWeather('עפולה')).error, /נח לרגע/);

    const offline = new WeatherService({ fetchImpl: async () => { throw new Error('offline'); } });
    assert.match((await offline.getWeather('עפולה')).error, /נח לרגע/);

    console.log('Weather service tests passed.');
}

Promise.all([runServiceTests(), testCoalescedRefresh()]).catch(error => {
    console.error(error);
    process.exitCode = 1;
});
