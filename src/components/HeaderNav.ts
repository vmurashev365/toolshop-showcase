import { expect, type Locator, type Page } from '@playwright/test';

export type StorefrontLanguage = 'en' | 'de' | 'es' | 'fr' | 'nl' | 'tr';

export const STOREFRONT_LANGUAGES: readonly StorefrontLanguage[] = ['en', 'de', 'es', 'fr', 'nl', 'tr'];

export class HeaderNav {
  readonly toggler: Locator;
  readonly cartLink: Locator;
  readonly cartQuantity: Locator;
  readonly signInLink: Locator;
  readonly userMenu: Locator;
  readonly languageSelect: Locator;

  constructor(private readonly page: Page) {
    this.toggler = page.locator('button.navbar-toggler');
    this.cartLink = page.getByTestId('nav-cart');
    this.cartQuantity = page.getByTestId('cart-quantity');
    this.signInLink = page.getByTestId('nav-sign-in');
    this.userMenu = page.getByTestId('nav-menu');
    this.languageSelect = page.getByTestId('language-select');
  }

  /**
   * FIND-04 guardrail: on mobile viewports (<992px) Toolshop collapses nav-cart
   * inside the Bootstrap hamburger menu. Open the menu only when required and
   * wait for the collapse animation to finish before interacting with it.
   */
  async ensureNavExpanded(): Promise<void> {
    if (!(await this.toggler.isVisible())) return;
    if ((await this.toggler.getAttribute('aria-expanded')) !== 'true') {
      await this.toggler.click();
      await expect(this.toggler).toHaveAttribute('aria-expanded', 'true');
    }
    await expect(this.cartLink).toBeVisible();
  }

  async openCart(): Promise<void> {
    await this.ensureNavExpanded();
    await this.cartLink.click();
    await expect(this.page).toHaveURL(/\/checkout/);
  }

  /**
   * Web-first badge check: waits for the badge to show the expected count
   * (it updates asynchronously after the add-to-cart / quantity API call).
   */
  async expectCartBadgeCount(expected: number): Promise<void> {
    await this.ensureNavExpanded();
    if (expected === 0) {
      await expect(this.cartQuantity, 'Cart badge should be hidden for an empty cart').toBeHidden();
      return;
    }
    await expect(this.cartQuantity, `Cart badge should show ${expected}`).toHaveText(String(expected));
  }

  async switchLanguage(langCode: StorefrontLanguage): Promise<void> {
    await this.ensureNavExpanded();
    await this.languageSelect.click();
    await this.page.getByTestId(`lang-${langCode}`).click();
  }
}
