import { test, expect } from '../fixtures';
import { dollarsToCents, formatUsd } from '../../../src/domain/money';
import { assertUsdTextEquals, expectUsdText } from '../../../src/domain/assertions';
import { injectCartPriceTamper, injectPaymentServerError } from '../../../src/utils/networkFaults';

test.describe('Network Fault Injection & Assertion Controls', () => {
  test('TC-RES-001: proves domain assertions catch a tampered cart price injected via page.route() @blocker-margin', async ({
    page,
    productsApi,
    productDetailsPage,
    checkoutPage,
  }) => {
    const product = await productsApi.findNonEcoRetailProduct();
    const expectedCents = dollarsToCents(product.price);
    const tamperedPrice = 0.01;

    await productDetailsPage.open(product.id);
    await productDetailsPage.addToCart(1);

    // Inject deliberate $0.01 defect into GET /carts/{id} before opening checkout
    await injectCartPriceTamper(page, tamperedPrice);
    await productDetailsPage.header.openCart();
    await checkoutPage.expectRowCount(1);

    const unitPrice = checkoutPage.row(product.name).getByTestId('product-price');
    await expect(
      unitPrice,
      'The tampered price must actually reach the UI for this control to mean anything',
    ).toHaveText(formatUsd(dollarsToCents(tamperedPrice)));

    const expectedMessage = new RegExp(
      `Cart unit price for .*: expected \\${formatUsd(expectedCents)}, actual \\$0\\.01\\.`,
    );

    // Control 1: the pure domain assertion flags the defect with a self-explanatory diagnostic.
    const [row] = await checkoutPage.readCartRows();
    expect(() => assertUsdTextEquals(`Cart unit price for ${product.name}`, expectedCents, row.unitPriceText)).toThrow(
      expectedMessage,
    );

    // Control 2: the auto-retrying UI assertion used by the real tests does not wait its way past it.
    await expect(
      expectUsdText(unitPrice, `Cart unit price for ${product.name}`, expectedCents, { timeout: 2_000 }),
    ).rejects.toThrow(expectedMessage);
  });

  test('TC-RES-002: payment gateway 500 surfaces an error, creates no invoice, and keeps the cart and retry available @blocker-conversion', async ({
    page,
    authApi,
    productsApi,
    productDetailsPage,
    checkoutPage,
  }) => {
    const customer = await authApi.createAuthenticatedCustomer('res');
    const product = await productsApi.findNonEcoRetailProduct();

    await productDetailsPage.open(product.id);
    await productDetailsPage.addToCart(1);
    await productDetailsPage.header.openCart();
    await checkoutPage.expectRowCount(1);

    await checkoutPage.proceedFromCartToSignIn();
    await checkoutPage.signInDuringCheckout(customer.credentials.email, customer.credentials.password);
    await checkoutPage.proceedFromSignInToBillingAddress();
    await checkoutPage.completeBillingAddress();

    const invoiceRequests: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && /\/invoices(\/guest)?$/.test(new URL(req.url()).pathname)) {
        invoiceRequests.push(req.url());
      }
    });

    await injectPaymentServerError(page, 500);
    await checkoutPage.selectPaymentMethod('cash-on-delivery');
    const paymentCheck = page.waitForResponse((res) => new URL(res.url()).pathname.endsWith('/payment/check'));
    await checkoutPage.submitPayment();
    expect((await paymentCheck).status(), 'Fault injection must have answered /payment/check').toBe(500);

    // The buyer gets feedback without technical internals (DT-PAY7: no raw stack trace in UI)...
    await expect(checkoutPage.paymentErrorMessage).toBeVisible();
    await expect(checkoutPage.paymentErrorMessage).not.toHaveText(/^\s*$/);
    await expect(checkoutPage.paymentErrorMessage).not.toContainText(/exception|stack|trace|sqlstate|\.php/i);

    // ...can retry, keeps the cart, and no order is placed behind their back.
    await expect(checkoutPage.confirmPaymentButton).toBeEnabled();
    await checkoutPage.header.expectCartBadgeCount(1);
    expect(invoiceRequests, 'No invoice may be created when payment validation failed').toEqual([]);
  });
});
