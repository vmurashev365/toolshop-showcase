const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} = require('node:fs');
const { rm } = require('node:fs/promises');
const { dirname, join, resolve } = require('node:path');
const { test } = require('node:test');

const source = resolve(__dirname, '..', '..');
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this fixture with npm run test:report-opening.');

test('normal npm scripts open only HTML from the completed invocation', { timeout: 120_000 }, async (t) => {
  const fixtureRoot = join(source, 'tmp');
  mkdirSync(fixtureRoot, { recursive: true });
  const fixture = mkdtempSync(join(fixtureRoot, 'Toolshop report fixture '));
  const modulesLink = join(fixture, 'node_modules');
  const openLog = join(fixture, 'opened.jsonl');
  const runLog = join(fixture, 'ran.txt');
  const baseEnv = { ...process.env };
  for (const name of Object.keys(baseEnv)) {
    if (/^(CI|GITHUB_ACTIONS|REPORT_DIR|PW_REPORT_DIR|PLAYWRIGHT_HTML_.*|TARGET_ENV|TAGS|PARALLEL)$/i.test(name))
      delete baseEnv[name];
  }
  Object.assign(baseEnv, {
    TARGET_ENV: 'local',
    TOOLSHOP_REPORT_OPENER: join(fixture, 'browser stub.js'),
    FIXTURE_OPEN_LOG: openLog,
    FIXTURE_RUN_LOG: runLog,
  });

  function put(path, contents) {
    const file = join(fixture, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }
  function copy(path) {
    put(path, readFileSync(join(source, path)));
  }
  function opens() {
    if (!existsSync(openLog)) return [];
    return readFileSync(openLog, 'utf8').trim().split('\n').map(JSON.parse);
  }
  function npmRun(script, args = [], extraEnv = {}) {
    const result = spawnSync(
      process.execPath,
      [npm, 'run', '--silent', script, ...(args.length ? ['--', ...args] : [])],
      {
        cwd: fixture,
        env: { ...baseEnv, ...extraEnv },
        encoding: 'utf8',
        timeout: 35_000,
        windowsHide: true,
      },
    );
    if (result.error) throw result.error;
    return { status: result.status, output: result.stdout + result.stderr };
  }
  async function html(url) {
    const result = await fetch(url, { signal: AbortSignal.timeout(5000) });
    assert.equal(result.status, 200, url);
    return result.text();
  }
  function completedRuns() {
    const dir = join(fixture, 'reports', 'runs');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .flatMap((id) => {
        const path = join(dir, id);
        const manifest = join(path, 'run.json');
        if (!existsSync(manifest)) return [];
        const { entry } = JSON.parse(readFileSync(manifest, 'utf8'));
        return [{ path, entry, completed: statSync(manifest, { bigint: true }).mtimeNs }];
      })
      .sort((a, b) => (a.completed < b.completed ? 1 : -1));
  }

  t.after(async () => {
    for (const pid of new Set(opens().map((entry) => entry.pid))) {
      try {
        process.kill(pid);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    assert.equal(dirname(resolve(fixture)), fixtureRoot);
    // Remove the junction itself before recursively deleting the fixture on Windows.
    if (existsSync(modulesLink)) unlinkSync(modulesLink);
    await rm(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  for (const path of [
    'scripts/run-tests.js',
    'scripts/report-open.js',
    'scripts/clean-report-dir.js',
    'cucumber.js',
    'tests/bdd/hooks/terminalFormatter.ts',
  ])
    copy(path);
  symlinkSync(join(source, 'node_modules'), modulesLink, 'junction');

  const pkg = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
  pkg.scripts['check:static'] = 'node -e "process.exit(0)"';
  pkg.scripts['check:local'] = 'node -e "process.exit(Number(process.env.FIXTURE_READINESS_EXIT || 0))"';
  pkg.scripts['prereport:open'] = 'node fixture-race.js';
  put('package.json', JSON.stringify(pkg));
  put(
    'browser stub.js',
    [
      'const { appendFileSync } = require("node:fs");',
      'appendFileSync(process.env.FIXTURE_OPEN_LOG, JSON.stringify({ url: process.argv[2], pid: Number(process.argv[3]) }) + "\\n");',
      'process.exitCode = process.env.FIXTURE_OPEN_FAIL ? 23 : 0;',
    ].join('\n'),
  );
  put(
    'fixture-race.js',
    [
      'if (process.env.FIXTURE_NEWER_HTML) {',
      '  const { mkdirSync, writeFileSync } = require("node:fs");',
      '  const dir = "reports/runs/00000000-0000-0000-0000-000000000001";',
      '  mkdirSync(dir, { recursive: true });',
      '  writeFileSync(dir + "/index.html", "<title>Later invocation</title>");',
      '  writeFileSync(dir + "/run.json", JSON.stringify({ entry: "index.html" }));',
      '}',
    ].join('\n'),
  );
  put(
    'tests/bdd/features/report.feature',
    '@smoke\nFeature: Report fixture\n  Scenario: Cucumber proof\n    Given a completed step\n',
  );
  put(
    'tests/bdd/step-definitions/report.ts',
    [
      "import { Given } from '@cucumber/cucumber';",
      "import { appendFileSync } from 'node:fs';",
      "Given('a completed step', function () {",
      "  appendFileSync(process.env.FIXTURE_RUN_LOG!, 'bdd\\n');",
      "  if (process.env.FIXTURE_BDD_FAIL) throw new Error('Controlled BDD failure');",
      '});',
    ].join('\n'),
  );
  put('tests/bdd/hooks/hooks.ts', 'export {};\n');
  put('tests/bdd/hooks/World.ts', 'export {};\n');

  put(
    'playwright.config.js',
    [
      "const { join } = require('node:path');",
      "const { defineConfig } = require('@playwright/test');",
      'const dir = process.env.PW_REPORT_DIR || "reports/playwright";',
      'module.exports = defineConfig({ testDir:"tests/pw", workers:1, outputDir:join(dir,"artifacts"),',
      '  reporter:[["list"], ["html",{outputFolder:join(dir,"html"), open:"never"}], ["json",{outputFile:join(dir,"results.json")}]],',
      '  projects: [',
      '    {name:"api-margin-security",testMatch:"**/api.spec.js"},',
      '    {name:"known-discrepancies-api",testMatch:"**/api.spec.js"},',
      '    {name:"mobile-webkit",testMatch:"**/mobile.spec.js"},',
      '    {name:"mobile-chromium",testMatch:"**/mobile.spec.js"},',
      '    {name:"ux-guards",testMatch:"**/ux.spec.js"},',
      '  ],',
      '});',
    ].join('\n'),
  );
  for (const name of ['api', 'mobile', 'ux']) {
    put(
      'tests/pw/' + name + '.spec.js',
      [
        'const { test, expect } = require("@playwright/test");',
        'const { appendFileSync, writeFileSync } = require("node:fs");',
        'test("' + name + ' fixture", async ({}, info) => {',
        '  appendFileSync(process.env.FIXTURE_RUN_LOG, info.project.name + "\\n");',
        '  const proof = info.outputPath("proof.txt");',
        '  writeFileSync(proof, "fixture attachment");',
        '  await info.attach("proof", { path: proof, contentType: "text/plain" });',
        '  expect(info.project.name).not.toBe(process.env.FIXTURE_PW_FAIL);',
        '});',
      ].join('\n'),
    );
  }

  put('reports/pw-mobile/html/index.html', '<title>Old report</title>');
  await t.test('empty history gives a clear message', () => {
    const first = npmRun('report:open');
    assert.equal(first.status, 0, first.output);
    assert.match(first.output, /No completed local run with an HTML report/);
    assert.equal(opens().length, 0);
  });

  await t.test('passing BDD opens once and respects its output override', async () => {
    const destination = join(fixture, 'custom BDD output');
    const result = npmRun('test:bdd', ['--tags', '@smoke'], { REPORT_DIR: destination });
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /1 scenario \(1 passed\)/);
    assert.equal(opens().length, 1);
    assert.match(opens()[0].url, /\/bdd\/cucumber-report\.html$/);
    assert.match(await html(opens()[0].url), /<title>Cucumber<\/title>/);
    const run = completedRuns()[0];
    assert.deepEqual(readFileSync(join(destination, 'cucumber-report.html')), readFileSync(join(run.path, run.entry)));
  });

  await t.test('manual reopen keeps the report and does not execute tests', async () => {
    const [run] = completedRuns();
    const before = readFileSync(runLog, 'utf8');
    const entry = join(run.path, run.entry);
    const modified = statSync(entry, { bigint: true }).mtimeNs;
    const result = npmRun('report:open');
    assert.equal(result.status, 0, result.output);
    assert.equal(opens().length, 2);
    assert.equal(await html(opens()[1].url), readFileSync(entry, 'utf8'));
    assert.equal(readFileSync(runLog, 'utf8'), before);
    assert.equal(statSync(entry, { bigint: true }).mtimeNs, modified);
  });

  await t.test('failing Playwright opens one current report with attachments over HTTP', async () => {
    const output = join(fixture, 'custom Playwright output');
    const result = npmRun('test:mobile', ['--trace=on'], {
      FIXTURE_PW_FAIL: 'mobile-webkit',
      PLAYWRIGHT_HTML_OUTPUT_DIR: output,
      PW_REPORT_DIR: 'custom Playwright results',
    });
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /1 failed/);
    const opened = opens().at(-1);
    assert.equal(opens().length, 3);
    assert.match(opened.url, /\/pw-mobile\/html\/index\.html$/);
    assert.match(await html(opened.url), /<title>Playwright Test Report<\/title>/);
    const [run] = completedRuns();
    assert.ok(existsSync(join(output, 'index.html')));
    assert.ok(existsSync(join(fixture, 'custom Playwright results', 'results.json')));
    const data = join(dirname(join(run.path, run.entry)), 'data');
    const attachment = readdirSync(data).find((file) => file.endsWith('.txt'));
    const trace = readdirSync(data).find((file) => file.endsWith('.zip'));
    assert.equal(await html(new URL('data/' + attachment, opened.url)), 'fixture attachment');
    assert.equal((await fetch(new URL('data/' + trace, opened.url), { headers: { Range: 'bytes=0-3' } })).status, 206);
    assert.match(await html(new URL('trace/index.html', opened.url)), /Playwright Trace Viewer/i);
  });

  await t.test('passing combined run opens one index for its five suites', async () => {
    const result = npmRun('test:pr-gate');
    assert.equal(result.status, 0, result.output);
    assert.equal(opens().length, 4);
    const opened = opens().at(-1);
    const index = await html(opened.url);
    const hrefs = [...index.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(hrefs, [
      'pw-api/html/index.html',
      'pw-discrepancies/html/index.html',
      'bdd/cucumber-report.html',
      'pw-mobile/html/index.html',
      'pw-ux/html/index.html',
    ]);
    for (const href of hrefs) assert.match(await html(new URL(href, opened.url)), /Cucumber|Playwright Test Report/);
  });

  await t.test('combined early failure lists only reports produced in this invocation', async () => {
    const result = npmRun('test:pr-gate', [], { FIXTURE_BDD_FAIL: '1' });
    assert.equal(result.status, 1, result.output);
    assert.equal(opens().length, 5);
    const opened = opens().at(-1);
    const index = await html(opened.url);
    assert.match(index, /API margin and security .* Passed .*pw-api\/html\/index\.html/);
    assert.match(index, /Known API discrepancies .* Passed .*pw-discrepancies\/html\/index\.html/);
    assert.match(index, /Cucumber business scenarios .* Failed .*bdd\/cucumber-report\.html/);
    assert.match(index, /Mobile WebKit and Chromium .* Did not run/);
    assert.match(index, /Accessibility, localisation and fault controls .* Did not run/);
    assert.doesNotMatch(index, /href="pw-mobile|href="pw-ux/);
    assert.equal((await fetch(new URL('pw-mobile/html/index.html', opened.url))).status, 404);
  });

  await t.test('CI, discovery, and no-HTML failures leave the last local report alone', () => {
    const [latest] = completedRuns();
    const cases = [
      ['test:bdd', [], { CI: '1' }, 0],
      ['test:api', [], { GITHUB_ACTIONS: 'true' }, 0],
      ['bdd:dry', [], {}, 0],
      ['pw:list', [], {}, 0],
      ['test:bdd', ['--dry-run'], {}, 0],
      ['test:api', ['--list'], {}, 0],
      ['test:pr-gate', [], { FIXTURE_READINESS_EXIT: '19' }, 19],
      ['test:bdd', ['--profile', 'no-such-profile'], {}, 1],
    ];
    for (const [script, args, env, code] of cases) {
      const result = npmRun(script, args, env);
      assert.equal(result.status, code, result.output);
      if (code) assert.match(result.output, /This run produced no HTML report/);
      assert.equal(opens().length, 5);
    }
    assert.equal(completedRuns()[0].path, latest.path);
    for (const path of [
      'reports/bdd/cucumber-report.html',
      'reports/pw-api/html/index.html',
      'reports/pw-api/results.json',
      'reports/bdd-dry-run/cucumber-report.html',
    ]) {
      assert.ok(existsSync(join(fixture, path)), path);
    }
  });

  await t.test('automatic open keeps its own ID and launcher failure keeps the test result', async () => {
    const result = npmRun('test:bdd', [], { FIXTURE_NEWER_HTML: '1', FIXTURE_OPEN_FAIL: '1' });
    assert.equal(result.status, 0, result.output);
    assert.equal(opens().length, 6);
    assert.match(result.output, /Could not open the report.*exited with code 23/);
    assert.match(result.output, /Open it at http:\/\/127\.0\.0\.1:/);
    assert.match(await html(opens().at(-1).url), /<title>Cucumber<\/title>/);
    assert.equal(completedRuns()[0].entry, 'index.html');
  });

  await t.test('a failing discrepancy watch stops the gate before BDD', async () => {
    const before = opens().length;
    const result = npmRun('test:pr-gate', [], { FIXTURE_PW_FAIL: 'known-discrepancies-api' });
    assert.equal(result.status, 1, result.output);
    assert.equal(opens().length, before + 1);
    const index = await html(opens().at(-1).url);
    assert.match(index, /Known API discrepancies .* Failed .*pw-discrepancies\/html\/index\.html/);
    assert.match(index, /Cucumber business scenarios .* Did not run/);
    assert.doesNotMatch(index, /href="(?:bdd|pw-mobile|pw-ux)\//);
  });
});
