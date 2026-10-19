// Writes constants/open-source-licenses.json, the list behind Configuraciones →
// Licencias de código abierto: every package that ships inside the app, with
// its license and the license text it includes. "Ships" means its code is in
// the JavaScript bundle (read from an export's source maps) or it is a native
// module that gets linked into the build; build tools (Babel, Metro...) don't.
// Run it after changing dependencies: node scripts/generate-licenses.js
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hanet-licenses-'));
execSync(`npx expo export --platform ios --platform android --source-maps --no-minify --output-dir ${exportDir}`, { cwd: root, stdio: 'inherit' });

function packageDirOf(file) {
  const parts = file.split('/');
  const at = parts.lastIndexOf('node_modules');
  if (at < 0) return null;
  const length = parts[at + 1]?.startsWith('@') ? 3 : 2;
  return path.resolve(root, parts.slice(0, at + length).join('/'));
}

const dirs = new Set();
const maps = execSync(`find ${exportDir} -name '*.map'`).toString().trim().split('\n');
for (const map of maps) {
  for (const source of JSON.parse(fs.readFileSync(map, 'utf8')).sources) {
    // Sources are relative to the map; only the node_modules part matters.
    const at = source.indexOf('node_modules/');
    const dir = at < 0 ? null : packageDirOf(path.join(root, source.slice(at)));
    if (dir) dirs.add(dir);
  }
}
fs.rmSync(exportDir, { recursive: true, force: true });

// Native modules can live only in the build, with no JavaScript in the bundle.
const isNative = dir => ['expo-module.config.json', 'react-native.config.js'].some(file => fs.existsSync(path.join(dir, file)))
  || fs.readdirSync(dir).some(file => file.endsWith('.podspec'));
const installed = execSync('npm ls --omit=dev --all --parseable', { cwd: root, maxBuffer: 1 << 28 }).toString().trim().split('\n');
for (const dir of installed) if (dir.includes('node_modules') && isNative(dir)) dirs.add(dir);
const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i;

const packages = new Map();
for (const dir of [...dirs]) {
  if (!fs.existsSync(path.join(dir, 'package.json'))) continue;
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const key = `${pkg.name}@${pkg.version}`;
  if (packages.has(key)) continue;
  const license = typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? ((pkg.licenses ?? []).map(l => l.type ?? l).join(' OR ') || 'Desconocida'));
  const file = fs.readdirSync(dir).find(entry => LICENSE_FILE.test(entry));
  const text = file ? fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n').trim() : null;
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  const author = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name ?? null;
  packages.set(key, { name: pkg.name, version: pkg.version, license, author, text, url: normalizeUrl(repo) ?? pkg.homepage ?? null });
}

function normalizeUrl(repo) {
  if (!repo) return null;
  const url = repo.replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://').replace(/^ssh:\/\/git@/, 'https://');
  if (/^github:/.test(url)) return `https://github.com/${url.slice(7)}`;
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) return `https://github.com/${url}`;
  return url.startsWith('http') ? url : null;
}

// Some packages don't include their license file. They borrow it from their
// family (expo-router from expo, @react-native/* from react-native) or, failing
// that, get the standard text of the license they declare.
const FAMILY = [[/^(expo-|@expo\/)/, 'expo'], [/^@react-native\//, 'react-native']];
const STANDARD = {
  MIT: holder => `MIT License\n\nCopyright (c) ${holder}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`,
  ISC: holder => `ISC License\n\nCopyright (c) ${holder}\n\nPermission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.\n\nTHE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`,
};
const all = [...packages.values()];
// The Apache text is the official one, without its appendix.
const apacheText = fs.readFileSync(path.join(__dirname, 'licenses/Apache-2.0.txt'), 'utf8').trim();
for (const entry of all) {
  if (entry.text) continue;
  const family = FAMILY.find(([pattern]) => pattern.test(entry.name))?.[1];
  const relative = family && all.find(other => other.name === family && other.text);
  const holder = (entry.author ?? entry.name).replace(/\s*[<(].*$/, '');
  if (relative) entry.text = relative.text;
  else if (entry.license === 'Apache-2.0') entry.text = apacheText;
  else if (STANDARD[entry.license]) entry.text = STANDARD[entry.license](holder);
  if (entry.text) entry.standard = !relative;
}

// The same license text is shared by many packages (all of Expo, all of React
// Native...): it is stored once and each package points at it.
const texts = [];
const textIndex = new Map();
const list = [...packages.values()]
  .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
  .map(({ text, ...entry }) => {
    if (text == null) return { ...entry, text: null };
    if (!textIndex.has(text)) { textIndex.set(text, texts.length); texts.push(text); }
    return { ...entry, text: textIndex.get(text) };
  });

fs.writeFileSync(path.join(root, 'constants/open-source-licenses.json'), JSON.stringify({ packages: list, texts }) + '\n');
console.log(`${list.length} paquetes, ${texts.length} textos de licencia, ${list.filter(p => p.standard).length} con el texto estándar, ${list.filter(p => p.text == null).length} sin texto`);
