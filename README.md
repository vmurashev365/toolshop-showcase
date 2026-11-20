# Toolshop · Risk-based QA and hybrid test automation

[![Toolshop QA Risk Gates](https://github.com/vmurashev365/toolshop-showcase/actions/workflows/qa.yml/badge.svg?branch=main)](https://github.com/vmurashev365/toolshop-showcase/actions/workflows/qa.yml)
[![Latest test report](https://img.shields.io/badge/report-latest%20run-0b5cad)](https://vmurashev365.github.io/toolshop-showcase/)

Risk-based QA suite for [Practice Software Testing (Toolshop)](https://practicesoftwaretesting.com/), an open-source demo e-commerce store built for practising software testing. Testing starts from commercial and technical risks — pricing integrity, discount math, stock checks, API access control, mobile checkout, accessibility, and payment failure recovery — and puts each check at the layer that fits best inside one TypeScript codebase.

## What this project shows

- **Right test layer per risk.** Pricing tampering, rounding, stock rules, and BOLA/RBAC run directly against the HTTP API. Mobile WebKit/Chromium, WCAG 2.1 AA, `DE` localization, and network fault controls run in `@playwright/test`. Business discount and checkout continuity rules run as Gherkin specs in Cucumber.
- **Documented findings with evidence.** Five areas where Toolshop has pricing, stock, access-control, mobile UX, or accessibility issues are backed by QA notes, screenshots or captured API responses, and automated checks in this repo.
- **Proof that assertions catch defects.** `page.route()` injects a tampered `$0.01` cart price (`TC-RES-001`) and a `500` payment gateway outage (`TC-RES-002`) to verify both the financial error diagnostic (`expected $14.15, actual $0.01`) and buyer recovery (no invoice created, cart kept, retry enabled).
- **Self-tightening discrepancy watches and a11y ratchet.** Known API findings (`FIND-01`, `FIND-02`, `FIND-03`) use `expectKnownDiscrepancy()` so they stay green while reproducing and turn red if upstream fixes them. The WCAG 2.1 AA check blocks any new `critical`/`serious` violation and fails if a baselined `FIND-08` issue disappears.
- **CI with a one-click public report.** GitHub Actions runs API gates against the live sandbox and browser gates against an ephemeral Sprint 5 Docker stack (avoiding Cloudflare bot challenges and hourly DB resets). The [latest test report](https://vmurashev365.github.io/toolshop-showcase/) publishes automatically to GitHub Pages.

## Findings

Toolshop (`testsmith-io/practice-software-testing`) is an open-source training app, so some behaviors may be unhardened or intentional for practice. Before logging each item below, we checked upstream GitHub issues and Sprint 5 source code, and ran strictly non-destructive checks against the shared public sandbox (no `PUT /products` calls were sent to `api.practicesoftwaretesting.com`).

| ID | Area | Observed behavior | Automated check | Evidence |
| --- | --- | --- | --- | --- |
| **FIND-01** | Product update RBAC (`PUT /products/{id}`) | Live OpenAPI `/docs` declares no `security` scheme on `PUT`/`PATCH /products/{id}` (unlike `DELETE`, which requires `apiAuth` + `role:admin`). Upstream `ProductController::update` has no auth middleware and `UpdateProduct::authorize()` returns `true`. | `TC-SEC-003` (non-destructive OpenAPI watch) | [QA note](test_documentation/findings/FIND-01-product-update-rbac.md) · [OpenAPI JSON](test_documentation/evidence/find-01-openapi-products.json) |
| **FIND-02** | Out-of-stock API bypass | UI shows `Out of stock` and disables `Add to cart` for `in_stock: false` SKUs, but `POST /carts/{id}` accepts them (`200 OK`) because `CartService` never checks `in_stock`. | `TC-API-004` (inverted watch) | [QA note](test_documentation/findings/FIND-02-out-of-stock-bypass.md) · [Screenshot](test_documentation/evidence/find-02-out-of-stock-ui.png) · [API JSON](test_documentation/evidence/find-02-cart-api-response.json) |
| **FIND-03** | Discount stacking & `is_location_offer` bug | `CartService` uses PHP `isset($product->is_location_offer)` (true even for `false`), applying up to `25%` geo-discount to non-offer SKUs and compounding it with the `15%` retail+rental discount (`36.25%` off). | `TC-API-005` (inverted watch) | [QA note](test_documentation/findings/FIND-03-discount-stacking.md) · [Screenshot](test_documentation/evidence/find-03-discount-stacking-ui.png) · [API JSON](test_documentation/evidence/find-03-discount-stacking.json) |
| **FIND-04..06** | Mobile checkout friction (`390×844`) | Cart badge is hidden inside the collapsed hamburger menu; `Add to cart` sits below the fold (`y = 1120px`); the floating feed widget overlaps the first product title; `data-test="filters"` is duplicated in the DOM. | `TC-MOB-001`, `HeaderNav`, `CatalogFilters` | [QA note](test_documentation/findings/FIND-04-06-mobile-ux.md) · [Collapsed](test_documentation/evidence/find-04-mobile-header-collapsed.png) · [Expanded](test_documentation/evidence/find-04-mobile-header-expanded.png) · [JSON](test_documentation/evidence/find-04-06-mobile-observations.json) |
| **FIND-07..08** | Accessibility & `DE` locale | Axe WCAG 2.1 AA reports 2 `serious` violations (`label-content-name-mismatch`, `list`) on funnel pages; `DE` locale translates chrome (`Einloggen`, `Sortieren`) while keeping USD `$` prices. | `TC-A11Y-001` (ratchet), `TC-I18N-001` | [QA note](test_documentation/findings/FIND-07-08-a11y-i18n.md) · [DE screenshot](test_documentation/evidence/find-07-de-locale-usd.png) · [Axe JSON](test_documentation/evidence/find-08-axe-wcag-violations.json) |

Test strategy and release gate criteria: [test_documentation/01-test-strategy.md](test_documentation/01-test-strategy.md)

## Coverage

| Suite | Checks | Runner / Target | What is checked |
| --- | ---: | --- | --- |
| [`tests/pw/api/`](tests/pw/api/) (`api-margin-security`) | 6 | Playwright · live API | Invalid quantities (`0`, negative, fractional), client price/discount tampering ignored, 20% geo-discount half-up rounding in cents, cross-user BOLA/IDOR, unauthenticated invoice `401`, `/payment/check` validation |
| [`tests/pw/api/`](tests/pw/api/) (`known-discrepancies-api`) | 3 | Playwright · live API | Inverted watches for `FIND-01`, `FIND-02`, and `FIND-03` |
| [`tests/bdd/features/`](tests/bdd/features/) | 3 | Cucumber + Playwright · Docker SUT | 15% retail+rental combination discount (API & UI), discount revocation on removal and page reload, guest cart reconciliation and sign-in continuity |
| [`tests/pw/mobile/`](tests/pw/mobile/) | 2 | Playwright · iPhone 14 WebKit & Pixel 7 Chromium · Docker SUT | Browse, product price match, add to cart, hamburger cart badge, cart total reconciliation, viewport image check, zero horizontal overflow |
| [`tests/pw/ux/`](tests/pw/ux/) | 4 | Playwright · Chromium · Docker SUT | WCAG 2.1 AA ratchet (`@axe-core/playwright`), `DE` localization & layout, `page.route()` tampered `$0.01` price control, `page.route()` payment `500` recovery |
| **Total** | **18** | | All executable in this repo and published in CI |

This repository is a public subset of a larger private suite, which I can walk through on request.

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

Requires Node.js 22+ (CI runs Node.js 24) and npm.

```sh
npm ci
npx playwright install chromium webkit

npm run typecheck               # Strict TypeScript check
npm run bdd:dry                 # Verify 100% Gherkin step resolution
npm run pw:list                 # List all Playwright projects and specs

npm run test:api                # 6 API margin & security checks (no browser)
npm run test:discrepancies:api  # 3 inverted watches for FIND-01, FIND-02, FIND-03
npm run test:bdd                # 3 Gherkin scenarios (Cucumber + Playwright)
npm run test:mobile             # Mobile Money Path (iPhone 14 WebKit + Pixel 7 Chromium)
npm run test:ux                 # WCAG 2.1 AA ratchet, DE locale, page.route() fault controls
```

Each suite writes to its own folder under `reports/` (`pw-api`, `pw-discrepancies`, `bdd`, `pw-mobile`, `pw-ux`) so consecutive runs never overwrite earlier HTML reports or traces.

### Isolated local target (`TARGET_ENV=local`)

To run against a local upstream Sprint 5 stack instead of the shared public sandbox (the same stack CI uses for browser suites):

```sh
git clone --depth 1 https://github.com/testsmith-io/practice-software-testing.git
cd practice-software-testing
SPRINT=sprint5 docker compose -f docker-compose.yml up -d mariadb laravel-api web angular-ui
docker compose -f docker-compose.yml exec -T -u root laravel-api sh -c "chown -R www-data:www-data /var/www && chmod -R 775 /var/www/storage /var/www/bootstrap/cache"
docker compose -f docker-compose.yml exec -T laravel-api composer install --no-dev --optimize-autoloader --ignore-platform-req=ext-ffi
docker compose -f docker-compose.yml exec -T laravel-api php artisan migrate:refresh --seed --force
# UI -> http://localhost:4200, API -> http://localhost:8091

# back in this repository
TARGET_ENV=local npm run test:pr-gate
```

`UI_BASE_URL` and `API_BASE_URL` override preset URLs for any custom deployment.

> **Mobile WebKit on Windows:** Playwright's Windows WebKit build cannot decode AVIF product photos. `BasePage.assertVisibleImagesLoaded()` probes AVIF support at runtime and annotates skipped AVIF images instead of raising a false defect; Chromium verifies every image.
