import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
vi.mock("server-only", () => ({}));
import { POST as login } from "@/app/api/admin/auth/login/route";
import { GET as me } from "@/app/api/admin/auth/me/route";
import { POST as logout } from "@/app/api/admin/auth/logout/route";
import { POST as createAdmin } from "@/app/api/admin/admins/route";
import { GET as products } from "@/app/api/admin/products/route";
import { GET as account } from "@/app/api/auth/me/route";
import { POST as order, GET as orders } from "@/app/api/orders/route";
import fixture from "../../mock-server/fixtures/catalog.json";

type Call = { url: string; headers: IncomingMessage["headers"]; body: string };
const calls: Call[] = [];
let respond: (res: ServerResponse) => void;
let base: string;
const server = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
  }

  calls.push({ url: req.url!, headers: req.headers, body });
  respond(res);
});
const json = (res: ServerResponse, value: unknown, status = 200) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
};
const token = "admin.payload.signature",
  customer = "customer.payload.signature";
const admin = { id: "admin-1", email: "admin@example.com", name: "운영자" };
const cookies = `aura_admin_access=${token}; aura_access=${customer}; aura_refresh=r1_${"a".repeat(64)}`;
const req = (path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://mall.test${path}`, {
    method,
    headers: { Cookie: cookies, "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const saved = {
  id: "order-1",
  recipient: "회원",
  address: "서울",
  total: 56000,
  created: "2026-10-27T00:00:00Z",
  items: [
    {
      key: "hand-cream",
      product: fixture.products[0],
      quantity: 2,
      selection: [],
      unitPrice: 28000,
    },
  ],
};

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
  vi.stubEnv("API_PREFIX", "/api/v1");
  vi.stubEnv("APP_ORIGIN", "https://mall.test");
  vi.stubEnv("API_AUTH_MODE", "jwt");
  vi.stubEnv("API_ADMIN_ACCESS_COOKIE", "aura_admin_access");
  vi.stubEnv("API_ACCESS_COOKIE", "aura_access");
  vi.stubEnv("API_REFRESH_COOKIE", "aura_refresh");
  calls.length = 0;
  respond = (res) => json(res, { accessToken: token, expiresIn: 3600, tokenType: "Bearer", admin });
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

it("sets only an administrator HttpOnly cookie and returns public admin fields", async () => {
  respond = (res) => {
    res.setHeader("Set-Cookie", "aura_access=attacker");
    json(res, {
      accessToken: token,
      tokenType: "Bearer",
      expiresIn: 3600,
      admin: { ...admin, passwordHash: "private" },
      refreshToken: "private",
    });
  };
  const response = await login(
    req("/api/admin/auth/login", "POST", {
      email: admin.email,
      password: "password123",
      role: "admin",
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ admin });
  expect(response.headers.getSetCookie()).toEqual([
    `aura_admin_access=${token}; Path=/api/admin; HttpOnly; SameSite=Lax; Max-Age=3600; Secure`,
  ]);
  expect(calls[0].url).toBe("/api/v1/admin/auth/login");
  expect(calls[0].headers.authorization).toBeUndefined();
  expect(calls[0].headers.cookie).toBeUndefined();
  expect(JSON.parse(calls[0].body)).toEqual({ email: admin.email, password: "password123" });
});

it("uses only the admin cookie for admin APIs, including when the customer cookie is malformed", async () => {
  respond = (res) => json(res, { ...admin, passwordHash: "private" });
  const response = await me(
    req("/api/admin/auth/me", "GET", undefined, {
      Cookie: `aura_admin_access=${token}; aura_access=bad`,
    }),
  );
  expect(await response.json()).toEqual({ admin });
  expect(calls[0].headers.authorization).toBe(`Bearer ${token}`);
  expect(calls[0].url).toBe("/api/v1/admin/session");
  expect(calls[0].headers.cookie).toBeUndefined();
});

it("never substitutes the customer credential when an admin credential is absent", async () => {
  const response = await me(
    req("/api/admin/auth/me", "GET", undefined, { Cookie: `aura_access=${customer}` }),
  );
  expect(await response.json()).toEqual({ admin: null });
  expect(
    (
      await products(
        req("/api/admin/products", "GET", undefined, {
          Cookie: `aura_access=${customer}`,
          Authorization: `Bearer ${token}`,
        }),
      )
    ).status,
  ).toBe(401);
  expect(calls).toHaveLength(0);
});

it("does not use the admin credential for customer account or order APIs", async () => {
  const response = await account(
    req("/api/auth/me", "GET", undefined, { Cookie: `aura_admin_access=${token}` }),
  );
  expect((await response.json()).user).toBeNull();
  respond = (res) => json(res, { detail: "Denied" }, 401);
  expect(
    (await orders(req("/api/orders", "GET", undefined, { Cookie: `aura_admin_access=${token}` })))
      .status,
  ).toBe(401);
  expect(calls[0].headers.authorization).toBeUndefined();
});

it("clears only the admin cookie on expiry or successful logout", async () => {
  respond = (res) => json(res, { detail: "Expired" }, 401);
  const expired = await me(req("/api/admin/auth/me"));
  expect(await expired.json()).toEqual({ admin: null });
  expect(expired.headers.getSetCookie()).toEqual([
    "aura_admin_access=; Path=/api/admin; HttpOnly; SameSite=Lax; Max-Age=0; Secure",
  ]);
  respond = (res) => {
    res.writeHead(204);
    res.end();
  };
  const response = await logout(req("/api/admin/auth/logout", "POST"));
  expect(await response.json()).toEqual({ admin: null });
  expect(response.headers.getSetCookie()).toEqual(expired.headers.getSetCookie());
  expect(calls.at(-1)?.headers.authorization).toBe(`Bearer ${token}`);
});

it("preserves credentials on failed logout and rejects malformed tokens and auth responses", async () => {
  respond = (res) => json(res, { detail: "private" }, 500);
  const failed = await logout(req("/api/admin/auth/logout", "POST"));
  expect(failed.status).toBe(502);
  expect(failed.headers.getSetCookie()).toEqual([]);
  for (const cookie of [
    "aura_admin_access=bad",
    `aura_admin_access=${token}; aura_admin_access=${token}`,
  ]) {
    expect((await me(req("/api/admin/auth/me", "GET", undefined, { Cookie: cookie }))).status).toBe(
      401,
    );
  }

  for (const value of [
    { accessToken: token },
    { accessToken: "opaque", tokenType: "Bearer", expiresIn: 3600, admin },
    { accessToken: token, tokenType: "Bearer", expiresIn: -1, admin },
  ]) {
    respond = (res) => json(res, value);
    const invalid = await login(req("/api/admin/auth/login", "POST", {}));
    expect(invalid.status).toBe(502);
    expect(invalid.headers.getSetCookie()).toEqual([]);
  }
});

it("blocks cross-origin admin mutations before any upstream request", async () => {
  for (const handler of [login, logout, createAdmin]) {
    expect(
      (await handler(req("/api/admin/auth", "POST", {}, { Origin: "https://attacker.invalid" })))
        .status,
    ).toBe(403);
  }

  expect(calls).toHaveLength(0);
});

it("filters administrator registration input and output", async () => {
  respond = (res) => json(res, { ...admin, passwordHash: "private" }, 201);
  const response = await createAdmin(
    req("/api/admin/admins", "POST", {
      name: admin.name,
      email: admin.email,
      password: "password123",
      createdBy: "attacker",
      status: "active",
    }),
  );
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual(admin);
  expect(JSON.parse(calls[0].body)).toEqual({
    name: admin.name,
    email: admin.email,
    password: "password123",
  });
  expect(calls[0].headers.authorization).toBe(`Bearer ${token}`);
});

it("preserves the caller's idempotency key, strips private order fields and keeps replay status", async () => {
  for (const status of [201, 200]) {
    respond = (res) =>
      json(
        res,
        {
          ...saved,
          userId: "private",
          idempotencyKey: "private",
          items: saved.items.map((item) => ({
            ...item,
            secret: "private",
            product: { ...item.product, internalCost: 1 },
          })),
        },
        status,
      );
    const response = await order(
      req(
        "/api/orders",
        "POST",
        { recipient: "회원", address: "서울", items: [], total: 1, userId: "attacker" },
        { "Idempotency-Key": "order-request-123" },
      ),
    );
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(saved);
    expect(calls.at(-1)?.headers["idempotency-key"]).toBe("order-request-123");
    expect(calls.at(-1)?.headers.authorization).toBe(`Bearer ${customer}`);
    expect(JSON.parse(calls.at(-1)!.body)).toEqual({
      recipient: "회원",
      address: "서울",
      items: [],
    });
  }

  expect(calls).toHaveLength(2);
});

it("rejects invalid/duplicated idempotency keys before upstream and ignores them on GET", async () => {
  for (const key of ["", "short", "x".repeat(65), "key-one11, key-two22", "../../private"]) {
    const response = await order(req("/api/orders", "POST", {}, { "Idempotency-Key": key }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("IDEMPOTENCY_KEY_INVALID");
  }

  expect(calls).toHaveLength(0);
  respond = (res) => json(res, [saved]);
  expect(
    (await orders(req("/api/orders", "GET", undefined, { "Idempotency-Key": "ignored-key" })))
      .status,
  ).toBe(200);
  expect(calls[0].headers["idempotency-key"]).toBeUndefined();
});

it("rejects invalid nested order/admin DTOs and preserves backend errors without retries", async () => {
  respond = (res) => json(res, { ...saved, items: [{ ...saved.items[0], unitPrice: "private" }] });
  expect((await order(req("/api/orders", "POST", {}))).status).toBe(502);
  respond = (res) => json(res, { items: [{ id: "private" }], total: 1, page: 1, pageSize: 20 });
  expect((await products(req("/api/admin/products"))).status).toBe(502);
  for (const status of [401, 403, 409, 500]) {
    respond = (res) => json(res, { error: { code: "OUT_OF_STOCK", message: "거절" } }, status);
    const count = calls.length;
    expect(
      (await order(req("/api/orders", "POST", {}, { "Idempotency-Key": "same-request-123" })))
        .status,
    ).toBe(status === 500 ? 502 : status);
    expect(calls.length).toBe(count + 1);
  }
});

it("accepts a public custom order with an optional product type", async () => {
  const custom = { name: "내 향", label: "paper", color: "#ffffff", counts: { rose: 2 } };
  const value = { ...saved, items: [{ ...saved.items[0], custom }] };
  respond = (res) => json(res, value, 201);
  const response = await order(req("/api/orders", "POST", {}));
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual(value);
});
