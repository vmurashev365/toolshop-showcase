# Toolshop · Risk-based QA and hybrid test automation

[![Toolshop QA Risk Gates](https://github.com/vmurashev365/toolshop-showcase/actions/workflows/qa.yml/badge.svg?branch=main)](https://github.com/vmurashev365/toolshop-showcase/actions/workflows/qa.yml)
[![Latest test report](https://img.shields.io/badge/report-latest%20run-0b5cad)](https://vmurashev365.github.io/toolshop-showcase/)

Download the Playwright and Cucumber artifacts from the November 20 QA run with a signed-in GitHub account. [QA run 44769291883](https://github.com/vmurashev365/toolshop-showcase/actions/runs/44769291883#artifacts)

Risk-based QA suite for [Practice Software Testing (Toolshop)](https://practicesoftwaretesting.com/), an open-source demo e-commerce store built for practising software testing. Testing starts from commercial and technical risks — pricing integrity, discount math, stock checks, API access control, mobile checkout, accessibility, and payment failure recovery — and puts each check at the layer that fits best inside one TypeScript codebase.

## What this project shows

- **Right test layer per risk.** Pricing tampering, rounding, stock rules, and BOLA/RBAC run directly against the HTTP API. Mobile WebKit/Chromium, WCAG 2.1 AA, `DE` localization, and network fault controls run in `@playwright/test`. Business discount and checkout continuity rules run as Gherkin specs in Cucumber.
- **Documented findings with evidence.** Five areas where Toolshop has pricing, stock, access-control, mobile UX, or accessibility issues are backed by QA notes, screenshots or captured API responses, and automated checks in this repo.
- **Proof that assertions catch defects.** `page.route()` injects a tampered `$0.01` cart price (`TC-RES-001`) and a `500` payment gateway outage (`TC-RES-002`) to verify both the financial error diagnostic (`expected $14.15, actual $0.01`) and buyer recovery (no invoice created, cart kept, retry enabled).
- **Self-tightening discrepancy watches and a11y ratchet.** Known API findings (`FIND-01`, `FIND-02`, `FIND-03`) use `expectKnownDiscrepancy()` so they stay green while reproducing and turn red when a fix is observed or a watch is inconclusive. The WCAG 2.1 AA check blocks any new `critical`/`serious` violation and fails if a baselined `FIND-08` issue disappears.
- **CI with a one-click public report.** GitHub Actions runs the API and browser gates against an isolated Sprint 5 Docker stack. The [latest test report](https://vmurashev365.github.io/toolshop-showcase/) is published from the isolated GitHub Actions regression run when Pages is enabled.

## Findings

Toolshop (`testsmith-io/practice-software-testing`) is an open-source training app, so some behaviors may be unhardened or intentional for practice. The linked evidence describes the historical observations. The automated FIND-01 watch reads the OpenAPI document and checks the PUT operation’s security declaration.

| ID | Area | Observed behavior | Automated check | Evidence |
| --- | --- | --- | --- | --- |
| **FIND-01** | Product update RBAC (`PUT /products/{id}`) | The captured OpenAPI document omits `security` on `PUT` and `PATCH`. The QA note records the separate Sprint 5 source review. | `TC-SEC-003` (non-destructive OpenAPI watch) | [QA note](test_documentation/findings/FIND-01-product-update-rbac.md) · [OpenAPI JSON](test_documentation/evidence/find-01-openapi-products.json) |
| **FIND-02** | Out-of-stock API bypass | UI shows `Out of stock` and disables `Add to cart` for `in_stock: false` SKUs, but `POST /carts/{id}` accepts them (`200 OK`) because `CartService` never checks `in_stock`. | `TC-API-004` (inverted watch) | [QA note](test_documentation/findings/FIND-02-out-of-stock-bypass.md) · [Screenshot](test_documentation/evidence/find-02-out-of-stock-ui.png) · [API JSON](test_documentation/evidence/find-02-cart-api-response.json) |
| **FIND-03** | Discount stacking & `is_location_offer` bug | `CartService` uses PHP `isset($product->is_location_offer)` (true even for `false`), applying up to `25%` geo-discount to non-offer SKUs and compounding it with the `15%` retail+rental discount (`36.25%` off). | `TC-API-005` (inverted watch) | [QA note](test_documentation/findings/FIND-03-discount-stacking.md) · [Screenshot](test_documentation/evidence/find-03-discount-stacking-ui.png) · [API JSON](test_documentation/evidence/find-03-discount-stacking.json) |
| **FIND-04..06** | Mobile checkout friction (`390×844`) | Cart badge is hidden inside the collapsed hamburger menu; `Add to cart` sits below the fold (`y = 1120px`); the floating feed widget overlaps the first product title; `data-test="filters"` is duplicated in the DOM. | `TC-MOB-001`, `HeaderNav`, `CatalogFilters` | [QA note](test_documentation/findings/FIND-04-06-mobile-ux.md) · [Collapsed](test_documentation/evidence/find-04-mobile-header-collapsed.png) · [Expanded](test_documentation/evidence/find-04-mobile-header-expanded.png) · [JSON](test_documentation/evidence/find-04-06-mobile-observations.json) |
| **FIND-07..08** | Accessibility & `DE` locale | Axe WCAG 2.1 AA reports 2 `serious` violations (`label-content-name-mismatch`, `list`) on funnel pages; `DE` locale translates chrome (`Einloggen`, `Sortieren`) while keeping USD `$` prices. | `TC-A11Y-001` (ratchet), `TC-I18N-001` | [QA note](test_documentation/findings/FIND-07-08-a11y-i18n.md) · [DE screenshot](test_documentation/evidence/find-07-de-locale-usd.png) · [Axe JSON](test_documentation/evidence/find-08-axe-wcag-violations.json) |

Test strategy and release gate criteria: [test_documentation/01-test-strategy.md](test_documentation/01-test-strategy.md)

## Coverage

| Suite | Checks | Runner / Target | What is checked |
| --- | ---: | --- | --- |
| [`tests/pw/api/`](tests/pw/api/) (`api-margin-security`) | 6 | Playwright · Docker SUT | Invalid quantities (`0`, negative, fractional), client price/discount tampering ignored, 20% geo-discount half-up rounding in cents, cross-user BOLA/IDOR, unauthenticated invoice `401`, `/payment/check` validation |
| [`tests/pw/api/`](tests/pw/api/) (`known-discrepancies-api`) | 3 | Playwright · live API | Inverted watches for `FIND-01`, `FIND-02`, and `FIND-03` |
| [`tests/bdd/features/`](tests/bdd/features/) | 3 | Cucumber + Playwright · Docker SUT | 15% retail+rental combination discount (API & UI), discount revocation on removal and page reload, guest cart reconciliation and sign-in continuity |
| [`tests/pw/mobile/`](tests/pw/mobile/) | 2 | Playwright · iPhone 14 WebKit & Pixel 7 Chromium · Docker SUT | Browse, product price match, add to cart, hamburger cart badge, cart total reconciliation, viewport image check, zero horizontal overflow |
| [`tests/pw/ux/`](tests/pw/ux/) | 4 | Playwright · Chromium · Docker SUT | WCAG 2.1 AA ratchet (`@axe-core/playwright`), `DE` localization & layout, `page.route()` tampered `$0.01` price control, `page.route()` payment `500` recovery |
| **Total** | **18** | | Includes the 3 scheduled live watches |

## Architecture & tech stack

Playwright 1.65 · TypeScript 7 · Cucumber 13 (Gherkin) · `@axe-core/playwright` · Node.js 24 · GitHub Actions · GitHub Pages

```text
src/
  api/          Typed APIRequestContext clients (Auth, Products, Cart, Invoices) + DB re-seed guard
  domain/       Integer-cent money math (half-up rounding) & web-first financial assertions
  components/   HeaderNav (mobile hamburger aware), CatalogFilters (FIND-06 scoped)
  pages/        BasePage (overflow & lazy/AVIF-aware image checks), Catalog, ProductDetails, Auth, CheckoutWizard
  utils/        page.route() network fault injection (tampered cart price, payment 500)

tests/
  pw/           @playwright/test suites (API, known discrepancies, mobile WebKit/Chromium, UX guards)
  bdd/          Cucumber 13 features, step definitions, World, hooks, and compact terminal formatter

test_documentation/
  01-test-strategy.md   Scope, layer split, data isolation, and release gates
  findings/             QA notes for FIND-01 through FIND-08
  evidence/             Screenshots and captured API/DOM/axe JSON observations
```

## Run it locally

Requires Node.js 24.18.0 (see [`.nvmrc`](.nvmrc)), Docker Compose 2.24.4 or later, Git, and Bash (Git Bash on Windows).

```sh
npm ci
npx playwright install chromium webkit
bash scripts/start-toolshop.sh ./tmp/toolshop-sut
npm run test:pr-gate
```

The startup script uses the Sprint 5 commit in [`scripts/toolshop-revision.txt`](scripts/toolshop-revision.txt) and prints the verified SHA. GitHub Actions uses the same script. It builds the QA stack without optional PHP coverage extensions, seeds a local database, and waits for the catalog API and UI to respond before the suites run. Choose a fresh checkout directory when starting a new stack.

The default `TARGET_ENV` is `local` (UI `http://localhost:4200`, API `http://localhost:8091`). Set `UI_BASE_URL` and `API_BASE_URL` to override the endpoints. Local overrides must use loopback hosts. Set `TARGET_ENV=live` explicitly for the shared sandbox, or `TARGET_ENV=with-bugs` for the hosted training variant. Unknown target names fail immediately.

`npm run check:static` runs ESLint, native TypeScript 7 typechecking, Node unit tests, Cucumber dry-run, and Playwright discovery. ESLint's typed rules use the TypeScript 6 compiler API. Run `npm run test:api`, `npm run test:bdd`, `npm run test:mobile`, or `npm run test:ux` individually against a ready local stack. For Cucumber, optional variables include `BROWSER`, `HEADED`, `TIMEOUT` (milliseconds), `PARALLEL`, and `TAGS`.

If a BDD step reports `ECONNREFUSED` on port 8091, run `npm run check:local` to check the storefront and seeded catalog API. For an existing stack, resume its containers from the QA checkout, then run the tests once the readiness check passes. Use the checkout path you passed to the startup script.

```sh
docker compose --project-name toolshop-qa -f ./tmp/toolshop-sut/docker-compose.yml -f ./scripts/toolshop-compose.yml start mariadb laravel-api web angular-ui
npm run check:local
```

To pause the stack between sessions and keep the seeded database, use the same Compose command with `stop` in place of `start`.

On a desktop, local test commands open their HTML report when the run finishes, including after a test failure. `test:pr-gate` opens one index with the completed suite reports and shows any suites that were skipped. Run `npm run report:open` to reopen the most recent completed run with HTML. Local runs are kept under `reports/runs/`. CI keeps the existing artifact paths, and Cucumber discovery writes to `reports/bdd-dry-run/`.

### CI reports

The regression workflow runs on push, pull request, and manual dispatch. `Toolshop Live Observation` runs at 06:00 UTC each Monday and on manual dispatch. Its artifacts stay with that workflow.

If the Pages link returns 404, a repository maintainer can select **GitHub Actions** in **Settings → Pages → Build and deployment → Source**. The Pages workflow checks that the public landing page identifies the deployed QA run and that a report from that run opens without credentials.

> **Mobile WebKit on Windows:** Playwright's Windows WebKit build cannot decode AVIF product photos. `BasePage.assertVisibleImagesLoaded()` probes AVIF support at runtime and annotates skipped AVIF images instead of raising a false defect; Chromium verifies every image.
