import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";

vi.mock("server-only", () => ({}));
import { GET as catalog } from "@/app/api/catalog/route";
import { GET as session } from "@/app/api/session/route";
import { POST as login } from "@/app/api/auth/login/route";
import { PUT as saveDraft } from "@/app/api/atelier/draft/route";
import { DELETE as removeRecipe } from "@/app/api/recipes/[id]/route";
import { DELETE as removeDraft } from "@/app/api/atelier/draft/route";
import { GET as adminProducts } from "@/app/api/admin/products/route";
import { PATCH as updateAdminInquiry } from "@/app/api/admin/inquiries/[id]/route";
import { createBffHandler } from "@/server/bff/handler";
import { serverRequest } from "@/lib/api/server";

type Call = { url?: string; method?: string; headers: IncomingMessage["headers"]; body: string };
let calls: Call[] = [];
let respond: (res: ServerResponse) => void;
let base: string;
const timers = new Set<ReturnType<typeof setTimeout>>();
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  calls.push({
    url: req.url,
    method: req.method,
    headers: req.headers,
    body: Buffer.concat(chunks).toString(),
  });
  respond(res);
});
const json = (res: ServerResponse, body: unknown, status = 200) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const request = (path: string, options?: RequestInit) =>
  new Request(`http://mall.test${path}`, options);
const credentials = JSON.stringify({ email: "member@example.com", password: "password123" });

beforeAll(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("No address");
  }

  base = `http://127.0.0.1:${address.port}`;
});
beforeEach(() => {
  vi.stubEnv("API_URL", base);
  vi.stubEnv("API_PREFIX", "/api");
  vi.stubEnv("API_SESSION_COOKIE", "aura_session");
  vi.stubEnv("API_TIMEOUT_MS", "1000");
  vi.stubEnv("APP_ORIGIN", "");
  vi.stubEnv("API_BFF_SHARED_KEY", "");
  calls = [];
  respond = (res) => json(res, { ok: true });
});
afterEach(() => {
  for (const timer of timers) {
    clearTimeout(timer);
  }

  timers.clear();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe("Next BFF to FastAPI HTTP boundary", () => {
  it("adds only the configured server key to originless backend mutations", async () => {
    const key = "test-only-server-key-0123456789abcdef";
    vi.stubEnv("API_BFF_SHARED_KEY", key);
    const response = await login(
      request("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://mall.test",
          "X-Aura-BFF-Key": "attacker",
        },
        body: credentials,
      }),
    );
    expect(response.status).toBe(200);
    expect(calls[0].headers["x-aura-bff-key"]).toBe(key);
    expect(calls[0].headers.origin).toBeUndefined();
    expect(response.headers.get("x-aura-bff-key")).toBeNull();
    expect(await response.text()).not.toContain(key);
    await catalog(request("/api/catalog"));
    expect(calls[1].headers["x-aura-bff-key"]).toBeUndefined();
  });

  it("does not forward browser-supplied server credentials when unconfigured", async () => {
    const response = await login(
      request("/api/auth/login", {
        method: "POST",
        headers: { "X-Aura-BFF-Key": "attacker" },
      }),
    );
    expect(response.status).toBe(200);
    expect(calls[0].headers["x-aura-bff-key"]).toBeUndefined();
  });

  it("rejects invalid server key configuration without exposing it", async () => {
    vi.stubEnv("API_BFF_SHARED_KEY", "private-invalid");
    const response = await login(request("/api/auth/login", { method: "POST" }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private-invalid");
    expect(calls).toHaveLength(0);
  });

  it("uses runtime API configuration for BFF and RSC without a self HTTP call", async () => {
    vi.stubEnv("API_PREFIX", "/api/v1");
    const result = await catalog(
      request("/api/catalog?url=https://attacker.test&token=private", {
        headers: {
          Cookie: "aura_session=private; analytics=private",
          Authorization: "Bearer private",
        },
      }),
    );
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ok: true });
    expect(calls[0].url).toBe("/api/v1/catalog");
    expect(calls[0].headers.cookie).toBeUndefined();
    expect(calls[0].headers.authorization).toBeUndefined();
    expect(result.headers.get("cache-control")).toContain("no-store");
    await expect(serverRequest("/catalog")).resolves.toEqual({ ok: true });
    expect(calls[1].url).toBe("/api/v1/catalog");
    expect(calls[1].headers.cookie).toBeUndefined();
  });

  it("forwards only allow-listed admin query parameters and keeps admin errors", async () => {
    await adminProducts(
      request(
        "/api/admin/products?q=%20hand%20&collection=fresh&collection=warm&page=2&role=admin" +
          "&url=https://attacker.test&stock=" +
          "x".repeat(101),
        { headers: { Cookie: "aura_session=admin-session" } },
      ),
    );
    expect(calls[0].url).toBe("/api/admin/products?q=hand&collection=fresh&page=2");
    expect(calls[0].headers.cookie).toBe("aura_session=admin-session");
    respond = (res) => json(res, { detail: "관리자 권한이 필요해요." }, 403);
    const denied = await updateAdminInquiry(
      request("/api/admin/inquiries/a", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Origin: "http://mall.test" },
        body: JSON.stringify({ version: 1, status: "done" }),
      }),
      { params: Promise.resolve({ id: "../orders" }) },
    );
    expect(denied.status).toBe(400);
    const forbidden = await updateAdminInquiry(
      request("/api/admin/inquiries/a", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Origin: "http://mall.test" },
        body: JSON.stringify({ version: 1, status: "done" }),
      }),
      { params: Promise.resolve({ id: "a" }) },
    );
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({
      error: { code: "HTTP_403", message: "관리자 권한이 필요해요." },
    });
    expect(calls.at(-1)?.url).toBe("/api/admin/inquiries/a");
  });

  it("forwards only the session and owner headers and creates its own request ID", async () => {
    const response = await saveDraft(
      request("/api/atelier/draft", {
        method: "PUT",
        headers: {
          Cookie: "analytics=secret; aura_session=session-token; other=value",
          Authorization: "Bearer secret",
          "Content-Type": "application/json",
          "X-Session-Owner": "member-1",
          "X-Request-ID": "untrusted",
          "X-User-ID": "admin",
        },
        body: JSON.stringify({ counts: { rose: 2 }, name: "초안", label: "paper", step: "select" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(calls[0].headers.cookie).toBe("aura_session=session-token");
    expect(calls[0].headers["x-session-owner"]).toBe("member-1");
    expect(calls[0].headers.authorization).toBeUndefined();
    expect(calls[0].headers["x-user-id"]).toBeUndefined();
    expect(calls[0].headers["x-request-id"]).toBe(response.headers.get("x-request-id"));
    expect(calls[0].headers["x-request-id"]).not.toBe("untrusted");
    expect(calls[0].url).toBe("/api/atelier/draft");
    expect(JSON.parse(calls[0].body)).toEqual({
      counts: { rose: 2 },
      name: "초안",
      label: "paper",
      step: "select",
    });
    expect(response.headers.get("vary")).toBe("Cookie");
    await removeRecipe(request("/api/recipes/recipe", { method: "DELETE" }), {
      params: Promise.resolve({ id: "recipe:1,2" }),
    });
    expect(calls[1].url).toBe("/api/recipes/recipe%3A1%2C2");
  });

  it("binds allowed response cookies to the BFF host, preserves expiry, and supports deletion", async () => {
    vi.stubEnv("APP_ORIGIN", "https://mall.test");
    respond = (res) => {
      res.setHeader("Set-Cookie", [
        "aura_session=token; Domain=fastapi.internal; Path=/api/v1; Expires=Tue, 01 Jan 2030 00:00:00 GMT",
        "tracking=secret; Path=/",
      ]);
      res.setHeader("X-Backend-Secret", "private");
      json(res, { user: null });
    };
    const response = await session(request("/api/session"));
    expect(response.headers.getSetCookie()).toEqual([
      "aura_session=token; Path=/; HttpOnly; SameSite=Lax; Secure; Expires=Tue, 01 Jan 2030 00:00:00 GMT",
    ]);
    expect(response.headers.get("x-backend-secret")).toBeNull();
    respond = (res) => {
      res.setHeader("Set-Cookie", "aura_session=; Path=/api; Max-Age=0");
      json(res, { detail: "Session expired" }, 401);
    };
    const expired = await session(request("/api/session"));
    expect(expired.status).toBe(401);
    expect(expired.headers.getSetCookie()[0]).toContain("Max-Age=0");
  });

  it("normalizes FastAPI errors without exposing Pydantic input values", async () => {
    respond = (res) => json(res, { detail: "Already registered" }, 409);
    const conflict = await login(request("/api/auth/login", { method: "POST" }));
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({
      error: { code: "HTTP_409", message: "Already registered" },
    });
    respond = (res) =>
      json(
        res,
        {
          detail: [
            {
              loc: ["body", "password"],
              msg: "Invalid",
              input: "secret-password",
              ctx: { private: true },
            },
          ],
        },
        422,
      );
    const invalid = await login(request("/api/auth/login", { method: "POST" }));
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "입력 항목을 확인해 주세요." },
    });
  });

  it("rejects cross-origin changes without trusting forwarded host headers", async () => {
    const foreignHeaders: Record<string, string>[] = [
      { Origin: "https://attacker.test", "X-Forwarded-Host": "attacker.test" },
      { "Sec-Fetch-Site": "cross-site" },
      { Origin: "null" },
    ];
    for (const headers of foreignHeaders) {
      expect((await login(request("/api/auth/login", { method: "POST", headers }))).status).toBe(
        403,
      );
    }

    expect(calls).toHaveLength(0);
    vi.stubEnv("APP_ORIGIN", "https://mall.test");
    expect(
      (
        await login(
          request("/api/auth/login", { method: "POST", headers: { Origin: "https://mall.test" } }),
        )
      ).status,
    ).toBe(200);
  });

  it("uses the direct loopback host in dev while preserving explicit and production origins", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const local = (host = "127.0.0.1:3000", origin = "http://127.0.0.1:3000") =>
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { Host: host, Origin: origin },
      });
    expect((await login(local())).status).toBe(200);
    expect((await login(local("127.0.0.1:4000", "http://127.0.0.1:4000"))).status).toBe(403);
    expect((await login(local("attacker.test", "http://attacker.test"))).status).toBe(403);
    vi.stubEnv("APP_ORIGIN", "https://mall.test");
    expect((await login(local())).status).toBe(403);
    vi.stubEnv("APP_ORIGIN", "");
    vi.stubEnv("NODE_ENV", "production");
    expect((await login(local())).status).toBe(403);
  });

  it("rejects malformed, non-object, non-JSON and oversized request bodies", async () => {
    for (const [body, contentType, status] of [
      ["{", "application/json", 400],
      ["[]", "application/json", 400],
      [credentials, "text/plain", 415],
      [JSON.stringify({ value: "x".repeat(33 * 1024) }), "application/json", 413],
    ] as const) {
      const response = await login(
        request("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": contentType, "Content-Length": "1" },
          body,
        }),
      );
      expect(response.status).toBe(status);
    }

    expect(calls).toHaveLength(0);
    const valid = await login(
      request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: credentials,
      }),
    );
    expect(valid.status).toBe(200);
  });

  it("handles bodyless deletes, 204 responses, and implicit HEAD requests", async () => {
    respond = (res) => {
      res.writeHead(204);
      res.end();
    };
    const deleted = await removeDraft(request("/api/atelier/draft", { method: "DELETE" }));
    expect(deleted.status).toBe(204);
    expect(await deleted.text()).toBe("");
    expect(calls[0].method).toBe("DELETE");
    respond = (res) => json(res, { ok: true });
    expect((await catalog(request("/api/catalog", { method: "HEAD" }))).status).toBe(200);
    expect(calls[1].method).toBe("GET");
  });

  it("does not follow upstream redirects or expose backend 5xx / malformed responses", async () => {
    const cases = [
      (res: ServerResponse) => {
        res.writeHead(307, { Location: "https://attacker.test" });
        res.end();
      },
      (res: ServerResponse) => json(res, { detail: "postgres://private-password" }, 500),
      (res: ServerResponse) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("private HTML");
      },
      (res: ServerResponse) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{");
      },
    ];
    for (const reply of cases) {
      respond = reply;
      const response = await session(request("/api/session"));
      expect(response.status).toBe(502);
      expect(response.headers.get("location")).toBeNull();
      expect(await response.text()).not.toMatch(/postgres|private|attacker/);
    }

    expect(calls).toHaveLength(4);
  });

  it("times out backend headers and bodies and distinguishes caller cancellation", async () => {
    vi.stubEnv("API_TIMEOUT_MS", "30");
    for (const startBody of [false, true]) {
      respond = (res) => {
        if (startBody) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.write("{");
        }

        timers.add(setTimeout(() => res.end(startBody ? "}" : "{}"), 500));
      };
      const response = await session(request("/api/session"));
      expect(response.status).toBe(504);
      expect((await response.json()).error.code).toBe("BACKEND_TIMEOUT");
    }

    const controller = new AbortController();
    controller.abort();
    expect((await session(request("/api/session", { signal: controller.signal }))).status).toBe(
      499,
    );
  });

  it("rejects invalid configuration and dynamic path traversal before accessing the backend", async () => {
    for (const key of ["../auth", "..", "\\\\evil", "id?url=evil"]) {
      expect(
        (
          await removeRecipe(request("/api/recipes/id", { method: "DELETE" }), {
            params: Promise.resolve({ id: key }),
          })
        ).status,
      ).toBe(400);
    }

    expect((await catalog(request("/api/catalog", { method: "POST" }))).status).toBe(405);
    vi.stubEnv("API_URL", "file:///etc/passwd");
    expect((await catalog(request("/api/catalog"))).status).toBe(500);
    expect(calls).toHaveLength(0);
  });

  it("keeps public endpoints from propagating upstream cookies", async () => {
    respond = (res) => {
      res.setHeader("Set-Cookie", "aura_session=unwanted; Path=/");
      json(res, { ok: true });
    };
    expect((await catalog(request("/api/catalog"))).headers.getSetCookie()).toEqual([]);
    const result = await createBffHandler("GET", "/catalog", { session: false })(
      request("/api/catalog"),
    );
    expect(result.headers.get("cache-control")).toBe("private, no-store");
  });
});
