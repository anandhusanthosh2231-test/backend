import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import worker from './worker.ts';

const originalFetch = globalThis.fetch;
const originalDateNow = Date.now;
const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');

afterEach(() => {
  globalThis.fetch = originalFetch;
  Date.now = originalDateNow;
  if (originalCaches) {
    Object.defineProperty(globalThis, 'caches', originalCaches);
  } else {
    Reflect.deleteProperty(globalThis, 'caches');
  }
});

test('serves cached homepage data while refreshing stale data in the background', async () => {
  const storedResponses = new Map<string, Response>();
  const cache = {
    async match(request: Request): Promise<Response | undefined> {
      return storedResponses.get(request.url)?.clone();
    },
    async put(request: Request, response: Response): Promise<void> {
      storedResponses.set(request.url, response.clone());
    },
  };
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { default: cache },
  });

  let now = 1_000_000;
  Date.now = () => now;
  let backendCalls = 0;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ version: ++backendCalls }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

  const env = {
    ASSETS: { fetch: async () => new Response('asset', { status: 200 }) },
    API_URL: 'https://backend.test',
  };
  const backgroundTasks: Promise<unknown>[] = [];
  const context = { waitUntil: (promise: Promise<unknown>) => backgroundTasks.push(promise) };
  const request = new Request('https://site.test/api/home');

  const initialResponse = await worker.fetch(request, env, context);
  assert.deepEqual(await initialResponse.json(), { version: 1 });
  await Promise.all(backgroundTasks.splice(0));

  now += 6 * 60 * 1000;
  const staleResponse = await worker.fetch(request, env, context);
  assert.equal(staleResponse.headers.get('Cache-Control'), 'public, max-age=60, stale-while-revalidate=300');
  assert.equal(staleResponse.headers.get('X-Home-Cache-Timestamp'), null);
  assert.deepEqual(await staleResponse.json(), { version: 1 });
  await Promise.all(backgroundTasks.splice(0));

  const refreshedResponse = await worker.fetch(request, env, context);
  assert.deepEqual(await refreshedResponse.json(), { version: 2 });
  assert.equal(backendCalls, 2);
});

test('preloads homepage data from the root HTML response', async () => {
  const env = {
    ASSETS: {
      fetch: async () => new Response('<html><head></head><body></body></html>', {
        status: 200,
        headers: {
          'Content-Length': '38',
          'Content-Type': 'text/html',
          ETag: 'old-etag',
        },
      }),
    },
  };

  const response = await worker.fetch(new Request('https://site.test/'), env);
  const html = await response.text();
  assert.match(html, /<link rel="preload" href="\/api\/home" as="fetch" crossorigin="anonymous" \/>/);
  assert.equal(response.headers.get('Content-Length'), null);
  assert.equal(response.headers.get('ETag'), null);
});

test('serves ARD well-known manifest paths from the JSON catalog asset', async () => {
  const catalog = JSON.stringify({
    specVersion: '1.0',
    host: { displayName: 'TaskBakeAI', identifier: 'did:web:example.com' },
    entries: [],
  });
  const assetRequests: string[] = [];
  const env = {
    ASSETS: {
      fetch: async (request: Request) => {
        assetRequests.push(new URL(request.url).pathname);
        return new URL(request.url).pathname === '/ai-catalog.json'
          ? new Response(catalog, { status: 200, headers: { 'Content-Type': 'application/json' } })
          : new Response('<!DOCTYPE html>', { status: 404, headers: { 'Content-Type': 'text/html' } });
      },
    },
  };

  for (const path of ['/.well-known/ard.json', '/.well-known/ai-catalog.json']) {
    const response = await worker.fetch(new Request(`https://site.test${path}`), env);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Content-Type') ?? '', /application\/json/);
    assert.deepEqual(await response.json(), JSON.parse(catalog));
  }

  assert.deepEqual(assetRequests, ['/ai-catalog.json', '/ai-catalog.json']);

  const missingManifest = await worker.fetch(new Request('https://site.test/.well-known/ard.json'), {
    ASSETS: { fetch: async () => new Response('<!DOCTYPE html>', { status: 404 }) },
  });
  assert.equal(missingManifest.status, 404);
  assert.equal(await missingManifest.text(), 'ARD manifest not found');
});
