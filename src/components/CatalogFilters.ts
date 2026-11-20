import type { Locator, Page } from '@playwright/test';

export class CatalogFilters {
  /**
   * FIND-06 guardrail: on mobile, Toolshop uses data-test="filters" on BOTH
   * the toggle button and the #filters container. Scope explicitly to avoid strict-mode collisions.
   */
  readonly mobileToggleButton: Locator;
  readonly container: Locator;
  readonly sortSelect: Locator;
  readonly searchInput: Locator;
  readonly searchSubmit: Locator;
  readonly searchReset: Locator;
  readonly ecoFriendlyCheckbox: Locator;

  constructor(private readonly page: Page) {
    this.mobileToggleButton = page.locator('a[data-test="filters"], button[data-test="filters"]').first();
    this.container = page.locator('#filters');
    this.sortSelect = page.getByTestId('sort');
    this.searchInput = page.getByTestId('search-query');
    this.searchSubmit = page.getByTestId('search-submit');
    this.searchReset = page.getByTestId('search-reset');
    this.ecoFriendlyCheckbox = page.getByTestId('eco-friendly-filter');
  }

  async ensureVisible(): Promise<void> {
    if (!(await this.container.isVisible()) && (await this.mobileToggleButton.isVisible())) {
      await this.mobileToggleButton.click();
      await this.container.waitFor({ state: 'visible' });
    }
  }

  async search(query: string): Promise<void> {
    await this.ensureVisible();
    await this.searchInput.fill(query);
    await this.searchSubmit.click();
  }

  async toggleEcoFriendly(): Promise<void> {
    await this.ensureVisible();
    await this.ecoFriendlyCheckbox.click();
  }
}
