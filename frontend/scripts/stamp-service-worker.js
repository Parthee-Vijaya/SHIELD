const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const buildDirectory = path.resolve(__dirname, '..', 'build');
const serviceWorkerPath = path.join(buildDirectory, 'sw.js');
const buildMarker = '__SHIELD_BUILD_ID__';

function listBuildFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? listBuildFiles(absolutePath) : [absolutePath];
  });
}

const releaseFiles = listBuildFiles(buildDirectory)
  .filter((filePath) => filePath !== serviceWorkerPath && !filePath.endsWith('.map'))
  .sort();
const releaseHash = crypto.createHash('sha256');

for (const filePath of releaseFiles) {
  releaseHash.update(path.relative(buildDirectory, filePath));
  releaseHash.update(fs.readFileSync(filePath));
}

const buildId = releaseHash.digest('hex').slice(0, 12);
const serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');
const stampedBuildPattern = /\$\{CACHE_PREFIX\}[a-f0-9]{12}/;
let stampedServiceWorker;

if (serviceWorker.includes(buildMarker)) {
  stampedServiceWorker = serviceWorker.replaceAll(buildMarker, buildId);
} else if (stampedBuildPattern.test(serviceWorker)) {
  stampedServiceWorker = serviceWorker.replace(
    stampedBuildPattern,
    () => `\${CACHE_PREFIX}${buildId}`
  );
} else {
  throw new Error(`Missing ${buildMarker} in the generated service worker`);
}

fs.writeFileSync(serviceWorkerPath, stampedServiceWorker);
console.log(`Stamped service worker for build ${buildId}`);
