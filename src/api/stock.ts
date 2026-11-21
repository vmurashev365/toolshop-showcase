import type { ApiResult } from './ApiClient';
import { assertCatalogProductStillKnown } from './CartApi';
import { DomainAssertionError } from '../domain/assertions';

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

const stockMessage = /^(?:the )?product is out of stock\.?$/i;

export async function assertOutOfStockRejected(
  add: ApiResult<unknown>,
  product: { id: string; name: string },
  readCart: () => Promise<ApiResult<unknown>>,
): Promise<void> {
  const body = asObject(add.body);
  const errors = asObject(body?.errors);
  const productErrors: unknown = errors?.product_id;
  const stockValidation = errors && Object.keys(errors).length === 1 &&
    Array.isArray(productErrors) && productErrors.length === 1 &&
    typeof productErrors[0] === 'string' && stockMessage.test(productErrors[0]);

  // The status and response must identify the stock rule. Other errors take precedence.
  if ((add.status === 409 || add.status === 422) &&
    (stockValidation || (body?.errors === undefined && body?.code === 'OUT_OF_STOCK'))) {
    return;
  }

  if (add.status === 422 && Array.isArray(productErrors) &&
    productErrors.includes('The selected product id is invalid.')) {
    try {
      assertCatalogProductStillKnown(add, product.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`FIND-02 inconclusive: ${message}`, { cause: error });
    }
  }

  if (add.status !== 200 || body?.result !== 'item added or updated') {
    throw new Error(`FIND-02 inconclusive: Cart API returned HTTP ${add.status} without a recognized stock-rule outcome for "${product.name}".`);
  }

  const cart = await readCart().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`FIND-02 inconclusive: could not read the cart: ${message}`, { cause: error });
  });
  const lines = asObject(cart.body)?.cart_items;
  const line = Array.isArray(lines) && lines.length === 1 ? asObject(lines[0]) : undefined;
  if (cart.status !== 200 || line?.product_id !== product.id || line.quantity !== 1 ||
    asObject(line.product)?.in_stock !== false) {
    throw new Error(`FIND-02 inconclusive: cart (HTTP ${cart.status}) did not confirm the accepted out-of-stock line for "${product.name}".`);
  }

  throw new DomainAssertionError(`Cart API accepted "${product.name}" (in_stock=false) and returned it in the cart.`);
}
