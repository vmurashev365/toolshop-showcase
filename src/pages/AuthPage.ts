import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './base/BasePage';

export class AuthPage extends BasePage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginSubmit: Locator;

  constructor(page: Page, baseUrl: string) {
    super(page, baseUrl);
    this.emailInput = page.getByTestId('email');
    this.passwordInput = page.getByTestId('password');
    this.loginSubmit = page.getByTestId('login-submit');
  }

  async openLogin(): Promise<void> {
    await this.goto('/auth/login');
    await expect(this.emailInput).toBeVisible();
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginSubmit.click();
  }

  /**
   * Hybrid UI+API fast auth: injects JWT token into sessionStorage/localStorage
   * before navigating, skipping redundant UI login forms in non-auth tests.
   */
  async injectAuthToken(token: string): Promise<void> {
    await this.page.addInitScript((jwt) => {
      window.sessionStorage.setItem('auth-token', jwt);
      window.localStorage.setItem('auth-token', jwt);
    }, token);
  }
}
