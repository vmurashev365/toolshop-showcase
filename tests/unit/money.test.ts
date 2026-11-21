import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertApiAmountEquals, assertUsdTextEquals, DomainAssertionError } from '../../src/domain/assertions';
import { applyDiscountHalfUp, dollarsToCents } from '../../src/domain/money';

const expected = applyDiscountHalfUp(dollarsToCents(48.41), 20);

test('TC-API-003 accepts the expected whole-cent discount', () => {
  assert.equal(expected, 3873);
  assert.equal(assertApiAmountEquals('Discounted price', expected, 38.73), 3873);
  assert.equal(assertApiAmountEquals('Catalog price', 29, 0.29), 29);
  assert.equal(assertUsdTextEquals('Displayed price', expected, '$38.73'), 3873);
  const stringFromApi = '38.73' as unknown as number;
  assert.throws(() => assertApiAmountEquals('Discounted price', expected, stringFromApi), DomainAssertionError);
});

test('TC-API-003 rejects a numeric sub-cent response that rounds to the expected amount', () => {
  assert.throws(() => assertApiAmountEquals('Discounted price', expected, 38.728), {
    name: 'DomainAssertionError',
    message: /expected \$38\.73.*38\.728/,
  });
  assert.throws(() => assertUsdTextEquals('Displayed price', expected, '$38.728'), DomainAssertionError);
});

test('an exact half-cent discount boundary rounds up', () => {
  // 4842 cents at 75% of list price is exactly 3631.5 cents.
  const halfUpCents = applyDiscountHalfUp(4842, 25);
  assert.equal(halfUpCents, 3632);
  assert.equal(assertApiAmountEquals('Discounted price', halfUpCents, 36.32), 3632);
  assert.throws(() => assertApiAmountEquals('Discounted price', halfUpCents, 36.315), DomainAssertionError);
});
