const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { GoogleCalendarService, GOOGLE_SCOPE } = require('../src/main/services/google-calendar-service.js');

async function requestCallback(url) {
    await new Promise((resolve, reject) => {
        http.get(url, response => {
            response.resume();
            response.on('end', resolve);
        }).on('error', reject);
    });
}

async function run() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ultimate-pro-google-calendar-'));
    const app = { getPath: () => root };
    const safeStorage = {
        isEncryptionAvailable: () => true,
        encryptString: value => Buffer.from(value).toString('base64'),
        decryptString: value => Buffer.from(value.toString(), 'base64').toString()
    };
    let tokenRequestBody;
    let insertedResource;
    let updatedResource;
    let requestedEventsUrl;
    const service = new GoogleCalendarService({
        app,
        safeStorage,
        clientId: 'desktop-client.apps.googleusercontent.com',
        openExternal: async authUrl => {
            const authorization = new URL(authUrl);
            assert.equal(authorization.searchParams.get('scope'), GOOGLE_SCOPE);
            assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
            assert.ok(authorization.searchParams.get('code_challenge'));
            const callback = new URL(authorization.searchParams.get('redirect_uri'));
            callback.searchParams.set('state', authorization.searchParams.get('state'));
            callback.searchParams.set('code', 'mock-auth-code');
            await requestCallback(callback);
        },
        fetchImpl: async (url, options = {}) => {
            const requestUrl = new URL(url);
            if (requestUrl.hostname === 'oauth2.googleapis.com') {
                tokenRequestBody = new URLSearchParams(options.body);
                return { ok: true, status: 200, json: async () => ({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600, scope: GOOGLE_SCOPE }) };
            }
            if (requestUrl.hostname === 'openidconnect.googleapis.com') {
                return { ok: true, status: 200, json: async () => ({ sub: 'google-user-123', email: 'user@example.com', email_verified: true, name: 'Google User' }) };
            }
            requestedEventsUrl = requestUrl;
            if (options.method === 'POST') {
                insertedResource = JSON.parse(options.body);
                return { ok: true, status: 200, json: async () => ({ id: 'event_123' }) };
            }
            if (options.method === 'PUT') {
                updatedResource = JSON.parse(options.body);
                return { ok: true, status: 200, json: async () => ({ id: 'event_123' }) };
            }
            return {
                ok: true,
                status: 200,
                json: async () => ({ items: [{ id: 'event_123', summary: 'פגישה', start: { dateTime: '2026-09-29T09:00:00+03:00' }, end: { dateTime: '2026-09-29T10:00:00+03:00' } }] })
            };
        }
    });

    try {
        const connected = await service.signIn();
        assert.deepEqual(connected, { ok: true, connected: true, account: { sub: 'google-user-123', email: 'user@example.com', name: 'Google User', picture: '' } });
        assert.equal(tokenRequestBody.get('grant_type'), 'authorization_code');
        assert.ok(tokenRequestBody.get('code_verifier'));
        assert.equal((await service.getStatus()).connected, true);
        assert.equal((await service.getStatus()).driveEnabled, true);
        assert.equal(fs.readFileSync(service.getTokenPath(), 'utf8').includes('refresh'), false);

        const listed = await service.listEvents({ timeMin: '2026-09-01T00:00:00.000Z', timeMax: '2026-10-01T00:00:00.000Z' });
        assert.equal(listed.ok, true);
        assert.equal(listed.events[0].id, 'event_123');
        assert.match(requestedEventsUrl.pathname, /\/calendars\/primary\/events$/);
        assert.equal(requestedEventsUrl.searchParams.get('singleEvents'), 'true');

        const event = { title: 'פגישה', description: 'תיאור', date: '2026-09-29', startTime: '09:00', endTime: '10:00', reminderMinutes: 30, timeZone: 'Asia/Jerusalem' };
        assert.deepEqual(await service.createEvent(event), { ok: true, id: 'event_123' });
        assert.equal(insertedResource.summary, 'פגישה');
        assert.deepEqual(insertedResource.reminders.overrides, [{ method: 'popup', minutes: 30 }]);
        assert.equal(insertedResource.start.timeZone, 'Asia/Jerusalem');
        assert.deepEqual(await service.updateEvent('event_123', event), { ok: true, id: 'event_123' });
        assert.equal(updatedResource.reminders.overrides[0].minutes, 30);
        assert.equal((await service.createEvent({ ...event, date: '2026-02-30' })).ok, false);

        assert.deepEqual(await service.signOut(), { ok: true, connected: false });
        assert.equal((await service.getStatus()).connected, false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }

    // Regression: a second click while the browser flow is open used to open a
    // competing loopback server and leave the first sign-in promise pending forever.
    const concurrentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ultimate-pro-google-concurrent-'));
    try {
        const concurrentService = new GoogleCalendarService({
            app: { getPath: () => concurrentRoot },
            safeStorage,
            clientId: 'desktop-client.apps.googleusercontent.com',
            openExternal: authUrl => {
                const callback = new URL(new URL(authUrl).searchParams.get('redirect_uri'));
                callback.searchParams.set('state', new URL(authUrl).searchParams.get('state'));
                callback.searchParams.set('code', 'mock-auth-code');
                setImmediate(() => { requestCallback(callback).catch(() => {}); });
            },
            fetchImpl: async url => new URL(url).hostname === 'oauth2.googleapis.com'
                ? { ok: true, status: 200, json: async () => ({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600, scope: GOOGLE_SCOPE }) }
                : { ok: true, status: 200, json: async () => ({ sub: 'google-user-456', email: 'two@example.com', email_verified: true, name: 'Second User' }) }
        });
        const first = concurrentService.signIn();
        const second = concurrentService.signIn();
        assert.equal(first, second, 'Concurrent sign-in attempts must share one flow.');
        assert.equal((await first).ok, true);
    } finally {
        fs.rmSync(concurrentRoot, { recursive: true, force: true });
    }

    console.log('Google Calendar service tests passed.');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
