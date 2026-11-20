import { test, expect, expectKnownDiscrepancy } from '../fixtures';

test.describe('Security, RBAC & Payment Validation (API) @blocker-security', () => {
  test('TC-SEC-001: blocks cross-user BOLA/IDOR access on GET /users/{otherUserId}', async ({ authApi }) => {
    const customerA = await authApi.createAuthenticatedCustomer('bolaA');
    const customerB = await authApi.createAuthenticatedCustomer('bolaB');

    const crossRead = await authApi.getUserById(customerA.user.id, customerB.token);
    expect([403, 404]).toContain(crossRead.status);
  });

  test('TC-SEC-002: rejects unauthenticated invoice creation with 401', async ({ cartApi, invoicesApi }) => {
    const cart = await cartApi.create();
    expect(cart.status).toBe(201);

    const res = await invoicesApi.create({
      billing_street: '100 Main Street',
      billing_city: 'Vienna',
      billing_state: 'Vienna',
      billing_country: 'AT',
      billing_postal_code: '1010',
      payment_method: 'cash-on-delivery',
      payment_details: {},
      cart_id: cart.body.id,
    });
    expect(res.status).toBe(401);
  });

  test('TC-SEC-004: /payment/check rejects expired credit card and short CVV, accepts COD', async ({
    authApi,
    invoicesApi,
  }) => {
    const customer = await authApi.createAuthenticatedCustomer('pay');

    const badCard = await invoicesApi.paymentCheck(
      'credit-card',
      {
        credit_card_number: '1111-1111-1111-1111',
        expiration_date: '01/2020',
        cvv: '12',
        card_holder_name: 'QA Buyer',
      },
      customer.token,
    );
    expect(badCard.status).toBe(422);

    const cod = await invoicesApi.paymentCheck('cash-on-delivery', {}, customer.token);
    expect(cod.status).toBe(200);
  });

  test('TC-SEC-003: OpenAPI contract requires authentication on PUT /products/{productId} @known-spec-discrepancy', async ({
    invoicesApi,
  }) => {
    // Non-destructive audit of FIND-01 so we never mutate catalog prices on the shared public sandbox.
    const spec = await invoicesApi.getOpenApiSpec();
    expect(spec.status).toBe(200);

    const putProduct = spec.body?.paths?.['/products/{productId}']?.put;
    expect(putProduct, 'PUT /products/{productId} missing from OpenAPI spec').toBeDefined();
    await expectKnownDiscrepancy('FIND-01', () => {
      expect(
        putProduct?.security,
        'PUT /products/{productId} must declare an OpenAPI security scheme (live probe confirmed customer price mutation).',
      ).toBeTruthy();
    });
  });
});
