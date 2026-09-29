# Shared Renderer Helpers

- `profile.js` validates the first-run profile and derives age from birth date.
- `clock.js` formats the current date and time for `Asia/Jerusalem`.

Keep these helpers free of Electron APIs. Secure persistence belongs in the main-process services and is exposed through named preload methods.
