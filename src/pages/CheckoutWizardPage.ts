import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './base/BasePage';
import { HeaderNav } from '../components/HeaderNav';
import { expectUsdText } from '../domain/assertions';
import type { InvoicePayload } from '../api/InvoicesApi';

export interface CartRowObservation {
  title: string;
  quantity: number;
  unitPriceText: string;
  linePriceText: string;
}

export interface ExpectedCartLine {
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class CheckoutWizardPage extends BasePage {
  readonly header: HeaderNav;
  readonly cartSummary: Locator;
  readonly cartRows: Locator;
  readonly cartTotal: Locator;
  readonly proceedStep1: Locator;
  readonly proceedStep2: Locator;
  readonly proceedStep3: Locator;
  readonly loginEmailInput: Locator;
  readonly loginPasswordInput: Locator;
  readonly loginSubmitButton: Locator;
  readonly houseNumberInput: Locator;
  readonly streetInput: Locator;
  readonly paymentMethodSelect: Locator;
  readonly confirmPaymentButton: Locator;
  readonly paymentErrorMessage: Locator;

  constructor(page: Page, baseUrl: string) {
    super(page, baseUrl);
    this.header = new HeaderNav(page);
    this.cartSummary = page.locator('app-cart');
    this.cartRows = page.locator('app-cart tbody tr');
    this.cartTotal = page.getByTestId('cart-total');
    this.proceedStep1 = page.getByTestId('proceed-1');
    this.proceedStep2 = page.getByTestId('proceed-2');
    this.proceedStep3 = page.getByTestId('proceed-3');
    this.loginEmailInput = page.getByTestId('email');
    this.loginPasswordInput = page.getByTestId('password');
    this.loginSubmitButton = page.getByTestId('login-submit');
    this.houseNumberInput = page.getByTestId('house_number');
    this.streetInput = page.getByTestId('street');
    this.paymentMethodSelect = page.getByTestId('payment-method');
    this.confirmPaymentButton = page.getByTestId('finish');
    this.paymentErrorMessage = page.getByTestId('payment-error-message');
  }

  async open(): Promise<void> {
    await this.goto('/checkout');
  }

  async waitForCartLoaded(): Promise<void> {
    await expect(this.cartTotal).toBeVisible({ timeout: 15_000 });
  }

  /** Cart row whose product title is exactly `productName` (not a substring match). */
  row(productName: string): Locator {
    return this.cartRows.filter({
      has: this.page.getByTestId('product-title').filter({
        hasText: new RegExp(`^\\s*${escapeRegExp(productName)}\\s*$`),
      }),
    });
  }

  async expectRowCount(count: number): Promise<void> {
    await expect(this.cartRows, `Cart should contain ${count} row(s)`).toHaveCount(count);
  }

  /** Web-first check of one cart line: waits until quantity and both amounts settle. */
  async expectLineItem(productName: string, expected: ExpectedCartLine): Promise<void> {
    const row = this.row(productName);
    await expect(row, `Cart row for "${productName}"`).toHaveCount(1);
    await expect(row.getByTestId('product-quantity'), `Cart quantity for "${productName}"`).toHaveValue(
      String(expected.quantity),
    );
    await expectUsdText(
      row.getByTestId('product-price'),
      `Cart unit price for ${productName}`,
      expected.unitPriceCents,
    );
    await expectUsdText(row.getByTestId('line-price'), `Cart line total for ${productName}`, expected.lineTotalCents);
  }

  async expectCartTotal(expectedCents: number, field = 'Cart grand total'): Promise<void> {
    await expectUsdText(this.cartTotal, field, expectedCents);
  }

  async expectSummaryToContain(text: string): Promise<void> {
    await expect(this.cartSummary).toContainText(text);
  }

  async expectSummaryNotToContain(text: string): Promise<void> {
    await expect(this.cartSummary).not.toContainText(text);
  }

  /**
   * Point-in-time snapshot of the cart rows. Prefer expectLineItem()/expectCartTotal() for
   * assertions; use this only when the raw displayed text itself is under test.
   */
  async readCartRows(): Promise<CartRowObservation[]> {
    await this.waitForCartLoaded();
    const rows: CartRowObservation[] = [];
    for (const row of await this.cartRows.all()) {
      rows.push({
        title: ((await row.getByTestId('product-title').textContent()) || '').trim(),
        quantity: Number((await row.getByTestId('product-quantity').inputValue()).trim()),
        unitPriceText: ((await row.getByTestId('product-price').textContent()) || '').trim(),
        linePriceText: ((await row.getByTestId('line-price').textContent()) || '').trim(),
      });
    }
    return rows;
  }

  async removeRowByProductName(productName: string): Promise<void> {
    await this.waitForCartLoaded();
    const row = this.row(productName);
    await expect(row).toBeVisible();
    const deleteResponse = this.page.waitForResponse(
      (res) => /\/carts\/[^/]+\/product\//.test(res.url()) && res.request().method() === 'DELETE',
      { timeout: 15_000 },
    );
    await row.locator('a.btn-danger, button.btn-danger').first().click();
    const res = await deleteResponse;
    expect(res.status(), `Remove cart item API returned ${res.status()}`).toBeLessThan(400);
    await expect(this.row(productName)).toHaveCount(0);
  }

  async updateRowQuantity(productName: string, quantity: number): Promise<void> {
    await this.waitForCartLoaded();
    const row = this.row(productName);
    await expect(row).toBeVisible();
    const qtyInput = row.getByTestId('product-quantity');
    const putResponse = this.page.waitForResponse(
      (res) => /\/carts\/[^/]+\/product\/quantity/.test(res.url()) && res.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await qtyInput.fill(String(quantity));
    await qtyInput.press('Enter');
    const res = await putResponse;
    expect(res.status(), `Update cart quantity API returned ${res.status()}`).toBeLessThan(400);
  }

  async proceedFromCartToSignIn(): Promise<void> {
    await expect(this.proceedStep1).toBeEnabled();
    await this.proceedStep1.click();
  }

  async signInDuringCheckout(email: string, password: string): Promise<void> {
    await expect(this.loginEmailInput).toBeVisible();
    await this.loginEmailInput.fill(email);
    await this.loginPasswordInput.fill(password);
    await this.loginSubmitButton.click();
    await expect(this.proceedStep2).toBeVisible();
  }

  async proceedFromSignInToBillingAddress(): Promise<void> {
    await this.proceedStep2.click();
    await expect(this.houseNumberInput).toBeVisible();
  }

  /**
   * The billing step is pre-filled from the customer profile, but the profile has no
   * house number, which keeps "Proceed" disabled until one is entered. The profile is
   * applied asynchronously and would overwrite anything typed before it arrives, so we
   * wait for the street to be populated first.
   */
  async completeBillingAddress(houseNumber = '1'): Promise<void> {
    await expect(this.streetInput, 'Billing address should be pre-filled from the customer profile').not.toHaveValue(
      '',
    );
    if (!(await this.houseNumberInput.inputValue())) {
      await this.houseNumberInput.fill(houseNumber);
    }
    await expect(this.proceedStep3).toBeEnabled();
    await this.proceedStep3.click();
    await expect(this.paymentMethodSelect).toBeVisible();
  }

  async selectPaymentMethod(method: InvoicePayload['payment_method']): Promise<void> {
    await expect(this.paymentMethodSelect).toBeVisible();
    await this.paymentMethodSelect.selectOption(method);
  }

  async submitPayment(): Promise<void> {
    await expect(this.confirmPaymentButton).toBeEnabled();
    await this.confirmPaymentButton.click();
  }
}
