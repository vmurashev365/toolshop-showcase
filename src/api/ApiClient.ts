import type { APIRequestContext, APIResponse } from '@playwright/test';

export interface ApiResult<T = unknown> {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: T;
}

/** One request and its parsed response, reported to the optional observer. */
export interface ApiExchange {
  method: string;
  url: string;
  requestBody?: unknown;
  status: number;
  responseBody: unknown;
}

export class ApiClient {
  constructor(
    public readonly request: APIRequestContext,
    public readonly baseUrl: string,
    private readonly onExchange?: (exchange: ApiExchange) => void,
  ) {}

  private record<T>(method: string, url: string, requestBody: unknown, result: ApiResult<T>): ApiResult<T> {
    this.onExchange?.({ method, url, requestBody, status: result.status, responseBody: result.body });
    return result;
  }

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
    const url = this.url(path);
    const res = await this.request.get(url, { headers: this.headers(token) });
    return this.record('GET', url, undefined, await this.parse<T>(res));
  }

  async post<T = unknown>(path: string, data?: unknown, token?: string): Promise<ApiResult<T>> {
    const url = this.url(path);
    const res = await this.request.post(url, {
      headers: this.headers(token, data !== undefined),
      data,
    });
    return this.record('POST', url, data, await this.parse<T>(res));
  }

  async put<T = unknown>(path: string, data?: unknown, token?: string): Promise<ApiResult<T>> {
    const url = this.url(path);
    const res = await this.request.put(url, {
      headers: this.headers(token, data !== undefined),
      data,
    });
    return this.record('PUT', url, data, await this.parse<T>(res));
  }

  async delete<T = unknown>(path: string, token?: string): Promise<ApiResult<T>> {
    const url = this.url(path);
    const res = await this.request.delete(url, { headers: this.headers(token) });
    return this.record('DELETE', url, undefined, await this.parse<T>(res));
  }
}
