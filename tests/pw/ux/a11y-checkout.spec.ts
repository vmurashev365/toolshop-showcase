import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

/**
 * AMB-10 / 01-test-strategy: the release gate is 0 critical AND 0 serious WCAG 2.1 AA violations
 * on the core funnel screens (catalog, product detail, checkout cart).
 *
 * Serious violations that already exist on the live site are documented as FIND-08 and listed
 * here as a baseline, so the gate still blocks every NEW violation. The baseline is a ratchet:
 * when a listed violation disappears, the test fails and asks you to remove it from the list,
 * so it cannot silently hide a regression later.
 */
const KNOWN_SERIOUS_VIOLATIONS: Record<string, string> = {
  'label-content-name-mismatch':
    'FIND-08: language switcher / cart link accessible name does not contain the visible label',
  list: 'FIND-08: catalog filter <ul> contains non-<li> children',
};

const WCAG_21_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

interface Finding {
  screen: string;
  id: string;
  impact: string;
  help: string;
  nodes: string[];
}

async function scan(page: Page, screen: string): Promise<Finding[]> {
  const result = await new AxeBuilder({ page }).withTags(WCAG_21_AA).analyze();
  return result.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => ({
      screen,
      id: v.id,
      impact: v.impact ?? 'unknown',
      help: v.help,
      nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
    }));
}

test.describe('Accessibility Gate (WCAG 2.1 AA) @ux-guard', () => {
  test('TC-A11Y-001: Catalog, Product Detail and Checkout Cart have no new critical/serious WCAG 2.1 AA violations', async ({
    page,
    productsApi,
    catalogPage,
    productDetailsPage,
    checkoutPage,
  }) => {
    const product = await productsApi.findNonEcoRetailProduct();
    const findings: Finding[] = [];

    await catalogPage.open();
    findings.push(...(await scan(page, 'catalog')));

    await productDetailsPage.open(product.id);
    findings.push(...(await scan(page, 'product-detail')));

    await productDetailsPage.addToCart(1);
    await productDetailsPage.header.openCart();
    await checkoutPage.expectRowCount(1);
    findings.push(...(await scan(page, 'checkout-cart')));

    const known = findings.filter((f) => f.impact === 'serious' && f.id in KNOWN_SERIOUS_VIOLATIONS);
    for (const f of known) {
      test.info().annotations.push({
        type: 'known-a11y-violation',
        description: `${f.screen}: ${f.id} (${KNOWN_SERIOUS_VIOLATIONS[f.id]})`,
      });
    }

    const newViolations = findings.filter((f) => !known.includes(f));
    expect(
      newViolations,
      `New critical/serious WCAG 2.1 AA violations:\n${JSON.stringify(newViolations, null, 2)}`,
    ).toEqual([]);

    const staleBaseline = Object.keys(KNOWN_SERIOUS_VIOLATIONS).filter((id) => !known.some((f) => f.id === id));
    expect(
      staleBaseline,
      'These baseline violations are no longer reported: remove them from KNOWN_SERIOUS_VIOLATIONS (and close FIND-08 items).',
    ).toEqual([]);
  });
});
