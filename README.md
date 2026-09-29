# Ultimate Pro

Ultimate Pro is a Windows desktop application for managing work shifts, payroll estimates, personal finance and a calendar. The interface is in Hebrew.

## Install

Download and run the Windows installer from the repository's Releases page. The installer supports choosing an installation directory, creates Start menu and desktop shortcuts, and includes an uninstaller. Windows may show a SmartScreen warning because the installer is not code-signed.

## First sign-in

Sign in with a Google account. New users then complete a local profile. The same Google authorization enables Google Calendar and the application's private Google Drive `appDataFolder` backup. Google sign-in requires the project owner to enable both Google Calendar API and Google Drive API and configure the OAuth consent screen for `openid`, `email`, `profile`, `calendar.events` and `drive.appdata`.

Profile and finance files are stored locally using Electron safeStorage. Work-shift data is stored in the current Windows user data directory. Drive backups use the app's private Drive folder, but the backup JSON is not end-to-end encrypted by the app. Avoid using the app for data that requires client-side-only encryption.

## Run from source

Requirements: Node.js and npm on Windows.

```powershell
npm install
npm start
```

## Tests

```powershell
npm test
npm run test:performance
```

## Build the Windows installer

The builder uses the placeholder `icon.ico` in the project root. Replace it with the final branded icon before distributing a signed release.

```powershell
npm install electron-builder --save-dev
npm run build
```

The installer is written to `dist/installers/`. The `npm run dist` command is an alias for the same build.
