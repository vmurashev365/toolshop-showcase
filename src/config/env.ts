export type TargetEnv = 'live' | 'with-bugs' | 'local';

export interface EnvConfig {
  target: TargetEnv;
  uiBaseUrl: string;
  apiBaseUrl: string;
}

const PRESETS: Record<TargetEnv, { uiBaseUrl: string; apiBaseUrl: string }> = {
  live: {
    uiBaseUrl: 'https://practicesoftwaretesting.com',
    apiBaseUrl: 'https://api.practicesoftwaretesting.com',
  },
  'with-bugs': {
    uiBaseUrl: 'https://with-bugs.practicesoftwaretesting.com',
    apiBaseUrl: 'https://api-with-bugs.practicesoftwaretesting.com',
  },
  local: {
    uiBaseUrl: 'http://localhost:4200',
    apiBaseUrl: 'http://localhost:8091',
  },
};

function resolveBaseUrl(variable: 'UI_BASE_URL' | 'API_BASE_URL', fallback: string, target: TargetEnv): string {
  const value = process.env[variable] || fallback;
  const url = new URL(value);
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    throw new Error(`${variable} must be an HTTP(S) URL without credentials.`);
  }
  if (target === 'local' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error(`${variable} must use a loopback host when TARGET_ENV=local.`);
  }
  return value;
}

export function resolveEnv(overrideTarget?: string): EnvConfig {
  const raw = (overrideTarget ?? process.env.TARGET_ENV ?? 'local').toLowerCase();
  if (raw !== 'local' && raw !== 'live' && raw !== 'with-bugs') {
    throw new Error(`Invalid TARGET_ENV ${JSON.stringify(raw)}. Choose local, live, or with-bugs.`);
  }

  const preset = PRESETS[raw];
  return {
    target: raw,
    uiBaseUrl: resolveBaseUrl('UI_BASE_URL', preset.uiBaseUrl, raw),
    apiBaseUrl: resolveBaseUrl('API_BASE_URL', preset.apiBaseUrl, raw),
  };
}
