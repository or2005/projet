function normalizeCity(value) {
    const city = String(value || '').trim();
    if (!city || city.length > 80 || /[<>\r\n]/.test(city)) return null;
    return city;
}

function getWeatherErrorMessage(status) {
    if (status === 429 || status >= 500) return 'מזג האוויר נח לרגע. ננסה שוב מאוחר יותר.';
    return 'אין כרגע עדכון מזג אוויר. אפשר לרענן שוב בעוד כמה דקות.';
}

function getWeatherCondition(code) {
    if (code === 0) return { condition: 'clear', description: 'בהיר' };
    if (code === 1) return { condition: 'clouds', description: 'מעונן מעט' };
    if (code === 2) return { condition: 'clouds', description: 'מעונן חלקית' };
    if (code === 3) return { condition: 'clouds', description: 'מעונן' };
    if (code === 45 || code === 48) return { condition: 'mist', description: 'ערפילי' };
    if (code >= 51 && code <= 67 || code >= 80 && code <= 82) return { condition: 'rain', description: 'גשום' };
    if (code >= 71 && code <= 77 || code === 85 || code === 86) return { condition: 'snow', description: 'שלג' };
    if (code >= 95 && code <= 99) return { condition: 'thunderstorm', description: 'סופות רעמים' };
    return { condition: 'clouds', description: 'מעונן' };
}

function normalizeWeatherResponse(payload, cityValue = 'עפולה') {
    const current = payload?.current_weather;
    const temperature = Number(current?.temperature);
    const windSpeed = Number(current?.windspeed);
    const code = Number(current?.weathercode);
    const city = String(cityValue || 'עפולה').trim().slice(0, 80);
    if (!Number.isFinite(temperature) || !Number.isFinite(code) || !city) return null;

    const weather = getWeatherCondition(code);
    return {
        city,
        temperature: Math.round(temperature),
        description: weather.description,
        humidity: null,
        windSpeed: Number.isFinite(windSpeed) ? Math.max(0, windSpeed) : null,
        condition: weather.condition
    };
}

class WeatherService {
    constructor({ fetchImpl = globalThis.fetch } = {}) {
        this.fetchImpl = fetchImpl;
    }

    async getWeather(cityValue) {
        const city = normalizeCity(cityValue) || 'עפולה';
        try {
            const url = new URL('https://api.open-meteo.com/v1/forecast?latitude=32.61&longitude=35.29&current_weather=true');
            const response = await this.fetchJson(url);
            if (!response.ok) return { ok: false, error: getWeatherErrorMessage(response.status) };
            const weather = normalizeWeatherResponse(await response.json(), city);
            return weather ? { ok: true, weather } : { ok: false, error: 'אין כרגע עדכון מזג אוויר. אפשר לרענן שוב בעוד כמה דקות.' };
        } catch (error) {
            const message = error?.name === 'TimeoutError' || error?.name === 'AbortError'
                ? 'העדכון מתעכב. ננסה שוב בעוד כמה דקות.'
                : 'מזג האוויר נח לרגע. ננסה שוב מאוחר יותר.';
            return { ok: false, error: message };
        }
    }

    fetchJson(url) {
        return this.fetchImpl(url, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } });
    }
}

module.exports = { WeatherService, getWeatherErrorMessage, getWeatherCondition, normalizeCity, normalizeWeatherResponse };