/**
 * Exact integer-cent money utilities to prevent IEEE-754 floating-point drift
 * in e-commerce catalog, discount, cart, and invoice assertions.
 */

export function dollarsToCents(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new Error(`Expected finite dollar amount, actual ${String(amount)}.`);
  }
  return Math.round(amount * 100);
}

export function parseUsdCents(text: string): number | undefined {
  const cleaned = text.trim();
  const match = /^\$(\d+|\d{1,3}(?:,\d{3})+)\.(\d{2})$/.exec(cleaned);
  if (!match) return undefined;
  const cents = Number(match[1].replaceAll(',', '')) * 100 + Number(match[2]);
  return Number.isSafeInteger(cents) ? cents : undefined;
}

export function formatUsd(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/**
 * Half-up percentage discount calculation in integer cents.
 * Verified live against Toolshop API: $48.41 with 20% off -> 38.728 -> $38.73 (3873 cents).
 *
 * Only whole percentages are accepted (all Toolshop discounts are 5/15/20/25%), which keeps
 * the arithmetic in exact integers: cents * remainingPercent is an integer, so +50 / 100 + floor
 * is an exact half-up rounding with no floating-point involvement.
 */
export function applyDiscountHalfUp(unitPriceCents: number, discountPercent: number): number {
  if (!Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new Error(`Discount percent must be a whole number in [0, 100], actual ${discountPercent}.`);
  }
  if (!Number.isSafeInteger(unitPriceCents)) {
    throw new Error(`Price must be an integer number of cents, actual ${unitPriceCents}.`);
  }
  const remainingPercent = 100 - discountPercent;
  return Math.floor((unitPriceCents * remainingPercent + 50) / 100);
}

export interface LineItemSpec {
  name: string;
  unitPriceCents: number;
  quantity: number;
  discountPercent?: number | null;
}

export function expectedLineTotalCents(item: LineItemSpec): number {
  const effectiveUnitCents =
    item.discountPercent && item.discountPercent > 0
      ? applyDiscountHalfUp(item.unitPriceCents, item.discountPercent)
      : item.unitPriceCents;
  return effectiveUnitCents * item.quantity;
}

export function expectedCartSubtotalCents(items: readonly LineItemSpec[]): number {
  return items.reduce((sum, item) => sum + expectedLineTotalCents(item), 0);
}
