#!/usr/bin/env node
'use strict';

/** Publish a validated CRA build outside iCloud and atomically switch current.
 * Existing releases are never edited or automatically deleted. Each new release
 * carries previous content-hashed static files so already-open tabs keep working.
 */
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const HASHED_STATIC = /^static\/(?:js|css|media)\/(?:[^/]+\/)*[^/]+\.[a-f0-9]{8,}(?:\.chunk)?\.[a-z0-9]+(?:\.map|\.LICENSE\.txt)?$/i;
const isWithin = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
};
const isSecretName = name => name === '.env' || name.startsWith('.env.') || name === '.git';

function defaultRuntimeDirectory(env = process.env, platform = process.platform, home = os.homedir()) {
  if (env.SHIELD_FRONTEND_RUNTIME_DIR) return path.resolve(env.SHIELD_FRONTEND_RUNTIME_DIR);
  return platform === 'darwin'
    ? path.join(home, 'Library', 'Application Support', 'SHIELD', 'frontend')
    : path.join(home, '.local', 'share', 'SHIELD', 'frontend');
}

async function statOrNull(file) {
  try { return await fs.lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function fileTree(root) {
  const files = [];
  async function visit(directory, prefix = '') {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (isSecretName(entry.name)) throw new Error('Build contains an environment or repository file; publication refused.');
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      // Do not follow symlinks, even when their current destination is inside the
      // build: all published assets must be independently durable regular files.
      const stat = await fs.lstat(absolute);
      if (stat.isSymbolicLink()) throw new Error(`Symbolic links are not allowed inside a frontend build: ${relative}`);
      if (stat.isDirectory()) await visit(absolute, relative);
      else if (stat.isFile()) files.push(relative);
      else throw new Error(`Non-regular frontend asset: ${relative}`);
    }
  }
  await visit(root);
  return files;
}

function localAsset(reference) {
  if (typeof reference !== 'string' || !reference.trim()) throw new Error('Manifest contains an invalid asset reference.');
  const raw = reference.split(/[?#]/, 1)[0];
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch { throw new Error('Manifest contains an invalid encoded asset path.'); }
  if (/^[a-z][a-z0-9+.-]*:/i.test(decoded) || decoded.startsWith('//') || /[\\\0]/.test(decoded)) throw new Error('Frontend asset references must be local paths.');
  const relative = decoded.replace(/^\//, '').replace(/^\.\//, '');
  if (!relative || relative.split('/').some(part => !part || part === '.' || part === '..' || isSecretName(part))) throw new Error('Unsafe frontend asset path.');
  return relative;
}

async function validateBuild(directory) {
  const root = await fs.realpath(directory);
  if (!(await fs.stat(root)).isDirectory()) throw new Error('Frontend build must be a directory.');
  const files = await fileTree(root);
  const names = new Set(files);
  if (!names.has('index.html') || !names.has('asset-manifest.json')) throw new Error('Build requires index.html and asset-manifest.json.');
  const index = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  if (!/<html(?:\s|>)/i.test(index) || !/<\/html\s*>/i.test(index)) throw new Error('Build index.html is incomplete.');
  let manifest;
  try { manifest = JSON.parse(await fs.readFile(path.join(root, 'asset-manifest.json'), 'utf8')); } catch { throw new Error('Build asset-manifest.json is invalid JSON.'); }
  if (!manifest || Array.isArray(manifest) || !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files) || !Object.keys(manifest.files).length) throw new Error('Build manifest must contain a nonempty files object.');
  if (manifest.entrypoints !== undefined && !Array.isArray(manifest.entrypoints)) throw new Error('Build manifest entrypoints must be an array.');
  const references = [...Object.values(manifest.files), ...(manifest.entrypoints || [])];
  for (const reference of references) {
    const asset = localAsset(reference);
    if (!names.has(asset)) throw new Error(`Manifest references a missing regular file: ${asset}`);
  }
  // Catch a mismatched HTML/manifest pair too. External fonts and data URLs in
  // HTML are not copied; all local script/link/image assets must exist locally.
  for (const match of index.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    if (/^(?:https?:|data:|\/\/|#)/i.test(match[1])) continue;
    const asset = localAsset(match[1]);
    if (!names.has(asset)) throw new Error(`index.html references a missing regular file: ${asset}`);
  }
  return { root, files, manifest };
}

async function ensureDirectory(directory) {
  const stat = await statOrNull(directory);
  if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) throw new Error('Runtime directories must be real directories, not symbolic links or files.');
  await fs.mkdir(directory, { recursive: true });
}

async function resolvedDestination(directory) {
  const tail = [];
  let current = directory;
  while (true) {
    try { return path.join(await fs.realpath(current), ...tail); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      tail.unshift(path.basename(current));
      current = parent;
    }
  }
}

async function previousRelease(current, releasesRoot) {
  const stat = await statOrNull(current);
  if (!stat) return null;
  if (!stat.isSymbolicLink()) throw new Error('Runtime current must be a symlink; the existing path has been left unchanged.');
  const previous = await fs.realpath(current);
  if (!isWithin(releasesRoot, previous) || !(await fs.stat(previous)).isDirectory()) throw new Error('Runtime current points outside the release directory; publication refused.');
  return previous;
}

async function copyRegular(source, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const stat = await fs.lstat(source);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Frontend asset changed during publication.');
  await fs.copyFile(source, destination, constants.COPYFILE_EXCL);
}

async function sameContent(first, second) {
  const digest = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
  return (await digest(first)) === (await digest(second));
}

async function publishBuild({ buildDirectory = path.resolve(__dirname, '../frontend/build'), targetDirectory = defaultRuntimeDirectory() } = {}) {
  const build = await validateBuild(path.resolve(buildDirectory));
  const requestedTarget = path.resolve(targetDirectory);
  const destination = await resolvedDestination(requestedTarget);
  if (destination === build.root || isWithin(build.root, destination)) throw new Error('Runtime target must not be inside the source build.');
  await ensureDirectory(requestedTarget);
  const target = await fs.realpath(requestedTarget);
  if (target === build.root || isWithin(build.root, target)) throw new Error('Runtime target must not be inside the source build.');
  const lock = path.join(target, '.publish-lock');
  try { await fs.mkdir(lock); } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another frontend publication is active, or a previous process left .publish-lock. Check that process before removing the lock.');
    throw error;
  }
  const identifier = `${new Date().toISOString().replace(/[^0-9TZ]/g, '')}-${crypto.randomUUID()}`;
  const releases = path.join(target, 'releases');
  const staging = path.join(releases, `.staging-${identifier}`);
  const release = path.join(releases, identifier);
  const current = path.join(target, 'current');
  const nextLink = path.join(target, `.current-${identifier}`);
  let staged = false;
  try {
    await ensureDirectory(releases);
    const releaseRoot = await fs.realpath(releases);
    const previous = await previousRelease(current, releaseRoot);
    await fs.mkdir(staging);
    staged = true;
    for (const file of build.files) await copyRegular(path.join(build.root, file), path.join(staging, file));
    let preservedAssets = 0;
    if (previous) {
      for (const file of await fileTree(previous)) {
        if (!HASHED_STATIC.test(file)) continue;
        const oldAsset = path.join(previous, file);
        const destination = path.join(staging, file);
        if (await statOrNull(destination)) {
          // CRA names source maps after the executable hash; original source can
          // change without changing optimized JS/CSS. Keep the new build's map.
          if (!/\.map$/i.test(file) && !(await sameContent(oldAsset, destination))) throw new Error(`Content-hashed asset name was reused for different content: ${file}`);
        } else {
          await copyRegular(oldAsset, destination);
          preservedAssets += 1;
        }
      }
    }
    await validateBuild(staging);
    await fs.rename(staging, release);
    staged = false;
    await fs.symlink(path.relative(target, release), nextLink, 'dir');
    // POSIX rename atomically replaces the symlink itself. Never unlink current:
    // readers therefore observe either the old release or the complete new one.
    await fs.rename(nextLink, current);
    return { releaseDirectory: release, currentDirectory: current, assetCount: build.files.length, preservedAssets };
  } finally {
    if (staged) await fs.rm(staging, { recursive: true, force: true });
    await fs.unlink(nextLink).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await fs.rmdir(lock);
  }
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') return { help: true };
    if (value === '--target') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error('--target requires a directory.');
      options.targetDirectory = path.resolve(argv[++index]);
    } else if (value.startsWith('--target=')) {
      if (!value.slice(9)) throw new Error('--target requires a directory.');
      options.targetDirectory = path.resolve(value.slice(9));
    } else if (value.startsWith('-')) throw new Error(`Unknown option: ${value}`);
    else if (options.buildDirectory) throw new Error('Provide only one build directory.');
    else options.buildDirectory = path.resolve(value);
  }
  return options;
}

if (require.main === module) {
  (async () => {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: node scripts/deploy-local-frontend.cjs [build-directory] [--target runtime-directory]\nTarget also accepts SHIELD_FRONTEND_RUNTIME_DIR. Existing releases are retained.');
      return;
    }
    const result = await publishBuild(options);
    console.log(`Frontend published: ${result.releaseDirectory}\nCurrent: ${result.currentDirectory}\nPreserved hashed assets: ${result.preservedAssets}`);
  })().catch(error => { console.error(`Frontend publication failed: ${error.message}`); process.exitCode = 1; });
}

module.exports = { defaultRuntimeDirectory, localAsset, parseArguments, publishBuild, validateBuild };
