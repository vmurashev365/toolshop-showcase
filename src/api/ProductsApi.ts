import type { ApiClient, ApiResult } from './ApiClient';

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  is_location_offer: boolean;
  is_rental: boolean;
  co2_rating: string;
  in_stock: boolean;
  is_eco_friendly: boolean;
}

export interface PaginatedProducts {
  current_page: number;
  last_page: number;
  total: number;
  data: Product[];
}

export class ProductsApi {
  /**
   * One instance lives for a single test / scenario, so the catalog is read at most once per
   * test instead of re-scanning up to 6 pages for every find*() call. Products keep page order,
   * so a larger cached sample returns the same first match as a smaller one would.
   */
  private catalogSample?: { pages: number; items: Promise<Product[]> };

  constructor(private readonly client: ApiClient) {}

  list(query = ''): Promise<ApiResult<PaginatedProducts>> {
    const suffix = query ? (query.startsWith('?') ? query : `?${query}`) : '';
    return this.client.get<PaginatedProducts>(`/products${suffix}`);
  }

  getById(productId: string): Promise<ApiResult<Product>> {
    return this.client.get<Product>(`/products/${productId}`);
  }

  fetchCatalogSample(pages = 3): Promise<Product[]> {
    if (!this.catalogSample || this.catalogSample.pages < pages) {
      const items = this.loadCatalogPages(pages).catch((error: unknown) => {
        this.catalogSample = undefined;
        throw error;
      });
      this.catalogSample = { pages, items };
    }
    return this.catalogSample.items;
  }

  private async loadCatalogPages(pages: number): Promise<Product[]> {
    const items: Product[] = [];
    for (let page = 1; page <= pages; page += 1) {
      const res = await this.list(`page=${page}`);
      if (res.status !== 200 || !Array.isArray(res.body?.data)) break;
      items.push(...res.body.data);
      if (page >= res.body.last_page) break;
    }
    return items;
  }

  async findInStockRetailProduct(): Promise<Product> {
    const products = await this.fetchCatalogSample(3);
    const match = products.find((p) => p.in_stock && !p.is_rental && !p.is_location_offer)
      ?? products.find((p) => p.in_stock && !p.is_rental);
    if (!match) throw new Error('Catalog has no in-stock retail product on pages 1..3.');
    return match;
  }

  async findInStockRetailProducts(count = 2): Promise<Product[]> {
    const products = await this.fetchCatalogSample(5);
    const matches = products.filter((p) => p.in_stock && !p.is_rental);
    if (matches.length < count) {
      throw new Error(`Catalog returned only ${matches.length} in-stock retail products; needed ${count}.`);
    }
    return matches.slice(0, count);
  }

  async findNonLocationOfferRetailProduct(): Promise<Product> {
    const products = await this.fetchCatalogSample(5);
    const match = products.find((p) => p.in_stock && !p.is_rental && !p.is_location_offer);
    if (!match) throw new Error('Catalog has no in-stock non-location-offer retail product on pages 1..5.');
    return match;
  }

  async findEcoFriendlyProduct(): Promise<Product> {
    const products = await this.fetchCatalogSample(6);
    const match = products.find((p) => p.in_stock && !p.is_rental && p.is_eco_friendly);
    if (!match) throw new Error('Catalog has no in-stock eco-friendly retail product on pages 1..6.');
    return match;
  }

  async findNonEcoRetailProduct(): Promise<Product> {
    const products = await this.fetchCatalogSample(5);
    const match = products.find((p) => p.in_stock && !p.is_rental && !p.is_eco_friendly && !p.is_location_offer)
      ?? products.find((p) => p.in_stock && !p.is_rental && !p.is_eco_friendly);
    if (!match) throw new Error('Catalog has no in-stock non-eco retail product on pages 1..5.');
    return match;
  }

  async findOutOfStockRetailProduct(): Promise<Product> {
    const products = await this.fetchCatalogSample(5);
    const match = products.find((p) => !p.in_stock && !p.is_rental);
    if (!match) throw new Error('Catalog has no out-of-stock retail product on pages 1..5.');
    return match;
  }

  async findLocationOfferProduct(): Promise<Product> {
    const products = await this.fetchCatalogSample(3);
    const match = products.find((p) => p.is_location_offer && p.in_stock && !p.is_rental);
    if (!match) throw new Error('Catalog has no in-stock location-offer product on pages 1..3.');
    return match;
  }

  async findRentalProduct(): Promise<Product> {
    const res = await this.list('is_rental=true');
    const match = res.body?.data?.[0];
    if (res.status !== 200 || !match) {
      throw new Error(`Catalog returned no rental product (${res.status}).`);
    }
    return match;
  }

  async findRentalProducts(count = 2): Promise<Product[]> {
    const res = await this.list('is_rental=true');
    const rentals = Array.isArray(res.body?.data) ? res.body.data : [];
    if (res.status !== 200 || rentals.length < count) {
      throw new Error(`Catalog returned only ${rentals.length} rental products; needed ${count}.`);
    }
    return rentals.slice(0, count);
  }
}
