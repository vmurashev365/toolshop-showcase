import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './base/BasePage';
import { HeaderNav } from '../components/HeaderNav';
import { expectUsdText } from '../domain/assertions';

export class ProductDetailsPage extends BasePage {
  readonly header: HeaderNav;
  readonly productName: Locator;
  readonly unitPrice: Locator;
  readonly quantityInput: Locator;
  readonly increaseQtyBtn: Locator;
  readonly addToCartButton: Locator;
  readonly outOfStockBadge: Locator;

  constructor(page: Page, baseUrl: string) {
    super(page, baseUrl);
    this.header = new HeaderNav(page);
    this.productName = page.getByTestId('product-name');
    this.unitPrice = page.getByTestId('unit-price');
    this.quantityInput = page.getByTestId('quantity');
    this.increaseQtyBtn = page.getByTestId('increase-quantity');
    this.addToCartButton = page.getByTestId('add-to-cart');
    this.outOfStockBadge = page.getByTestId('out-of-stock');
  }

  async open(productId: string): Promise<void> {
    await this.goto(`/product/${productId}`);
    await expect(this.productName).toBeVisible({ timeout: 15_000 });
  }

  /** The "$" sign is rendered outside [data-test="unit-price"], so a bare "14.15" is accepted. */
  async expectUnitPrice(expectedCents: number, field = 'Product detail price'): Promise<void> {
    await expectUsdText(this.unitPrice, field, expectedCents, { allowMissingCurrencySign: true });
  }

  async setQuantity(quantity: number): Promise<void> {
    await expect(this.quantityInput).toBeVisible();
    await this.quantityInput.fill(String(quantity));
  }

  async addToCart(quantity = 1): Promise<void> {
    if (quantity > 1) {
      await this.setQuantity(quantity);
    }
    await this.addToCartButton.scrollIntoViewIfNeeded();
    await expect(this.addToCartButton).toBeEnabled();

    const addResponse = this.page.waitForResponse(
      (res) => /\/carts\/[^/]+$/.test(res.url()) && res.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await this.addToCartButton.click();
    const res = await addResponse;
    expect(res.status(), `Add to cart API returned ${res.status()}`).toBeLessThan(400);
  }
}
