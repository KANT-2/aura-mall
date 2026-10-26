import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { once } from "node:events";
import type { Server } from "node:http";
import { createMockApp } from "../../mock-server/app";
import { createDatabase } from "../../mock-server/data/store";
import { ensureMockAdmin } from "../../mock-server/admin-account";

const admin = { email: "admin@example.com", password: "admin-password" };
const database = createDatabase();
ensureMockAdmin(database, admin.email, admin.password);
let server: Server;
let base: string;
beforeAll(async () => {
  server = createMockApp({ database }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("No mock address");
  }

  base = `http://127.0.0.1:${address.port}`;
});
afterAll(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    ),
);

function client() {
  let cookie = "";
  return async function api(path: string, method = "GET", data?: unknown) {
    const response = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    cookie = response.headers.get("set-cookie")?.split(";")[0] ?? cookie;
    return { status: response.status, body: await response.json() };
  };
}
async function adminClient() {
  const api = client();
  const login = await api("/api/auth/login", "POST", admin);
  expect(login.body.user.role).toBe("admin");
  return api;
}
const inquiry = {
  brand: "Moss Studio",
  name: "담당자",
  email: "partner@example.com",
  introduction: "향 브랜드",
  message: "입점 문의",
  type: "향수",
  consent: "on",
};

describe("Mock admin API authorization", () => {
  const endpoints: [string, string, unknown?][] = [
    ["/api/admin/overview", "GET"],
    ["/api/admin/products", "GET"],
    ["/api/admin/products/fresh-hand-cream", "PATCH", { version: 1, price: 1 }],
    [
      "/api/admin/products/fresh-hand-cream/stock-adjustments",
      "POST",
      { version: 1, delta: 1, reason: "x", key: "unauthorized-key" },
    ],
    ["/api/admin/orders", "GET"],
    ["/api/admin/inquiries", "GET"],
    ["/api/admin/inquiries/any", "PATCH", { version: 1, status: "done" }],
  ];
  it.each(endpoints)(
    "rejects guests (401) and members (403) for %s %s",
    async (path, method, body) => {
      const guest = client();
      expect((await guest(path, method, body)).status).toBe(401);
      const member = client();
      await member("/api/auth/register", "POST", {
        name: "회원",
        email: `member-${method}-${path.length}-${Math.random()}@example.com`,
        password: "password123",
      });
      expect((await member(path, method, body)).status).toBe(403);
    },
  );
  it("never grants admin through registration input", async () => {
    const api = client();
    const registered = await api("/api/auth/register", "POST", {
      name: "공격자",
      email: "role-injection@example.com",
      password: "password123",
      role: "admin",
    });
    expect(registered.body.user.role).toBe("member");
    expect((await api("/api/admin/overview")).status).toBe(403);
  });
  it("rejects access after logout and after the role is revoked", async () => {
    const api = await adminClient();
    expect((await api("/api/admin/overview")).status).toBe(200);
    await api("/api/auth/logout", "POST");
    expect((await api("/api/admin/overview")).status).toBe(401);

    const revoked = await adminClient();
    const account = Object.values(database.state.accounts).find((a) => a.email === admin.email)!;
    account.role = "member";
    try {
      expect((await revoked("/api/admin/products")).status).toBe(403);
    } finally {
      account.role = "admin";
    }
  });
});

describe("Mock admin product and stock management", () => {
  it("filters and paginates products", async () => {
    const api = await adminClient();
    const all = await api("/api/admin/products");
    expect(all.body).toMatchObject({ total: 30, page: 1, pageSize: 20 });
    expect(all.body.items).toHaveLength(20);
    expect((await api("/api/admin/products?page=2")).body.items).toHaveLength(10);
    const fresh = await api("/api/admin/products?collection=fresh&q=hand");
    expect(fresh.body.items.length).toBeGreaterThan(0);
    expect(
      fresh.body.items.every(
        (product: { collection: string; englishName: string }) =>
          product.collection === "fresh" && /hand/i.test(product.englishName),
      ),
    ).toBe(true);
  });
  it("updates allowed fields with version checks and keeps order snapshots", async () => {
    const shopper = client();
    await shopper("/api/auth/register", "POST", {
      name: "구매자",
      email: "snapshot@example.com",
      password: "password123",
    });
    const order = await shopper("/api/orders", "POST", {
      recipient: "구매자",
      address: "서울",
      items: [{ productId: "warm-hand-cream", quantity: 1 }],
    });
    expect(order.status).toBe(201);
    const originalPrice = order.body.items[0].unitPrice;

    const api = await adminClient();
    const before = await api("/api/admin/products/warm-hand-cream");
    expect(before.body.imageOptions.length).toBeGreaterThan(1);
    const updated = await api("/api/admin/products/warm-hand-cream", "PATCH", {
      version: before.body.version,
      price: originalPrice + 5000,
      name: "WARM 핸드크림 리뉴얼",
      stock: 999,
      id: "renamed",
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      id: "warm-hand-cream",
      price: originalPrice + 5000,
      name: "WARM 핸드크림 리뉴얼",
      stock: before.body.stock,
      version: before.body.version + 1,
    });
    expect(updated.body.history[0]).toMatchObject({
      action: "product.update",
      actor: "AURA 운영자",
    });

    const stale = await api("/api/admin/products/warm-hand-cream", "PATCH", {
      version: before.body.version,
      price: 1,
    });
    expect(stale.status).toBe(409);
    expect(
      (
        await api("/api/admin/products/warm-hand-cream", "PATCH", {
          version: updated.body.version,
          image: "https://attacker.test/x.png",
        })
      ).status,
    ).toBe(400);

    const catalog = await shopper("/api/catalog/products/warm-hand-cream");
    expect(catalog.body.price).toBe(originalPrice + 5000);
    expect(catalog.body).not.toHaveProperty("version");
    expect(catalog.body).not.toHaveProperty("history");
    const orders = await shopper("/api/orders");
    expect(orders.body[0].items[0].unitPrice).toBe(originalPrice);
    expect(orders.body[0].items[0].product.name).not.toBe("WARM 핸드크림 리뉴얼");
    const detail = await api(`/api/admin/orders/${order.body.id}`);
    expect(detail.body).toMatchObject({
      customer: { name: "구매자", email: "snapshot@example.com" },
      items: [{ productId: "warm-hand-cream", unitPrice: originalPrice, quantity: 1 }],
    });
    expect(JSON.stringify(detail.body)).not.toMatch(/passwordHash|salt|owner/);
  });
  it("records stock adjustments once per request key and rejects invalid results", async () => {
    const api = await adminClient();
    const before = (await api("/api/admin/products/fresh-hand-wash")).body;
    const input = { version: before.version, delta: 5, reason: "정기 입고", key: "stock-key-0001" };
    const first = await api("/api/admin/products/fresh-hand-wash/stock-adjustments", "POST", input);
    expect(first.status).toBe(201);
    expect(first.body.stock).toBe(before.stock + 5);
    expect(first.body.history[0]).toMatchObject({
      action: "product.stock",
      reason: "정기 입고",
      changes: [{ field: "stock", from: before.stock, to: before.stock + 5 }],
    });
    const replay = await api(
      "/api/admin/products/fresh-hand-wash/stock-adjustments",
      "POST",
      input,
    );
    expect(replay.status).toBe(200);
    expect(replay.body.stock).toBe(before.stock + 5);
    expect(
      (
        await api("/api/admin/products/fresh-hand-wash/stock-adjustments", "POST", {
          ...input,
          delta: 6,
        })
      ).status,
    ).toBe(409);
    for (const body of [
      { ...input, key: "stock-key-0002", version: before.version },
      { ...input, key: "stock-key-0003", version: first.body.version, reason: " " },
      { ...input, key: "stock-key-0004", version: first.body.version, delta: 0 },
      { ...input, key: "stock-key-0005", version: first.body.version, delta: -100_000 },
    ]) {
      const response = await api(
        "/api/admin/products/fresh-hand-wash/stock-adjustments",
        "POST",
        body,
      );
      expect([400, 409]).toContain(response.status);
    }

    expect((await api("/api/admin/products/fresh-hand-wash")).body.stock).toBe(before.stock + 5);
  });
  it("does not lose concurrent stock adjustments based on the same version", async () => {
    const api = await adminClient();
    const before = (await api("/api/admin/products/soft-hand-cream")).body;
    const results = await Promise.all(
      ["concurrent-a1", "concurrent-b1"].map((key) =>
        api("/api/admin/products/soft-hand-cream/stock-adjustments", "POST", {
          version: before.version,
          delta: 1,
          reason: "동시 입고",
          key,
        }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect((await api("/api/admin/products/soft-hand-cream")).body.stock).toBe(before.stock + 1);
  });
});

describe("Mock admin orders and inquiries", () => {
  it("filters orders by Korean business date and validates ranges", async () => {
    const api = await adminClient();
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
    expect((await api(`/api/admin/orders?from=${today}&to=${today}`)).body.total).toBeGreaterThan(
      0,
    );
    expect((await api("/api/admin/orders?to=2000-01-01")).body.total).toBe(0);
    expect((await api("/api/admin/orders?from=2026-02-01&to=2026-01-01")).status).toBe(400);
    expect((await api("/api/admin/orders?from=yesterday")).status).toBe(400);
    expect((await api("/api/admin/orders/missing")).status).toBe(404);
  });
  it("updates inquiry status and internal memo without exposing them publicly", async () => {
    const visitor = client();
    const created = await visitor("/api/partner", "POST", inquiry);
    expect(created.body).toEqual({ id: expect.any(String) });
    const api = await adminClient();
    const list = await api("/api/admin/inquiries?status=received");
    expect(list.body.items.some((item: { id: string }) => item.id === created.body.id)).toBe(true);
    const detail = await api(`/api/admin/inquiries/${created.body.id}`);
    expect(detail.body).toMatchObject({ status: "received", memo: "", version: 1 });
    const updated = await api(`/api/admin/inquiries/${created.body.id}`, "PATCH", {
      version: 1,
      status: "reviewing",
      memo: "  다음 주 연락  ",
    });
    expect(updated.body).toMatchObject({ status: "reviewing", memo: "다음 주 연락", version: 2 });
    expect(
      updated.body.history[0].changes.map((change: { field: string }) => change.field),
    ).toEqual(["status", "memo"]);
    expect(
      (
        await api(`/api/admin/inquiries/${created.body.id}`, "PATCH", {
          version: 1,
          status: "done",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await api(`/api/admin/inquiries/${created.body.id}`, "PATCH", {
          version: 2,
          status: "spam",
        })
      ).status,
    ).toBe(400);
    const overview = await api("/api/admin/overview");
    expect(overview.body.inquiries.reviewing).toBeGreaterThan(0);
    expect(JSON.stringify(await visitor("/api/catalog"))).not.toContain("다음 주 연락");
  });
});
