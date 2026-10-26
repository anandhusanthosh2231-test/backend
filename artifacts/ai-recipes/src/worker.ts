export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  API_URL?: string;
}

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
      if (cacheKey && edgeCache) {
        const cachedResponse = await edgeCache.match(cacheKey);
        if (cachedResponse) return cachedResponse;
      }

      const backendBase = env.API_URL || 'https://backend-xkwn.onrender.com';
      const backendUrl = new URL(url.pathname, backendBase);
      backendUrl.search = url.search;

      const proxyRequest = new Request(backendUrl, {
        method: request.method,
        headers: request.headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      });

      const response = await fetch(proxyRequest);
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers });
      }

      if (cacheKey && edgeCache && response.ok && !headers.has('Set-Cookie')) {
        headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        const cacheableResponse = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
        const cacheWrite = edgeCache.put(cacheKey, cacheableResponse.clone());
        if (context) context.waitUntil(cacheWrite);
        else await cacheWrite;
        return cacheableResponse;
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
      if (/\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[^/]+$/.test(url.pathname)) {
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (headers.get('Content-Type')?.includes('text/html')) {
        headers.set('Cache-Control', 'no-cache, must-revalidate');
      }
      return new Response(assetResponse.body, {
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
