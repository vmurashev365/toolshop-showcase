/**
 * Basket (Cart API) steps for server-side combination discount and catalog price assertions.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import type { ToolshopWorld } from '../hooks/World';
import { assertCatalogProductStillKnown, type Cart } from '../../../src/api/CartApi';
import type { Product } from '../../../src/api/ProductsApi';
import { dollarsToCents } from '../../../src/domain/money';
import { assertApiAmountEquals } from '../../../src/domain/assertions';

const START_BASKET = 'a shopper starts an empty basket with no regional location set';

async function addOrFail(world: ToolshopWorld, product: Product, quantity: number): Promise<void> {
  const res = await world.cartApi.addItem(world.need('activeCartId', START_BASKET), {
    product_id: product.id,
    quantity,
  });
  assertCatalogProductStillKnown(res, product.name);
  expect(res.status, `Adding ${quantity} x "${product.name}" failed: ${JSON.stringify(res.body)}`).toBe(200);
}

async function readBasket(world: ToolshopWorld): Promise<Cart> {
  const cart = await world.cartApi.get(world.need('activeCartId', START_BASKET));
  if (cart.status !== 200) {
    throw new Error(`GET /carts/{id} returned ${cart.status}: ${JSON.stringify(cart.body)}`);
  }
  return cart.body;
}

Given('a registered shopper exists', async function (this: ToolshopWorld) {
  await this.ensureCustomer('bdd');
});

Given(START_BASKET, async function (this: ToolshopWorld) {
  const created = await this.cartApi.create();
  expect(created.status, `POST /carts returned ${created.status}`).toBe(201);
  this.activeCartId = created.body.id;
});

When(
  'the shopper adds {int} unit(s) of an in-stock retail product to the basket',
  async function (this: ToolshopWorld, qty: number) {
    this.selectedProduct = await this.productsApi.findNonEcoRetailProduct();
    this.selectedQuantity = qty;
    await addOrFail(this, this.selectedProduct, qty);
  },
);

When(
  'the shopper adds a rental item for {int} hours to the basket',
  async function (this: ToolshopWorld, hours: number) {
    this.selectedRental = await this.productsApi.findRentalProduct();
    await addOrFail(this, this.selectedRental, hours);
  },
);

Then(
  'the basket qualifies for the {int} percent combination discount',
  async function (this: ToolshopWorld, pct: number) {
    const cart = await readBasket(this);
    expect(cart.additional_discount_percentage, 'Basket-level combination discount').toBe(pct);
  },
);

Then('every basket line should keep the exact catalog unit price in cents', async function (this: ToolshopWorld) {
  const cart = await readBasket(this);
  for (const product of [this.need('selectedProduct'), this.need('selectedRental')]) {
    const line = cart.cart_items.find((i) => i.product_id === product.id);
    expect(line, `"${product.name}" missing from basket`).toBeDefined();
    assertApiAmountEquals(`Basket unit price for ${product.name}`, dollarsToCents(product.price), line?.product.price);
  }
});
