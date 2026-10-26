export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  API_URL?: string;
}

const HOME_CACHE_FRESH_MS = 5 * 60 * 1000;
const HOME_CACHE_RETENTION_SECONDS = 24 * 60 * 60;

export default {
  async fetch(
    request: Request,
    env: Env,
    context?: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api')) {
      const cacheableHomeRequest = request.method === 'GET'
        && url.pathname === '/api/home'
        && !request.headers.has('Authorization');
      const cacheKey = cacheableHomeRequest
        ? new Request(url.toString(), { method: 'GET' })
        : null;
      const edgeCache = cacheKey
        ? (caches as CacheStorage & { default: Cache }).default
        : null;
      const cachedResponse = cacheKey && edgeCache
        ? await edgeCache.match(cacheKey)
        : undefined;
      if (cachedResponse) {
        const cachedAt = Number(cachedResponse.headers.get('X-Home-Cache-Timestamp'));
        if (!Number.isFinite(cachedAt) || Date.now() - cachedAt < HOME_CACHE_FRESH_MS) {
          const headers = new Headers(cachedResponse.headers);
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
        const refresh = fetch(proxyRequest)
          .then(async (response) => {
            const headers = new Headers(response.headers);
            if (!response.ok || headers.has('Set-Cookie')) return;
            headers.set('Access-Control-Allow-Origin', '*');
            headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
            headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
            headers.set('X-Home-Cache-Timestamp', Date.now().toString());
            headers.set('Cache-Control', `public, max-age=${HOME_CACHE_RETENTION_SECONDS}`);
            const refreshedResponse = new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers,
            });
            await edgeCache.put(cacheKey, refreshedResponse);
          })
          .catch((error: unknown) => {
            console.error('Failed to refresh cached /api/home response', error);
          });
        if (context) context.waitUntil(refresh);
        else await refresh;

        const headers = new Headers(cachedResponse.headers);
        headers.delete('X-Home-Cache-Timestamp');
        headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        return new Response(cachedResponse.body, {
          status: cachedResponse.status,
          statusText: cachedResponse.statusText,
          headers,
        });
      }

      const response = await fetch(proxyRequest);
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers });
      }

      if (cacheKey && edgeCache && response.ok && !headers.has('Set-Cookie')) {
        headers.set('X-Home-Cache-Timestamp', Date.now().toString());
        headers.set('Cache-Control', `public, max-age=${HOME_CACHE_RETENTION_SECONDS}`);
        const cacheableResponse = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
        const cacheWrite = edgeCache.put(cacheKey, cacheableResponse.clone())
          .catch((error: unknown) => {
            console.error('Failed to cache /api/home response', error);
          });
        if (context) context.waitUntil(cacheWrite);
        else await cacheWrite;
        headers.delete('X-Home-Cache-Timestamp');
        headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        return new Response(cacheableResponse.body, {
          status: cacheableResponse.status,
          statusText: cacheableResponse.statusText,
          headers,
        });
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      const headers = new Headers(assetResponse.headers);
      let body: BodyInit | null = assetResponse.body;
      if (/\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[^/]+$/.test(url.pathname)) {
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (headers.get('Content-Type')?.includes('text/html')) {
        headers.set('Cache-Control', 'no-cache, must-revalidate');
        if (request.method === 'GET' && url.pathname === '/') {
          const html = await assetResponse.text();
          const headClose = html.lastIndexOf('</head>');
          const preload = '<link rel="preload" href="/api/home" as="fetch" crossorigin="anonymous" />';
          if (headClose !== -1 && !html.includes('href="/api/home"')) {
            body = `${html.slice(0, headClose)}${preload}${html.slice(headClose)}`;
            headers.delete('Content-Length');
            headers.delete('Content-Encoding');
            headers.delete('ETag');
          } else {
            body = html;
          }
        }
      }
      return new Response(body, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers,
      });
    }

    const indexResponse = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url)));
    const headers = new Headers(indexResponse.headers);
    headers.set('Cache-Control', 'no-cache, must-revalidate');
    return new Response(indexResponse.body, {
      status: indexResponse.status,
      statusText: indexResponse.statusText,
      headers,
    });
  },
} satisfies { fetch(request: Request, env: Env): Promise<Response> };
