#!/usr/bin/env node

const fs   = require('fs');
const path = require('path');

// ─── Config ─────────────────────────────────────────
const FOLDER = path.join(__dirname, 'assets');
const BASE_FILE = 'en-US.json';
const UNTRANSLATED_FILE = 'untranslated.json';

// ─── Helpers ────────────────────────────────────────

function flattenPaths(obj, prefix = '') {
  const result = {};
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      Object.assign(result, flattenPaths(obj[key], fullKey));
    } else {
      result[fullKey] = obj[key];
    }
  }
  return result;
}

function setDeep(obj, dotPath, value) {
  const keys = dotPath.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!cur[keys[i]] || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

function deleteDeep(obj, dotPath) {
  const keys = dotPath.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!cur[keys[i]]) return;
    cur = cur[keys[i]];
  }
  delete cur[keys[keys.length - 1]];
}

function repairJson(raw) {
  let s = raw;
  s = s.replace(/\r\n/g, '\n');
  s = s.replace(/(\"[^\"]*\")\s*\n(\s*\")/g, (_, a, b) => `${a},\n${b}`);
  s = s.replace(/,(\s*[}\]])/g, '$1');
  return s;
}

// ─── Main ───────────────────────────────────────────

function main() {
  const untranslatedReport = {};  // 👈 store all untranslated keys

  const basePath = path.join(FOLDER, BASE_FILE);
  const baseData  = JSON.parse(repairJson(fs.readFileSync(basePath, 'utf8')));
  const basePaths = flattenPaths(baseData);
  const baseKeys  = new Set(Object.keys(basePaths));

  console.log('\n════════════════════════════════════════');
  console.log('  i18n Audit Report');
  console.log('════════════════════════════════════════');

  const langFiles = fs.readdirSync(FOLDER).filter(f =>
    f.endsWith('.json') &&
    f !== BASE_FILE &&
    f !== UNTRANSLATED_FILE
  );

  for (const file of langFiles) {
    const filePath = path.join(FOLDER, file);
    let langData;

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      langData = JSON.parse(repairJson(raw));
    } catch (e) {
      console.log(`❌ Failed to parse ${file}`);
      continue;
    }

    const langPaths = flattenPaths(langData);
    const langKeys  = new Set(Object.keys(langPaths));

    const missingKeys = [...baseKeys].filter(k => !langKeys.has(k));
    const extraKeys   = [...langKeys].filter(k => !baseKeys.has(k));

    const untranslatedKeys = [...baseKeys].filter(k =>
      langKeys.has(k) && langPaths[k] === basePaths[k]
    );

    console.log(`\n📄 ${file}`);
    console.log(`Untranslated: ${untranslatedKeys.length}`);

    // 👇 Store untranslated keys
    if (untranslatedKeys.length > 0) {
      untranslatedReport[file] = {};
      untranslatedKeys.forEach(k => {
        untranslatedReport[file][k] = basePaths[k];
      });
    }

    // 🔧 Fix original file
    missingKeys.forEach(k => setDeep(langData, k, basePaths[k]));
    extraKeys.forEach(k => deleteDeep(langData, k));

    fs.writeFileSync(filePath, JSON.stringify(langData, null, 2), 'utf8');

    console.log(`✔ Updated: ${file}`);
  }

  // 🆕 Write untranslated report
  const untranslatedPath = path.join(FOLDER, UNTRANSLATED_FILE);
  fs.writeFileSync(untranslatedPath, JSON.stringify(untranslatedReport, null, 2), 'utf8');

  console.log('\n📄 Untranslated report generated: untranslated.json');
  console.log('✅ Done!\n');
}

main();