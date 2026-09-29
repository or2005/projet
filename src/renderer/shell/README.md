# Application Shell

The shell is currently rendered by `index.html` and orchestrated by the existing `script.js` to avoid breaking the salary app. `src/renderer/apps/registry.js` declares the launcher modules. New navigation and hub-only helpers belong here as the shell is separated from the legacy renderer.
