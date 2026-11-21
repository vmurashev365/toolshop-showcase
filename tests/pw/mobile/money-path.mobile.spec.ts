import { test, expect, expectKnownDiscrepancy } from '../fixtures';
import { dollarsToCents } from '../../../src/domain/money';

test.describe('Mobile Money Path & Layout Hygiene @blocker-conversion', () => {
  test('TC-MOB-001: mobile buyer can browse, add in-stock item, and reconcile cart total without horizontal overflow', async ({
    productsApi,
    catalogPage,
    productDetailsPage,
    checkoutPage,
  }) => {
    const product = await productsApi.findNonEcoRetailProduct();
    const expectedCents = dollarsToCents(product.price);

    const noteSkippedImages = ({ skippedUnsupportedAvif }: { skippedUnsupportedAvif: string[] }) => {
      if (skippedUnsupportedAvif.length > 0) {
        test.info().annotations.push({
          type: 'image-check-limited',
          description: `This test browser cannot decode AVIF; not judged: ${skippedUnsupportedAvif.join(', ')}`,
        });
      }
    };

    await catalogPage.open();
    await catalogPage.assertNoHorizontalOverflow();
    noteSkippedImages(await catalogPage.assertVisibleImagesLoaded());

    await productDetailsPage.open(product.id);
    await productDetailsPage.assertNoHorizontalOverflow();
    noteSkippedImages(await productDetailsPage.assertVisibleImagesLoaded());
    await productDetailsPage.expectUnitPrice(expectedCents, `Mobile product detail price for ${product.name}`);

    await productDetailsPage.addToCart(1);
    await productDetailsPage.header.expectCartBadgeCount(1);

    await productDetailsPage.header.openCart();
    await checkoutPage.waitForCartLoaded();
    const linuxWebKit = test.info().project.name === 'mobile-webkit' && process.platform === 'linux';
    // FIND-09 measured a 422px cart in the 390px iPhone viewport.
    const overflowPx = await checkoutPage.assertNoHorizontalOverflow(linuxWebKit ? 32 : 0);
    if (linuxWebKit) {
      await expectKnownDiscrepancy('FIND-09', () => {
        expect(overflowPx, `Linux WebKit checkout overflow measured ${overflowPx}px`).toBe(0);
      });
    }

    await checkoutPage.expectRowCount(1);
    await checkoutPage.expectLineItem(product.name, {
      quantity: 1,
      unitPriceCents: expectedCents,
      lineTotalCents: expectedCents,
    });
    await checkoutPage.expectCartTotal(expectedCents, `Mobile cart total for ${product.name}`);
  });
});
