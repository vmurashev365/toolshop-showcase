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

export function resolveEnv(overrideTarget?: string): EnvConfig {
  const raw = (overrideTarget || process.env.TARGET_ENV || 'live').toLowerCase();
  const target: TargetEnv =
    raw === 'with-bugs' || raw === 'local' || raw === 'live' ? raw : 'live';
  const preset = PRESETS[target];

  return {
    target,
    uiBaseUrl: process.env.UI_BASE_URL || preset.uiBaseUrl,
    apiBaseUrl: process.env.API_BASE_URL || preset.apiBaseUrl,
  };
}
