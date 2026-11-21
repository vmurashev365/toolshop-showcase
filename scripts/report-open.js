const { fork, spawn, spawnSync } = require('node:child_process');
const { readdirSync, readFileSync, statSync } = require('node:fs');
const { isAbsolute, join, relative, resolve, sep } = require('node:path');

const runsDir = resolve(__dirname, '..', 'reports', 'runs');
const runIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

function isCI() {
  return Boolean(process.env.CI || process.env.GITHUB_ACTIONS);
}

function isHtmlReport(path) {
  const info = statSync(path, { throwIfNoEntry: false });
  return info?.isFile() && info.size > 0;
}

function readRun(id) {
  if (!runIdPattern.test(id)) return undefined;
  const dir = join(runsDir, id);
  const manifest = join(dir, 'run.json');
  const completed = statSync(manifest, { bigint: true, throwIfNoEntry: false })?.mtimeNs;
  if (!completed) return undefined;
  try {
    const { entry } = JSON.parse(readFileSync(manifest, 'utf8'));
    if (typeof entry !== 'string') return undefined;
    const report = resolve(dir, entry);
    const inside = relative(dir, report);
    if (!inside || inside === '..' || inside.startsWith('..' + sep) || isAbsolute(inside)) return undefined;
    if (isHtmlReport(report)) return { dir, entry, report, completed };
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }
  return undefined;
}

function latestRun() {
  let entries;
  try {
    entries = readdirSync(runsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
  let latest;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const run = readRun(entry.name);
    if (run && (!latest || run.completed > latest.completed)) latest = run;
  }
  return latest;
}

function hasDesktop() {
  if (process.env.TOOLSHOP_REPORT_OPENER) return true;
  const options = { stdio: 'ignore', timeout: 3000, windowsHide: true };
  if (process.platform === 'win32') {
    return (
      spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          'if ([Environment]::UserInteractive -and (Get-Process -Id $PID).SessionId -gt 0) { exit 0 }; exit 1',
        ],
        options,
      ).status === 0
    );
  }
  if (process.platform === 'darwin') {
    return spawnSync('launchctl', ['print', 'gui/' + process.getuid()], options).status === 0;
  }
  return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

async function serve(dir) {
  // Use the same file server as Playwright show-report for trace assets, MIME types and ranges.
  const { serveFolder } = require('playwright-core/lib/coreBundle').utils;
  const server = serveFolder(dir);
  await server.start({ host: '127.0.0.1', port: 0 });
  const idle = setTimeout(
    () => {
      server.stop();
    },
    30 * 60 * 1000,
  ).unref();
  server.server().on('request', () => idle.refresh());
  process.send(server.urlPrefix('human-readable'));
}

function startServer(dir) {
  const child = fork(__filename, ['--serve', dir], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    windowsHide: true,
  });
  return new Promise((ok, fail) => {
    const timer = setTimeout(() => {
      child.kill();
      fail(new Error('Timed out starting the local report server.'));
    }, 5000);
    child.once('error', (error) => {
      clearTimeout(timer);
      fail(error);
    });
    child.once('exit', () => {
      clearTimeout(timer);
      fail(new Error('The local report server exited before it was ready.'));
    });
    child.once('message', (url) => {
      clearTimeout(timer);
      child.disconnect();
      child.unref();
      ok({ url, pid: child.pid });
    });
  });
}

function launch(url, serverPid) {
  const override = process.env.TOOLSHOP_REPORT_OPENER;
  let executable;
  let args;
  if (override) {
    executable = process.execPath;
    args = [resolve(override), url, String(serverPid)];
  } else if (process.platform === 'win32') {
    executable = 'powershell.exe';
    args = [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Start-Process -FilePath $env:TOOLSHOP_REPORT_URL -ErrorAction Stop',
    ];
  } else {
    executable = process.platform === 'darwin' ? 'open' : 'xdg-open';
    args = [url];
  }
  const child = spawn(executable, args, {
    env: { ...process.env, TOOLSHOP_REPORT_URL: url },
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  return new Promise((ok, fail) => {
    // Some Linux openers stay alive for the lifetime of the browser.
    const timer = setTimeout(ok, 1500);
    child.once('error', (error) => {
      clearTimeout(timer);
      fail(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) ok();
      else fail(new Error(executable + ' exited with code ' + code));
    });
  });
}

async function openReport(id) {
  const run = id === undefined ? latestRun() : readRun(id);
  if (!run) {
    console.log(id === undefined ? 'No completed local run with an HTML report yet.' : 'No HTML report for this run.');
    return;
  }
  if (isCI() || !hasDesktop()) {
    console.log('HTML report (desktop opening unavailable) ' + run.report);
    return;
  }
  let location = run.report;
  try {
    const base = await startServer(run.dir);
    location = base.url + '/' + run.entry.split('/').map(encodeURIComponent).join('/');
    console.log('HTML report ' + location);
    await launch(location, base.pid);
  } catch (error) {
    console.warn('Could not open the report. ' + error.message + '\nOpen it at ' + location);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  const [, , flag, value] = process.argv;
  const action = flag === '--serve' ? serve(value) : openReport(flag === '--run' ? (value ?? '') : undefined);
  action.catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { isCI, isHtmlReport, runsDir };
