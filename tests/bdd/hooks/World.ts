import {
  chromium,
  firefox,
  webkit,
  request as playwrightRequest,
  selectors,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { World, setWorldConstructor, type IWorldOptions } from '@cucumber/cucumber';
import { resolveEnv, type EnvConfig } from '../../../src/config/env';
import { ApiClient, type ApiExchange } from '../../../src/api/ApiClient';
import { AuthApi, type AuthenticatedCustomer } from '../../../src/api/AuthApi';
import { ProductsApi, type Product } from '../../../src/api/ProductsApi';
import { CartApi } from '../../../src/api/CartApi';
import { InvoicesApi } from '../../../src/api/InvoicesApi';
import { CatalogPage } from '../../../src/pages/CatalogPage';
import { ProductDetailsPage } from '../../../src/pages/ProductDetailsPage';
import { AuthPage } from '../../../src/pages/AuthPage';
import { CheckoutWizardPage } from '../../../src/pages/CheckoutWizardPage';

let sharedWorkerBrowser: Browser | undefined;
let testIdConfigured = false;
const MAX_API_EXCHANGES = 10;

export async function ensureWorkerBrowser(browserName: string, headed: boolean): Promise<Browser> {
  if (!testIdConfigured) {
    selectors.setTestIdAttribute('data-test');
    testIdConfigured = true;
  }
  if (!sharedWorkerBrowser) {
    const engine = browserName === 'firefox' ? firefox : browserName === 'webkit' ? webkit : chromium;
    sharedWorkerBrowser = await engine.launch({ headless: !headed });
  }
  return sharedWorkerBrowser;
}

export async function closeWorkerBrowser(): Promise<void> {
  if (sharedWorkerBrowser) {
    await sharedWorkerBrowser.close();
    sharedWorkerBrowser = undefined;
  }
}

export interface StorefrontUi {
  page: Page;
  catalog: CatalogPage;
  productDetails: ProductDetailsPage;
  auth: AuthPage;
  checkout: CheckoutWizardPage;
}

export class ToolshopWorld extends World {
  public readonly env: EnvConfig;
  public readonly timeout: number;
  public readonly browserName: string;
  public readonly headed: boolean;

  public apiRequest!: APIRequestContext;
  public apiClient!: ApiClient;
  public authApi!: AuthApi;
  public productsApi!: ProductsApi;
  public cartApi!: CartApi;
  public invoicesApi!: InvoicesApi;
  /** The latest API calls of this scenario, attached to the report when it fails. */
  public readonly apiExchanges: ApiExchange[] = [];

  public context?: BrowserContext;
  public page?: Page;
  public tracing = false;
  public traceGroupOpen = false;
  private storefront?: StorefrontUi;

  // Scenario domain state (set by earlier steps, read via need())
  public activeCartId?: string;
  public selectedProduct?: Product;
  public selectedQuantity = 1;
  public selectedRental?: Product;
  public customer?: AuthenticatedCustomer;

  constructor(options: IWorldOptions) {
    super(options);
    this.env = resolveEnv(this.parameters?.targetEnv);
    this.timeout = Number(this.parameters?.timeout) || 30_000;
    this.browserName = String(this.parameters?.browser || 'chromium');
    this.headed = this.parameters?.headed === true;
  }

  /**
   * Reads scenario state that an earlier step must have set. Replaces non-null assertions (`!`),
   * which turn a mis-ordered or missing step into "Cannot read properties of undefined".
   */
  need<K extends keyof this>(key: K, setBy?: string): NonNullable<this[K]> {
    const value = this[key];
    if (value === undefined || value === null) {
      const hint = setBy ? `add a step like "${setBy}" earlier in the scenario` : 'an earlier step must set it';
      throw new Error(`Scenario state "${String(key)}" is not set: ${hint}.`);
    }
    return value as NonNullable<this[K]>;
  }

  /** Storefront page objects; fails clearly when a UI step is used in an @api (browserless) scenario. */
  ui(): StorefrontUi {
    if (!this.storefront) {
      throw new Error(
        'This step drives the storefront UI, but no browser was started: remove the @api tag from the scenario.',
      );
    }
    return this.storefront;
  }

  async ensureCustomer(tag = 'bdd'): Promise<AuthenticatedCustomer> {
    if (!this.customer) {
      this.customer = await this.authApi.createAuthenticatedCustomer(tag);
    }
    return this.customer;
  }

  async initApi(): Promise<void> {
    this.apiRequest = await playwrightRequest.newContext({
      baseURL: this.env.apiBaseUrl,
      extraHTTPHeaders: { Accept: 'application/json' },
    });
    this.apiClient = new ApiClient(this.apiRequest, this.env.apiBaseUrl, (exchange) => {
      this.apiExchanges.push(exchange);
      if (this.apiExchanges.length > MAX_API_EXCHANGES) this.apiExchanges.shift();
    });
    this.authApi = new AuthApi(this.apiClient);
    this.productsApi = new ProductsApi(this.apiClient);
    this.cartApi = new CartApi(this.apiClient);
    this.invoicesApi = new InvoicesApi(this.apiClient);
  }

  /**
   * Lazy browser context creation: only invoked for UI / Hybrid scenarios.
   * Pure @api scenarios never pay browser startup cost.
   */
  async initBrowser(): Promise<void> {
    const browser = await ensureWorkerBrowser(this.browserName, this.headed);
    this.context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      await this.context.tracing.start({ screenshots: true, snapshots: true });
      this.tracing = true;
    } catch (error) {
      this.log(`Could not start Playwright tracing: ${error}`);
    }
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.timeout);

    this.storefront = {
      page: this.page,
      catalog: new CatalogPage(this.page, this.env.uiBaseUrl),
      productDetails: new ProductDetailsPage(this.page, this.env.uiBaseUrl),
      auth: new AuthPage(this.page, this.env.uiBaseUrl),
      checkout: new CheckoutWizardPage(this.page, this.env.uiBaseUrl),
    };
  }

  async dispose(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = undefined;
      this.page = undefined;
      this.storefront = undefined;
    }
    if (this.apiRequest) {
      await this.apiRequest.dispose();
    }
  }
}

setWorldConstructor(ToolshopWorld);
