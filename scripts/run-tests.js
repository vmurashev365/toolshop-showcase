const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { cpSync, existsSync, mkdirSync, renameSync, writeFileSync } = require('node:fs');
const { constants } = require('node:os');
const { dirname, join, resolve } = require('node:path');
const { isCI, isHtmlReport, runsDir } = require('./report-open');

const root = resolve(__dirname, '..');
const suites = {
  api: { folder: 'pw-api', args: ['--project=api-margin-security'] },
  bdd: { folder: 'bdd' },
  mobile: { folder: 'pw-mobile', args: ['--project=mobile-webkit', '--project=mobile-chromium'] },
  ux: { folder: 'pw-ux', args: ['--project=ux-guards'] },
  discrepancies: { folder: 'pw-discrepancies', args: ['--project=known-discrepancies-api'] },
  'with-bugs': { folder: 'pw-with-bugs', args: ['--project=api-margin-security'], target: 'with-bugs' },
};

function runNode(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  return result.status ?? (result.signal ? 128 + constants.signals[result.signal] : 1);
}

function runNpm(script, args = []) {
  return runNode([process.env.npm_execpath, 'run', '--silent', script, ...args]);
}

// Keep explicit output overrides available at their requested paths, while the opener uses
// only the isolated files. An overlapping run can replace a mirror without changing this report.
function mirror(source, destination) {
  if (!destination || !existsSync(source)) return;
  try {
    cpSync(source, resolve(root, destination), { recursive: true });
  } catch (error) {
    console.warn('Could not copy report to ' + destination + '. ' + error.message);
  }
}

function runSuite(name, args, runDir) {
  const suite = suites[name];
  const suiteDir = runDir && join(runDir, suite.folder);
  const env = { ...process.env };
  let relativeHtml;
  let status;
  if (name === 'bdd') {
    if (suiteDir) {
      env.REPORT_DIR = suiteDir;
    } else {
      const cleanup = runNode([join(__dirname, 'clean-report-dir.js'), 'reports/bdd']);
      if (cleanup) return { status: cleanup };
    }
    const cli = join(dirname(require.resolve('@cucumber/cucumber/package.json')), 'bin', 'cucumber.js');
    status = runNode([cli, ...args], env);
    if (suiteDir) mirror(suiteDir, process.env.REPORT_DIR);
    relativeHtml = suite.folder + '/cucumber-report.html';
  } else {
    if (suite.target) env.TARGET_ENV = suite.target;
    env.PW_REPORT_DIR = suiteDir || 'reports/' + suite.folder;
    env.PLAYWRIGHT_HTML_OPEN = 'never';
    if (suiteDir) env.PLAYWRIGHT_HTML_OUTPUT_DIR = join(suiteDir, 'html');
    status = runNode([require.resolve('@playwright/test/cli'), 'test', ...suite.args, ...args], env);
    if (suiteDir) {
      mirror(suiteDir, process.env.PW_REPORT_DIR);
      mirror(join(suiteDir, 'html'), process.env.PLAYWRIGHT_HTML_OUTPUT_DIR || process.env.PLAYWRIGHT_HTML_REPORT);
    }
    relativeHtml = suite.folder + '/html/index.html';
  }
  if (runDir) {
    try {
      if (isHtmlReport(join(runDir, relativeHtml))) return { status, html: relativeHtml };
    } catch (error) {
      console.warn('Could not check this suite’s HTML report. ' + error.message);
    }
  }
  return { status };
}

function writeIndex(runDir, reports) {
  const rows = reports.map(({ label, result }) => {
    if (!result) return '<li>' + label + ' \u2014 Did not run</li>';
    const outcome = result.status === 0 ? 'Passed' : 'Failed (exit ' + result.status + ')';
    const link = result.html ? '<a href="' + result.html + '">Open report</a>' : 'No HTML report';
    return '<li>' + label + ' \u2014 ' + outcome + ' \u00b7 ' + link + '</li>';
  });
  writeFileSync(join(runDir, 'index.html'), [
    '<!doctype html><html lang="en"><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Toolshop PR test report</title>',
    '<style>body{font:1rem/1.65 system-ui;margin:2rem auto;padding:0 1rem;max-width:44rem;color-scheme:light dark}</style>',
    '<h1>Toolshop PR test report</h1><ul>', ...rows, '</ul></html>',
  ].join('\n'));
}

function finishReport(id, runDir, reports, combined) {
  try {
    const first = reports.find(({ result }) => result?.html);
    if (!first) {
      console.log('This run produced no HTML report.');
      return;
    }
    if (combined) writeIndex(runDir, reports);
    const entry = combined ? 'index.html' : first.result.html;
    const pending = join(runDir, 'run.json.tmp');
    writeFileSync(pending, JSON.stringify({ entry }));
    renameSync(pending, join(runDir, 'run.json'));
    if (runNpm('report:open', ['--', '--run', id])) {
      console.warn('The report is available at ' + join(runDir, entry));
    }
  } catch (error) {
    console.warn('Could not open this run automatically. Reports directory ' + runDir + '. ' + error.message);
  }
}

function main(name, args) {
  const combined = name === 'pr-gate';
  const discovery = combined || name !== 'bdd'
    ? args.includes('--list')
    : args.includes('--dry-run') || args.includes('-d');
  const track = !isCI() && (combined || !discovery);
  const id = randomUUID();
  let runDir;
  if (track) {
    try {
      const directory = join(runsDir, id);
      mkdirSync(directory, { recursive: true });
      runDir = directory;
    } catch (error) {
      console.warn('Could not create a local run directory. ' + error.message);
    }
  }
  if (!combined) {
    const result = runSuite(name, args, runDir);
    if (runDir) finishReport(id, runDir, [{ result }], false);
    return result.status;
  }

  const reports = [
    { name: 'api', label: 'API margin and security' },
    { name: 'bdd', label: 'Cucumber business scenarios' },
    { name: 'mobile', label: 'Mobile WebKit and Chromium' },
    { name: 'ux', label: 'Accessibility, localisation and fault controls' },
  ];
  let status = runNpm('check:static');
  if (!status) status = runNpm('check:local');
  for (const report of reports) {
    if (status) break;
    // The original npm chain forwarded arguments to its last suite.
    report.result = runSuite(report.name, report.name === 'ux' ? args : [], runDir);
    if (report.name === 'ux' && discovery && report.result.html) delete report.result.html;
    status = report.result.status;
  }
  if (runDir) finishReport(id, runDir, reports, true);
  return status;
}

const [, , suite, ...args] = process.argv;
if (suite === 'pr-gate' || Object.hasOwn(suites, suite)) {
  process.exitCode = main(suite, args);
} else {
  console.error('Unknown test suite ' + suite);
  process.exitCode = 1;
}
