import { test, expect } from "./fixtures/test";
import { randomUUID } from "node:crypto";

test("BFF exposes the storefront contract and keeps backend-only endpoints private", async ({
  request,
}) => {
  const catalog = await request.get("/api/catalog?url=https://untrusted.invalid");
  expect(catalog.status()).toBe(200);
  expect((await catalog.json()).products).toHaveLength(30);
  expect(catalog.headers()["cache-control"]).toContain("no-store");
  expect(catalog.headers()["x-request-id"]).toBeTruthy();
  const session = await request.get("/api/session");
  expect(session.status()).toBe(200);
  expect((await session.json()).user).toBeNull();
  expect(session.headers()["set-cookie"]).toMatch(/HttpOnly/i);
  expect(session.headers()["set-cookie"]).not.toMatch(/Domain=/i);
  expect((await request.get("/api/auth/login")).status()).toBe(405);
  for (const path of ["/api/__test__/seed", "/api/openapi.json", "/api/docs"]) {
    expect((await request.get(path)).status()).toBe(404);
  }
});

test("BFF rejects foreign origins and invalid JSON before authentication", async ({ request }) => {
  const foreign = await request.post("/api/auth/login", {
    headers: { Origin: "https://untrusted.invalid" },
    data: {},
  });
  expect(foreign.status()).toBe(403);
  expect((await foreign.json()).error.code).toBe("INVALID_ORIGIN");
  const malformed = await request.post("/api/auth/login", {
    headers: { "Content-Type": "application/json" },
    data: "{",
  });
  expect(malformed.status()).toBe(400);
  expect((await malformed.json()).error.code).toBe("INVALID_JSON");
});

test("BFF preserves Mock sessions and isolates recipes, drafts and orders", async ({ request }) => {
  const guest = await (await request.get("/api/session")).json();
  const credentials = { email: `bff-${randomUUID()}@example.com`, password: "password123" };
  const registered = await request.post("/api/auth/register", {
    data: { ...credentials, name: "BFF 회원" },
  });
  expect(registered.status()).toBe(201);
  const member = await registered.json();
  expect(member.guestId).toBe(guest.guestId);
  expect(member.user).not.toHaveProperty("passwordHash");

  const composition = { name: "BFF 조향", counts: { rose: 2 }, label: "paper" };
  const recipe = await request.post("/api/recipes", { data: composition });
  expect(recipe.status()).toBe(201);
  const saved = await recipe.json();
  expect(saved.version).toBe(1);
  expect(
    (
      await request.put("/api/atelier/draft", { data: { ...composition, step: "select" } })
    ).status(),
  ).toBe(200);
  const loggedOut = await request.post("/api/auth/logout");
  expect(loggedOut.status()).toBe(200);
  expect(await loggedOut.json()).toEqual(guest);
  expect(await (await request.get("/api/recipes")).json()).toEqual([]);
  expect((await (await request.get("/api/atelier/draft")).json()).name).toBe(composition.name);
  expect((await request.get("/api/orders")).status()).toBe(401);

  expect((await request.post("/api/auth/login", { data: credentials })).status()).toBe(200);
  expect(await (await request.get("/api/recipes")).json()).toEqual([saved]);
  const order = await request.post("/api/orders", {
    data: {
      recipient: "BFF 회원",
      address: "서울",
      coupon: true,
      total: 1,
      items: [{ custom: composition, quantity: 1 }],
    },
  });
  expect(order.status()).toBe(201);
  const ordered = await order.json();
  expect(ordered.total).toBe(98000);
  expect(ordered.items[0].unitPrice).toBe(98000);
  expect(await (await request.get("/api/orders")).json()).toEqual([ordered]);
  expect(await (await request.delete(`/api/recipes/${saved.id}`)).json()).toEqual([]);
  expect(await (await request.delete("/api/atelier/draft")).json()).toBeNull();
});

test("BFF returns invalid order errors and does not expose cart endpoints", async ({ request }) => {
  for (const items of [
    [],
    [{ productId: "fresh-hand-cream", quantity: 16 }],
    [{ productId: "fresh-hand-cream", custom: { name: "조향", counts: { rose: 2 } }, quantity: 1 }],
  ]) {
    const rejected = await request.post("/api/orders", {
      data: { recipient: "AURA", address: "서울", items },
    });
    expect(rejected.status()).toBe(400);
    expect(await rejected.json()).toEqual({
      error: { code: "HTTP_400", message: expect.any(String) },
    });
  }

  expect((await request.post("/api/auth/register")).status()).toBe(400);
  expect((await request.get("/api/cart")).status()).toBe(404);
  expect(
    (
      await request.post("/api/cart/items", {
        data: { productId: "fresh-hand-cream", quantity: 1 },
      })
    ).status(),
  ).toBe(404);
});
