#!/usr/bin/env node
// After `expo export --platform web`: fills in dist-web/sw.js (copied from
// public/sw.js) with the files of this build, so the web app works offline
// and every new build is a new service worker (the app then offers the
// update). Run by `npm run web:build`.
//
// Kept: every page (as its address without ".html"), the scripts in
// _expo/static, the error screens' drawings and what the manifest points
// to. The rest of the fonts and images (assets/) are kept the first time the
// app uses them instead, because most of them (icon sets the app never
// draws) would only weigh.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, '..', 'dist-web');
const SW = path.join(OUT, 'sw.js');
// Expo Router's own pages, and the groups' copies of pages that already have an address.
const SKIP_PAGE = /(^|\/)(\+not-found|404|_sitemap)\.html$|(^|\/)\(/;
const ROOT_FILES = ['manifest.webmanifest', 'favicon.ico', 'apple-touch-icon.png'];
// The error screens' drawings: the offline one is only drawn without internet.
const ERROR_ART = 'assets/assets/errors/';

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function pageUrl(relative) {
  const clean = relative.replace(/\.html$/, '').replace(/(^|\/)index$/, '');
  return `/${clean}`.replace(/\/$/, '') || '/';
}

if (!fs.existsSync(SW)) {
  console.error('dist-web/sw.js no existe: corre primero expo export --platform web.');
  process.exit(1);
}

const files = walk(OUT).map(file => path.relative(OUT, file).split(path.sep).join('/'));
const entries = [];
for (const file of files.sort()) {
  if (file.endsWith('.html')) {
    if (!SKIP_PAGE.test(file)) entries.push({ url: pageUrl(file), file });
  } else if (file.startsWith('_expo/static/') || file.startsWith('icons/') || file.startsWith(ERROR_ART) || ROOT_FILES.includes(file)) {
    entries.push({ url: `/${file}`, file });
  }
}

// The build's name is the hash of everything it keeps: same files, same worker.
const hash = crypto.createHash('sha256');
for (const entry of entries) {
  hash.update(entry.url);
  hash.update(fs.readFileSync(path.join(OUT, entry.file)));
}
const build = hash.digest('hex').slice(0, 12);

const source = fs.readFileSync(SW, 'utf8');
const filled = source
  .replace("const BUILD = 'dev';", `const BUILD = '${build}';`)
  .replace('const PRECACHE = [];', `const PRECACHE = ${JSON.stringify(entries.map(entry => entry.url))};`);
if (filled === source || filled.includes("const BUILD = 'dev';")) {
  console.error('No encontré BUILD ni PRECACHE en dist-web/sw.js.');
  process.exit(1);
}
fs.writeFileSync(SW, filled);

const bytes = entries.reduce((total, entry) => total + fs.statSync(path.join(OUT, entry.file)).size, 0);
console.log(`sw.js: build ${build}, ${entries.length} archivos (${(bytes / 1024 / 1024).toFixed(1)} MB sin comprimir).`);
