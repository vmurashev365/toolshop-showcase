import type { ApiClient, ApiResult } from './ApiClient';
import type { Product } from './ProductsApi';

export interface CartItem {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  discount_percentage: number | null;
  discounted_price?: number;
  product: Product;
}

export interface Cart {
  id: string;
  additional_discount_percentage: number | null;
  lat: number | null;
  lng: number | null;
  cart_items: CartItem[];
}

/** True when the Cart API rejected the product ID itself (422 with errors.product_id). */
export function isUnknownProductRejection(res: ApiResult<unknown>): boolean {
  const errors = (res.body as { errors?: Record<string, unknown> } | null | undefined)?.errors;
  return res.status === 422 && typeof errors === 'object' && errors !== null && 'product_id' in errors;
}

/**
 * Guard for products discovered from the live catalog moments earlier.
 *
 * The public sandbox periodically re-seeds its database with NEW product IDs. A request made
 * right after a reset is then rejected with 422 "The selected product id is invalid", which a
 * test expecting "422 for a bad quantity / over the cap / out of stock" would wrongly count as
 * the expected rejection (and an inverted known-discrepancy check as "defect fixed").
 * Throwing here turns that into an explicit environment failure instead.
 */
export function assertCatalogProductStillKnown(res: ApiResult<unknown>, productName: string): void {
  if (isUnknownProductRejection(res)) {
    throw new Error(
      `"${productName}" was read from the catalog moments ago, but the Cart API no longer knows its ID: ` +
        'the shared sandbox was most likely re-seeded mid-run. This is an environment event, not a result; re-run the test.',
    );
  }
}

export class CartApi {
  constructor(private readonly client: ApiClient) {}

  create(coords?: { lat: number; lng: number }): Promise<ApiResult<{ id: string }>> {
    return this.client.post<{ id: string }>('/carts', coords);
  }

  get(cartId: string): Promise<ApiResult<Cart>> {
    return this.client.get<Cart>(`/carts/${cartId}`);
  }

  addItem(cartId: string, payload: Record<string, unknown>): Promise<ApiResult<unknown>> {
    return this.client.post(`/carts/${cartId}`, payload);
  }

  updateQuantity(cartId: string, productId: string, quantity: number): Promise<ApiResult<unknown>> {
    return this.client.put(`/carts/${cartId}/product/quantity`, {
      product_id: productId,
      quantity,
    });
  }

  removeItem(cartId: string, productId: string): Promise<ApiResult<unknown>> {
    return this.client.delete(`/carts/${cartId}/product/${productId}`);
  }
}
