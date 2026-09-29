const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');

const GOOGLE_CLIENT_ID = '767977046495-kht73hm31j6cuu10m2gjh2s8dj2apdoi.apps.googleusercontent.com';
const GOOGLE_SCOPE = [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/drive.appdata'
].join(' ');
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const USER_INFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TIMEOUT_MS = 180000;
const CALLBACK_CLOSE_TIMEOUT_MS = 3000;

function describeOAuthError(code) {
    switch (code) {
        case 'access_denied': return 'האישור ב־Google לא ניתן או שהמשתמש ביטל אותו.';
        case 'timeout': return 'ההתחברות לא הושלמה בזמן. אפשר לנסות שוב.';
        case 'invalid_state': return 'בקשת ההתחברות לא תואמה. אפשר לנסות שוב.';
        case 'missing_code': return 'Google לא החזיר קוד הרשאה. אפשר לנסות שוב.';
        default: return 'ההתחברות בוטלה או נדחתה.';
    }
}

function base64Url(buffer) {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function safeText(value, maxLength = 5000) {
    return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, maxLength);
}

function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function nextDate(value) {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function validTimeZone(value) {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
        return value;
    } catch {
        return 'UTC';
    }
}

class GoogleCalendarService {
    constructor({ app, safeStorage, openExternal, fetchImpl = globalThis.fetch, fileSystem = fs, pathModule = path, clientId = GOOGLE_CLIENT_ID }) {
        this.app = app;
        this.safeStorage = safeStorage;
        this.openExternal = openExternal;
        this.fetchImpl = fetchImpl;
        this.fileSystem = fileSystem;
        this.pathModule = pathModule;
        this.clientId = clientId;
    }

    getTokenPath() {
        return this.pathModule.join(this.app.getPath('userData'), 'google-calendar-token.bin');
    }

    loadTokens() {
        const filePath = this.getTokenPath();
        if (!this.fileSystem.existsSync(filePath)) return null;
        if (!this.safeStorage.isEncryptionAvailable()) throw new Error('השמירה המאובטחת אינה זמינה במחשב.');
        try {
            return JSON.parse(this.safeStorage.decryptString(this.fileSystem.readFileSync(filePath)));
        } catch {
            throw new Error('לא ניתן לקרוא את חיבור Google Calendar השמור. התחבר מחדש.');
        }
    }

    saveTokens(tokens) {
        if (!this.safeStorage.isEncryptionAvailable()) throw new Error('השמירה המאובטחת אינה זמינה במחשב.');
        const filePath = this.getTokenPath();
        this.fileSystem.mkdirSync(this.pathModule.dirname(filePath), { recursive: true });
        const temporaryPath = `${filePath}.${process.pid}.tmp`;
        this.fileSystem.writeFileSync(temporaryPath, this.safeStorage.encryptString(JSON.stringify(tokens)));
        this.fileSystem.renameSync(temporaryPath, filePath);
    }

    async getStatus() {
        try {
            const tokens = this.loadTokens();
            const connected = Boolean(tokens?.refreshToken || tokens?.accessToken);
            return {
                connected,
                driveEnabled: connected && String(tokens?.scope || '').split(/\s+/).includes('https://www.googleapis.com/auth/drive.appdata'),
                account: tokens?.account ? {
                    email: tokens.account.email,
                    name: tokens.account.name,
                    picture: tokens.account.picture
                } : null
            };
        } catch {
            return { connected: false, driveEnabled: false };
        }
    }

    hasScope(scope) {
        try {
            return String(this.loadTokens()?.scope || '').split(/\s+/).includes(scope);
        } catch {
            return false;
        }
    }

    async getAccountInfo() {
        const result = await this.authorizedRequest(USER_INFO_URL);
        const sub = safeText(result?.sub, 256);
        const email = safeText(result?.email, 254).trim().toLowerCase();
        if (!sub || !email || result?.email_verified !== true) {
            throw new Error('Google לא החזיר חשבון מאומת. אפשר לנסות חשבון Google אחר.');
        }
        return {
            sub,
            email,
            name: safeText(result?.name || email.split('@')[0], 120),
            picture: safeText(result?.picture, 1000)
        };
    }

    signIn() {
        if (!this.safeStorage.isEncryptionAvailable()) return Promise.resolve({ ok: false, error: 'השמירה המאובטחת אינה זמינה במחשב.' });
        if (this.signInFlight) return this.signInFlight;

        this.signInFlight = this.runSignIn().finally(() => {
            this.signInFlight = null;
        });
        return this.signInFlight;
    }

    async runSignIn() {
        const state = base64Url(crypto.randomBytes(32));
        const verifier = base64Url(crypto.randomBytes(48));
        const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
        let resolveCallback;
        let rejectServer;
        let timer;
        let listening = false;
        let settled = false;
        const settle = value => {
            if (settled) return;
            settled = true;
            resolveCallback(value);
        };
        const callback = new Promise(resolve => { resolveCallback = resolve; });
        const server = http.createServer((request, response) => {
            const callbackUrl = new URL(request.url, 'http://127.0.0.1');
            if (callbackUrl.pathname !== '/oauth2callback') {
                response.writeHead(404).end();
                return;
            }
            if (callbackUrl.searchParams.get('state') !== state) {
                response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Invalid OAuth state.');
                settle({ error: 'invalid_state' });
                return;
            }
            const error = callbackUrl.searchParams.get('error');
            const code = callbackUrl.searchParams.get('code');
            response.writeHead(error || !code ? 400 : 200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store'
            });
            response.end('<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>Ultimate Pro</title><p>אפשר לחזור לאפליקציית Ultimate Pro ולסגור את החלון הזה.</p></html>');
            settle({ code, error: error || (code ? '' : 'missing_code') });
        });

        server.on('error', () => settle({ error: 'server_error' }));

        try {
            await new Promise((resolve, reject) => {
                rejectServer = reject;
                server.listen(0, '127.0.0.1', resolve);
                });
            listening = true;
            const address = server.address();
            const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
            const authUrl = new URL(AUTH_URL);
            authUrl.searchParams.set('client_id', this.clientId);
            authUrl.searchParams.set('redirect_uri', redirectUri);
            authUrl.searchParams.set('response_type', 'code');
            authUrl.searchParams.set('scope', GOOGLE_SCOPE);
            authUrl.searchParams.set('code_challenge', challenge);
            authUrl.searchParams.set('code_challenge_method', 'S256');
            authUrl.searchParams.set('state', state);
            authUrl.searchParams.set('access_type', 'offline');
            authUrl.searchParams.set('include_granted_scopes', 'true');
            authUrl.searchParams.set('prompt', 'consent select_account');

            timer = setTimeout(() => settle({ error: 'timeout' }), OAUTH_TIMEOUT_MS);
            await this.openExternal(authUrl.toString());
            const result = await callback;
            if (result.error) return { ok: false, error: describeOAuthError(result.error) };

            const tokenResult = await this.exchangeCode(result.code, verifier, redirectUri);
            if (!tokenResult.ok) return tokenResult;
            const previous = this.loadTokens();
            const tokens = {
                accessToken: tokenResult.data.access_token,
                refreshToken: tokenResult.data.refresh_token || previous?.refreshToken || '',
                expiresAt: Date.now() + Number(tokenResult.data.expires_in || 3600) * 1000,
                scope: tokenResult.data.scope || GOOGLE_SCOPE,
                tokenType: tokenResult.data.token_type || 'Bearer'
            };
            this.saveTokens(tokens);
            const account = await this.getAccountInfo();
            this.saveTokens({ ...tokens, account });
            return { ok: true, connected: true, account };
        } catch (error) {
            if (rejectServer && !listening) rejectServer(error);
            return { ok: false, error: error?.message || 'לא ניתן להתחבר ל־Google Calendar.' };
        } finally {
            clearTimeout(timer);
            if (listening) {
                // Chrome keeps the loopback connection alive; without closing it explicitly
                // server.close() never completes and the whole sign-in promise hangs.
                if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
                await new Promise(resolve => {
                    const closeTimer = setTimeout(() => {
                        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
                        resolve();
                    }, CALLBACK_CLOSE_TIMEOUT_MS);
                    server.close(() => { clearTimeout(closeTimer); resolve(); });
                });
            }
        }
    }

    async exchangeCode(code, verifier, redirectUri) {
        const body = new URLSearchParams({
            code,
            client_id: this.clientId,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
            code_verifier: verifier
        });
        return this.tokenRequest(body);
    }

    async tokenRequest(body) {
        try {
            const response = await this.fetchImpl(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
                body,
                signal: AbortSignal.timeout(15000)
            });
            const data = await response.json();
            if (!response.ok || !data?.access_token) return { ok: false, error: 'Google לא השלים את החיבור. בדוק את סוג OAuth Client ID והגדרות הפרויקט.' };
            return { ok: true, data };
        } catch {
            return { ok: false, error: 'לא ניתן להשלים את החיבור ל־Google כרגע.' };
        }
    }

    async getAccessToken(forceRefresh = false) {
        const tokens = this.loadTokens();
        if (!tokens) throw new Error('יש להתחבר תחילה ל־Google Calendar.');
        if (!forceRefresh && tokens.accessToken && tokens.expiresAt > Date.now() + 60000) return tokens.accessToken;
        if (!tokens.refreshToken) throw new Error('החיבור פג. יש להתחבר מחדש ל־Google Calendar.');

        const result = await this.tokenRequest(new URLSearchParams({
            client_id: this.clientId,
            refresh_token: tokens.refreshToken,
            grant_type: 'refresh_token'
        }));
        if (!result.ok) throw new Error(result.error);
        const refreshed = {
            ...tokens,
            accessToken: result.data.access_token,
            expiresAt: Date.now() + Number(result.data.expires_in || 3600) * 1000,
            scope: result.data.scope || tokens.scope
        };
        this.saveTokens(refreshed);
        return refreshed.accessToken;
    }

    async authorizedFetch(url, options = {}, retry = true) {
        const accessToken = await this.getAccessToken();
        const response = await this.fetchImpl(url, {
            ...options,
            headers: { ...(options.headers || {}), Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
            signal: options.signal || AbortSignal.timeout(15000)
        });
        if (response.status === 401 && retry) {
            await this.getAccessToken(true);
            return this.authorizedFetch(url, options, false);
        }
        if (!response.ok) throw new Error('Google לא הצליח להשלים את הפעולה. בדוק את ההרשאות והחיבור ונסה שוב.');
        return response;
    }

    async authorizedRequest(url, options = {}, retry = true) {
        const response = await this.authorizedFetch(url, options, retry);
        return response.json();
    }

    async listEvents({ timeMin, timeMax }) {
        if (!timeMin || !timeMax || !Number.isFinite(Date.parse(timeMin)) || !Number.isFinite(Date.parse(timeMax))) {
            return { ok: false, error: 'טווח התאריכים אינו תקין.' };
        }
        try {
            const url = new URL(EVENTS_URL);
            url.searchParams.set('timeMin', timeMin);
            url.searchParams.set('timeMax', timeMax);
            url.searchParams.set('singleEvents', 'true');
            url.searchParams.set('orderBy', 'startTime');
            url.searchParams.set('maxResults', '2500');
            const result = await this.authorizedRequest(url);
            return { ok: true, events: Array.isArray(result.items) ? result.items.map(item => ({
                id: safeText(item.id, 256),
                summary: safeText(item.summary, 200),
                description: safeText(item.description, 5000),
                start: item.start?.dateTime || item.start?.date || '',
                end: item.end?.dateTime || item.end?.date || '',
                allDay: Boolean(item.start?.date),
                colorId: safeText(item.colorId, 8),
                htmlLink: safeText(item.htmlLink, 1000)
            })) : [] };
        } catch (error) {
            return { ok: false, error: error?.message || 'לא ניתן לטעון אירועים מ־Google Calendar.' };
        }
    }

    buildEventResource(input = {}) {
        const title = safeText(input.title, 200).trim();
        const date = String(input.date || '');
        if (!title || !validDate(date)) throw new Error('יש להזין כותרת ותאריך תקינים.');

        const timezone = validTimeZone(input.timeZone);
        const reminders = Math.max(0, Math.min(1440, Number(input.reminderMinutes) || 0));
        const resource = {
            summary: title,
            description: safeText(input.description, 5000),
            reminders: {
                useDefault: false,
                overrides: reminders ? [{ method: 'popup', minutes: reminders }] : []
            }
        };

        if (input.allDay) {
            resource.start = { date, timeZone: timezone };
            resource.end = { date: nextDate(date), timeZone: timezone };
            return resource;
        }

        const startTime = String(input.startTime || '09:00');
        const endTime = String(input.endTime || '10:00');
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) {
            throw new Error('שעת התחלה או סיום אינה תקינה.');
        }
        resource.start = { dateTime: `${date}T${startTime}:00`, timeZone: timezone };
        resource.end = { dateTime: `${date}T${endTime}:00`, timeZone: timezone };
        return resource;
    }

    async createEvent(input) {
        try {
            const resource = this.buildEventResource(input);
            const result = await this.authorizedRequest(EVENTS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(resource)
            });
            return { ok: true, id: safeText(result.id, 256) };
        } catch (error) {
            return { ok: false, error: error?.message || 'לא ניתן ליצור אירוע ב־Google Calendar.' };
        }
    }

    async updateEvent(id, input) {
        if (!/^[\w-]{1,256}$/.test(String(id || ''))) return { ok: false, error: 'מזהה האירוע אינו תקין.' };
        try {
            const resource = this.buildEventResource(input);
            const url = `${EVENTS_URL}/${encodeURIComponent(id)}`;
            const result = await this.authorizedRequest(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(resource)
            });
            return { ok: true, id: safeText(result.id, 256) };
        } catch (error) {
            return { ok: false, error: error?.message || 'לא ניתן לעדכן אירוע ב־Google Calendar.' };
        }
    }

    async signOut() {
        try {
            this.fileSystem.rmSync(this.getTokenPath(), { force: true });
            return { ok: true, connected: false };
        } catch {
            return { ok: false, error: 'לא ניתן לנתק את Google Calendar מהמחשב.' };
        }
    }
}

module.exports = { GoogleCalendarService, GOOGLE_CLIENT_ID, GOOGLE_SCOPE, safeText, validDate, nextDate };
