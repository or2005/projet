const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const scriptJs = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const expectedVersion = packageJson.version;
assert.equal(packageJson.version, expectedVersion, 'package.json version should match the release version');
const escapedVersion = expectedVersion.replace(/\./g, '\\.');
assert.match(scriptJs, new RegExp(`Version:\\s*${escapedVersion}`), 'script.js should declare the current release version');
assert.match(indexHtml, new RegExp(`גרסה ${escapedVersion}`), 'index.html should show the current release version');

console.log('Version consistency checks passed.');
