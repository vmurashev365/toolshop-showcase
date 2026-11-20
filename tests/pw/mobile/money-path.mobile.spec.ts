import { test } from '../fixtures';
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
    await checkoutPage.assertNoHorizontalOverflow();

    await checkoutPage.expectRowCount(1);
    await checkoutPage.expectLineItem(product.name, {
      quantity: 1,
      unitPriceCents: expectedCents,
      lineTotalCents: expectedCents,
    });
    await checkoutPage.expectCartTotal(expectedCents, `Mobile cart total for ${product.name}`);
  });
});
