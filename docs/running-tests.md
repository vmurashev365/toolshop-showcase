# Running the tests

## Prerequisites

- **Node.js 24.18.0** (see [`.nvmrc`](../.nvmrc); `engines.node >= 22.13.0`)
- **Docker Compose 2.24.4+** (uses `!override` in [`scripts/toolshop-compose.yml`](../scripts/toolshop-compose.yml))
- **Git** and **Bash** (Git Bash on Windows)

```sh
npm ci
npx playwright install chromium webkit
```

## Isolated local Toolshop stack (default)

Start a pinned Sprint 5 stack in a fresh directory:

```sh
bash scripts/start-toolshop.sh ./tmp/toolshop-sut
```

The startup script checks out the commit pinned in [`scripts/toolshop-revision.txt`](../scripts/toolshop-revision.txt), strips optional PHP coverage extensions via [`scripts/toolshop-no-coverage.patch`](../scripts/toolshop-no-coverage.patch), binds UI (`127.0.0.1:4200`) and API (`127.0.0.1:8091`) to loopback only, seeds the database, and waits until [`scripts/check-local-toolshop.ts`](../scripts/check-local-toolshop.ts) verifies both endpoints. GitHub Actions runs the same script.

### Pausing, resuming, and cleaning up

To pause between sessions while keeping the seeded database:

```sh
docker compose --project-name toolshop-qa -f ./tmp/toolshop-sut/docker-compose.yml -f ./scripts/toolshop-compose.yml stop mariadb laravel-api web angular-ui
```

To resume an existing stack and verify readiness:

```sh
docker compose --project-name toolshop-qa -f ./tmp/toolshop-sut/docker-compose.yml -f ./scripts/toolshop-compose.yml start mariadb laravel-api web angular-ui
npm run check:local
```

When switching to a newer pinned revision in `scripts/toolshop-revision.txt`, clear the named dependency volumes first (`down -v`) so stale `vendor/` or `node_modules/` are not reused.

## Commands

| Command | What it runs |
| --- | --- |
| `npm run check:static` | Prettier (`format:check`), ESLint, native TypeScript 7 (`typecheck`), 11 unit tests (`test:unit`), Cucumber dry-run (`bdd:dry`), Playwright discovery (`pw:list`), and report-opening integration test (`test:report-opening`) |
| `npm run format:write` | Formats JS, TS, JSON, and YAML files with Prettier |
| `npm run check:local` | Verifies local UI (`4200`) and seeded catalog API (`8091`) |
| `npm run test:pr-gate` | Runs `check:static`, `check:local`, then API, Known Discrepancies, BDD, Mobile, and UX suites in order, stopping at the first failure |
| `npm run test:api` | 6 API margin & security checks (`api-margin-security`) |
| `npm run test:discrepancies:api` | 3 inverted watches for `FIND-01`, `FIND-02`, and `FIND-03` (`known-discrepancies-api`) |
| `npm run test:bdd` | 3 Cucumber Gherkin scenarios |
| `npm run test:mobile` | Mobile Money Path on iPhone 14 WebKit and Pixel 7 Chromium |
| `npm run test:ux` | WCAG 2.1 AA ratchet, `DE` localization, and `page.route()` fault injection controls |
| `npm run test:with-bugs` | Runs API margin & security checks against `with-bugs.practicesoftwaretesting.com` |
| `npm run report:open` | Reopens the most recent completed local HTML report over a local `127.0.0.1` HTTP server |

## Environment variables & `.env`

The default `TARGET_ENV` is `local` (UI `http://localhost:4200`, API `http://localhost:8091`).

- Set `TARGET_ENV=live` explicitly to run against the shared public sandbox, or `TARGET_ENV=with-bugs` for the hosted training variant. Unknown or empty target names fail immediately.
- `UI_BASE_URL` and `API_BASE_URL` override the selected preset; when `TARGET_ENV=local`, overrides must use loopback hosts (`localhost`, `127.0.0.1`, or `[::1]`).
- For Cucumber (`test:bdd`), optional variables include `BROWSER` (`chromium` | `firefox` | `webkit`), `HEADED=true`, `TIMEOUT` (ms), `PARALLEL`, and `TAGS`.

To keep overrides in a local file, copy [`.env.example`](../.env.example) to `.env` and load it in Bash / Git Bash:

```sh
set -a
. ./.env
set +a
```

## Local HTML reports

On a desktop, local test commands save isolated runs under `reports/runs/<uuid>/` and open the HTML report automatically when the run finishes (including on test failures). `test:pr-gate` generates a combined index linking each completed suite and marking any skipped suites. `npm run report:open` serves the latest completed run over a loopback HTTP server (supporting HTTP `Range` requests for Playwright Trace Viewer) without re-running tests.

In CI, reports write to deterministic paths under `reports/` (`pw-api`, `pw-discrepancies`, `bdd`, `pw-mobile`, `pw-ux`), and Cucumber dry-runs write to `reports/bdd-dry-run/`.

Each suite writes an HTML report for people and a JSON file (`results.json`, `cucumber-report.json`) that the GitHub Pages summary reads. In the Cucumber report, key steps log the products, quantities and expected amounts they check, so a passing scenario still shows what was verified. A failed scenario adds, under its `After` hook, a full-page screenshot, a link to the Playwright trace, and `api-exchanges.json` with the scenario's last 10 API calls. Passwords, tokens and JWT-shaped values are redacted because the report is published.

## CI workflows & public report

- **Toolshop QA Risk Gates** (`.github/workflows/qa.yml`): runs `check:static`, boots the isolated Docker SUT, runs API, Known Discrepancies watch, BDD, Mobile WebKit/Chromium, and UX suites, and uploads all 5 report artifacts.
- **Publish test report** (`.github/workflows/pages.yml`): triggers after `Toolshop QA Risk Gates` completes on `main`, assembles `.github/report-site/index.html` with all suite reports, deploys to GitHub Pages, and verifies signed-out HTTP access. Requires **Settings → Pages → Source: GitHub Actions**.
- **Toolshop Live Observation** (`.github/workflows/live-watch.yml`): runs `test:discrepancies:api` weekly (Monday 06:00 UTC) and on manual dispatch against the hosted public sandbox (`TARGET_ENV=live`).

## Notes

- **TypeScript 6 & 7 side by side:** `typescript-eslint` uses the TypeScript 6 compiler API for type-aware rules via `projectService`, while the `typescript-native` npm alias installs TypeScript 7 so `npm run typecheck` uses the native compiler.
- **Mobile WebKit on Windows:** Playwright's Windows WebKit build cannot decode AVIF product photos. `BasePage.assertVisibleImagesLoaded()` probes AVIF support at runtime and annotates skipped AVIF images rather than raising a false defect; Chromium verifies every image.
