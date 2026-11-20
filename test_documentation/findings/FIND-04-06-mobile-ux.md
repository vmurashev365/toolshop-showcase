# FIND-04 / FIND-05 / FIND-06 · Mobile viewport (`390×844`) checkout friction & duplicate test ID

**Environment:** `https://practicesoftwaretesting.com`, headless Chromium mobile viewport (`390×844`, `isMobile: true`, `hasTouch: true`), observed 2026-11-20.  
**Evidence:** [Collapsed mobile header screenshot](../evidence/find-04-mobile-header-collapsed.png) · [Expanded mobile header screenshot](../evidence/find-04-mobile-header-expanded.png) · [DOM & geometry observations (JSON)](../evidence/find-04-06-mobile-observations.json) · [Mobile test (`TC-MOB-001`)](../../tests/pw/mobile/money-path.mobile.spec.ts)

## Observations

| ID | Area | Observed at `390×844` | Automation guardrail |
| --- | --- | --- | --- |
| **FIND-04** | Header cart visibility | After adding `Combination Pliers` to cart, `nav-cart` and its badge (`1`) are hidden inside the collapsed Bootstrap hamburger menu (`navCartVisibleWhenCollapsed: false`). A shopper gets no persistent cart badge in the top bar. | `HeaderNav.ensureNavExpanded()` ([`src/components/HeaderNav.ts`](../../src/components/HeaderNav.ts)) |
| **FIND-05** | Mobile CTA & floating widget | On Product Detail, `Add to cart` renders below the fold at `y = 1120px` (viewport height `844px`). On Catalog, the bottom-left floating feed widget overlaps the first product title (`Combination Pliers`). | `scrollIntoViewIfNeeded()` in `ProductDetailsPage.addToCart()`, overflow check in `TC-MOB-001` |
| **FIND-06** | Duplicate `data-test="filters"` | Two DOM nodes carry `data-test="filters"`: the mobile `<button>` toggle and the `<div id="filters">` panel. Unscoped `getByTestId('filters')` fails Playwright strict mode. | Explicitly scoped `mobileToggleButton` and `container` in [`src/components/CatalogFilters.ts`](../../src/components/CatalogFilters.ts) |

### Visual evidence (`390×844`)

- **Collapsed header (1 item in cart, no cart badge visible, bottom-left widget overlapping card title):**  
  ![Mobile catalog with collapsed hamburger menu and floating widget overlapping product title](../evidence/find-04-mobile-header-collapsed.png)
- **Expanded header (cart badge `1` only appears after tapping hamburger):**  
  ![Mobile catalog with expanded hamburger menu showing cart icon and badge 1](../evidence/find-04-mobile-header-expanded.png)
