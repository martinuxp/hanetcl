#!/usr/bin/env node
/* global __dirname */
// The app's version lives in app.json: `expo.version` is the number the
// stores and the phones see (iOS and Android only take digits and dots), and
// `expo.extra.releaseStage` is the label shown next to it ("beta"). The app
// shows both as "v0.1.0-beta". package.json carries the same pair as semver.
// constants/changelog.json is what Configuraciones > Novedades shows: its
// first release must be the current version and say what changed.
//
//   npm run version:bump            -> 0.1.0 => 0.1.1 (default, any PR)
//   npm run version:bump -- minor   -> 0.1.3 => 0.2.0 (a new module or big change)
//   npm run version:bump -- major   -> leaves beta (1.0.0 = stable)
//   npm run version:check [-- <base ref>]
//     Fails unless app.json, package.json and the changelog agree and, given a base ref
//     (e.g. origin/auditoria-ui-y-auth-ydxytn), the version went up against it.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const appJsonPath = path.join(root, 'app.json');
const pkgPath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');
const changelogPath = path.join(root, 'constants', 'changelog.json');

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, data) => fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);

const parse = version => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? '');
  if (!match) throw new Error(`"${version}" no es una versión X.Y.Z válida para iOS y Android.`);
  return match.slice(1).map(Number);
};
const compare = (a, b) => {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};
const semver = (version, stage) => (stage ? `${version}-${stage}` : version);
const current = (appJson = readJson(appJsonPath)) => ({
  version: appJson.expo.version,
  stage: appJson.expo.extra?.releaseStage ?? '',
});

function bump(kind = 'patch') {
  const appJson = readJson(appJsonPath);
  const { version, stage } = current(appJson);
  let [major, minor, patch] = parse(version);
  if (kind === 'major') [major, minor, patch] = [major + 1, 0, 0];
  else if (kind === 'minor') [minor, patch] = [minor + 1, 0];
  else if (kind === 'patch') patch += 1;
  else throw new Error(`Usa patch, minor o major (no "${kind}").`);
  const next = `${major}.${minor}.${patch}`;
  // 1.0.0 is the stable version: it no longer carries the beta label.
  const nextStage = major >= 1 ? '' : stage;

  appJson.expo.version = next;
  if (nextStage) appJson.expo.extra = { ...appJson.expo.extra, releaseStage: nextStage };
  else if (appJson.expo.extra) delete appJson.expo.extra.releaseStage;
  writeJson(appJsonPath, appJson);

  const full = semver(next, nextStage);
  const pkg = readJson(pkgPath);
  pkg.version = full;
  writeJson(pkgPath, pkg);
  if (fs.existsSync(lockPath)) {
    const lock = readJson(lockPath);
    lock.version = full;
    if (lock.packages?.['']) lock.packages[''].version = full;
    writeJson(lockPath, lock);
  }
  const changelog = readJson(changelogPath);
  if (changelog.releases[0]?.version !== full) {
    const date = new Date().toISOString().slice(0, 10);
    changelog.releases.unshift({ version: full, date, title: '', items: [] });
    writeJson(changelogPath, changelog);
  }
  console.log(`v${semver(version, stage)} -> v${full}`);
  console.log('Escribe qué cambió en constants/changelog.json (title es opcional).');
}

function check(baseRef) {
  const { version, stage } = current();
  parse(version);
  const full = semver(version, stage);
  const pkgVersion = readJson(pkgPath).version;
  if (pkgVersion !== full) {
    throw new Error(`package.json dice ${pkgVersion} y app.json dice ${full}. Usa npm run version:bump.`);
  }
  const [latest] = readJson(changelogPath).releases;
  if (latest?.version !== full) {
    throw new Error(`El changelog parte en ${latest?.version ?? 'nada'}, no en ${full}. Agrega la versión a constants/changelog.json.`);
  }
  if (!latest.items?.some(item => item.trim())) {
    throw new Error(`La versión ${full} no dice qué cambió en constants/changelog.json.`);
  }
  if (!baseRef) {
    console.log(`v${full}`);
    return;
  }
  const show = file => execFileSync('git', ['show', `${baseRef}:${file}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    show('constants/changelog.json');
  } catch {
    // The base predates numbered versions (it said 1.0.0): this PR starts them.
    console.log(`v${full} (primera versión con número)`);
    return;
  }
  const base = current(JSON.parse(show('app.json')));
  if (compare(parse(version), parse(base.version)) <= 0) {
    throw new Error(`La versión sigue en v${semver(base.version, base.stage)}. Cada PR la sube: npm run version:bump.`);
  }
  console.log(`v${semver(base.version, base.stage)} -> v${full}`);
}

try {
  const [command, arg] = process.argv.slice(2);
  if (command === 'bump') bump(arg);
  else if (command === 'check') check(arg);
  else throw new Error('Uso: node scripts/version.js bump [patch|minor|major] | check [base]');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
