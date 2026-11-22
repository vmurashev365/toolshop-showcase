/**
 * Storefront (UI) steps. Every amount and badge check is web-first (auto-retrying), because the
 * Angular storefront recalculates totals asynchronously after edits, removals and reloads.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import type { ToolshopWorld } from '../hooks/World';
import type { Product } from '../../../src/api/ProductsApi';
import { applyDiscountHalfUp, dollarsToCents, formatUsd } from '../../../src/domain/money';

const COMBINATION_DISCOUNT_LABEL = 'Discount (15%)';

const catalogPrice = (product: Product): string => formatUsd(dollarsToCents(product.price));

/** Logs and returns the retail-only cart total that the step's assertions expect. */
function expectedRetailTotal(world: ToolshopWorld): number {
  const product = world.need('selectedProduct');
  const totalCents = dollarsToCents(product.price) * world.selectedQuantity;
  world.log(
    `Expected: no combination discount; cart total ${formatUsd(totalCents)} ` +
      `(${world.selectedQuantity} × ${catalogPrice(product)} ${product.name})`,
  );
  return totalCents;
}

async function openProductAndAdd(world: ToolshopWorld, productId: string, quantity: number): Promise<void> {
  const { productDetails } = world.ui();
  await productDetails.open(productId);
  await productDetails.addToCart(quantity);
}

Given('a guest shopper opens an in-stock retail product page in the storefront', async function (this: ToolshopWorld) {
  this.selectedProduct = await this.productsApi.findNonEcoRetailProduct();
  this.log(`Retail product: ${this.selectedProduct.name}, catalog price ${catalogPrice(this.selectedProduct)}`);
  await this.ui().productDetails.open(this.selectedProduct.id);
});

Then('the product page should show the exact catalog price in cents', async function (this: ToolshopWorld) {
  const product = this.need('selectedProduct');
  await this.ui().productDetails.expectUnitPrice(
    dollarsToCents(product.price),
    `Product detail price for ${product.name}`,
  );
});

Given(
  'a shopper adds {int} unit(s) of an in-stock retail product in the storefront',
  async function (this: ToolshopWorld, qty: number) {
    this.selectedProduct = await this.productsApi.findNonEcoRetailProduct();
    this.selectedQuantity = qty;
    this.log(`Retail product: ${this.selectedProduct.name}, ${catalogPrice(this.selectedProduct)} × ${qty}`);
    await openProductAndAdd(this, this.selectedProduct.id, qty);
  },
);

Given('the shopper adds a rental item in the storefront', async function (this: ToolshopWorld) {
  this.selectedRental = await this.productsApi.findRentalProduct();
  this.log(`Rental item: ${this.selectedRental.name}, ${catalogPrice(this.selectedRental)} × 1`);
  await openProductAndAdd(this, this.selectedRental.id, 1);
});

When('the shopper adds {int} unit(s) of that product to the cart', async function (this: ToolshopWorld, qty: number) {
  this.need('selectedProduct');
  this.selectedQuantity = qty;
  await this.ui().productDetails.addToCart(qty);
});

When('the shopper opens the storefront checkout cart', async function (this: ToolshopWorld) {
  const { productDetails, checkout } = this.ui();
  await productDetails.header.openCart();
  await checkout.waitForCartLoaded();
});

When('the shopper removes the rental item from the storefront cart', async function (this: ToolshopWorld) {
  await this.ui().checkout.removeRowByProductName(this.need('selectedRental').name);
});

When('the shopper reloads the checkout cart page', async function (this: ToolshopWorld) {
  const { page, checkout } = this.ui();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await checkout.waitForCartLoaded();
});

Then(
  'the storefront cart should display quantity {int} and exact recalculated totals in cents',
  async function (this: ToolshopWorld, qty: number) {
    const { checkout } = this.ui();
    const product = this.need('selectedProduct');
    const unitCents = dollarsToCents(product.price);
    this.log(
      `Expected: ${product.name} ${qty} × ${formatUsd(unitCents)} = ${formatUsd(unitCents * qty)}; ` +
        `cart total ${formatUsd(unitCents * qty)}; cart badge ${qty}`,
    );

    await checkout.expectRowCount(1);
    await checkout.expectLineItem(product.name, {
      quantity: qty,
      unitPriceCents: unitCents,
      lineTotalCents: unitCents * qty,
    });
    await checkout.expectCartTotal(unitCents * qty);
    await checkout.header.expectCartBadgeCount(qty);
  },
);

Then(
  'the storefront cart should show a {int} percent combination discount and exact discounted total',
  async function (this: ToolshopWorld, discountPct: number) {
    const { checkout } = this.ui();
    await checkout.expectSummaryToContain(`Discount (${discountPct}%)`);

    const product = this.need('selectedProduct');
    const rental = this.need('selectedRental');
    const subtotalCents = dollarsToCents(product.price) * this.selectedQuantity + dollarsToCents(rental.price);
    const totalCents = applyDiscountHalfUp(subtotalCents, discountPct);
    this.log(
      `Expected: subtotal ${formatUsd(subtotalCents)} (${this.selectedQuantity} × ${catalogPrice(product)} ` +
        `${product.name} + ${catalogPrice(rental)} ${rental.name}), ${discountPct}% discount ` +
        `−${formatUsd(subtotalCents - totalCents)}, cart total ${formatUsd(totalCents)}`,
    );
    await checkout.expectCartTotal(totalCents, 'Mixed cart discounted total');
  },
);

Then(
  'the storefront cart should no longer show a combination discount and total should match the retail line',
  async function (this: ToolshopWorld) {
    const { checkout } = this.ui();
    const totalCents = expectedRetailTotal(this);
    await checkout.expectSummaryNotToContain(COMBINATION_DISCOUNT_LABEL);
    await checkout.expectCartTotal(totalCents, 'Retail-only cart total');
  },
);

Then(
  'the storefront cart should still show no combination discount and preserve the exact retail total',
  async function (this: ToolshopWorld) {
    const { checkout } = this.ui();
    await checkout.expectCartTotal(expectedRetailTotal(this), 'Reloaded retail cart total');
    await checkout.expectSummaryNotToContain(COMBINATION_DISCOUNT_LABEL);
  },
);

When('the shopper proceeds to checkout and signs in as the registered shopper', async function (this: ToolshopWorld) {
  const { credentials } = this.need('customer', 'a registered shopper exists');
  const { checkout } = this.ui();
  await checkout.proceedFromCartToSignIn();
  await checkout.signInDuringCheckout(credentials.email, credentials.password);
});

Then(
  'the checkout should continue to the billing step with the cart badge still showing {int}',
  async function (this: ToolshopWorld, expectedCount: number) {
    const { checkout } = this.ui();
    await expect(checkout.proceedStep2).toBeVisible();
    await checkout.header.expectCartBadgeCount(expectedCount);
  },
);
