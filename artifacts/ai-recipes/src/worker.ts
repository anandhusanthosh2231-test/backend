export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  API_URL?: string;
}

const HOME_CACHE_FRESH_MS = 5 * 60 * 1000;
const HOME_CACHE_RETENTION_SECONDS = 24 * 60 * 60;
const publicGetRequestsInFlight = new Map<string, Promise<Response>>();

function isCacheablePublicGet(pathname: string): boolean {
  return pathname === '/api/home'
    || pathname === '/api/recipes'
    || pathname === '/api/categories'
    || pathname === '/api/audiences'
    || /^\/api\/(?:recipes|categories|audiences)\/[^/]+(?:\/related)?$/.test(pathname);
}

async function fetchAndCachePublicGet(
  cacheKey: Request,
  proxyRequest: Request,
  edgeCache: Cache,
  context?: { waitUntil(promise: Promise<unknown>): void },
): Promise<Response> {
  const key = cacheKey.url;
  const pendingRequest = publicGetRequestsInFlight.get(key);
  if (pendingRequest) return (await pendingRequest).clone();

  const requestPromise = (async () => {
    const response = await fetch(proxyRequest);
    const headers = new Headers(response.headers);
    if (response.ok && !headers.has('Set-Cookie')) {
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      headers.set('X-Public-API-Cache-Timestamp', Date.now().toString());
      headers.set('Cache-Control', `public, max-age=${HOME_CACHE_RETENTION_SECONDS}`);
      const cacheableResponse = new Response(response.clone().body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      const cacheWrite = edgeCache.put(cacheKey, cacheableResponse.clone())
        .catch((error: unknown) => {
          console.error('Failed to cache public API response', error);
        });
      if (context) {
        context.waitUntil(cacheWrite);
      } else {
        await cacheWrite;
      }
    }
    return response;
  })();
  publicGetRequestsInFlight.set(key, requestPromise);

  try {
    return (await requestPromise).clone();
  } finally {
    if (publicGetRequestsInFlight.get(key) === requestPromise) {
      publicGetRequestsInFlight.delete(key);
    }
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    context?: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api')) {
      const cacheablePublicGet = request.method === 'GET'
        && isCacheablePublicGet(url.pathname)
        && !request.headers.has('Authorization');
      const cacheKey = cacheablePublicGet
        ? new Request(url.toString(), { method: 'GET' })
        : null;
      const edgeCache = cacheKey
        ? (caches as CacheStorage & { default: Cache }).default
        : null;
      const cachedResponse = cacheKey && edgeCache
        ? await edgeCache.match(cacheKey)
        : undefined;
      if (cachedResponse) {
        const cachedTimestamp = cachedResponse.headers.get('X-Public-API-Cache-Timestamp')
          ?? cachedResponse.headers.get('X-Home-Cache-Timestamp');
        const cachedAt = Number(cachedTimestamp);
        if (!Number.isFinite(cachedAt) || Date.now() - cachedAt < HOME_CACHE_FRESH_MS) {
          const headers = new Headers(cachedResponse.headers);
          headers.delete('X-Public-API-Cache-Timestamp');
          headers.delete('X-Home-Cache-Timestamp');
          headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
          return new Response(cachedResponse.body, {
            status: cachedResponse.status,
            statusText: cachedResponse.statusText,
            headers,
          });
        }
      }

      const backendBase = env.API_URL || 'https://backend-xkwn.onrender.com';
      const backendUrl = new URL(url.pathname, backendBase);
      backendUrl.search = url.search;

      const proxyRequest = new Request(backendUrl, {
        method: request.method,
        headers: request.headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      });

      if (cachedResponse && cacheKey && edgeCache) {
        const refresh = fetchAndCachePublicGet(cacheKey, proxyRequest, edgeCache, context)
          .catch((error: unknown) => {
            console.error('Failed to refresh cached public API response', error);
          });
        if (context) context.waitUntil(refresh);
        else await refresh;

        const headers = new Headers(cachedResponse.headers);
        headers.delete('X-Public-API-Cache-Timestamp');
        headers.delete('X-Home-Cache-Timestamp');
        headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        return new Response(cachedResponse.body, {
          status: cachedResponse.status,
          statusText: cachedResponse.statusText,
          headers,
        });
      }

      const response = cacheKey && edgeCache
        ? await fetchAndCachePublicGet(cacheKey, proxyRequest, edgeCache, context)
        : await fetch(proxyRequest);
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      if (response.status === 429 && !headers.has('Retry-After')) {
        headers.set('Retry-After', '30');
      }

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers });
      }

      if (cacheKey && edgeCache && response.ok && !headers.has('Set-Cookie')) {
        headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    const isArdManifestPath = url.pathname === '/.well-known/ard.json'
      || url.pathname === '/.well-known/ai-catalog.json';
    const assetRequest = isArdManifestPath
      ? new Request(new URL('/ai-catalog.json', request.url), {
        method: request.method,
        headers: request.headers,
      })
      : request;
    const assetResponse = await env.ASSETS.fetch(assetRequest);
    if (isArdManifestPath && assetResponse.status === 404) {
      return new Response('ARD manifest not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    if (assetResponse.status !== 404) {
      const headers = new Headers(assetResponse.headers);
      const body: BodyInit | null = assetResponse.body;
      if (/\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[^/]+$/.test(url.pathname)) {
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (headers.get('Content-Type')?.includes('text/html')) {
        headers.set('Content-Type', 'text/html; charset=utf-8');
        headers.set('Cache-Control', 'no-cache, must-revalidate');
      }
      return new Response(body, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers,
      });
    }

    const indexResponse = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url)));
    const headers = new Headers(indexResponse.headers);
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Cache-Control', 'no-cache, must-revalidate');
    return new Response(indexResponse.body, {
      status: indexResponse.status,
      statusText: indexResponse.statusText,
      headers,
    });
  },
} satisfies { fetch(request: Request, env: Env): Promise<Response> };
