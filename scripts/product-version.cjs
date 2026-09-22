#!/usr/bin/env node
// BRAND.version is the source of truth; package metadata and README mirror it.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const brandPath = 'frontend/src/config/brand.js';
const brand = read(brandPath);
const current = brand.match(/version: 'v(\d+\.\d+\.\d+)'/)?.[1];
const readme = read('README.md');
const readmePattern = /\*\*Aktuel produktversion: v\d+\.\d+\.\d+\.\*\*/;
const pkg = json('package.json');
const frontend = json('frontend/package.json');
const lock = json('package-lock.json');

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!current || !readmePattern.test(readme) || !lock.packages?.[''] || !lock.packages?.frontend) {
  fail('Versionskilder mangler eller har ændret format. Ingen filer er ændret.');
}

const [command = 'check', level = 'patch'] = process.argv.slice(2);
if (command === 'check') {
  const versions = [pkg.version, frontend.version, lock.version, lock.packages[''].version, lock.packages.frontend.version];
  if (versions.some((value) => value !== current) || !readme.includes(`**Aktuel produktversion: v${current}.**`)) {
    fail(`Versionsnumrene stemmer ikke med BRAND.version v${current}. Brug npm run version:bump -- patch|minor|major eller et nyt versionsnummer.`);
  }
  console.log(`SHIELD v${current}: brugerflade, pakkefiler, lockfil og README stemmer overens.`);
} else if (command === 'bump') {
  const parts = current.split('.').map(Number);
  const index = ['major', 'minor', 'patch'].indexOf(level);
  let next = level;
  if (index !== -1) {
    parts[index] += 1;
    parts.fill(0, index + 1);
    next = parts.join('.');
  }
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(next)) {
    fail('Brug patch, minor, major eller et versionsnummer som 0.8.1. Ingen filer er ændret.');
  }
  const previousParts = current.split('.').map(Number);
  const nextParts = next.split('.').map(Number);
  const firstDifference = nextParts.findIndex((value, i) => value !== previousParts[i]);
  if (nextParts.some((value) => !Number.isSafeInteger(value)) || firstDifference < 0 || nextParts[firstDifference] < previousParts[firstDifference]) {
    fail(`Versionen skal være højere end ${current}. Ingen filer er ændret.`);
  }
  pkg.version = frontend.version = lock.version = lock.packages[''].version = lock.packages.frontend.version = next;
  const updates = {
    [brandPath]: brand.replace(`version: 'v${current}'`, `version: 'v${next}'`),
    'package.json': JSON.stringify(pkg, null, 2) + '\n',
    'frontend/package.json': JSON.stringify(frontend, null, 2) + '\n',
    'package-lock.json': JSON.stringify(lock, null, 2) + '\n',
    'README.md': readme.replace(readmePattern, `**Aktuel produktversion: v${next}.**`),
  };
  for (const [file, content] of Object.entries(updates)) {
    fs.writeFileSync(path.join(root, file), content);
  }
  console.log(`SHIELD v${current} → v${next}. Opdatér CHANGELOG.md, byg og kontrollér versionen i browseren.`);
} else {
  fail('Brug check eller bump [patch|minor|major|version].');
}
