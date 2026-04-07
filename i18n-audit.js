#!/usr/bin/env node

/**
 * i18n Audit & Fix Script
 * -----------------------
 * Usage: node i18n-audit.js
 *
 * - en-US.json is the base/reference file
 * - All other JSON files in the same folder are compared against it
 * - Reports: missing keys, extra keys, untranslated strings
 * - Outputs fixed JSON files as <lang>.fixed.json
 */

const fs   = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────

const FOLDER      = __dirname;          // folder where all JSON files live
const BASE_FILE   = 'assets/en-US.json';       // reference file
const OUTPUT_SUFFIX = '.fixed.json';    // suffix for corrected output files

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Flatten nested object to dot-notation paths → { 'auth.welcome': 'Welcome...' } */
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

/** Set a deeply nested value using a dot-notation path */
function setDeep(obj, dotPath, value) {
  const keys = dotPath.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!cur[keys[i]] || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

/** Delete a deeply nested key using a dot-notation path */
function deleteDeep(obj, dotPath) {
  const keys = dotPath.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!cur[keys[i]]) return;
    cur = cur[keys[i]];
  }
  delete cur[keys[keys.length - 1]];
}

/** ANSI color helpers */
const c = {
  reset  : s => `\x1b[0m${s}\x1b[0m`,
  bold   : s => `\x1b[1m${s}\x1b[0m`,
  red    : s => `\x1b[31m${s}\x1b[0m`,
  yellow : s => `\x1b[33m${s}\x1b[0m`,
  blue   : s => `\x1b[34m${s}\x1b[0m`,
  green  : s => `\x1b[32m${s}\x1b[0m`,
  cyan   : s => `\x1b[36m${s}\x1b[0m`,
  gray   : s => `\x1b[90m${s}\x1b[0m`,
};

// ─── JSON Auto-Repair ────────────────────────────────────────────────────────

/**
 * Fixes common JSON issues found in i18n files:
 *  1. Missing comma between key-value pairs (e.g. "a": "x"\n  "b": ...)
 *  2. Trailing comma before closing brace/bracket
 */
function repairJson(raw) {
  let s = raw;
  // Normalize line endings
  s = s.replace(/\r\n/g, '\n');
  // 1. Add missing comma: "value"\n[whitespace]"key"  →  "value",\n[whitespace]"key"
  s = s.replace(/(\"[^\"]*\")\s*\n(\s*\")/g, (_, a, b) => `${a},\n${b}`);
  // 2. Remove trailing comma before } or ]
  s = s.replace(/,(\s*[}\]])/g, '$1');
  return s;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  // 1. Load base file
  const basePath = path.join(FOLDER, BASE_FILE);
  if (!fs.existsSync(basePath)) {
    console.error(c.red(`✖ Base file not found: ${basePath}`));
    process.exit(1);
  }
  const baseData  = JSON.parse(repairJson(fs.readFileSync(basePath, 'utf8')));
  const basePaths = flattenPaths(baseData);
  const baseKeys  = new Set(Object.keys(basePaths));

  console.log(c.bold('\n════════════════════════════════════════'));
  console.log(c.bold('  i18n Audit Report'));
  console.log(c.bold('════════════════════════════════════════'));
  console.log(c.gray(`  Base file : ${BASE_FILE}`));
  console.log(c.gray(`  Base keys : ${baseKeys.size}\n`));

  // 2. Find all other JSON files
  const langFiles = fs.readdirSync(FOLDER).filter(f =>
    f.endsWith('.json') &&
    f !== BASE_FILE &&
    !f.endsWith(OUTPUT_SUFFIX)
  );

  if (langFiles.length === 0) {
    console.log(c.yellow('No language files found to compare.\n'));
    return;
  }

  const summary = [];

  for (const file of langFiles) {
    const filePath = path.join(FOLDER, file);
    let langData;

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const repaired = repairJson(raw);
      langData = JSON.parse(repaired);
    } catch (e) {
      console.log(c.red(`\n✖ Failed to parse ${file}: ${e.message}`));
      continue;
    }

    const langPaths = flattenPaths(langData);
    const langKeys  = new Set(Object.keys(langPaths));

    // ── Task 1: Structure diff ───────────────────────────────────────────────

    const missingKeys     = [...baseKeys].filter(k => !langKeys.has(k));
    const extraKeys       = [...langKeys].filter(k => !baseKeys.has(k));

    // ── Task 2: Untranslated strings (value == English value) ────────────────

    const untranslatedKeys = [...baseKeys].filter(k =>
      langKeys.has(k) && langPaths[k] === basePaths[k]
    );

    // ── Report ───────────────────────────────────────────────────────────────

    console.log(c.bold(`┌─ ${file} ${'─'.repeat(Math.max(0, 42 - file.length))}`));
    console.log(`│  ${c.yellow(`Missing  : ${missingKeys.length}`)}   ${c.red(`Extra    : ${extraKeys.length}`)}   ${c.blue(`Untranslated: ${untranslatedKeys.length}`)}`);

    if (missingKeys.length) {
      console.log(`│`);
      console.log(`│  ${c.yellow('⚠ Missing keys')} ${c.gray('(will be added with EN fallback)')}`);
      for (const k of missingKeys) {
        console.log(`│    ${c.cyan(k)}`);
        console.log(`│      ${c.gray('→ "' + basePaths[k] + '"')}`);
      }
    }

    if (extraKeys.length) {
      console.log(`│`);
      console.log(`│  ${c.red('✖ Extra keys')} ${c.gray('(not in en-US — will be removed)')}`);
      for (const k of extraKeys) {
        console.log(`│    ${c.cyan(k)}`);
        console.log(`│      ${c.gray('value: "' + langPaths[k] + '"')}`);
      }
    }

    if (untranslatedKeys.length) {
      console.log(`│`);
      console.log(`│  ${c.blue('○ Untranslated strings')} ${c.gray('(still have English value)')}`);
      for (const k of untranslatedKeys) {
        console.log(`│    ${c.cyan(k)}`);
        console.log(`│      ${c.gray('"' + basePaths[k] + '"')}`);
      }
    }

    // ── Build & write fixed file ──────────────────────────────────────────────

    const fixed = JSON.parse(JSON.stringify(langData));

    // Add missing keys (with EN fallback value)
    for (const k of missingKeys) {
      setDeep(fixed, k, basePaths[k]);
    }
    // Remove extra keys
    for (const k of extraKeys) {
      deleteDeep(fixed, k);
    }

    const outputName = file.replace('.json', OUTPUT_SUFFIX);
    const outputPath = path.join(FOLDER, outputName);
    fs.writeFileSync(outputPath, JSON.stringify(fixed, null, 2), 'utf8');

    const fixedPaths = flattenPaths(fixed);
    console.log(`│`);
    console.log(`│  ${c.green('✔ Fixed file written:')} ${outputName}`);
    console.log(`│  ${c.gray(`Total keys: ${Object.keys(fixedPaths).length}`)}`);
    console.log(`└${'─'.repeat(44)}\n`);

    summary.push({ file, missing: missingKeys.length, extra: extraKeys.length, untranslated: untranslatedKeys.length });
  }

  // ── Summary table ─────────────────────────────────────────────────────────

  console.log(c.bold('════════ Summary ════════════════════════'));
  console.log(c.bold(` ${'File'.padEnd(20)} ${'Missing'.padStart(8)} ${'Extra'.padStart(8)} ${'Untrans'.padStart(10)}`));
  console.log(c.gray(' ' + '─'.repeat(46)));
  for (const row of summary) {
    const m = row.missing     > 0 ? c.yellow(String(row.missing).padStart(8))     : String(row.missing).padStart(8);
    const e = row.extra       > 0 ? c.red(String(row.extra).padStart(8))         : String(row.extra).padStart(8);
    const u = row.untranslated> 0 ? c.blue(String(row.untranslated).padStart(10)) : String(row.untranslated).padStart(10);
    console.log(` ${row.file.padEnd(20)} ${m} ${e} ${u}`);
  }
  console.log();
  console.log(c.green('✔ Done. Fixed files saved alongside originals.\n'));
}

main();