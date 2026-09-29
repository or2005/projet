const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const appFile = path.join(__dirname, '..', 'src', 'renderer', 'apps', 'calendar', 'calendar.js');
assert.ok(fs.existsSync(appFile), 'Calendar app module should exist.');

const mod = require(appFile);
assert.ok(mod && typeof mod.getMonthDays === 'function');
assert.ok(mod && typeof mod.normalizeEvent === 'function');
assert.ok(mod && Array.isArray(mod.DEFAULT_COLORS));

const monthDays = mod.getMonthDays('2026-09');
assert.equal(monthDays.length, 35);
assert.equal(monthDays[0].date, '2026-08-31');
assert.equal(monthDays[2].date, '2026-09-02');

const event = mod.normalizeEvent({
  title: 'פגישה',
  date: '2026-09-12',
  startTime: '09:00',
  endTime: '10:30',
  allDay: false,
  reminderMinutes: 30
});
assert.equal(event.title, 'פגישה');
assert.equal(event.reminderMinutes, 30);
assert.equal(event.color, 'mint');
assert.equal(event.completed, false);
assert.equal(mod.normalizeEvent({ title: 'משימה', date: '2026-09-12', completed: true }).completed, true);

console.log('Calendar app tests passed.');
