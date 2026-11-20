# Toolshop E-Commerce · Risk-Based QA & Hybrid Automation Framework (Showcase)

Production-grade QA architecture for [Practice Software Testing (Toolshop)](https://practicesoftwaretesting.com/), built to industry e-commerce and ISTQB v4.0 / ISO 29119 / ISO 25010 standards.

Instead of automating UI clicks blindly, testing starts from **commercial risk & margin protection** (pricing integrity, discount recalculation, inventory guards, RBAC/BOLA, and buyer conversion) and chooses the right execution layer per risk class inside a single TypeScript codebase.

> **Scope of this public showcase:** This repository contains the core automation architecture, all Playwright technical & UX guardrails (API security/margin, mobile WebKit/Chromium, WCAG 2.1 AA ratchet, DE localization, network fault injection), and a representative subset of executable Gherkin specifications.  
> The full **24-vector E-Commerce Margin-Leak Research Methodology** (Layer 1 Evidence Archive, Layer 2 Decision Digest, complete Risk Matrix, Decision Tables, Exploratory Charters, and the full 37-scenario BDD Release Gate) is shared privately during client walkthroughs and audits.

---

## Selected Live Findings Uncovered on `practicesoftwaretesting.com`

Even on a widely tested public e-commerce demo, a commercial-risk approach surfaced real margin, integrity, and conversion defects that standard happy-path E2E suites miss:

| Area | Impact | Observed Live Behaviour (2026-11-20) | Automated Control |
| :--- | :--- | :--- | :--- |
| **Catalog RBAC (`FIND-01`)** | **Critical · Margin / Fraud** | `PUT /products/{productId}` declares no OpenAPI `security` scheme and permitted a regular customer to modify catalog prices. *(Non-destructive OpenAPI audit on live.)* | `TC-SEC-003` (inverted watch) |
| **Out-of-Stock Bypass (`FIND-02`)** | **High · Margin / Overselling** | Out-of-stock retail SKU (`in_stock: false`) is blocked in the UI, yet Cart and Invoice APIs accept it end-to-end. | `TC-API-004` (inverted watch) |
| **Discount Stacking & Exclusion (`FIND-03`)** | **High · Margin Leak** | Multi-tier geolocation discounts apply even to `is_location_offer: false` SKUs and compound with the `15%` retail+rental combination discount (up to `36.25%` effective reduction). | Covered in full private BDD gate |
| **Quantity Cap & Order Idempotency** | **High · Margin / Ops** | Repeated additive `POST /carts/{id}` calls bypass the `99`-unit and `10h` rental limits; `POST /invoices` accepts empty carts (`$0.00`) and allows replaying the same `cart_id` into duplicate invoices. | Covered in full private BDD gate |
| **Invoice Status Escalation & Rounding** | **High · Security / Reconciliation** | Standard customers can update their own invoice status via `PUT /invoices/{id}/status`; discounted `POST /invoices` responses emit unrounded IEEE-754 floats. | Covered in full private BDD gate |
| **Mobile Conversion Friction (`FIND-04`, `05`, `06`)** | **Medium · Buyer UX** | At `390×844`, the cart badge is hidden inside the hamburger menu, `Add to cart` sits below the fold (`y = 1384px`), a floating widget overlaps filters, and `data-test="filters"` is duplicated in DOM. | `TC-MOB-001`, POM guardrails |
| **Accessibility & i18n (`FIND-07`, `FIND-08`)** | **Medium · Compliance / UX** | WCAG 2.1 AA scan catches `serious` violations (`label-content-name-mismatch`, `list`); `DE` locale retains USD formatting (`$`) and wraps the promo CTA. | `TC-A11Y-001` (ratchet), `TC-I18N-001` |

Strategy & gate criteria: [test_documentation/01-test-strategy.md](test_documentation/01-test-strategy.md)

---

## Hybrid Automation Architecture

```text
src/
  api/          Typed APIRequestContext clients (Auth, Products, Cart, Invoices) — dynamic catalog discovery & re-seed guard
  domain/       Exact integer-cent math (half-up rounding) & self-explanatory domain assertions (pure + web-first)
  components/   HeaderNav (mobile hamburger aware), CatalogFilters (FIND-06 scoped)
  pages/        BasePage (overflow & lazy/AVIF-aware image guards), Catalog, ProductDetails, Auth, CheckoutWizard
  utils/        page.route() network fault injection (tampered cart price, payment gateway 5xx)

tests/
  pw/           @playwright/test — API margin/tampering, RBAC/BOLA, Mobile WebKit/Chromium, WCAG 2.1 AA ratchet, DE i18n, Fault Controls
  bdd/          Cucumber 13 (Gherkin) — Representative executable business specs (combination discount + reverse recalculation, guest checkout continuity)
    features/           Declarative business rules in shared shopper vocabulary
    step-definitions/   basket · storefront
    hooks/              World (scenario state via need(), UI via ui()), step-grouped Playwright traces & failure artifacts

scripts/
  clean-report-dir.js   Safe project-scoped report cleanup before each BDD run
```

### Key Engineering Highlights

- **Exact Integer-Cent Money Math ([src/domain/money.ts](src/domain/money.ts)):** Avoids IEEE-754 drift with strict whole-percent half-up rounding in integer cents.
- **Web-First Domain Assertions ([src/domain/assertions.ts](src/domain/assertions.ts)):** Auto-retrying UI checks (`expectUsdText`, `expectCartTotal`, `expectLineItem`, `expectCartBadgeCount`) handle Angular's async recalculation while emitting clear financial diagnostics (`expected $38.73, actual $0.01`).
- **Proof That Assertions Actually Catch Defects ([tests/pw/ux/fault-injection.spec.ts](tests/pw/ux/fault-injection.spec.ts)):** Uses `page.route()` to inject a tampered `$0.01` cart price (`TC-RES-001`) and a `500` payment gateway outage (`TC-RES-002`), proving both the financial guardrail and graceful buyer recovery.
- **Inverted Discrepancy Watch ([expectKnownDiscrepancy](tests/pw/fixtures.ts)):** Known live defects (`FIND-01`, `FIND-02`) stay green while reproducing and turn red the moment a fix lands (prompting promotion to the blocking gate) — without masking broken preconditions or runtime exceptions.
- **WCAG 2.1 AA Ratchet ([tests/pw/ux/a11y-checkout.spec.ts](tests/pw/ux/a11y-checkout.spec.ts)):** Blocks every **new** `critical` or `serious` violation across Catalog, Product Detail, and Checkout Cart, and fails if a baselined `FIND-08` item is fixed so the baseline tightens automatically.
- **Shared-Sandbox Resilience:** Dynamically discovers product IDs per test, caps worker load, detects mid-run DB re-seeding (`assertCatalogProductStillKnown`), and handles Playwright WebKit-on-Windows AVIF limitations transparently.

---

## Quick Start

```sh
npm install
npx playwright install chromium webkit

npm run typecheck               # Strict TypeScript check
npm run bdd:dry                 # Verify 100% Gherkin step resolution
npm run pw:list                 # List all Playwright projects and specs

npm run test:api                # Fast API margin, pricing & security gates (no browser)
npm run test:bdd                # Representative executable business specs (Cucumber + Playwright)
npm run test:mobile             # Mobile Money Path (iPhone 14 WebKit + Pixel 7 Chromium)
npm run test:ux                 # WCAG 2.1 AA ratchet, DE localization, page.route() fault controls
npm run test:discrepancies:api  # Inverted watch on known live API findings (FIND-01, FIND-02)
```

### Reports

Each suite writes to an isolated directory so consecutive runs never overwrite earlier reports or traces:

| Command | Report Path |
| :--- | :--- |
| `test:api` / `test:mobile` / `test:ux` / `test:discrepancies:api` | `reports/pw-api/`, `reports/pw-mobile/`, `reports/pw-ux/`, `reports/pw-discrepancies/` (`html/`, `results.json`, `artifacts/`) |
| `test:bdd` | `reports/bdd/` (cleaned before each run) |

### Isolated Local Target (`TARGET_ENV=local`)

Destructive RBAC / catalog mutation probes should only run against a local isolated instance of the upstream Sprint 5 stack:

```sh
git clone https://github.com/testsmith-io/practice-software-testing.git
cd practice-software-testing/sprint5
docker compose up -d            # UI -> http://localhost:4200, API -> http://localhost:8091

# back in this repository
TARGET_ENV=local npm run test:pr-gate
```

`UI_BASE_URL` and `API_BASE_URL` override preset URLs for any custom deployment.

> **Mobile WebKit on Windows:** Playwright's Windows WebKit build cannot decode AVIF, which Toolshop serves for product photos. The viewport image guard detects this capability at runtime and annotates skipped AVIF images rather than raising a false product defect; Chromium suites verify every image.

---

*For a walkthrough of the full 24-vector E-Commerce Margin-Leak Research Methodology, Layer 1/2 Decision Digest, and complete 37-scenario BDD Release Gate, reach out for a private demo.*
