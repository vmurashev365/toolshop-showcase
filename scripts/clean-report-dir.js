#!/usr/bin/env node
/**
 * Removes a report directory before a run, so screenshots/traces from an earlier run are never
 * mixed with (and mistaken for) the results of the current one.
 *
 * Usage: node scripts/clean-report-dir.js <default-dir>
 * REPORT_DIR, when set, takes precedence (it is the directory cucumber.js will write to).
 */
const { rmSync } = require('node:fs');
const { isAbsolute, relative, resolve } = require('node:path');

const dir = process.env.REPORT_DIR || process.argv[2];
if (!dir) {
  console.error('clean-report-dir: no directory given');
  process.exit(1);
}

const root = resolve(__dirname, '..');
const target = resolve(root, dir);
const rel = relative(root, target);
if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
  // Only clean directories strictly inside the project; sibling paths or absolute dirs elsewhere are left alone.
  process.exit(0);
}
rmSync(target, { recursive: true, force: true });
