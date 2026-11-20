import { randomUUID } from 'node:crypto';

export interface CustomerAddress {
  street: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
}

export interface NewCustomerPayload {
  first_name: string;
  last_name: string;
  address: CustomerAddress;
  phone: string;
  dob: string;
  password: string;
  email: string;
}

export function buildUniqueCustomer(tag = 'e2e', addressOverride?: Partial<CustomerAddress>): NewCustomerPayload {
  const uid = randomUUID().replaceAll('-', '').slice(0, 10);
  return {
    first_name: `QA_${tag}`,
    last_name: 'Buyer',
    address: {
      street: '100 Main Street',
      city: 'Vienna',
      state: 'Vienna',
      country: 'AT',
      postal_code: '1010',
      ...addressOverride,
    },
    phone: '0612345678',
    dob: '1992-04-18',
    password: `Qa!${uid}9Aa`,
    email: `qa.${tag}.${uid}@example.test`,
  };
}
