import https from 'node:https';
import fs from 'node:fs';
import { readConfig, writeConfig } from './config.js';

let currentVersion = '1.1.0';
try {
  const pkgUrl = new URL('../package.json', import.meta.url);
  const pkg = JSON.parse(fs.readFileSync(pkgUrl, 'utf8'));
  currentVersion = pkg.version || '1.1.0';
} catch {}

export const CURRENT_VERSION = currentVersion;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'imgpull-updater' }, timeout: 2500 }, (res) => {
      if (res.statusCode !== 200) {
        res.destroy();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('JSON parse error'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

export function parseVersion(v) {
  const m = String(v).replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
}

export function isNewer(latestArr, currentArr) {
  for (let i = 0; i < 3; i += 1) {
    if (latestArr[i] > currentArr[i]) return true;
    if (latestArr[i] < currentArr[i]) return false;
  }
  return false;
}

export function getUpdateCommand() {
  const execName = (process.execPath || '').split(/[\\/]/).pop().toLowerCase();
  const isStandalone = execName === 'imgpull.exe' || execName === 'imgpull';

  if (isStandalone) {
    if (process.platform === 'win32') {
      return 'powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/caya8205-2/imgpull/main/scripts/install.ps1 | iex"';
    }
    return 'curl -fsSL https://raw.githubusercontent.com/caya8205-2/imgpull/main/scripts/install.sh | bash';
  }
  return 'npm i -g imgpull@latest';
}

/**
 * Checks for updates using GitHub Releases with 24-hour cache throttling.
 * Returns update info object if newer version exists, null otherwise.
 */
export async function checkForUpdates(force = false) {
  try {
    const config = readConfig();
    const now = Date.now();
    const lastCheck = config.lastUpdateCheck || 0;
    const current = parseVersion(CURRENT_VERSION);

    // If checked recently, reuse cached latest version without network lag
    if (!force && now - lastCheck < ONE_DAY_MS && config.cachedLatestVersion) {
      const cached = parseVersion(config.cachedLatestVersion);
      if (isNewer(cached, current)) {
        return {
          current: CURRENT_VERSION,
          latest: config.cachedLatestVersion,
          command: getUpdateCommand(),
        };
      }
      return null;
    }

    const release = await fetchJson('https://api.github.com/repos/caya8205-2/imgpull/releases/latest');
    const latestTag = String(release.tag_name || '').replace(/^v/, '');
    const latest = parseVersion(latestTag);

    writeConfig({
      lastUpdateCheck: now,
      cachedLatestVersion: latestTag,
    });

    if (isNewer(latest, current)) {
      return {
        current: CURRENT_VERSION,
        latest: latestTag,
        command: getUpdateCommand(),
      };
    }
    return null;
  } catch {
    return null;
  }
}
