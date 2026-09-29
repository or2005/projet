const assert = require('node:assert/strict');
const apps = require('../src/renderer/apps/registry.js');
const profile = require('../src/renderer/shared/profile.js');
const clock = require('../src/renderer/shared/clock.js');

assert.deepEqual(apps.map(app => app.id), ['salary', 'finance', 'calendar', 'vault']);
assert.equal(apps[0].status, 'ready');
assert.equal(apps[1].status, 'ready');
assert.equal(apps[2].status, 'ready');
assert.equal(apps[3].status, 'planned');

const afterBirthday = new Date(2026, 8, 29);
const beforeBirthday = new Date(2026, 8, 27);
assert.equal(profile.calculateAge('2000-09-28', afterBirthday), 26);
assert.equal(profile.calculateAge('2000-09-28', beforeBirthday), 25);
assert.equal(profile.calculateAge('2020-02-30', afterBirthday), null);

const validProfile = profile.validateProfile({ name: 'אור', dateOfBirth: '2000-09-28' }, afterBirthday);
assert.equal(validProfile.valid, true);
assert.equal(validProfile.values.age, 26);
assert.equal(profile.validateProfile({ name: '', dateOfBirth: '2020-02-30' }, afterBirthday).valid, false);
assert.equal(profile.validateProfile({ name: 'אור', dateOfBirth: '2000-09-28', email: 'bad' }, afterBirthday).valid, false);

assert.match(clock.formatTime(new Date('2026-09-29T09:00:00Z')), /^12:00:00$/);
assert.match(clock.formatDate(new Date('2026-09-29T09:00:00Z')), /יום/);
assert.equal(clock.getGreeting(new Date('2026-09-29T02:00:00Z')), 'בוקר טוב');
assert.equal(clock.getGreeting(new Date('2026-09-29T09:00:00Z')), 'צהריים טובים');
assert.equal(clock.getGreeting(new Date('2026-09-29T14:00:00Z')), 'צהריים טובים');
assert.equal(clock.getGreeting(new Date('2026-09-29T16:00:00Z')), 'ערב טוב');
assert.equal(clock.getGreeting(new Date('2026-09-29T21:00:00Z')), 'לילה טוב');

console.log('Hub foundation tests passed.');