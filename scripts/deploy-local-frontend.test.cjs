'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: pause } = require('node:timers/promises');
const { defaultRuntimeDirectory, localAsset, parseArguments, publishBuild } = require('./deploy-local-frontend.cjs');

async function sandbox(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'shield-frontend-publish-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, target: path.join(root, 'runtime') };
}

async function build(root, hash = '1234abcd', label = 'first') {
  const directory = path.join(root, `build-${label}`);
  const script = `static/js/main.${hash}.js`;
  const chunk = `static/js/42.${hash}.chunk.js`;
  const css = `static/css/main.${hash}.css`;
  for (const file of [script, chunk, css]) {
    await fs.mkdir(path.dirname(path.join(directory, file)), { recursive: true });
    await fs.writeFile(path.join(directory, file), `${label}:${file}`);
  }
  const index = `<html><head><link href="/${css}" rel="stylesheet"></head><body><div id="root"></div><script src="/${script}"></script></body></html>`;
  await fs.writeFile(path.join(directory, 'index.html'), index);
  await fs.writeFile(path.join(directory, 'asset-manifest.json'), JSON.stringify({ files: { index: '/index.html', script: `/${script}`, chunk: `/${chunk}`, css: `/${css}` }, entrypoints: [css, script] }));
  await fs.writeFile(path.join(directory, 'sw.js'), `service worker:${label}`);
  await fs.writeFile(path.join(directory, 'mutable.js'), `mutable:${label}`);
  return { directory, script, chunk, css, index };
}

test('publishes a complete SPA through current and preserves old hashed chunks for already-open tabs', async t => {
  const { root, target } = await sandbox(t);
  const first = await build(root);
  const initial = await publishBuild({ buildDirectory: first.directory, targetDirectory: target });
  await fs.writeFile(path.join(target, '.env'), 'DO-NOT-TOUCH');
  const second = await build(root, '8765dcba', 'second');
  await fs.unlink(path.join(second.directory, 'mutable.js'));
  const updated = await publishBuild({ buildDirectory: second.directory, targetDirectory: target });
  assert.notEqual(updated.releaseDirectory, initial.releaseDirectory);
  assert.equal(await fs.readFile(path.join(target, 'current/index.html'), 'utf8'), second.index);
  assert.equal(await fs.readFile(path.join(target, 'current', first.chunk), 'utf8'), `first:${first.chunk}`);
  assert.equal(await fs.readFile(path.join(target, 'current', second.chunk), 'utf8'), `second:${second.chunk}`);
  assert.equal(updated.preservedAssets, 3);
  assert.equal(await fs.readFile(path.join(target, 'current/sw.js'), 'utf8'), 'service worker:second');
  assert.equal(await fs.readFile(path.join(initial.releaseDirectory, 'index.html'), 'utf8'), first.index);
  await assert.rejects(fs.access(path.join(target, 'current/mutable.js')), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(target, '.env'), 'utf8'), 'DO-NOT-TOUCH');
  assert.equal((await fs.readdir(path.join(target, 'releases'))).length, 2);
  assert.equal((await fs.lstat(path.join(target, 'current'))).isSymbolicLink(), true);
  assert.equal(path.isAbsolute(await fs.readlink(path.join(target, 'current'))), false);
});

test('invalid manifest, missing manifest asset or mismatched HTML leaves current unchanged', async t => {
  const { root, target } = await sandbox(t);
  const first = await build(root);
  const initial = await publishBuild({ buildDirectory: first.directory, targetDirectory: target });
  const link = await fs.readlink(initial.currentDirectory);
  const missing = await build(root, 'aaaaaaaa', 'missing');
  await fs.unlink(path.join(missing.directory, missing.chunk));
  await assert.rejects(publishBuild({ buildDirectory: missing.directory, targetDirectory: target }), /missing regular file/);
  const invalid = await build(root, 'bbbbbbbb', 'invalid');
  await fs.writeFile(path.join(invalid.directory, 'asset-manifest.json'), '{broken');
  await assert.rejects(publishBuild({ buildDirectory: invalid.directory, targetDirectory: target }), /invalid JSON/);
  const stale = await build(root, 'cccccccc', 'stale');
  await fs.writeFile(path.join(stale.directory, 'index.html'), '<html><script src="/not-here.js"></script></html>');
  await assert.rejects(publishBuild({ buildDirectory: stale.directory, targetDirectory: target }), /index.html references a missing/);
  assert.equal(await fs.readlink(initial.currentDirectory), link);
  assert.equal(await fs.readFile(path.join(target, 'current/index.html'), 'utf8'), first.index);
  assert.equal((await fs.readdir(path.join(target, 'releases'))).length, 1);
});

test('rejects source symlinks, secret files, traversal references and an external current target', async t => {
  const { root, target } = await sandbox(t);
  const good = await build(root);
  await publishBuild({ buildDirectory: good.directory, targetDirectory: target });
  const outside = path.join(root, 'outside.js');
  await fs.writeFile(outside, 'outside');
  const linked = await build(root, 'aaaaaaaa', 'linked');
  await fs.symlink(outside, path.join(linked.directory, 'external.js'));
  await assert.rejects(publishBuild({ buildDirectory: linked.directory, targetDirectory: target }), /Symbolic links/);
  const secret = await build(root, 'bbbbbbbb', 'secret');
  await fs.writeFile(path.join(secret.directory, '.env.local'), 'DO-NOT-READ-OR-COPY');
  await assert.rejects(publishBuild({ buildDirectory: secret.directory, targetDirectory: target }), /environment or repository file/);
  for (const reference of ['../outside.js', '/%2e%2e/outside.js', '//example.invalid/app.js', 'https://example.invalid/app.js', 'static\\outside.js', '/.env.local']) assert.throws(() => localAsset(reference));
  const externalTarget = path.join(root, 'external-runtime');
  await fs.mkdir(externalTarget);
  await fs.symlink(good.directory, path.join(externalTarget, 'current'));
  await assert.rejects(publishBuild({ buildDirectory: good.directory, targetDirectory: externalTarget }), /outside the release directory/);
  assert.equal(await fs.realpath(path.join(externalTarget, 'current')), await fs.realpath(good.directory));
});

test('a malicious symlink in a previous release cannot be carried into a new release', async t => {
  const { root, target } = await sandbox(t);
  const first = await build(root);
  const initial = await publishBuild({ buildDirectory: first.directory, targetDirectory: target });
  const original = await fs.readlink(initial.currentDirectory);
  const outside = path.join(root, 'outside.js');
  await fs.writeFile(outside, 'external');
  await fs.symlink(outside, path.join(initial.releaseDirectory, 'static/js/evil.aaaaaaaa.js'));
  const next = await build(root, 'bbbbbbbb', 'next');
  await assert.rejects(publishBuild({ buildDirectory: next.directory, targetDirectory: target }), /Symbolic links/);
  assert.equal(await fs.readlink(initial.currentDirectory), original);
  assert.deepEqual((await fs.readdir(target)).sort(), ['current', 'releases']);
  assert.equal((await fs.readdir(path.join(target, 'releases'))).length, 1);
});

test('refuses a reused content hash with changed bytes without replacing current', async t => {
  const { root, target } = await sandbox(t);
  const first = await build(root);
  const initial = await publishBuild({ buildDirectory: first.directory, targetDirectory: target });
  const original = await fs.readlink(initial.currentDirectory);
  const changed = await build(root, '1234abcd', 'different-bytes');
  await assert.rejects(publishBuild({ buildDirectory: changed.directory, targetDirectory: target }), /reused for different content/);
  assert.equal(await fs.readlink(initial.currentDirectory), original);
  assert.equal(await fs.readFile(path.join(target, 'current', first.script), 'utf8'), `first:${first.script}`);
});

test('prefers new source maps for unchanged executable hashes and preserves absent old maps', async t => {
  const { root, target } = await sandbox(t);
  const first = await build(root);
  const replacedMap = `${first.script}.map`;
  const retainedMap = `${first.chunk}.map`;
  await fs.writeFile(path.join(first.directory, replacedMap), 'original source map');
  await fs.writeFile(path.join(first.directory, retainedMap), 'old chunk source map');
  const firstManifestPath = path.join(first.directory, 'asset-manifest.json');
  const firstManifest = JSON.parse(await fs.readFile(firstManifestPath, 'utf8'));
  firstManifest.files.scriptMap = `/${replacedMap}`;
  firstManifest.files.chunkMap = `/${retainedMap}`;
  await fs.writeFile(firstManifestPath, JSON.stringify(firstManifest));
  const initial = await publishBuild({ buildDirectory: first.directory, targetDirectory: target });

  const second = await build(root, '1234abcd', 'second');
  for (const file of [first.script, first.chunk, first.css]) {
    await fs.copyFile(path.join(first.directory, file), path.join(second.directory, file));
  }
  await fs.writeFile(path.join(second.directory, replacedMap), 'updated source map');
  const secondManifestPath = path.join(second.directory, 'asset-manifest.json');
  const secondManifest = JSON.parse(await fs.readFile(secondManifestPath, 'utf8'));
  secondManifest.files.scriptMap = `/${replacedMap}`;
  await fs.writeFile(secondManifestPath, JSON.stringify(secondManifest));
  const updated = await publishBuild({ buildDirectory: second.directory, targetDirectory: target });

  assert.notEqual(updated.releaseDirectory, initial.releaseDirectory);
  assert.equal(await fs.readFile(path.join(target, 'current', replacedMap), 'utf8'), 'updated source map');
  assert.equal(await fs.readFile(path.join(target, 'current', retainedMap), 'utf8'), 'old chunk source map');
  assert.equal(await fs.readFile(path.join(initial.releaseDirectory, replacedMap), 'utf8'), 'original source map');
  assert.equal(updated.preservedAssets, 1);
});

test('continuous readers never observe a missing current/index or a missing old chunk during the switch', async t => {
  const { root, target } = await sandbox(t);
  const first = await build(root);
  await publishBuild({ buildDirectory: first.directory, targetDirectory: target });
  const next = await build(root, 'aaaaaaaa', 'next');
  for (let i = 0; i < 160; i += 1) await fs.writeFile(path.join(next.directory, `extra-${i}.txt`), 'copy workload');
  let stop = false;
  let reads = 0;
  const seen = new Set();
  const reader = (async () => {
    while (!stop) {
      const html = await fs.readFile(path.join(target, 'current/index.html'), 'utf8');
      assert.ok(html === first.index || html === next.index);
      seen.add(html);
      const script = html.match(/<script src="\/([^"]+)"/)[1];
      await fs.readFile(path.join(target, 'current', script), 'utf8');
      await fs.readFile(path.join(target, 'current', first.chunk), 'utf8');
      reads += 1;
      await pause(1);
    }
  })();
  try {
    await pause(5);
    await publishBuild({ buildDirectory: next.directory, targetDirectory: target });
    await pause(8);
  } finally { stop = true; await reader; }
  assert.ok(reads > 2);
  assert.equal(seen.size, 2);
});

test('target selection is explicit, and source/target overlap cannot recurse', async t => {
  assert.equal(defaultRuntimeDirectory({}, 'darwin', '/Users/test'), '/Users/test/Library/Application Support/SHIELD/frontend');
  assert.equal(defaultRuntimeDirectory({ SHIELD_FRONTEND_RUNTIME_DIR: '/tmp/custom' }), '/tmp/custom');
  assert.equal(parseArguments(['some-build', '--target', '/tmp/elsewhere']).targetDirectory, '/tmp/elsewhere');
  assert.equal(parseArguments(['--target=/tmp/elsewhere']).targetDirectory, '/tmp/elsewhere');
  assert.throws(() => parseArguments(['--target']), /requires/);
  const { root } = await sandbox(t);
  const source = await build(root);
  await assert.rejects(publishBuild({ buildDirectory: source.directory, targetDirectory: path.join(source.directory, 'runtime') }), /inside the source build/);
  await assert.rejects(fs.access(path.join(source.directory, 'runtime')), { code: 'ENOENT' });
});
