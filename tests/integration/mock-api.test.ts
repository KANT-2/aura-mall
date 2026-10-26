import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { once } from "node:events";
import type { Server } from "node:http";
import { createMockApp } from "../../mock-server/app";

let server: Server;
let base: string;
beforeAll(async () => {
  server = createMockApp({ testMode: true }).listen(0, "127.0.0.1");
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
  return async function api(
    path: string,
    method = "GET",
    data?: unknown,
    headers: Record<string, string> = {},
  ) {
    const response = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie, ...headers },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    cookie = response.headers.get("set-cookie")?.split(";")[0] ?? cookie;
    return { status: response.status, body: await response.json() };
  };
}
const credentials = (name: string) => ({
  name,
  email: `${name}@example.com`,
  password: "password123",
});

describe("Mock API data ownership and validation", () => {
  it("serves catalog data, legacy slugs and explicit missing products", async () => {
    const api = client();
    const catalog = await api("/api/catalog");
    expect(catalog.body.products).toHaveLength(30);
    expect(catalog.body.ingredients).toHaveLength(24);
    expect((await api("/api/catalog/products/bergamot-veil")).body.id).toBe("fresh-eau-de-parfum");
    for (const id of ["unknown", "constructor", "toString", "__proto__"]) {
      expect((await api(`/api/catalog/products/${id}`)).status).toBe(404);
    }
  });
  it("keeps guest and member carts separate, including after logout", async () => {
    const api = client();
    expect(
      (await api("/api/cart/items", "POST", { productId: "fresh-hand-cream", quantity: 2 })).status,
    ).toBe(201);
    const registered = await api("/api/auth/register", "POST", credentials("cart-owner"));
    expect(registered.status).toBe(201);
    expect(registered.body.user.passwordHash).toBeUndefined();
    expect((await api("/api/cart")).body).toEqual([]);
    await api("/api/cart/items", "POST", { productId: "soft-candle", quantity: 1 });
    await api("/api/auth/logout", "POST");
    expect((await api("/api/cart")).body[0].product.id).toBe("fresh-hand-cream");
    await api("/api/auth/login", "POST", credentials("cart-owner"));
    expect((await api("/api/cart")).body[0].product.id).toBe("soft-candle");
  });
  it("rebuilds prices on the server and rejects invalid gift selections and quantities", async () => {
    const api = client();
    const added = await api("/api/cart/items", "POST", {
      productId: "fresh-hand-cream",
      quantity: 1,
      product: { price: 1 },
      price: 1,
    });
    expect(added.body[0].product.price).toBe(28000);
    expect(added.body[0].unitPrice).toBe(28000);
    expect(
      (await api("/api/cart/items", "POST", { productId: "fresh-hand-cream", quantity: -1 }))
        .status,
    ).toBe(400);
    expect(
      (
        await api("/api/cart/items", "POST", {
          productId: "fresh-gift-set",
          selection: ["fresh-candle", "fresh-candle", "soft-candle"],
        })
      ).status,
    ).toBe(400);
    const gift = await api("/api/cart/items", "POST", {
      productId: "fresh-gift-set",
      selection: ["fresh-hand-cream", "fresh-candle", "fresh-hand-wash"],
    });
    expect(gift.status).toBe(201);
  });
  it("rejects unregistered and incorrect credentials and duplicate concurrent registrations", async () => {
    const first = client(),
      second = client();
    expect((await first("/api/auth/login", "POST", credentials("missing"))).status).toBe(401);
    const results = await Promise.all([
      first("/api/auth/register", "POST", credentials("duplicate")),
      second("/api/auth/register", "POST", credentials("duplicate")),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(
      (
        await second("/api/auth/login", "POST", {
          ...credentials("duplicate"),
          password: "incorrect",
        })
      ).status,
    ).toBe(401);
  });
  it("owns recipe IDs and versions and refuses another account's parent recipe", async () => {
    const first = client(),
      second = client();
    const input = {
      name: "원본",
      counts: { bergamot: 3 },
      label: "paper",
      id: "forged",
      version: 999,
    };
    expect((await first("/api/recipes", "POST", input)).status).toBe(401);
    await first("/api/auth/register", "POST", credentials("recipe-owner"));
    const saved = await first("/api/recipes", "POST", input);
    expect(saved.body.id).not.toBe("forged");
    expect(saved.body.version).toBe(1);
    const version = await first("/api/recipes", "POST", { ...input, parent: saved.body.id });
    expect(version.body.version).toBe(2);
    await second("/api/auth/register", "POST", credentials("other-owner"));
    expect((await second("/api/recipes")).body).toEqual([]);
    expect((await second("/api/recipes", "POST", { ...input, parent: saved.body.id })).status).toBe(
      404,
    );
    expect((await second(`/api/recipes/${saved.body.id}`, "DELETE")).status).toBe(404);
  });
  it("persists a draft across login, isolates browsers and deletes the draft", async () => {
    const first = client(),
      second = client();
    const draft = { name: "초안", counts: { rose: 2 }, label: "classic", step: "select" };
    expect((await first("/api/atelier/draft", "PUT", draft)).status).toBe(200);
    await first("/api/auth/register", "POST", credentials("draft-owner"));
    expect((await first("/api/atelier/draft")).body.name).toBe(draft.name);
    expect((await second("/api/atelier/draft")).body).toBeNull();
    expect(
      (await first("/api/atelier/draft", "PUT", { ...draft, counts: { unknown: 1 } })).status,
    ).toBe(400);
    await first("/api/atelier/draft", "DELETE");
    expect((await first("/api/atelier/draft")).body).toBeNull();
  });
  it("calculates mock orders from server prices and consumes eligible coupons", async () => {
    const api = client();
    await api("/api/auth/register", "POST", credentials("order-owner"));
    await api("/api/cart/items", "POST", { productId: "fresh-hand-cream", quantity: 1 });
    const order = await api("/api/orders", "POST", {
      recipient: "AURA",
      address: "서울",
      coupon: true,
      total: 1,
    });
    expect(order.status).toBe(201);
    expect(order.body.total).toBe(28000);
    expect((await api("/api/cart")).body).toEqual([]);
    expect((await api("/api/orders")).body).toHaveLength(1);
    expect((await api("/api/session")).body.user.coupon).toBe(false);
  });
  it("stores validated partner inquiries and does not report invalid input as successful", async () => {
    const api = client();
    expect((await api("/api/partner", "POST", {})).status).toBe(400);
    const result = await api("/api/partner", "POST", {
      brand: "AURA",
      name: "담당자",
      email: "partner@example.com",
      introduction: "제품 소개",
      message: "입점 문의",
      type: "향수",
      consent: "on",
    });
    expect(result.status).toBe(201);
    expect(result.body.id).toEqual(expect.any(String));
  });
  it("does not expose test seeding in the regular mock server", async () => {
    const normal = createMockApp().listen(0, "127.0.0.1");
    await once(normal, "listening");
    try {
      const address = normal.address();
      if (!address || typeof address === "string") {
        throw new Error("No address");
      }

      expect(
        (
          await fetch(`http://127.0.0.1:${address.port}/__test__/seed`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          })
        ).status,
      ).toBe(404);
    } finally {
      await new Promise<void>((resolve) => normal.close(() => resolve()));
    }
  });
});

it("prototype-like cookies never become sessions", async () => {
  for (const token of ["__proto__", "constructor", "toString"]) {
    const response = await fetch(`${base}/api/session`, {
      headers: { Cookie: `aura_mock_session=${token}` },
    });
    const session = await response.json();
    expect(session.user).toBeNull();
    expect(session.guestId).toEqual(expect.any(String));
  }
});

it("rejects cart and recipe commands captured before an account change", async () => {
  const api = client();
  const guest = await api("/api/session");
  await api("/api/auth/register", "POST", credentials("scope-owner"));
  const headers = { "X-Session-Owner": guest.body.guestId };
  expect(
    (await api("/api/cart/items", "POST", { productId: "fresh-hand-cream", quantity: 1 }, headers))
      .status,
  ).toBe(409);
  expect(
    (await api("/api/recipes", "POST", { name: "Stale", counts: { rose: 1 } }, headers)).status,
  ).toBe(409);
  expect((await api("/api/cart")).body).toEqual([]);
  expect((await api("/api/recipes")).body).toEqual([]);
});
