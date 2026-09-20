const BOOTSTRAP_CACHE_KEY = 'galatime.bootstrap.v1';

export interface BootstrapData {
  locale: string;
  cachedAt: number;
  translations: Record<string, unknown>;
}

export async function loadAndCacheBootstrap(locale: string, translations: Record<string, unknown>): Promise<BootstrapData> {
  // Keep the loaded translation bundle available before the game starts.
  await new Promise<void>((resolve) => window.setTimeout(resolve, 220));

  const data: BootstrapData = { locale, cachedAt: Date.now(), translations };
  try {
    window.localStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify(data));
  } catch {
    // The game can still start if browser storage is disabled.
  }
  return data;
}
