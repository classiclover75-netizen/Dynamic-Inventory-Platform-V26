type UnauthorizedListener = () => void;

let activeListener: UnauthorizedListener | null = null;
let guardInstalled = false;

export function setUnauthorizedListener(listener: UnauthorizedListener | null): void {
  activeListener = listener;
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isAuthBootstrapCall(url: string): boolean {
  return url.includes('/api/auth/login')
    || url.includes('/api/auth/setup')
    || url.includes('/api/auth/status')
    || url.includes('/api/auth/logout');
}

export function installAuthFetchGuard(): void {
  if (guardInstalled) return;
  guardInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await originalFetch(...args);
    try {
      const url = resolveUrl(args[0]);
      if (response.status === 401 && url.startsWith('/api') && !isAuthBootstrapCall(url) && activeListener) {
        activeListener();
      }
    } catch {
    }
    return response;
  };
}
