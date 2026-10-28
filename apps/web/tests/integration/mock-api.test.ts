import { randomUUID } from "node:crypto";
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
  let token = "";
  const guestId = randomUUID();
  return async function api(
    path: string,
    method = "GET",
    data?: unknown,
    headers: Record<string, string> = {},
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Guest-ID": guestId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const body = response.status === 204 ? null : await response.json();
    if (body?.accessToken) {
      token = body.accessToken;
    }

    return { status: response.status, body, guestId, headers: response.headers };
  };
}

const credentials = (name: string) => ({
  name,
  email: `${name}@example.com`,
  password: "password123",
});

describe("Mock API data ownership and validation", () => {
  it.each([
    ["/api/auth/register", "POST"],
    ["/api/auth/login", "POST"],
    ["/api/recipes", "POST"],
    ["/api/atelier/draft", "PUT"],
    ["/api/orders", "POST"],
    ["/api/partner", "POST"],
  ])("requires a JSON object for %s %s", async (path, method) => {
    for (const body of [undefined, "", "[]", "null", '"private-password"', '{"password":']) {
      const response = await fetch(base + path, {
        method,
        headers: { "Content-Type": "application/json" },
        body,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: { message: "입력 형식을 확인해 주세요." },
      });
    }

    const response = await fetch(base + path, {
      method,
      headers: { "Content-Type": "text/plain" },
      body: "{}",
    });
    expect(response.status).toBe(415);
  });
  it("reports oversized JSON as 413 without echoing request data", async () => {
    const response = await fetch(base + "/api/partner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "private-input".repeat(3000) }),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: { message: "입력 내용이 너무 길어요." } });
  });
  it("issues JWT token pairs, accepts only Bearer, rotates refresh and revokes logout", async () => {
    const api = client();
    expect((await api("/api/auth/me")).status).toBe(401);
    const registered = await api("/api/auth/register", "POST", credentials("identity-owner"));
    expect(registered.body).toMatchObject({
      accessToken: expect.stringMatching(/^[\w-]+\.[\w-]+\.[\w-]+$/),
      refreshToken: expect.stringMatching(/^r1_/),
      tokenType: "Bearer",
    });
    expect(registered.headers.get("set-cookie")).toBeNull();
    expect((await api("/api/auth/me")).body.email).toBe("identity-owner@example.com");
    const rotated = await api("/api/auth/refresh", "POST", {
      refreshToken: registered.body.refreshToken,
    });
    expect(rotated.status).toBe(200);
    expect(rotated.body.accessToken).not.toBe(registered.body.accessToken);
    expect((await api("/api/auth/logout", "POST")).status).toBe(204);
    expect((await api("/api/auth/me")).status).toBe(401);
    expect(
      (await api("/api/auth/refresh", "POST", { refreshToken: rotated.body.refreshToken })).status,
    ).toBe(401);
  });

  it("revokes a whole token family when a consumed refresh token is replayed", async () => {
    const api = client();
    const registered = await api("/api/auth/register", "POST", credentials("refresh-replay"));
    await api("/api/auth/refresh", "POST", { refreshToken: registered.body.refreshToken });
    expect(
      (await api("/api/auth/refresh", "POST", { refreshToken: registered.body.refreshToken }))
        .status,
    ).toBe(401);
    expect((await api("/api/auth/me")).status).toBe(401);
  });
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
  it("does not expose server cart endpoints", async () => {
    const api = client();
    expect((await api("/api/cart")).status).toBe(404);
    expect(
      (await api("/api/cart/items", "POST", { productId: "fresh-hand-cream", quantity: 1 })).status,
    ).toBe(404);
    expect((await api("/api/cart/items/key", "PATCH", { quantity: 2 })).status).toBe(404);
  });
  it("does not create an account when the account owner check rejects registration", async () => {
    const api = client();
    const guest = await api("/api/auth/me");
    const input = credentials("rejected-registration");
    expect(
      (await api("/api/auth/register", "POST", input, { "X-Account-Owner": "stale-owner" })).status,
    ).toBe(409);
    expect((await api("/api/auth/me")).body).toEqual(guest.body);
    expect((await api("/api/auth/login", "POST", input)).status).toBe(401);
    expect((await api("/api/auth/register", "POST", input)).status).toBe(201);
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
    const order = await api("/api/orders", "POST", {
      recipient: "AURA",
      address: "서울",
      coupon: true,
      total: 1,
      items: [{ productId: "fresh-hand-cream", quantity: 1, unitPrice: 1, product: { price: 1 } }],
    });
    expect(order.status).toBe(201);
    expect(order.body.total).toBe(28000);
    expect(order.body.items[0].unitPrice).toBe(28000);
    expect((await api("/api/orders")).body).toEqual([order.body]);
    expect((await api("/api/auth/me")).body.coupon).toBe(false);
  });
  it("rechecks order stock and leaves orders and coupons intact on failure", async () => {
    const api = client();
    await api("/api/auth/register", "POST", credentials("stock-order-owner"));
    const invalidItems = [
      undefined,
      [],
      [{ productId: "fresh-hand-cream", quantity: 16 }],
      [
        { productId: "fresh-hand-cream", quantity: 10 },
        { productId: "fresh-hand-cream", quantity: 6 },
      ],
      [
        {
          productId: "fresh-hand-cream",
          quantity: 1,
          custom: { name: "invalid", counts: { rose: 2 } },
        },
      ],
      [
        {
          productId: "fresh-gift-set",
          selection: ["fresh-hand-cream", "fresh-candle", "fresh-hand-wash"],
          quantity: 10,
        },
        { productId: "fresh-hand-cream", quantity: 6 },
      ],
    ];
    for (const items of invalidItems) {
      expect(
        (
          await api("/api/orders", "POST", {
            recipient: "AURA",
            address: "서울",
            coupon: true,
            items,
          })
        ).status,
      ).toBe(400);
    }

    expect((await api("/api/orders")).body).toEqual([]);
    expect((await api("/api/auth/me")).body.coupon).toBe(true);
  });
  it("rebuilds custom order items from compositions and isolates order history", async () => {
    const first = client(),
      second = client();
    await first("/api/auth/register", "POST", credentials("custom-order-owner"));
    const result = await first("/api/orders", "POST", {
      recipient: "AURA",
      address: "서울",
      items: [
        {
          custom: { name: "내 향", counts: { rose: 2 }, label: "paper", color: "#000000" },
          quantity: 1,
          unitPrice: 1,
        },
      ],
    });
    expect(result.status).toBe(201);
    expect(result.body.total).toBe(98000);
    expect(result.body.items[0].unitPrice).toBe(98000);
    expect(result.body.items[0].custom.color).not.toBe("#000000");
    await second("/api/auth/register", "POST", credentials("other-order-owner"));
    expect((await second("/api/orders")).body).toEqual([]);
    expect((await first("/api/orders")).body).toEqual([result.body]);
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

it("never authenticates a user from a legacy session cookie", async () => {
  for (const token of ["__proto__", "constructor", "toString"]) {
    const response = await fetch(`${base}/api/auth/me`, {
      headers: { Cookie: `aura_mock_session=${token}` },
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  }
});

it("rejects recipe commands captured before an account change", async () => {
  const api = client();
  const guest = await api("/api/auth/me");
  await api("/api/auth/register", "POST", credentials("scope-owner"));
  const headers = { "X-Account-Owner": guest.guestId };
  expect(
    (await api("/api/recipes", "POST", { name: "Stale", counts: { rose: 1 } }, headers)).status,
  ).toBe(409);
  expect((await api("/api/recipes")).body).toEqual([]);
});

it("replays a member's idempotent order without adding a second order or consuming another coupon", async () => {
  const api = client();
  await api("/api/auth/register", "POST", credentials("idempotent-owner"));
  const data = {
    recipient: "회원",
    address: "서울",
    coupon: true,
    items: [{ productId: "fresh-hand-cream", quantity: 1 }],
  };
  const first = await api("/api/orders", "POST", data, { "Idempotency-Key": "same-order-request" });
  expect(first.status).toBe(201);
  const replay = await api(
    "/api/orders",
    "POST",
    { ...data, items: [] },
    { "Idempotency-Key": "same-order-request" },
  );
  expect(replay.status).toBe(200);
  expect(replay.body).toEqual(first.body);
  expect((await api("/api/orders")).body).toEqual([first.body]);
  expect((await api("/api/auth/me")).body.coupon).toBe(false);
});
