import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveEnv } from '../../src/config/env';

test('target resolution defaults to loopback and rejects typos and remote local overrides', (context) => {
  const originalEnv = process.env;
  process.env = {};
  context.after(() => {
    process.env = originalEnv;
  });
  assert.equal(resolveEnv().target, 'local');
  assert.equal(resolveEnv().apiBaseUrl, 'http://localhost:8091');
  assert.equal(resolveEnv('live').target, 'live');
  process.env.TARGET_ENV = 'locla';
  assert.throws(() => resolveEnv(), /Invalid TARGET_ENV/);
  process.env.TARGET_ENV = '';
  assert.throws(() => resolveEnv(), /Invalid TARGET_ENV/);
  process.env.TARGET_ENV = 'local';
  process.env.API_BASE_URL = 'https://api.practicesoftwaretesting.com';
  assert.throws(() => resolveEnv(), /API_BASE_URL must use a loopback host/);
  process.env.API_BASE_URL = 'http://127.0.0.1:9091';
  assert.equal(resolveEnv().apiBaseUrl, 'http://127.0.0.1:9091');
});
