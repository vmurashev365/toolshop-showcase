import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ApiResult } from '../../src/api/ApiClient';
import { assertOutOfStockRejected } from '../../src/api/stock';
import { observeKnownDiscrepancy } from '../../src/domain/knownDiscrepancy';

const product = { id: 'retail-fixture', name: 'Long Nose Pliers' };
const accepted = { result: 'item added or updated' };
const cart = { cart_items: [{ product_id: product.id, quantity: 1, product: { in_stock: false } }] };

function response(status: number, body: unknown): ApiResult<unknown> {
  return { status, ok: status >= 200 && status < 300, headers: {}, body };
}

function watch(add: ApiResult<unknown>, readCart = async () => response(200, cart)) {
  return observeKnownDiscrepancy('FIND-02', () => assertOutOfStockRejected(add, product, readCart));
}

test('FIND-02 reproduces only when the known response and cart line agree', async () => {
  assert.match(await watch(response(200, accepted)), /^FIND-02 still reproduces:/);
  await assert.rejects(
    watch(response(200, accepted), async () => response(200, { cart_items: [] })),
    /inconclusive.*cart/i,
  );
  await assert.rejects(watch(response(200, { result: 'unknown' })), /inconclusive.*HTTP 200/i);
});

test('FIND-02 emits the promotion signal for a stock-specific rejection', async () => {
  await assert.rejects(watch(response(409, { code: 'OUT_OF_STOCK' })), /no longer reproduces.*promote/);
  await assert.rejects(
    watch(response(422, { errors: { product_id: ['Product is out of stock.'] } })),
    /no longer reproduces.*promote/,
  );
});

test('FIND-02 treats unrelated validation, server failure, missing state and timeouts as inconclusive', async () => {
  const errors = { quantity: ['The quantity must be at least 1.'] };
  await assert.rejects(watch(response(422, { errors })), /inconclusive.*HTTP 422/i);
  await assert.rejects(watch(response(422, { code: 'OUT_OF_STOCK', errors })), /inconclusive.*HTTP 422/i);
  await assert.rejects(
    watch(response(422, { errors: { product_id: ['The selected product id is invalid.'] } })),
    /inconclusive.*re-seeded/i,
  );
  await assert.rejects(watch(response(500, { code: 'OUT_OF_STOCK' })), /inconclusive.*HTTP 500/i);
  await assert.rejects(
    watch(response(200, accepted), async () => response(404, {})),
    /inconclusive.*cart.*404/i,
  );
  await assert.rejects(
    watch(response(200, accepted), async () => {
      throw new Error('request timed out');
    }),
    /inconclusive.*request timed out/i,
  );
});
