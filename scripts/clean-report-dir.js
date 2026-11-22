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

const root = resolve(__dirname, '..');
const runsDir = resolve(root, 'reports', 'runs');

/** True when `child` is `parent` itself or lies inside it. */
function within(parent, child) {
  const rel = relative(parent, child);
  return !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Only directories strictly inside the project are removed; sibling paths or absolute dirs
 * elsewhere are left alone. Neither is a directory that holds, or sits inside, the local run
 * history (reports/runs), because the current run is copied from there.
 */
function cleanReportDir(dir) {
  const target = resolve(root, dir);
  if (target === root || !within(root, target)) return;
  if (within(target, runsDir) || within(runsDir, target)) return;
  rmSync(target, { recursive: true, force: true });
}

if (require.main === module) {
  const dir = process.env.REPORT_DIR || process.argv[2];
  if (!dir) {
    console.error('clean-report-dir: no directory given');
    process.exit(1);
  }
  cleanReportDir(dir);
}

module.exports = { cleanReportDir };
