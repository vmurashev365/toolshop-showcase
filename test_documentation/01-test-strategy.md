# Test Strategy — Toolshop (`practicesoftwaretesting.com`)

**Target system:** [Practice Software Testing — Toolshop (Sprint 5)](https://github.com/testsmith-io/practice-software-testing)  
**Environments:**
- Live UI: `https://practicesoftwaretesting.com`
- Live API & OpenAPI spec: `https://api.practicesoftwaretesting.com` (`/docs`)
- Bug-verification twin (`with-bugs`): `https://with-bugs.practicesoftwaretesting.com` (`https://api-with-bugs.practicesoftwaretesting.com`)
- Isolated local / CI stack: Docker Compose (`TARGET_ENV=local`, UI `http://localhost:4200`, API `http://localhost:8091`)

---

## 1. What This Suite Protects

The tests target two groups of e-commerce release risks:

1. **Revenue, margin, and access control:**
   - Client-side price or quantity tampering, invalid discount stacking, cent rounding drift, and out-of-stock orders bypassing UI controls via direct API calls.
   - Exact financial reconciliation across Catalog, Product Detail, Cart, and Checkout in integer cents.
   - Authorization boundaries (BOLA/IDOR across customer accounts, authentication on checkout/invoices, OpenAPI security contract).
2. **Buyer checkout and usability:**
   - Core purchase funnel on desktop (`1440×900` Chromium) and mobile (`390×844` iPhone 14 WebKit, `412×839` Pixel 7 Chromium).
   - Graceful recovery on payment gateway failures (error shown without stack traces, cart preserved, no invoice created, retry stays enabled).
   - Accessibility baseline (WCAG 2.1 AA critical/serious ratchet via `@axe-core/playwright`), layout hygiene (no horizontal overflow or broken visible images), and `DE` localization stability.

---

## 2. Scope & Out-of-Scope Boundaries

### In Scope
- **Pricing & cart rules:** Catalog-to-cart price reconciliation, integer-cent half-up discount rounding, 15% retail+rental combination discount and revocation on removal/reload, quantity validation (`0`, negative, fractional), client-payload tampering (`price`, `discount_percentage`).
- **API security & contracts:** Cross-user BOLA/IDOR (`GET /users/{id}`), unauthenticated invoice rejection (`401`), `/payment/check` validation, non-destructive OpenAPI auth audit (`PUT /products/{id}`).
- **Mobile, accessibility & localization:** Mobile Money Path on WebKit and Chromium, WCAG 2.1 AA automated scan with ratchet baseline, `DE` locale UI translation and currency consistency.
- **Fault injection controls:** `page.route()` injection of a tampered `$0.01` cart price (proving the domain assertions fail with the expected diagnostic) and a `500` payment error (proving buyer recovery).

### Out of Scope on the Public Demo
| Area | Why out of scope on Toolshop | Typical production coverage |
| :--- | :--- | :--- |
| Real 3DS2 / PCI card processing | Toolshop uses a simulated `/payment/check` endpoint without a live PSP | Sandbox PSP test cards, 3DS2 challenge flows, tokenization checks |
| Concurrent warehouse stock locking | Demo DB does not atomically reserve inventory under race conditions | k6 / concurrency test racing multiple buyers for the last unit |
| Analytics / tracking tags | Demo site has no production GA4 / DataLayer pipeline | Network assertions on `add_to_cart`, `begin_checkout`, `purchase` events |
| Destructive catalog mutations on live | Shared public sandbox used by the wider QA community | Non-destructive OpenAPI audit on live; active mutation probes only against isolated `TARGET_ENV=local` |

---

## 3. Hybrid Layer Split

Instead of forcing every check into Gherkin, one TypeScript codebase splits work between two runners sharing `src/api/`, `src/domain/`, `src/components/`, and `src/pages/`:

| Layer | Runner | Owns | Why |
| :--- | :--- | :--- | :--- |
| **Business rules** | Cucumber 13 (Gherkin) | Retail+rental combination discount, discount revocation on removal/reload, guest-to-signed-in checkout continuity | Plain business vocabulary; step-grouped Playwright traces on failure |
| **API, security, mobile & UX** | `@playwright/test` | API tampering & rounding, RBAC/BOLA, known-discrepancy watch, Mobile WebKit/Chromium, WCAG 2.1 AA ratchet, `DE` i18n, `page.route()` fault injection | Native multi-device `projects`, fast parallel workers, no Gherkin boilerplate for HTTP/a11y/fault checks |

---

## 4. Test Data, Isolation & Sandbox Rules

1. **Dynamic catalog discovery:** Product IDs, prices, stock flags, and rental items are queried from `GET /products` at runtime rather than hardcoded.
2. **Per-test users:** Tests that need an authenticated buyer register a fresh ephemeral user (`qa.<scope>.<uuid>@example.test`) so parallel workers never collide.
3. **Integer-cent money math:** All price and discount checks run in integer cents (`src/domain/money.ts`) with explicit half-up rounding.
4. **Non-destructive live probes:** No test mutates catalog items on `api.practicesoftwaretesting.com`. Worker count is capped (`4` local / `2` CI) to avoid overloading the shared sandbox.
5. **Re-seed guard:** The public sandbox periodically re-seeds its DB with new ULIDs. Tests expecting `422` first verify the error is not an unknown `product_id` (`assertCatalogProductStillKnown`), so a mid-run reset is reported as an environment issue. FIND-02 requires stock-rule evidence to declare a fix.

---

## 5. Execution Matrix & Release Gates

| Suite | Runner / Target | CI cadence | Release decision if red |
| :--- | :--- | :--- | :--- |
| `test:api` (`api-margin-security`) | `@playwright/test` · isolated Docker SUT | Push / PR / manual | Block release — pricing or security regression |
| `test:discrepancies:api` (`known-discrepancies-api`) | `@playwright/test` · isolated Docker SUT & weekly live API | Push / PR (isolated SUT) + weekly Monday 06:00 UTC (live) | Review — either a tracked finding was fixed (promote to regression gate) or a precondition broke |
| `test:bdd` | Cucumber + Chromium · isolated Docker SUT | Push / PR / manual | Block release — discount or checkout continuity broken |
| `test:mobile` | `@playwright/test` · iPhone 14 WebKit & Pixel 7 Chromium · isolated Docker SUT | Push / PR / manual | Block release — mobile buyer funnel broken |
| `test:ux` | `@playwright/test` · Chromium · isolated Docker SUT | Push / PR / manual | Triage before release — new WCAG 2.1 AA violation, i18n regression, or failed fault control |

---

## 6. Severity Scale

Findings are rated as if Toolshop were a production store. Toolshop is a training app, so some behaviors may be intentional upstream.

| Severity | Meaning |
| :--- | :--- |
| **Critical** | Unauthorized change of prices, orders, or customer data, or direct financial loss, with no special conditions |
| **High** | Revenue or margin loss, or a broken business rule, under realistic shopping conditions |
| **Medium** | Friction or compliance risk on a core buyer flow; a workaround exists |
| **Low** | Cosmetic, limited to an unusual environment, or affecting only maintainability |

---

## 7. Risk → Test Traceability

| Risk | Test | Suite (project) | Finding |
| :--- | :--- | :--- | :--- |
| Invalid cart quantities (`0`, negative, fractional) | `TC-API-001` | `test:api` (`api-margin-security`) | — |
| Client-supplied price or discount accepted | `TC-API-002` | `test:api` (`api-margin-security`) | — |
| Cent rounding drift in percentage discounts | `TC-API-003` | `test:api` (`api-margin-security`) | — |
| Cross-user data access (BOLA/IDOR) | `TC-SEC-001` | `test:api` (`api-margin-security`) | — |
| Unauthenticated invoice creation | `TC-SEC-002` | `test:api` (`api-margin-security`) | — |
| Payment details accepted without validation | `TC-SEC-004` | `test:api` (`api-margin-security`) | — |
| Catalog updates without authentication | `TC-SEC-003` (watch) | `test:discrepancies:api` (`known-discrepancies-api`) | [FIND-01](findings/FIND-01-product-update-rbac.md) · Critical |
| Out-of-stock items ordered through the API | `TC-API-004` (watch) | `test:discrepancies:api` (`known-discrepancies-api`) | [FIND-02](findings/FIND-02-out-of-stock-bypass.md) · High |
| Ineligible or stacked discounts | `TC-API-005` (watch) | `test:discrepancies:api` (`known-discrepancies-api`) | [FIND-03](findings/FIND-03-discount-stacking.md) · High |
| Catalog price differs from cart; cart lost at sign-in | `TC-BDD-001` | `test:bdd` | — |
| 15% retail+rental combination discount not applied | `TC-BDD-002` | `test:bdd` | — |
| Combination discount kept after the rental is removed or the page reloads | `TC-BDD-003` | `test:bdd` | — |
| Mobile buyer cannot browse, add to cart, and reconcile the total | `TC-MOB-001` | `test:mobile` (`mobile-webkit`, `mobile-chromium`) | [FIND-04, FIND-05, FIND-09](findings/FIND-04-06-mobile-ux.md) · Medium / Low |
| Ambiguous test hooks break automation | Page-object guardrail (`CatalogFilters`); no public test uses the filters yet | — | [FIND-06](findings/FIND-04-06-mobile-ux.md) · Low |
| New critical/serious accessibility violation | `TC-A11Y-001` (ratchet) | `test:ux` (`ux-guards`) | [FIND-08](findings/FIND-07-08-a11y-i18n.md) · Medium |
| `DE` locale breaks layout or price format | `TC-I18N-001` | `test:ux` (`ux-guards`) | [FIND-07](findings/FIND-07-08-a11y-i18n.md) · Low |
| Price assertions miss a tampered amount | `TC-RES-001` (fault injection) | `test:ux` (`ux-guards`) | — |
| Payment outage loses the cart or creates an invoice | `TC-RES-002` (fault injection) | `test:ux` (`ux-guards`) | — |
