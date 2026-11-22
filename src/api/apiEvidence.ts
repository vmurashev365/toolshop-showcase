import type { ApiExchange } from './ApiClient';

/** Field names whose values must never reach a published report. */
const SECRET_KEY = /password|token|secret|authorization|api[-_]?key/i;
/** A JSON Web Token found in any string value, whatever its field name. */
const JWT = /^eyJ[\w-]+\.[\w-]+\.[\w-]*$/;
const MAX_BODY_CHARS = 8_000;
const MAX_STRING_CHARS = 200;
const MAX_ARRAY_ITEMS = 5;

/** Deep copy with secret fields and token-shaped strings replaced by "[redacted]". */
export function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string') return JWT.test(value) ? '[redacted]' : value;
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, SECRET_KEY.test(key) ? '[redacted]' : redactSecrets(item)]),
    );
  }
  return value;
}

/** Keeps the structure readable: long strings and arrays are shortened. */
function abridge(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_STRING_CHARS ? `${value.slice(0, MAX_STRING_CHARS)}…` : value;
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map(abridge);
    return value.length > MAX_ARRAY_ITEMS ? [...items, `… ${value.length - MAX_ARRAY_ITEMS} more items`] : items;
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, abridge(item)]));
  }
  return value;
}

/**
 * Small bodies are kept as they are. A larger body is abridged, and one that is still too large
 * is replaced by the start of its JSON text.
 */
function bounded(body: unknown): unknown {
  const text = JSON.stringify(body);
  if (text === undefined || text.length <= MAX_BODY_CHARS) return body;
  const abridged = abridge(body);
  const abridgedText = JSON.stringify(abridged);
  if (abridgedText.length <= MAX_BODY_CHARS) return abridged;
  return `${abridgedText.slice(0, MAX_BODY_CHARS)}… (truncated, ${text.length} characters in total)`;
}

/**
 * Report attachment for the recent API calls, oldest first. Secrets are redacted because the
 * BDD report is published on GitHub Pages.
 */
export function formatApiExchanges(exchanges: readonly ApiExchange[]): string {
  return JSON.stringify(
    exchanges.map(({ method, url, requestBody, status, responseBody }) => ({
      request: `${method} ${url}`,
      ...(requestBody === undefined ? {} : { requestBody: bounded(redactSecrets(requestBody)) }),
      status,
      responseBody: bounded(redactSecrets(responseBody)),
    })),
    null,
    2,
  );
}
