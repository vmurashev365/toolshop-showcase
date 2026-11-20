import { test as base, expect } from '@playwright/test';
import { resolveEnv, type EnvConfig } from '../../src/config/env';
import { ApiClient } from '../../src/api/ApiClient';
import { AuthApi } from '../../src/api/AuthApi';
import { ProductsApi } from '../../src/api/ProductsApi';
import { CartApi } from '../../src/api/CartApi';
import { InvoicesApi } from '../../src/api/InvoicesApi';
import { CatalogPage } from '../../src/pages/CatalogPage';
import { ProductDetailsPage } from '../../src/pages/ProductDetailsPage';
import { AuthPage } from '../../src/pages/AuthPage';
import { CheckoutWizardPage } from '../../src/pages/CheckoutWizardPage';
import { isAssertionError } from '../../src/domain/assertions';

export interface ToolshopFixtures {
  env: EnvConfig;
  apiClient: ApiClient;
  authApi: AuthApi;
  productsApi: ProductsApi;
  cartApi: CartApi;
  invoicesApi: InvoicesApi;
  catalogPage: CatalogPage;
  productDetailsPage: ProductDetailsPage;
  authPage: AuthPage;
  checkoutPage: CheckoutWizardPage;
}

export const test = base.extend<ToolshopFixtures>({
  env: async ({}, use) => {
    await use(resolveEnv());
  },
  apiClient: async ({ request, env }, use) => {
    await use(new ApiClient(request, env.apiBaseUrl));
  },
  authApi: async ({ apiClient }, use) => {
    await use(new AuthApi(apiClient));
  },
  productsApi: async ({ apiClient }, use) => {
    await use(new ProductsApi(apiClient));
  },
  cartApi: async ({ apiClient }, use) => {
    await use(new CartApi(apiClient));
  },
  invoicesApi: async ({ apiClient }, use) => {
    await use(new InvoicesApi(apiClient));
  },
  catalogPage: async ({ page, env }, use) => {
    await use(new CatalogPage(page, env.uiBaseUrl));
  },
  productDetailsPage: async ({ page, env }, use) => {
    await use(new ProductDetailsPage(page, env.uiBaseUrl));
  },
  authPage: async ({ page, env }, use) => {
    await use(new AuthPage(page, env.uiBaseUrl));
  },
  checkoutPage: async ({ page, env }, use) => {
    await use(new CheckoutWizardPage(page, env.uiBaseUrl));
  },
});

export { expect };

/**
 * Inverted check for a live defect tracked as @known-spec-discrepancy.
 *
 * `assertion` states the CORRECT business rule. While the defect still reproduces the assertion
 * fails, and the test passes with a "still reproduces" annotation. Once the defect is fixed the
 * assertion passes and this helper FAILS, telling you to promote the test to the regression gate.
 *
 * Only the outcome assertion is inverted: setup steps outside the callback (catalog discovery,
 * cart creation, ...) still fail the test normally, so a broken precondition is never mistaken
 * for a reproduced defect (which is what a blanket test.fail() would do).
 */
export async function expectKnownDiscrepancy(defectId: string, assertion: () => void | Promise<void>): Promise<void> {
  try {
    await assertion();
  } catch (error) {
    if (!isAssertionError(error)) {
      throw error;
    }
    const firstLine = String(error instanceof Error ? error.message : error).split('\n')[0];
    test.info().annotations.push({ type: 'known-discrepancy', description: `${defectId} still reproduces: ${firstLine}` });
    return;
  }
  throw new Error(
    `${defectId} no longer reproduces: the correct behaviour is now observed. ` +
      'Remove the @known-spec-discrepancy tag and the expectKnownDiscrepancy() wrapper to promote this test to the regression gate.',
  );
}
