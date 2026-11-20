import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './base/BasePage';
import { HeaderNav } from '../components/HeaderNav';
import { CatalogFilters } from '../components/CatalogFilters';
import { expectUsdText } from '../domain/assertions';

export class CatalogPage extends BasePage {
  readonly header: HeaderNav;
  readonly filters: CatalogFilters;
  readonly productCards: Locator;

  constructor(page: Page, baseUrl: string) {
    super(page, baseUrl);
    this.header = new HeaderNav(page);
    this.filters = new CatalogFilters(page);
    this.productCards = page.locator('a[data-test^="product-"]');
  }

  async open(): Promise<void> {
    await this.goto('/');
    await expect(this.productCards.first()).toBeVisible();
  }

  cardByProductId(productId: string): Locator {
    return this.page.getByTestId(`product-${productId}`);
  }

  cardByName(productName: string): Locator {
    return this.productCards.filter({
      has: this.page.getByTestId('product-name').filter({ hasText: productName }),
    }).first();
  }

  async expectCardPrice(productName: string, expectedCents: number): Promise<void> {
    const card = this.cardByName(productName);
    await expect(card).toBeVisible();
    await expectUsdText(card.getByTestId('product-price'), `Catalog card price for ${productName}`, expectedCents);
  }

  async openProductById(productId: string): Promise<void> {
    await this.goto(`/product/${productId}`);
    await expect(this.page.getByTestId('product-name')).toBeVisible();
  }

  async openProductByName(productName: string): Promise<void> {
    const card = this.cardByName(productName);
    await expect(card).toBeVisible();
    await card.click();
    await expect(this.page).toHaveURL(/\/product\//);
    await expect(this.page.getByTestId('product-name')).toBeVisible();
  }
}
