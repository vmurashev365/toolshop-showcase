import { expect, type Locator } from '@playwright/test';
import { formatUsd, parseUsdCents, dollarsToCents } from './money';

export class DomainAssertionError extends Error {
  readonly isDomainAssertion = true;

  constructor(message: string) {
    super(message);
    this.name = 'DomainAssertionError';
  }
}

export function isAssertionError(error: unknown): boolean {
  if (error instanceof DomainAssertionError) return true;
  if (typeof error === 'object' && error !== null && 'matcherResult' in error) return true;
  return false;
}

export function assertUsdTextEquals(field: string, expectedCents: number, actualText: string): number {
  const actualCents = parseUsdCents(actualText);
  if (actualCents !== expectedCents) {
    const displayed = actualText.trim();
    const received = actualCents === undefined ? JSON.stringify(displayed) : displayed;
    throw new DomainAssertionError(`${field}: expected ${formatUsd(expectedCents)}, actual ${received}.`);
  }
  return actualCents;
}

export function assertApiAmountEquals(field: string, expectedCents: number, actualDollars: number | null | undefined): number {
  if (typeof actualDollars !== 'number' || !Number.isFinite(actualDollars)) {
    throw new DomainAssertionError(`${field}: expected ${formatUsd(expectedCents)}, actual ${JSON.stringify(actualDollars)}.`);
  }
  assertExactCents(field, actualDollars, expectedCents);
  const actualCents = dollarsToCents(actualDollars);
  if (actualCents !== expectedCents) {
    throw new DomainAssertionError(`${field}: expected ${formatUsd(expectedCents)}, actual ${formatUsd(actualCents)}.`);
  }
  return actualCents;
}

/**
 * Checks for a sub-cent remainder, allowing binary representation noise in ordinary cents.
 */
export function assertExactCents(field: string, actualDollars: number | null | undefined, expectedCents?: number): void {
  if (typeof actualDollars !== 'number' || !Number.isFinite(actualDollars)) {
    throw new DomainAssertionError(`${field}: expected a finite amount in whole cents, actual ${JSON.stringify(actualDollars)}.`);
  }
  const scaled = actualDollars * 100;
  if (Math.abs(scaled - Math.round(scaled)) >= 1e-6) {
    const expected = expectedCents === undefined ? 'a whole-cent amount' : formatUsd(expectedCents);
    throw new DomainAssertionError(`${field}: expected ${expected} in whole cents, actual ${String(actualDollars)}.`);
  }
}

export interface UsdTextOptions {
  /** How long to wait for the UI to settle on the expected amount. Defaults to the expect timeout. */
  timeout?: number;
  /** Accept a bare number ("14.15") when the "$" sign is rendered in a separate element. */
  allowMissingCurrencySign?: boolean;
}

/**
 * Web-first (auto-retrying) version of assertUsdTextEquals for UI amounts.
 *
 * Totals in the storefront are recalculated asynchronously after quantity edits, item removal,
 * discount changes and language switches, so a single textContent() read can observe a stale
 * value. This polls until the displayed amount equals the expected cents and, if it never does,
 * fails with the same self-explanatory domain message as assertUsdTextEquals.
 */
export async function expectUsdText(
  locator: Locator,
  field: string,
  expectedCents: number,
  options: UsdTextOptions = {},
): Promise<void> {
  const normalize = (raw: string): string => {
    const text = raw.trim();
    return options.allowMissingCurrencySign && text && !text.startsWith('$') ? `$${text}` : text;
  };

  let lastText = '';
  try {
    await expect
      .poll(
        async () => {
          lastText = normalize((await locator.textContent({ timeout: 1_000 }).catch(() => null)) ?? '');
          return parseUsdCents(lastText);
        },
        { timeout: options.timeout },
      )
      .toBe(expectedCents);
  } catch (error) {
    assertUsdTextEquals(field, expectedCents, lastText);
    throw error;
  }
}
