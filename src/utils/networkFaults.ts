import type { Page } from '@playwright/test';

/**
 * Network-level fault injection helpers via Playwright page.route().
 * Replaces maintaining duplicate local HTML fixtures by mutating real API responses
 * deterministically to prove domain assertions and UI error handling actually work.
 */

export async function injectCartPriceTamper(page: Page, tamperedDollars: number): Promise<void> {
  await page.route('**/carts/*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const contentType = response.headers()['content-type'] || '';
    if (!contentType.includes('application/json')) {
      await route.fulfill({ response });
      return;
    }
    const json = await response.json();
    if (Array.isArray(json.cart_items) && json.cart_items.length > 0 && json.cart_items[0].product) {
      json.cart_items[0].product.price = tamperedDollars;
      if (json.cart_items[0].discounted_price !== undefined) {
        json.cart_items[0].discounted_price = tamperedDollars;
      }
    }
    await route.fulfill({
      response,
      json,
    });
  });
}

export async function injectPaymentServerError(page: Page, statusCode = 500): Promise<void> {
  await page.route('**/payment/check', async (route) => {
    await route.fulfill({
      status: statusCode,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Simulated payment gateway outage' }),
    });
  });
}
