import type { ApiClient, ApiResult } from './ApiClient';

export interface BillingAddress {
  billing_street: string;
  billing_city: string;
  billing_state: string;
  billing_country: string;
  billing_postal_code: string;
}

export interface InvoicePayload extends BillingAddress {
  payment_method: 'bank-transfer' | 'cash-on-delivery' | 'credit-card' | 'buy-now-pay-later' | 'gift-card';
  payment_details: Record<string, unknown>;
  cart_id: string;
  [extraField: string]: unknown;
}

export interface GuestInvoicePayload extends InvoicePayload {
  guest_email: string;
  guest_first_name: string;
  guest_last_name: string;
}

export interface PostcodeLookupResponse {
  street: string;
  house_number: string;
  city: string;
  state: string;
  country: string;
  postcode: string;
}

export interface InvoiceResponse {
  id: string;
  invoice_number: string;
  user_id?: string | null;
  subtotal?: number | null;
  additional_discount_percentage?: number | null;
  additional_discount_amount?: number | null;
  eco_discount_percentage?: number | null;
  eco_discount_amount?: number | null;
  total: number;
  status?: string;
}

export class InvoicesApi {
  constructor(private readonly client: ApiClient) {}

  postcodeLookup(country: string, postcode: string): Promise<ApiResult<PostcodeLookupResponse>> {
    const qs = new URLSearchParams({ country, postcode }).toString();
    return this.client.get<PostcodeLookupResponse>(`/postcode-lookup?${qs}`);
  }

  async resolveValidBillingAddress(country = 'NL', postcode = '1012LG'): Promise<BillingAddress> {
    const res = await this.postcodeLookup(country, postcode);
    if (res.status !== 200 || !res.body?.city) {
      throw new Error(`Postcode lookup failed (${res.status}): ${JSON.stringify(res.body)}`);
    }
    return {
      billing_street: res.body.street,
      billing_city: res.body.city,
      billing_state: res.body.state,
      billing_country: res.body.country,
      billing_postal_code: res.body.postcode,
    };
  }

  paymentCheck(
    paymentMethod: InvoicePayload['payment_method'],
    paymentDetails: Record<string, unknown>,
    token?: string,
  ): Promise<ApiResult<unknown>> {
    return this.client.post(
      '/payment/check',
      { payment_method: paymentMethod, payment_details: paymentDetails },
      token,
    );
  }

  create(payload: InvoicePayload, token?: string): Promise<ApiResult<InvoiceResponse>> {
    return this.client.post<InvoiceResponse>('/invoices', payload, token);
  }

  createGuest(payload: GuestInvoicePayload): Promise<ApiResult<InvoiceResponse>> {
    return this.client.post<InvoiceResponse>('/invoices/guest', payload);
  }

  getById(invoiceId: string, token: string): Promise<ApiResult<InvoiceResponse>> {
    return this.client.get<InvoiceResponse>(`/invoices/${invoiceId}`, token);
  }

  updateStatus(invoiceId: string, status: string, token: string): Promise<ApiResult<unknown>> {
    return this.client.put(`/invoices/${invoiceId}/status`, { status }, token);
  }

  getOpenApiSpec(): Promise<ApiResult<{ paths: Record<string, Record<string, { security?: unknown }>> }>> {
    return this.client.get('/docs');
  }
}
