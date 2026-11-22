import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatApiExchanges, redactSecrets } from '../../src/api/apiEvidence';

const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';

test('redacts secret fields and token-shaped strings at any depth without changing the input', () => {
  const login = {
    email: 'shopper@example.test',
    password: 'Secret#1',
    profile: [{ new_password: 'x', apiKey: 'k', note: jwt }],
    access_token: jwt,
  };
  assert.deepEqual(redactSecrets(login), {
    email: 'shopper@example.test',
    password: '[redacted]',
    profile: [{ new_password: '[redacted]', apiKey: '[redacted]', note: '[redacted]' }],
    access_token: '[redacted]',
  });
  assert.equal(login.password, 'Secret#1');
});

test('formats exchanges in call order and omits a missing request body', () => {
  const report = JSON.parse(
    formatApiExchanges([
      {
        method: 'POST',
        url: 'http://127.0.0.1:8091/users/login',
        requestBody: { email: 'a@b.test', password: 'p' },
        status: 200,
        responseBody: { access_token: jwt, expires_in: 300 },
      },
      { method: 'GET', url: 'http://127.0.0.1:8091/carts/1', status: 404, responseBody: { message: 'Not found' } },
    ]),
  );
  assert.deepEqual(report, [
    {
      request: 'POST http://127.0.0.1:8091/users/login',
      requestBody: { email: 'a@b.test', password: '[redacted]' },
      status: 200,
      responseBody: { access_token: '[redacted]', expires_in: 300 },
    },
    { request: 'GET http://127.0.0.1:8091/carts/1', status: 404, responseBody: { message: 'Not found' } },
  ]);
});

test('abridges a large body but keeps its structure', () => {
  const products = Array.from({ length: 9 }, (_, i) => ({ name: `Product ${i}`, description: 'd'.repeat(1_000) }));
  const [entry] = JSON.parse(
    formatApiExchanges([
      { method: 'GET', url: '/products', status: 200, responseBody: { current_page: 1, data: products } },
    ]),
  );
  assert.equal(entry.responseBody.current_page, 1);
  assert.equal(entry.responseBody.data.length, 6);
  assert.deepEqual(entry.responseBody.data[0], { name: 'Product 0', description: `${'d'.repeat(200)}…` });
  assert.equal(entry.responseBody.data[5], '… 4 more items');
});

test('truncates a body that stays too large after abridging', () => {
  const wide = Object.fromEntries(Array.from({ length: 2_000 }, (_, i) => [`field${i}`, i]));
  const [entry] = JSON.parse(formatApiExchanges([{ method: 'GET', url: '/wide', status: 200, responseBody: wide }]));
  assert.equal(typeof entry.responseBody, 'string');
  assert.match(entry.responseBody, /^\{"field0":0,.*… \(truncated, \d+ characters in total\)$/);
  assert.ok(entry.responseBody.length < 8_100);
});
