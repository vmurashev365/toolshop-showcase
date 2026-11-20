import type { APIRequestContext, APIResponse } from '@playwright/test';

export interface ApiResult<T = unknown> {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: T;
}

export class ApiClient {
  constructor(
    public readonly request: APIRequestContext,
    public readonly baseUrl: string,
  ) {}

  private url(path: string): string {
    const cleanBase = this.baseUrl.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanBase}${cleanPath}`;
  }

  private headers(token?: string, hasBody = false): Record<string, string> {
    const hdrs: Record<string, string> = { Accept: 'application/json' };
    if (hasBody) hdrs['Content-Type'] = 'application/json';
    if (token) hdrs['Authorization'] = `Bearer ${token}`;
    return hdrs;
  }

  private async parse<T>(response: APIResponse): Promise<ApiResult<T>> {
    const contentType = response.headers()['content-type'] || '';
    let body: unknown;
    if (contentType.includes('application/json')) {
      body = await response.json().catch(() => null);
    } else {
      body = await response.text().catch(() => '');
    }
    return {
      status: response.status(),
      ok: response.ok(),
      headers: response.headers(),
      body: body as T,
    };
  }

  async get<T = unknown>(path: string, token?: string): Promise<ApiResult<T>> {
    const res = await this.request.get(this.url(path), { headers: this.headers(token) });
    return this.parse<T>(res);
  }

  async post<T = unknown>(path: string, data?: unknown, token?: string): Promise<ApiResult<T>> {
    const res = await this.request.post(this.url(path), {
      headers: this.headers(token, data !== undefined),
      data,
    });
    return this.parse<T>(res);
  }

  async put<T = unknown>(path: string, data?: unknown, token?: string): Promise<ApiResult<T>> {
    const res = await this.request.put(this.url(path), {
      headers: this.headers(token, data !== undefined),
      data,
    });
    return this.parse<T>(res);
  }

  async delete<T = unknown>(path: string, token?: string): Promise<ApiResult<T>> {
    const res = await this.request.delete(this.url(path), { headers: this.headers(token) });
    return this.parse<T>(res);
  }
}
