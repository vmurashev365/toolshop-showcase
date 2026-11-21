import { test, expect, expectKnownDiscrepancy } from '../fixtures';
import type { ApiResult } from '../../../src/api/ApiClient';
import { assertCatalogProductStillKnown } from '../../../src/api/CartApi';
import { assertOutOfStockRejected } from '../../../src/api/stock';
import { applyDiscountHalfUp, dollarsToCents } from '../../../src/domain/money';
import { assertApiAmountEquals } from '../../../src/domain/assertions';

test.describe('Margin & Pricing Integrity (API) @blocker-margin', () => {
  test('TC-API-001: rejects zero, negative, and fractional cart quantities on add and update', async ({
    productsApi,
    cartApi,
  }) => {
    const product = await productsApi.findInStockRetailProduct();
    const created = await cartApi.create();
    expect(created.status).toBe(201);
    const cartId = created.body.id;

    // The 422 must be about the quantity, not e.g. an unknown product ID after a sandbox reset.
    const expectQuantityRejected = (res: ApiResult<unknown>, label: string) => {
      assertCatalogProductStillKnown(res, product.name);
      expect(res.status, label).toBe(422);
      expect((res.body as { errors?: Record<string, unknown> })?.errors, `${label}: validation errors`).toHaveProperty(
        'quantity',
      );
    };

    for (const invalidQty of [0, -2, 1.5]) {
      const addRes = await cartApi.addItem(cartId, { product_id: product.id, quantity: invalidQty });
      expectQuantityRejected(addRes, `POST /carts/{id} with quantity=${invalidQty}`);
    }

    // Seed valid quantity=1, then attempt invalid updates
    const validAdd = await cartApi.addItem(cartId, { product_id: product.id, quantity: 1 });
    expect(validAdd.status).toBe(200);

    for (const invalidQty of [0, -5]) {
      const putRes = await cartApi.updateQuantity(cartId, product.id, invalidQty);
      expectQuantityRejected(putRes, `PUT /carts/{id}/product/quantity with quantity=${invalidQty}`);
    }

    const cart = await cartApi.get(cartId);
    expect(cart.status).toBe(200);
    expect(cart.body.cart_items).toHaveLength(1);
    expect(cart.body.cart_items[0].quantity).toBe(1);
  });

  test('TC-API-002: ignores client-supplied price and discount_percentage in cart payload', async ({
    productsApi,
    cartApi,
  }) => {
    const product = await productsApi.findInStockRetailProduct();
    const expectedCents = dollarsToCents(product.price);
    const created = await cartApi.create();
    expect(created.status).toBe(201);

    const addRes = await cartApi.addItem(created.body.id, {
      product_id: product.id,
      quantity: 1,
      price: 0.01,
      discount_percentage: 99,
    });
    expect(addRes.status).toBe(200);

    const cart = await cartApi.get(created.body.id);
    expect(cart.status).toBe(200);
    const item = cart.body.cart_items[0];
    assertApiAmountEquals(`Server price for ${product.name}`, expectedCents, item.product.price);
    expect(item.discount_percentage).toBeNull();
  });

  test('TC-API-003: verifies 20% geo-location discount half-up rounding in exact cents', async ({
    productsApi,
    cartApi,
  }) => {
    const product = await productsApi.findLocationOfferProduct();
    const expectedDiscountedCents = applyDiscountHalfUp(dollarsToCents(product.price), 20);

    const created = await cartApi.create({ lat: 52.37, lng: 4.89 });
    expect(created.status).toBe(201);

    const addRes = await cartApi.addItem(created.body.id, { product_id: product.id, quantity: 1 });
    expect(addRes.status).toBe(200);

    const cart = await cartApi.get(created.body.id);
    expect(cart.status).toBe(200);
    const line = cart.body.cart_items[0];
    expect(line.discount_percentage).toBe(20);
    assertApiAmountEquals(`20% discounted price for ${product.name}`, expectedDiscountedCents, line.discounted_price);
  });

  test('TC-API-004: out-of-stock retail product must be rejected by Cart API @known-spec-discrepancy', async ({
    productsApi,
    cartApi,
  }) => {
    // FIND-02: UI disables Add to Cart for in_stock=false, but live API currently accepts it (200).
    const outOfStock = await productsApi.findOutOfStockRetailProduct();
    const created = await cartApi.create();
    expect(created.status, 'FIND-02 inconclusive: the Cart API did not create a fresh cart').toBe(201);

    const addRes = await cartApi
      .addItem(created.body.id, { product_id: outOfStock.id, quantity: 1 })
      .catch((error: unknown) => {
        throw new Error('FIND-02 inconclusive: the Cart API request failed.', { cause: error });
      });

    await expectKnownDiscrepancy('FIND-02', () =>
      assertOutOfStockRejected(addRes, outOfStock, () => cartApi.get(created.body.id)),
    );
  });

  test('TC-API-005: non-location-offer SKU must not receive geolocation discount or stack with 15% combination discount @known-spec-discrepancy', async ({
    productsApi,
    cartApi,
  }) => {
    // FIND-03: upstream CartService checks isset($product->is_location_offer), which is true even
    // when is_location_offer is false. That applies the 25% London geo discount to non-offer SKUs
    // and stacks it with the 15% retail+rental combination discount (36.25% combined reduction).
    const retail = await productsApi.findNonLocationOfferRetailProduct();
    const rental = await productsApi.findRentalProduct();
    expect(retail.is_location_offer, `${retail.name} should have is_location_offer=false`).toBe(false);

    const created = await cartApi.create({ lat: 51.5, lng: -0.12 });
    expect(created.status).toBe(201);
    const cartId = created.body.id;

    const addRetail = await cartApi.addItem(cartId, { product_id: retail.id, quantity: 1 });
    assertCatalogProductStillKnown(addRetail, retail.name);
    expect(addRetail.status).toBe(200);

    const addRental = await cartApi.addItem(cartId, { product_id: rental.id, quantity: 1 });
    assertCatalogProductStillKnown(addRental, rental.name);
    expect(addRental.status).toBe(200);

    const cart = await cartApi.get(cartId);
    expect(cart.status).toBe(200);
    const retailLine = cart.body.cart_items.find((item) => item.product_id === retail.id);
    expect(retailLine, `${retail.name} missing from cart`).toBeDefined();

    await expectKnownDiscrepancy('FIND-03', () => {
      expect(
        retailLine?.discount_percentage ?? 0,
        `Non-offer SKU "${retail.name}" (is_location_offer=false) should not receive a geolocation discount (also stacked with ${cart.body.additional_discount_percentage ?? 0}% combo discount)`,
      ).toBe(0);
    });
  });
});
