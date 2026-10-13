import fs from 'node:fs';
import path from 'node:path';

const CONFIG_FILE = path.join(process.env.USERPROFILE || process.env.HOME || '.', '.imgpullrc');

export function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function writeConfig(updates) {
  const current = readConfig();
  const next = { ...current, ...updates };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2) + '\n');
  return next;
}

export function getDefaultOutput() {
  return readConfig().defaultOutput || null;
}

export function saveDefaultOutput(dir) {
  const abs = path.resolve(dir);
  fs.mkdirSync(abs, { recursive: true });
  writeConfig({ defaultOutput: abs });
  return abs;
}

export function getDefaultCookies() {
  const p = readConfig().defaultCookies;
  if (p && fs.existsSync(p)) return p;
  return null;
}

export function saveDefaultCookies(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Cookie file not found: ${abs}`);
  }
  writeConfig({ defaultCookies: abs });
  return abs;
}
