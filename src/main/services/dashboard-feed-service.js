const ADVICE_FALLBACK = 'צעד קטן ועקבי יכול לעשות שינוי גדול.';
const FACT_FALLBACK = 'היום הוא זמן טוב לגלות משהו חדש.';
const REQUEST_TIMEOUT_MS = 8000;

function safeText(value, maxLength = 500) {
    return String(value || '')
        .replace(/`/g, "'")
        .replace(/[<>]/g, '')
        .trim()
        .slice(0, maxLength);
}

class DashboardFeedService {
    constructor({ fetchImpl = globalThis.fetch } = {}) {
        this.fetchImpl = fetchImpl;
    }

    async getAdvice() {
        try {
            const response = await this.fetchImpl('https://api.adviceslip.com/advice', {
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }
            });
            if (!response.ok) return { ok: false, advice: ADVICE_FALLBACK };
            const payload = await response.json();
            const advice = safeText(payload?.slip?.advice);
            return advice ? { ok: true, advice } : { ok: false, advice: ADVICE_FALLBACK };
        } catch {
            return { ok: false, advice: ADVICE_FALLBACK };
        }
    }

    async getDailyFact() {
        try {
            const response = await this.fetchImpl('https://uselessfacts.jsph.pl/api/v2/facts/today?language=en', {
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                headers: { Accept: 'application/json' }
            });
            if (!response.ok) return { ok: false, fact: FACT_FALLBACK };
            const payload = await response.json();
            const fact = safeText(payload?.text);
            return fact ? { ok: true, fact } : { ok: false, fact: FACT_FALLBACK };
        } catch {
            return { ok: false, fact: FACT_FALLBACK };
        }
    }
}

module.exports = { DashboardFeedService, ADVICE_FALLBACK, FACT_FALLBACK, safeText };
