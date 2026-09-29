# Personal Calendar

The calendar is a local-first renderer app registered in `src/renderer/apps/registry.js`.

- Month grid with previous/next navigation and a selected-day agenda.
- Create, edit, and delete all-day or timed events with notes and a color.
- Reminder intervals are stored with each event; this version does not send operating-system notifications.
- Events are stored in browser local storage under `ultimate_pro_calendar_events_v1`.
- Dates use local calendar dates; recurrence and cross-device synchronization are not implemented.

Run `node tests/calendar-app.test.js` to validate the month and event data helpers.
