import type { ApiClient, ApiResult } from './ApiClient';
import { buildUniqueCustomer, type NewCustomerPayload } from '../data/factories';

export interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  dob?: string;
  address?: {
    street: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    postal_code: string | null;
  };
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface AuthenticatedCustomer {
  credentials: NewCustomerPayload;
  user: UserProfile;
  token: string;
}

export class AuthApi {
  constructor(private readonly client: ApiClient) {}

  register(payload: NewCustomerPayload): Promise<ApiResult<UserProfile>> {
    return this.client.post<UserProfile>('/users/register', payload);
  }

  login(email: string, password: string): Promise<ApiResult<LoginResponse>> {
    return this.client.post<LoginResponse>('/users/login', { email, password });
  }

  me(token: string): Promise<ApiResult<UserProfile>> {
    return this.client.get<UserProfile>('/users/me', token);
  }

  getUserById(userId: string, token: string): Promise<ApiResult<UserProfile | { error?: string }>> {
    return this.client.get(`/users/${userId}`, token);
  }

  async createAuthenticatedCustomer(tag = 'auto'): Promise<AuthenticatedCustomer> {
    const credentials = buildUniqueCustomer(tag);
    const reg = await this.register(credentials);
    if (reg.status !== 201) {
      throw new Error(`Register customer failed (${reg.status}): ${JSON.stringify(reg.body)}`);
    }
    const login = await this.login(credentials.email, credentials.password);
    if (login.status !== 200 || !login.body?.access_token) {
      throw new Error(`Login customer failed (${login.status}): ${JSON.stringify(login.body)}`);
    }
    return {
      credentials,
      user: reg.body,
      token: login.body.access_token,
    };
  }
}
