# Toolshop · Risk-based QA and hybrid test automation

[![Toolshop QA Risk Gates](https://github.com/vmurashev365/toolshop-showcase/actions/workflows/qa.yml/badge.svg?branch=main)](https://github.com/vmurashev365/toolshop-showcase/actions/workflows/qa.yml)
[![Latest test report](https://img.shields.io/badge/report-latest%20run-0b5cad)](https://vmurashev365.github.io/toolshop-showcase/)

Risk-based QA suite for [Practice Software Testing (Toolshop)](https://practicesoftwaretesting.com/), an open-source demo e-commerce store built for practising software testing. Testing starts from commercial and technical risks — pricing integrity, discount math, stock checks, API access control, mobile checkout, accessibility, and payment failure recovery — and puts each check at the layer that fits best inside one TypeScript codebase.

This repository is a public subset of a larger private suite, which I can walk through on request.

## What this project shows

- **Right test layer per risk.** Pricing tampering, rounding, stock rules, and BOLA/RBAC run directly against the HTTP API. Mobile WebKit/Chromium, WCAG 2.1 AA, `DE` localization, and network fault controls run in `@playwright/test`. Business discount and checkout continuity rules run as Gherkin specs in Cucumber.
- **Documented findings with evidence.** Five areas where Toolshop has pricing, stock, access-control, mobile UX, or accessibility issues are backed by QA notes, screenshots or captured API responses, and automated checks in this repo.
- **Proof that assertions catch defects.** `page.route()` injects a tampered `$0.01` cart price (`TC-RES-001`) and a `500` payment gateway outage (`TC-RES-002`) to verify both the financial error diagnostic (`expected $14.15, actual $0.01`) and buyer recovery (no invoice created, cart kept, retry enabled).
- **Self-tightening discrepancy watches and ratchets.** Known API findings (`FIND-01`, `FIND-02`, `FIND-03`) and the Linux WebKit checkout overflow (`FIND-09`) use `expectKnownDiscrepancy()` so they stay green while reproducing and turn red when upstream fixes them (or a watch is inconclusive). The WCAG 2.1 AA check blocks any new `critical`/`serious` violation and fails if a baselined `FIND-08` issue disappears.
- **CI with a one-click public report.** GitHub Actions runs static checks (Prettier, ESLint, TypeScript 7, unit & report-opening tests) and executes all API and browser suites against a pinned Sprint 5 Docker stack. The [latest test report](https://vmurashev365.github.io/toolshop-showcase/) opens directly in the browser on GitHub Pages.

## Findings

Toolshop (`testsmith-io/practice-software-testing`) is an open-source training app, so some behaviors may be unhardened or intentional for practice. Before logging each item below, we checked upstream GitHub issues and Sprint 5 source code, and ran strictly non-destructive checks against the shared public sandbox (no `PUT /products` calls were sent to `api.practicesoftwaretesting.com`).

| ID & severity | Area | Observed behavior | Automated check | Evidence |
| --- | --- | --- | --- | --- |
| **FIND-01**<br>Critical | Product update RBAC (`PUT /products/{id}`) | OpenAPI `/docs` omits `security` on `PUT` and `PATCH` (unlike `DELETE`, which requires `apiAuth` + `role:admin`); separate Sprint 5 source review confirmed `ProductController::update` has no auth middleware. | `TC-SEC-003` (non-destructive OpenAPI watch) | [QA note](test_documentation/findings/FIND-01-product-update-rbac.md) · [OpenAPI JSON](test_documentation/evidence/find-01-openapi-products.json) |
| **FIND-02**<br>High | Out-of-stock API bypass | UI shows `Out of stock` and disables `Add to cart` for `in_stock: false` SKUs, but `POST /carts/{id}` accepts them (`200 OK`) because `CartService` never checks `in_stock`. | `TC-API-004` (inverted watch + unit-tested oracle) | [QA note](test_documentation/findings/FIND-02-out-of-stock-bypass.md) · [Screenshot](test_documentation/evidence/find-02-out-of-stock-ui.png) · [API JSON](test_documentation/evidence/find-02-cart-api-response.json) |
| **FIND-03**<br>High | Discount stacking & `is_location_offer` bug | `CartService` uses PHP `isset($product->is_location_offer)` (true even for `false`), applying up to `25%` geo-discount to non-offer SKUs and compounding it with the `15%` retail+rental discount (`36.25%` off). | `TC-API-005` (inverted watch) | [QA note](test_documentation/findings/FIND-03-discount-stacking.md) · [Screenshot](test_documentation/evidence/find-03-discount-stacking-ui.png) · [API JSON](test_documentation/evidence/find-03-discount-stacking.json) |
| **FIND-04..06, FIND-09**<br>Medium–Low | Mobile checkout friction (`390×844`) | Cart badge is hidden inside the collapsed hamburger menu; `Add to cart` sits below the fold (`y = 1120px`); Linux WebKit `/checkout` overflows to `422px` (`FIND-09`); `data-test="filters"` is duplicated in the DOM. | `TC-MOB-001` (with WebKit ratchet), `HeaderNav`, `CatalogFilters` | [QA note](test_documentation/findings/FIND-04-06-mobile-ux.md) · [WebKit overflow](test_documentation/evidence/mobile-cart-overflow-webkit-ci.png) · [Collapsed](test_documentation/evidence/find-04-mobile-header-collapsed.png) · [JSON](test_documentation/evidence/find-04-06-mobile-observations.json) |
| **FIND-07..08**<br>Medium–Low | Accessibility & `DE` locale | Axe WCAG 2.1 AA reports 2 `serious` violations (`label-content-name-mismatch`, `list`) on funnel pages; `DE` locale translates chrome (`Einloggen`, `Sortieren`) while keeping USD `$` prices. | `TC-A11Y-001` (ratchet), `TC-I18N-001` | [QA note](test_documentation/findings/FIND-07-08-a11y-i18n.md) · [DE screenshot](test_documentation/evidence/find-07-de-locale-usd.png) · [Axe JSON](test_documentation/evidence/find-08-axe-wcag-violations.json) |

Each QA note includes severity, business impact, and reproduction steps. Release gates, the severity scale, and a risk-to-test traceability table are in the [test strategy](test_documentation/01-test-strategy.md).

## Coverage

| Suite | Checks | Runner / Target | What is checked |
| --- | ---: | --- | --- |
| [`tests/pw/api/`](tests/pw/api/) (`api-margin-security`) | 6 | Playwright · Docker SUT | Invalid quantities (`0`, negative, fractional), client price/discount tampering ignored, 20% geo-discount half-up rounding in cents, cross-user BOLA/IDOR, unauthenticated invoice `401`, `/payment/check` validation |
| [`tests/pw/api/`](tests/pw/api/) (`known-discrepancies-api`) | 3 | Playwright · Docker SUT & weekly live API | Inverted watches for `FIND-01`, `FIND-02`, and `FIND-03` |
| [`tests/bdd/features/`](tests/bdd/features/) | 3 | Cucumber + Playwright · Docker SUT | 15% retail+rental combination discount (API & UI), discount revocation on removal and page reload, guest cart reconciliation and sign-in continuity |
| [`tests/pw/mobile/`](tests/pw/mobile/) | 2 | Playwright · iPhone 14 WebKit & Pixel 7 Chromium · Docker SUT | Browse, product price match, add to cart, hamburger cart badge, cart total reconciliation, viewport image check, horizontal overflow guards |
| [`tests/pw/ux/`](tests/pw/ux/) | 4 | Playwright · Chromium · Docker SUT | WCAG 2.1 AA ratchet (`@axe-core/playwright`), `DE` localization & layout, `page.route()` tampered `$0.01` price control, `page.route()` payment `500` recovery |
| **Total E2E / API** | **18** | | Plus 11 Node unit tests (`env`, `money`, `stock`, `apiEvidence`) and report-opening integration checks in `check:static` |

## Reading the report

The [latest test report](https://vmurashev365.github.io/toolshop-showcase/) shows one card per suite with its results and a link to the full HTML report.

- **Green** means the checked behavior holds. **Red** means a regression, or that a tracked finding changed.
- **A green run does not mean the store has no defects.** Open findings are tracked by *watch* tests. A watch stays green while its defect still reproduces and lists it under the suite card (for example, `FIND-02 still reproduces: …`). It turns red when the behavior changes, so the fix can be reviewed and the test promoted to a normal regression check.
- **Ratchets** hold a known baseline. The accessibility check allows only the two baselined `FIND-08` violations: any new one fails, and so does a fixed one until it is removed from the baseline. On Linux WebKit, the checkout allows up to 32px of overflow while `FIND-09` is open.
- **Evidence on failure.** Playwright reports keep the trace of each failed test, plus a screenshot and video for browser tests. In the Cucumber report, key steps log the products and amounts they check. A failed scenario adds a screenshot, a trace link, and its recent API calls with secrets redacted.

## Architecture & tech stack

Playwright 1.65 · TypeScript 7 · Cucumber 13 (Gherkin) · `@axe-core/playwright` · ESLint 10 · Prettier 3 · Node.js 24 · GitHub Actions · GitHub Pages

```text
src/
  api/          Typed APIRequestContext clients (Auth, Products, Cart, Invoices), stock oracle & re-seed guard
  domain/       Integer-cent money math (half-up rounding), web-first assertions & known-discrepancy helper
  components/   HeaderNav (mobile hamburger aware), CatalogFilters (FIND-06 scoped)
  pages/        BasePage (overflow & lazy/AVIF-aware image checks), Catalog, ProductDetails, Auth, CheckoutWizard
  utils/        page.route() network fault injection (tampered cart price, payment 500)

tests/
  pw/           @playwright/test suites (API, known discrepancies, mobile WebKit/Chromium, UX guards)
  bdd/          Cucumber 13 features, step definitions, World, hooks, and compact terminal formatter
  unit/         Unit tests for target env validation, integer-cent rounding, FIND-02 stock oracle, and API evidence redaction
  integration/  End-to-end verification of isolated local HTML report generation and opening

scripts/
  start-toolshop.sh        Pinned Sprint 5 Docker Compose bootstrap (used locally and in CI)
  run-tests.js             Local per-run HTML report isolation and combined PR-gate index
  report-open.js           Opens saved reports using Playwright’s local HTTP server

test_documentation/
  01-test-strategy.md      Scope, layer split, data isolation, and release gates
  findings/                QA notes for FIND-01 through FIND-09
  evidence/                Screenshots and captured API/DOM/axe JSON observations
```

## Run it locally

Requires Node.js 24.18.0 (see [`.nvmrc`](.nvmrc)), Docker Compose 2.24.4+, Git, and Bash (Git Bash on Windows).

```sh
npm ci
npx playwright install chromium webkit
bash scripts/start-toolshop.sh ./tmp/toolshop-sut
npm run test:pr-gate
```

`TARGET_ENV` defaults to `local` (`http://localhost:4200` / `http://localhost:8091`), and desktop runs automatically open their HTML report when finished. Run `npm run report:open` to reopen the latest report. [Running the tests](docs/running-tests.md) covers every npm script, `.env` configuration, container pause/resume, CI workflows, and Windows WebKit notes.
