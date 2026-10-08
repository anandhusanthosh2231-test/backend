import { execSync } from "node:child_process";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ApiError,
  ResponseParseError,
  customFetch,
  setAuthTokenGetter,
  setBaseUrl,
} from "./custom-fetch.ts";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const skipSlowSemgrepTest = ["1", "true", "yes"].includes((process.env.SKIP_SLOW_TESTS ?? "").toLowerCase());

function mockFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(input, init));
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  setAuthTokenGetter(null);
  setBaseUrl(null);

  if (originalWindow === undefined) {
    delete (globalThis as typeof globalThis & { window?: unknown }).window;
  } else {
    (globalThis as typeof globalThis & { window: typeof originalWindow }).window = originalWindow;
  }
});

test("customFetch resolves relative URLs with a base URL and parses JSON data", async () => {
  setBaseUrl("https://api.example.com");

  mockFetch(async (input, init) => {
    assert.equal(String(input), "https://api.example.com/v1/recipes");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("accept"), "application/json, application/problem+json");

    return new Response(JSON.stringify({ id: 42, status: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const result = await customFetch<{ id: number; status: string }>("/v1/recipes", {
    responseType: "json",
  });
  assert.deepEqual(result, { id: 42, status: "ok" });
});

test("customFetch sets JSON content type for JSON string bodies and adds bearer auth", async () => {
  setAuthTokenGetter(async () => "top-secret-token");

  mockFetch(async (_input, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("content-type"), "application/json");
    assert.equal(headers.get("authorization"), "Bearer top-secret-token");

    return new Response(JSON.stringify({ created: true }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  });

  const result = await customFetch<{ created: boolean }>("/v1/create", {
    method: "POST",
    body: '{"name":"alpha"}',
  });

  assert.deepEqual(result, { created: true });
});

test("customFetch respects an explicit Authorization header and does not override it", async () => {
  setAuthTokenGetter(async () => "should-not-win");

  mockFetch(async (_input, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer explicit-token");
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const result = await customFetch<{ ok: boolean }>("/v1/protected", {
    headers: { authorization: "Bearer explicit-token" },
  });

  assert.deepEqual(result, { ok: true });
});

test("customFetch reads window localStorage admin headers when present", async () => {
  (globalThis as typeof globalThis & { window: { localStorage: { getItem: (key: string) => string | null } } }).window = {
    localStorage: {
      getItem: (key: string) => {
        if (key === "ai_recipes_admin_token") return "admin-token";
        if (key === "ai_recipes_admin_key") return "admin-key";
        return null;
      },
    },
  };

  mockFetch(async (_input, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer admin-token");
    assert.equal(headers.get("x-admin-key"), "admin-key");
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const result = await customFetch<{ ok: boolean }>("/v1/admin-check");
  assert.deepEqual(result, { ok: true });
});

test("customFetch auto-detects text responses and preserves plain strings", async () => {
  mockFetch(() =>
    new Response("plain-text", {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    }),
  );

  const result = await customFetch<string>("/v1/plain-text", { responseType: "auto" });
  assert.equal(result, "plain-text");
});

test("customFetch returns null for empty and no-content responses", async () => {
  mockFetch(() => new Response(null, { status: 204, headers: { "content-length": "0" } }));
  const emptyResult = await customFetch("/v1/empty", { responseType: "json" });
  assert.equal(emptyResult, null);

  mockFetch(() => new Response("", { status: 200, headers: { "content-type": "application/json" } }));
  const jsonEmpty = await customFetch("/v1/blank", { responseType: "json" });
  assert.equal(jsonEmpty, null);
});

test("customFetch throws ApiError with structured error details for unsuccessful responses", async () => {
  mockFetch(() =>
    new Response(JSON.stringify({ title: "Validation failed", detail: "Email is required" }), {
      status: 400,
      statusText: "Bad Request",
      headers: { "content-type": "application/problem+json" },
    }),
  );

  await assert.rejects(() => customFetch("/v1/submit"), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 400);
    assert.equal(error.statusText, "Bad Request");
    assert.match(error.message, /Validation failed.*Email is required/);
    return true;
  });
});

test("customFetch throws ResponseParseError when a JSON response is malformed", async () => {
  mockFetch(() =>
    new Response("{not valid json}", {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

  await assert.rejects(() => customFetch("/v1/bad-json", { responseType: "json" }), (error: unknown) => {
    assert.ok(error instanceof ResponseParseError);
    assert.equal(error.status, 200);
    assert.match(error.message, /Failed to parse response/);
    return true;
  });
});

test("customFetch rejects GET and HEAD requests that include a body", async () => {
  await assert.rejects(
    () => customFetch("/v1/get-with-body", { method: "GET", body: "{}" }),
    /cannot have a body/i,
  );

  await assert.rejects(
    () => customFetch("/v1/head-with-body", { method: "HEAD", body: "{}" }),
    /cannot have a body/i,
  );
});

test("customFetch auto-detects blob responses when content type is binary", async () => {
  const blobPayload = new Blob(["binary-data"]);

  mockFetch(() =>
    new Response(blobPayload, {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    }),
  );

  const result = await customFetch<Blob>("/v1/download", { responseType: "auto" });
  assert.ok(result instanceof Blob);
  assert.equal(await result.text(), "binary-data");
});

test("customFetch handles 204 and empty content-length responses without throwing", async () => {
  mockFetch(() => new Response(null, { status: 204 }));
  const result = await customFetch("/v1/no-content");
  assert.equal(result, null);

  mockFetch(() =>
    new Response("", {
      status: 200,
      headers: { "content-length": "0" },
    }),
  );

  const resultWithLength = await customFetch("/v1/zero-length");
  assert.equal(resultWithLength, null);
});

test("customFetch rejects CRLF header injection in Authorization and custom header values", async () => {
  await assert.rejects(
    () =>
      customFetch("/v1/security/header-injection", {
        headers: { authorization: "Bearer abc\r\nX-Injection: yes" },
      }),
    /CRLF|invalid header|header value/i,
  );

  await assert.rejects(
    () =>
      customFetch("/v1/security/header-injection", {
        headers: { "X-Trace": "ok\r\nSet-Cookie: admin=true" },
      }),
    /CRLF|invalid header|header value/i,
  );
});

test("customFetch masks sensitive query params in ApiError messages", async () => {
  mockFetch(() =>
    new Response(
      JSON.stringify({
        detail:
          "https://api.example.com/auth?token=abc123&apiKey=super-secret&password=letmein",
      }),
      {
        status: 401,
        statusText: "Unauthorized",
        headers: { "content-type": "application/json" },
      },
    ),
  );

  await assert.rejects(
    () => customFetch("/auth?token=abc123&apiKey=super-secret&password=letmein", { responseType: "json" }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      const message = String(error.message);

      assert.doesNotMatch(message, /token=abc123/i);
      assert.doesNotMatch(message, /apiKey=super-secret/i);
      assert.doesNotMatch(message, /password=letmein/i);
      assert.match(message, /token=\[REDACTED\]/i);
      assert.match(message, /apiKey=\[REDACTED\]/i);
      assert.match(message, /password=\[REDACTED\]/i);
      return true;
    },
  );
});

test("customFetch rejects dangerous non-HTTP protocols before network execution", async () => {
  await assert.rejects(() => customFetch("file:///etc/passwd"), /unsafe protocol|not allowed/i);
  await assert.rejects(() => customFetch("gopher://example.com"), /unsafe protocol|not allowed/i);
  await assert.rejects(() => customFetch("javascript:alert(1)"), /unsafe protocol|not allowed/i);
});

test("customFetch propagates AbortController cancellation as AbortError", async () => {
  const controller = new AbortController();

  mockFetch(async (_input, init) => {
    const signal = init?.signal as AbortSignal | undefined;
    assert.ok(signal);

    return new Promise<Response>((_, reject) => {
      signal.addEventListener("abort", () => {
        const abortError = new Error("The operation was aborted");
        abortError.name = "AbortError";
        reject(abortError);
      });
    });
  });

  const request = customFetch("/v1/timeout", { signal: controller.signal });
  controller.abort();

  await assert.rejects(request, (error: unknown) => {
    assert.equal((error as Error).name, "AbortError");
    return true;
  });
});

test("customFetch merges Headers cleanly and avoids duplicate standard-header keys", async () => {
  mockFetch(async (_input, init) => {
    const headers = new Headers(init?.headers);

    assert.equal(headers.get("authorization"), "Bearer existing-token");
    assert.match(headers.get("content-type") ?? "", /^application\/json/i);
    assert.equal(headers.get("x-custom"), "abc");

    const authorizationMatches = Array.from(headers.keys()).filter(
      (key) => key.toLowerCase() === "authorization",
    ).length;

    const contentTypeMatches = Array.from(headers.keys()).filter(
      (key) => key.toLowerCase() === "content-type",
    ).length;

    assert.equal(authorizationMatches, 1);
    assert.equal(contentTypeMatches, 1);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const result = await customFetch("/v1/merge", {
    method: "POST",
    headers: new Headers({
      Authorization: "Bearer existing-token",
      "Content-Type": "application/json; charset=utf-8",
      "X-Custom": "abc",
    }),
    body: '{"hello":"world"}',
  });

  assert.deepEqual(result, { ok: true });
});

test("customFetch supports 10+ parallel requests without cross-request contamination", async () => {
  const total = 12;

  mockFetch(async (input) => {
    const value = Number(String(input).split("/").at(-1));
    return new Response(JSON.stringify({ id: value, path: String(input) }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const results = await Promise.all(
    Array.from({ length: total }, (_, index) =>
      customFetch<{ id: number; path: string }>(`/v1/parallel/${index}`, {
        responseType: "json",
      }),
    ),
  );

  assert.equal(results.length, total);
  assert.equal(results[0]?.id, 0);
  assert.equal(results.at(-1)?.id, total - 1);
  assert.equal(results[0]?.path, "/v1/parallel/0");
  assert.equal(results.at(-1)?.path, `/v1/parallel/${total - 1}`);
});

test("customFetch handles large JSON payloads without memory errors", async () => {
  const payload = {
    items: Array.from({ length: 60000 }, (_, index) => ({
      id: index,
      value: `item-${index}`,
    })),
  };

  mockFetch(() =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

  const result = await customFetch<{ items: Array<{ id: number; value: string }> }>("/v1/bulk", {
    responseType: "json",
  });

  assert.equal(result.items.length, 60000);
  assert.equal(result.items[0]?.id, 0);
  assert.equal(result.items[59999]?.id, 59999);
  assert.equal(result.items[42]?.value, "item-42");
});

if (!skipSlowSemgrepTest) {
  test("customFetch runs semgrep static security scan for ./src when the tool is available", () => {
    const projectRoot = fileURLToPath(new URL("..", import.meta.url));

    try {
      execSync("npx semgrep --config=p/security-audit --error --quiet ./src", {
        cwd: projectRoot,
        stdio: "pipe",
        encoding: "utf8",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/semgrep.*(not found|ENOENT)|could not determine executable|Failed to fetch/i.test(message)) {
        return;
      }
      throw new Error(`Semgrep audit failed:\n${message}`);
    }
  });
}
