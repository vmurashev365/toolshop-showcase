import { resolveEnv } from '../src/config/env';

async function checkLocalToolshop(): Promise<void> {
  const { target, uiBaseUrl, apiBaseUrl } = resolveEnv();
  if (target !== 'local') throw new Error('The PR gate requires TARGET_ENV=local.');

  const options = { redirect: 'error', signal: AbortSignal.timeout(5_000) } as const;
  const catalogUrl = new URL('products?page=1', apiBaseUrl.replace(/\/?$/, '/'));
  const [ui, api] = await Promise.all([
    fetch(uiBaseUrl, options).catch((cause: unknown) => {
      throw new Error('UI unavailable at ' + uiBaseUrl, { cause });
    }),
    fetch(catalogUrl, options).catch((cause: unknown) => {
      throw new Error('Catalog API unavailable at ' + catalogUrl.href, { cause });
    }),
  ]);
  if (ui.status !== 200 || !ui.headers.get('content-type')?.includes('text/html')) {
    throw new Error('UI readiness at ' + uiBaseUrl + ' returned HTTP ' + ui.status + ' or non-HTML content.');
  }
  if (api.status !== 200) throw new Error('Catalog API readiness returned HTTP ' + api.status + '.');
  const { data } = await api.json() as { data?: unknown };
  if (!Array.isArray(data) || data.length === 0) throw new Error('Catalog API did not return seeded products.');
}

checkLocalToolshop().catch((error: unknown) => {
  console.error('Local Toolshop is unavailable.', error);
  process.exitCode = 1;
});
