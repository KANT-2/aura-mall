import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";

vi.mock("server-only", () => ({}));
import { GET as catalog } from "@/app/api/catalog/route";
import { GET as product } from "@/app/api/catalog/products/[id]/route";
import { POST as inquiry } from "@/app/api/partner/route";
import { POST as saveRecipe } from "@/app/api/recipes/route";
import { GET as session } from "@/app/api/auth/me/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as refresh } from "@/app/api/auth/refresh/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as register } from "@/app/api/auth/register/route";
import { PUT as saveDraft } from "@/app/api/atelier/draft/route";
import { DELETE as removeRecipe } from "@/app/api/recipes/[id]/route";
import { DELETE as removeDraft } from "@/app/api/atelier/draft/route";
import { GET as adminProducts } from "@/app/api/admin/products/route";
import { PATCH as updateAdminInquiry } from "@/app/api/admin/inquiries/[id]/route";
import { createBffHandler } from "@/server/bff/handler";
import { serverRequest } from "@/lib/api/server";
import { catalogResponse } from "@/server/backend/storefront";
import fixtureCatalog from "../../mock-server/fixtures/catalog.json";

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
const token = "header.payload.signature";
const guestId = "11111111-1111-4111-8111-111111111111";
const member = {
  id: "member-1",
  name: "회원",
  email: "member@example.com",
  coupon: true,
  role: "member",
};
const pair = {
  accessToken: token,
  refreshToken: "r1_" + "a".repeat(64),
  tokenType: "Bearer",
  expiresIn: 900,
  refreshExpiresIn: 604800,
};
const request = (path: string, options: RequestInit = {}) => {
  const headers = new Headers(options.headers);
  if (!headers.has("Cookie")) {
    headers.set(
      "Cookie",
      `aura_guest=${guestId}${path === "/api/auth/me" ? `; aura_access=${token}` : ""}`,
    );
  }

  return new Request(`http://mall.test${path}`, { ...options, headers });
};
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
  vi.stubEnv("API_ACCESS_COOKIE", "aura_access");
  vi.stubEnv("API_REFRESH_COOKIE", "aura_refresh");
  vi.stubEnv("API_AUTH_MODE", "jwt");
  vi.stubEnv("API_TIMEOUT_MS", "1000");
  vi.stubEnv("APP_ORIGIN", "");
  vi.stubEnv("API_BFF_SHARED_KEY", "");
  calls = [];
  respond = (res) => {
    const path = calls.at(-1)?.url ?? "";
    if (path.endsWith("/auth/logout")) {
      res.writeHead(204);
      res.end();
    } else {
      json(
        res,
        path.includes("/catalog")
          ? fixtureCatalog
          : path.endsWith("/auth/me")
            ? member
            : path.endsWith("/atelier/draft")
              ? { counts: { rose: 2 }, name: "초안", label: "paper", step: "select" }
              : /\/auth\/(login|register|refresh)$/.test(path)
                ? pair
                : [],
      );
    }
  };
});

describe("JWT authentication contract", () => {
  it("uses only the access cookie for Bearer and preserves owner/request IDs", async () => {
    const response = await saveDraft(
      request("/api/atelier/draft", {
        method: "PUT",
        headers: {
          Cookie: `aura_guest=${guestId}; aura_access=${token}; analytics=private`,
          Authorization: "Bearer attacker",
          "X-User-ID": "admin",
          "X-Account-Owner": "member-1",
          "X-Request-ID": "attacker",
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(calls[0].headers.authorization).toBe(`Bearer ${token}`);
    expect(calls[0].headers.cookie).toBeUndefined();
    expect(calls[0].headers["x-user-id"]).toBeUndefined();
    expect(calls[0].headers["x-account-owner"]).toBe("member-1");
    expect(calls[0].headers["x-request-id"]).toBe(response.headers.get("x-request-id"));
  });

  it("keeps catalog/RSC public and never authenticates from browser Authorization", async () => {
    await catalog(request("/api/catalog", { headers: { Cookie: `aura_access=${token}` } }));
    await serverRequest("/catalog");
    const anonymous = await session(
      request("/api/auth/me", {
        headers: { Cookie: `aura_guest=${guestId}`, Authorization: `Bearer ${token}` },
      }),
    );
    expect(await anonymous.json()).toEqual({ user: null, guestId });
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.headers.authorization).toBeUndefined();
      expect(call.headers.cookie).toBeUndefined();
    }
  });

  it("converts TokenPair JSON to separate HttpOnly cookies and uses verified /auth/me", async () => {
    vi.stubEnv("APP_ORIGIN", "https://mall.test");
    for (const handler of [login, register]) {
      const response = await handler(request("/api/auth/login", { method: "POST" }));
      expect(response.status).toBe(handler === register ? 201 : 200);
      expect(await response.json()).toEqual({ user: member, guestId });
      expect(response.headers.getSetCookie()).toEqual([
        `aura_access=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900; Secure`,
        `aura_refresh=${pair.refreshToken}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=604800; Secure`,
      ]);
      expect(calls.at(-1)?.url).toBe("/api/auth/me");
      expect(calls.at(-1)?.headers.authorization).toBe(`Bearer ${token}`);
    }
  });

  it("forwards refresh exclusively from its HttpOnly cookie and never leaks the rotated tokens", async () => {
    const response = await refresh(
      request("/api/auth/refresh", {
        method: "POST",
        headers: {
          Cookie: `aura_guest=${guestId}; aura_refresh=${pair.refreshToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken: "attacker" }),
      }),
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(JSON.parse(calls[0].body)).toEqual({ refreshToken: pair.refreshToken });
    expect(calls[0].headers.authorization).toBeUndefined();
    expect(calls[0].headers.cookie).toBeUndefined();
    expect(response.headers.getSetCookie()).toHaveLength(2);
  });

  it("requires refresh when the access cookie has expired and refresh remains", async () => {
    const response = await session(
      request("/api/auth/me", { headers: { Cookie: `aura_refresh=${pair.refreshToken}` } }),
    );
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("keeps credentials on resource 401, but clears both after a rejected refresh", async () => {
    respond = (res) => {
      res.setHeader("Set-Cookie", "attacker=private");
      json(res, { detail: "인증이 필요합니다." }, 401);
    };
    const rejected = await session(request("/api/auth/me"));
    expect(rejected.status).toBe(401);
    expect(rejected.headers.get("www-authenticate")).toBe("Bearer");
    expect(rejected.headers.getSetCookie()).toEqual([]);
    const ended = await refresh(
      request("/api/auth/refresh", {
        method: "POST",
        headers: { Cookie: `aura_refresh=${pair.refreshToken}` },
      }),
    );
    expect(ended.status).toBe(401);
    expect(ended.headers.getSetCookie()).toEqual([
      "aura_access=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      "aura_refresh=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0",
    ]);
  });

  it("rejects malformed/oversized/duplicate access and refresh cookies before HTTP", async () => {
    for (const cookie of [
      "aura_access=",
      "aura_access=opaque",
      "aura_access=a.b.c%20",
      `aura_access=${"a".repeat(3800)}.b.c`,
      `aura_access=${token}; aura_access=${token}`,
    ]) {
      expect((await session(request("/api/auth/me", { headers: { Cookie: cookie } }))).status).toBe(
        401,
      );
    }

    for (const cookie of [
      "",
      "aura_refresh=bad",
      `aura_refresh=${pair.refreshToken}; aura_refresh=${pair.refreshToken}`,
    ]) {
      expect(
        (
          await refresh(
            request("/api/auth/refresh", { method: "POST", headers: { Cookie: cookie } }),
          )
        ).status,
      ).toBe(401);
    }

    expect(calls).toHaveLength(0);
  });

  it("preserves credentials on forbidden/conflict/unavailable and failed logout", async () => {
    for (const status of [403, 409, 500]) {
      respond = (res) => {
        res.setHeader("Set-Cookie", `aura_access=${token}; Max-Age=0`);
        json(res, { detail: "Denied" }, status);
      };
      const response = await logout(
        request("/api/auth/logout", {
          method: "POST",
          headers: { Cookie: `aura_access=${token}` },
        }),
      );
      expect(response.status).toBe(status === 500 ? 502 : status);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
  });

  it("rejects invalid token pairs and private/invalid profiles before issuing cookies", async () => {
    for (const data of [
      { accessToken: token },
      { ...pair, refreshToken: "bad" },
      { ...pair, expiresIn: -1 },
      { ...pair, accessToken: "opaque" },
    ]) {
      respond = (res) => json(res, data);
      const response = await login(request("/api/auth/login", { method: "POST" }));
      expect(response.status).toBe(502);
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(await response.text()).not.toContain(token);
    }

    respond = (res) =>
      json(res, calls.at(-1)?.url?.endsWith("/auth/me") ? { ...member, role: "superadmin" } : pair);
    expect((await login(request("/api/auth/login", { method: "POST" }))).status).toBe(502);
    respond = (res) => json(res, { ...member, passwordHash: "private", accessToken: token });
    const me = await session(request("/api/auth/me"));
    expect(await me.json()).toEqual({ user: member, guestId });
  });

  it("adapts backend logout 204 only after revocation succeeds and preserves the visitor", async () => {
    const response = await logout(
      request("/api/auth/logout", {
        method: "POST",
        headers: { Cookie: `aura_access=${token}; aura_guest=${guestId}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: null, guestId });
    expect(calls).toHaveLength(1);
    expect(calls[0].headers.authorization).toBe(`Bearer ${token}`);
    expect(response.headers.getSetCookie().every((cookie) => cookie.includes("Max-Age=0"))).toBe(
      true,
    );
  });

  it("rejects legacy session configuration", async () => {
    vi.stubEnv("API_AUTH_MODE", "cookie");
    expect((await session(request("/api/auth/me"))).status).toBe(500);
    expect(calls).toHaveLength(0);
  });
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

describe("storefront resource contract", () => {
  const recipe = {
    id: "server-recipe",
    name: "향",
    label: "paper",
    counts: { bergamot: 3 },
    version: 1,
    color: "#e8d36b",
    created: "2026-10-26T00:00:00Z",
  };

  it("sends only recipe inputs and returns the server's public recipe", async () => {
    respond = (res) => json(res, { ...recipe, ownerId: "private", token: "private" }, 201);
    const input = { name: "향", label: "paper", counts: { bergamot: 3 }, parent: "parent-1" };
    const response = await saveRecipe(
      request("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Account-Owner": "member-1" },
        body: JSON.stringify({
          ...input,
          id: "client-id",
          userId: "other-member",
          version: 999,
          color: "#000000",
          created: "private",
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(JSON.parse(calls[0].body)).toEqual(input);
    expect(calls[0].headers["x-account-owner"]).toBe("member-1");
    expect(await response.json()).toEqual(recipe);
  });

  it("keeps inquiry status and private fields out of the public request and response", async () => {
    respond = (res) => json(res, { id: "inquiry-1", email: "private", memo: "private" }, 201);
    const input = {
      brand: "AURA",
      name: "담당자",
      email: "a@example.com",
      introduction: "소개",
      message: "문의",
      type: "향수",
      consent: "on",
      website: "",
    };
    const response = await inquiry(
      request("/api/partner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "aura_session=private",
          Authorization: "Bearer private",
        },
        body: JSON.stringify({
          ...input,
          userId: "admin",
          status: "done",
          memo: "private",
          id: "client-id",
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(JSON.parse(calls[0].body)).toEqual(input);
    expect(calls[0].headers.cookie).toBeUndefined();
    expect(calls[0].headers.authorization).toBeUndefined();
    expect(await response.json()).toEqual({ id: "inquiry-1" });
  });

  it("preserves FastAPI domain codes and never exposes their private details", async () => {
    respond = (res) =>
      json(
        res,
        {
          error: {
            code: "PRODUCT_NOT_FOUND",
            message: "상품을 찾을 수 없어요.",
            details: "private",
          },
        },
        404,
      );
    const response = await product(request("/api/catalog/products/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "PRODUCT_NOT_FOUND", message: "상품을 찾을 수 없어요." },
    });
  });

  it("uses the same catalog validation for BFF and direct RSC requests", async () => {
    respond = (res) => json(res, { ...fixtureCatalog, secret: "private", products: [] });
    const response = await catalog(request("/api/catalog"));
    expect(await response.json()).toEqual({ ...fixtureCatalog, products: [] });
    await expect(serverRequest("/catalog", catalogResponse)).resolves.toEqual({
      ...fixtureCatalog,
      products: [],
    });
    respond = (res) => json(res, { products: "private" });
    expect((await catalog(request("/api/catalog"))).status).toBe(502);
    await expect(serverRequest("/catalog", catalogResponse)).rejects.toMatchObject({
      status: 502,
      code: "INVALID_BACKEND_RESPONSE",
    });
  });
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
    expect(calls.at(-1)?.headers["x-aura-bff-key"]).toBeUndefined();
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
    expect(await result.json()).toEqual(fixtureCatalog);
    expect(calls[0].url).toBe("/api/v1/catalog");
    expect(calls[0].headers.cookie).toBeUndefined();
    expect(calls[0].headers.authorization).toBeUndefined();
    expect(result.headers.get("cache-control")).toContain("no-store");
    await expect(serverRequest("/catalog")).resolves.toEqual(fixtureCatalog);
    expect(calls[1].url).toBe("/api/v1/catalog");
    expect(calls[1].headers.cookie).toBeUndefined();
  });

  it("forwards only allow-listed admin query parameters and keeps admin errors", async () => {
    respond = (res) => json(res, { items: [], total: 0, page: 2, pageSize: 20 });
    await adminProducts(
      request(
        "/api/admin/products?q=%20hand%20&collection=fresh&collection=warm&page=2&role=admin" +
          "&url=https://attacker.test&stock=" +
          "x".repeat(101),
        { headers: { Cookie: `aura_admin_access=${token}` } },
      ),
    );
    expect(calls[0].url).toBe("/api/admin/products?q=hand&collection=fresh&page=2");
    expect(calls[0].headers.authorization).toBe(`Bearer ${token}`);
    respond = (res) => json(res, { detail: "관리자 권한이 필요해요." }, 403);
    const denied = await updateAdminInquiry(
      request("/api/admin/inquiries/a", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://mall.test",
          Cookie: `aura_admin_access=${token}`,
        },
        body: JSON.stringify({ version: 1, status: "done" }),
      }),
      { params: Promise.resolve({ id: "../orders" }) },
    );
    expect(denied.status).toBe(400);
    const forbidden = await updateAdminInquiry(
      request("/api/admin/inquiries/a", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://mall.test",
          Cookie: `aura_admin_access=${token}`,
        },
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
          Cookie: `aura_guest=${guestId}; analytics=secret; aura_access=${token}; other=value`,
          Authorization: "Bearer secret",
          "Content-Type": "application/json",
          "X-Account-Owner": "member-1",
          "X-Request-ID": "untrusted",
          "X-User-ID": "admin",
        },
        body: JSON.stringify({ counts: { rose: 2 }, name: "초안", label: "paper", step: "select" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(calls[0].headers.cookie).toBeUndefined();
    expect(calls[0].headers["x-account-owner"]).toBe("member-1");
    expect(calls[0].headers.authorization).toBe(`Bearer ${token}`);
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

  it("ignores all upstream cookies and private profile fields", async () => {
    respond = (res) => {
      res.setHeader("Set-Cookie", [
        "aura_access=attacker; Domain=backend.internal",
        "tracking=private",
      ]);
      json(res, { ...member, passwordHash: "private" });
    };
    const response = await session(request("/api/auth/me"));
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await response.json()).toEqual({ user: member, guestId });
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
    respond = (res) => json(res, fixtureCatalog);
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
      const response = await session(request("/api/auth/me"));
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
      const response = await session(request("/api/auth/me"));
      expect(response.status).toBe(504);
      expect((await response.json()).error.code).toBe("BACKEND_TIMEOUT");
    }

    const controller = new AbortController();
    controller.abort();
    expect((await session(request("/api/auth/me", { signal: controller.signal }))).status).toBe(
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
      json(res, fixtureCatalog);
    };
    expect((await catalog(request("/api/catalog"))).headers.getSetCookie()).toEqual([]);
    const result = await createBffHandler("GET", "/catalog", { authenticated: false })(
      request("/api/catalog"),
    );
    expect(result.headers.get("cache-control")).toBe("private, no-store");
  });
});
