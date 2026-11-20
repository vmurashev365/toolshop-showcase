# 01 · Test Strategy — Toolshop E-Commerce (`practicesoftwaretesting.com`)

**Standard Alignment:** ISTQB CTFL v4.0 · ISO/IEC/IEEE 29119 · ISO/IEC 25010 · OWASP API Security Top 10 · WCAG 2.1 AA (ADA / EAA)  
**Target System:** Practice Software Testing — Toolshop (Sprint 5)  
**Environments:**
- Live UI: `https://practicesoftwaretesting.com`
- Live API & OpenAPI Spec: `https://api.practicesoftwaretesting.com` (`/docs`)
- Bug Verification Twin (`with-bugs`): `https://with-bugs.practicesoftwaretesting.com` (`https://api-with-bugs.practicesoftwaretesting.com`)
- Isolated Local / CI Target: Local Docker Compose (required for destructive security/admin tests and zero-flake PR gates)

---

## 1. Mission & Quality Objectives

This strategy protects two complementary business dimensions of an e-commerce store:

1. **Business Analyst / Finance / Operations Perspective (Margin & Integrity):**
   - Prevent revenue and margin leakage from client-side price/quantity tampering, invalid discount stacking, rounding drift, or selling out-of-stock items via direct API calls.
   - Guarantee strict financial reconciliation across all surfaces: `Catalog → Product Detail → Cart → Checkout → Invoice API → PDF / Admin`.
   - Enforce access control boundaries (RBAC & BOLA/IDOR) between Guest, Customer, and Admin roles.
2. **Buyer Perspective (Conversion, Trust & Compliance):**
   - Protect the end-to-end Money Path across both desktop and mobile viewports (`390×844` WebKit & Chromium), where 60–75% of real retail traffic occurs.
   - Ensure graceful error handling and cart preservation during payment failures, retries, and guest-to-authenticated transitions.
   - Enforce baseline accessibility (WCAG 2.1 AA critical/serious gate), layout hygiene (no broken media or horizontal overflow), and localization stability (`DE`, `FR`, `ES`, `NL`, `TR`).

---

## 2. Scope & Explicit Out-of-Scope Boundaries

### In Scope
- **Functional Suitability (ISO 25010):** Catalog browsing, search, multi-facet filtering (price range slider, categories, brands, CO₂ sustainability/eco-friendly), sorting, pagination, standard purchases, hourly rentals (`is_rental`), combination & geo-location discounts, 4-step checkout, all 5 payment methods, user registration/login, profile & invoice history.
- **Security (ISO 25010 / OWASP API):** Authentication enforcement, BOLA/IDOR across users and invoices, RBAC privilege boundaries, server-side price/quantity trust validation, OpenAPI security contract auditing, PII/card-field leakage checks.
- **Compatibility & Usability (ISO 25010):** Desktop (`1440×900` Chromium) and Mobile (`390×844` WebKit/iPhone + Chromium/Pixel), localization (`DE` text expansion & currency consistency), WCAG 2.1 AA automated scanning (`@axe-core/playwright`).
- **Reliability & Fault Tolerance:** Network failure injection (`500` on payment/invoice), double-submit protection, cart persistence across reloads.
- **Test Effectiveness Proof:** Controlled fault injection via `page.route()` + scheduled verification against `with-bugs.practicesoftwaretesting.com`.

### Explicitly Out of Scope (with Production Extension Points)
| Area | Reason Out of Scope on Public Demo | How Handled in Real Production |
| :--- | :--- | :--- |
| Real 3DS2 / PSD2 & PCI DSS Card Processing | Toolshop uses a simulated `/payment/check` endpoint without a live PSP (Stripe/Adyen) | Sandbox PSP cards, 3DS2 challenge flows, hosted-iframe tokenization audit |
| Live ERP / Warehouse Stock Locking | Demo database does not decrement real inventory atomically per SKU | Concurrency load test (k6) racing 20 buyers for last 1 unit |
| Marketing Analytics (GA4 / DataLayer) | No GA4 tag manager container on demo site | Network interception asserting `add_to_cart`, `begin_checkout`, `purchase` payloads |
| Destructive Admin / Catalog Mutations on Live | Shared public sandbox used by global QA community | Executed exclusively against an isolated local instance (`TARGET_ENV=local`, upstream `practice-software-testing/sprint5` Docker Compose stack, see README) |

---

## 3. Hybrid Automation Architecture (Right Tool per Risk Class)

Rather than forcing every technical check into Gherkin, the framework deliberately splits responsibilities into two complementary layers inside one TypeScript codebase sharing `src/api/`, `src/domain/`, `src/components/`, and `src/pages/`:

| Layer | Runner | Owns | Why |
| :--- | :--- | :--- | :--- |
| **Executable Business Specs** | Cucumber 13 (BDD / Gherkin) | Pricing & discount rules, guest-to-auth cart merge, UI-to-API invoice reconciliation | Readable by BA/PO; traceable to business rules; step-grouped Playwright traces |
| **Technical & Risk Guardrails** | `@playwright/test` | API tampering & margin math, RBAC/BOLA & OpenAPI audit, Mobile WebKit/Chromium Money Path, `@axe-core/playwright` a11y, `DE` localization & layout guards, `page.route()` fault injection | Native multi-device `projects`, fast parallel workers, built-in `toHaveScreenshot`, zero Gherkin boilerplate for security/UX checks |
| **Human Exploration** | Time-boxed Exploratory Charters *(private walkthrough pack)* | Multi-tab cart races, mobile touch usability, keyboard-only UX feel, i18n copy quality | Automation cannot evaluate human cognitive friction or visual polish |

---

## 4. Test Data, Isolation & Environmental Safety

1. **No Hardcoded Catalog Prices:** Product IDs, prices, stock status, and rental rates are discovered dynamically from `GET /products` at runtime so tests validate live integrity without brittle fixtures.
2. **Per-Test Isolated Users:** Mutating tests register unique ephemeral users (`qa.<scope>.<uuid>@example.test`) via `POST /users/register` so parallel workers never collide.
3. **Exact Integer-Cent Math:** All monetary assertions operate in integer cents (`src/domain/money.ts`) with explicit half-up rounding to avoid IEEE-754 floating-point drift.
4. **Shared-Sandbox Ethics Rule:** Destructive tests (e.g., verifying `PUT /products/{id}` rejects customer price edits) are **strictly non-destructive** against the live public API (verified via OpenAPI security audit; active probes belong on an isolated `TARGET_ENV=local` instance), preventing interference with other users. Parallelism is capped (4 local / 2 CI workers) because heavier load visibly degrades the shared sandbox.
5. **Sandbox Re-Seeding Guard:** The public sandbox periodically re-seeds its database with new product IDs. Every test that expects a `422` (quantity cap, out-of-stock, bad quantity) first checks that the rejection is not "unknown product ID" (`assertCatalogProductStillKnown`), so a mid-run reset surfaces as an explicit environment failure instead of a false pass (or a false "defect fixed" in the inverted discrepancy runners).

---

## 5. Browser & Device Matrix

| Target | Engine | Viewport | Scope | Cadence |
| :--- | :--- | :--- | :--- | :--- |
| API Contract & Margin | Node / `APIRequestContext` | N/A (headless) | Tampering, Discounts, Inventory, RBAC/BOLA | Every PR |
| Desktop Primary | Chromium | `1440×900` | BDD Business Specs, Fault Injection, A11y, i18n | Every PR |
| Mobile iOS Proxy | WebKit | `390×844` (iPhone 14) | Money Path, Overflow, Touch Reachability | Every PR |
| Mobile Android Proxy | Chromium | `393×851` (Pixel 7) | Money Path, Filters Collapse, Cart Access | Nightly |
| Bug-Hunting Twin | Chromium / API | `1440×900` | Suite effectiveness check on `with-bugs` | Nightly / Weekly |

---

## 6. Entry & Exit Criteria (Release Gates)

### Entry Criteria
- `npm run typecheck` passes with 0 TypeScript errors.
- `npm run bdd:dry` resolves 100% of Gherkin steps with 0 undefined/ambiguous snippets.
- Target environment health check (`GET /products?page=1` returns `200`).

### Exit Criteria (Release Go / No-Go)
| Gate | Tag / Suite | Mandatory Threshold | Business Decision if Red |
| :--- | :--- | :--- | :--- |
| **Margin & Pricing** | `@blocker-margin` | 100% pass (excluding documented `@known-spec-discrepancy` tracked in discrepancy runner) | **STOP RELEASE** — direct financial loss |
| **Security & RBAC** | `@blocker-security` | 100% pass, 0 unacknowledged BOLA/RBAC gaps | **STOP RELEASE** — legal & fraud exposure |
| **Conversion Funnel** | `@blocker-conversion` | 100% pass on Desktop Chromium + Mobile WebKit | **STOP RELEASE** — revenue drop |
| **UX / A11y / i18n** | `@ux-guard` | 0 `critical` and 0 new `serious` axe violations on catalog, product detail and checkout (pre-existing ones baselined as `FIND-08`, ratchet); 0 horizontal overflow; 0 broken images in the viewport | Soft gate on PR; must be triaged before production release |
