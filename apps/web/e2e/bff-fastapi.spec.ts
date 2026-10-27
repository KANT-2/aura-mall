import { createHmac, randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

function token(subject: string, expired = false) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: subject, jti: randomUUID(), iat: now - 100, exp: expired ? now - 1 : now + 900, iss: "storefront-e2e", aud: "storefront-api-test" })}`;
  return `${input}.${createHmac("sha256", "storefront-e2e-test-only-key-0123456789").update(input).digest("base64url")}`;
}

test("production catalog API serves BFF and server-rendered product pages", async ({ request }) => {
  const response = await request.get("/api/catalog?url=https://attacker.invalid", {
    headers: { Cookie: "aura_session=not-a-jwt", Authorization: "Bearer private" },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["set-cookie"]).toBeUndefined();
  expect(response.headers()["cache-control"]).toContain("no-store");
  const catalog = await response.json();
  expect(catalog.products).toHaveLength(30);
  expect(catalog.ingredients).toHaveLength(24);
  expect(catalog.atelier.suggestedNames.fresh.length).toBeGreaterThan(0);
  expect(catalog.home.guestPromotions[0].copy).toEqual(expect.any(String));
  const product = await request.get("/api/catalog/products/fresh-eau-de-parfum");
  const legacy = await request.get("/api/catalog/products/bergamot-veil");
  expect(product.status()).toBe(200);
  expect(await legacy.json()).toEqual(await product.json());
  const missing = await request.get("/api/catalog/products/missing-product");
  expect(missing.status()).toBe(404);
  expect((await missing.json()).error.code).toBe("PRODUCT_NOT_FOUND");
  const page = await request.get("/shop/fresh-eau-de-parfum");
  expect(page.status()).toBe(200);
  expect(await page.text()).toContain((await product.json()).name);
});

test("production partner domain errors and validation remain public and safe", async ({
  request,
}) => {
  const inquiry = {
    brand: "오브제",
    name: "담당자",
    email: "partner@example.com",
    introduction: "향 브랜드",
    message: "입점 문의",
    type: "향수",
    consent: "on",
    website: "",
    userId: "admin",
    status: "done",
  };
  const submitted = await request.post("/api/partner", { data: inquiry });
  expect(submitted.status()).toBe(201);
  expect(await submitted.json()).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  expect(submitted.headers()["x-request-id"]).toBeTruthy();
  expect(submitted.headers()["set-cookie"]).toBeUndefined();
  const denied = await request.post("/api/partner", { data: { ...inquiry, consent: "off" } });
  expect(denied.status()).toBe(400);
  expect((await denied.json()).error.code).toBe("INQUIRY_CONSENT");
  const invalid = await request.post("/api/partner", {
    data: { ...inquiry, brand: { password: "private-input" } },
  });
  expect(invalid.status()).toBe(422);
  expect((await invalid.json()).error.code).toBe("VALIDATION_ERROR");
  expect(await invalid.text()).not.toContain("private-input");
  expect(
    (
      await request.post("/api/partner", {
        headers: { Origin: "https://attacker.invalid" },
        data: inquiry,
      })
    ).status(),
  ).toBe(403);
});

test("recipe API keeps anonymous access empty and rejects forged or expired credentials", async ({
  request,
}) => {
  expect(await (await request.get("/api/recipes")).json()).toEqual([]);
  const data = { name: "향", label: "paper", counts: { bergamot: 3 } };
  const anonymous = await request.post("/api/recipes", {
    headers: { Authorization: `Bearer ${token(randomUUID())}` },
    data,
  });
  expect(anonymous.status()).toBe(401);
  expect((await anonymous.json()).error.code).toBe("LOGIN_REQUIRED");
  for (const value of [token(randomUUID(), true), "header.payload.forged"]) {
    const response = await request.get("/api/recipes", {
      headers: { Cookie: `aura_session=${value}` },
    });
    expect(response.status()).toBe(401);
    expect(response.headers()["www-authenticate"]).toBe("Bearer");
    expect(response.headers()["set-cookie"]).toContain("Max-Age=0");
    expect(await response.text()).not.toContain(value);
  }
});

test("production recipe service supports save, remake, ownership and delete through BFF", async ({
  playwright,
}) => {
  const owner = randomUUID();
  const other = randomUUID();
  const context = async (id: string) =>
    playwright.request.newContext({
      baseURL: "http://127.0.0.1:3300",
      extraHTTPHeaders: { Cookie: `aura_session=${token(id)}`, "X-Session-Owner": id },
    });
  const member = await context(owner);
  const stranger = await context(other);
  try {
    const data = {
      name: "실제 API 조향",
      label: "paper",
      counts: { bergamot: 3 },
      id: randomUUID(),
      version: 999,
      userId: other,
      color: "#000000",
    };
    const created = await member.post("/api/recipes", { data });
    expect(created.status()).toBe(201);
    const recipe = await created.json();
    expect(recipe.id).not.toBe(data.id);
    expect(recipe.version).toBe(1);
    const catalog = await (await member.get("/api/catalog")).json();
    const bergamot = catalog.ingredients.find((item: { id: string }) => item.id === "bergamot");
    expect(recipe.color).toBe(bergamot.color);
    expect(recipe.color).not.toBe(data.color);
    expect(recipe).not.toHaveProperty("parent");
    expect(recipe).not.toHaveProperty("userId");
    expect(Date.parse(recipe.created)).not.toBeNaN();
    const remake = await member.post("/api/recipes", { data: { ...data, parent: recipe.id } });
    expect(remake.status()).toBe(201);
    const child = await remake.json();
    expect(child.parent).toBe(recipe.id);
    expect(child.version).toBe(2);
    expect(await (await stranger.get("/api/recipes")).json()).toEqual([]);
    const hidden = await stranger.delete(`/api/recipes/${recipe.id}`);
    expect(hidden.status()).toBe(404);
    expect((await hidden.json()).error.code).toBe("RECIPE_NOT_FOUND");
    const foreignParent = await stranger.post("/api/recipes", {
      data: { ...data, parent: recipe.id },
    });
    expect(foreignParent.status()).toBe(404);
    expect((await foreignParent.json()).error.code).toBe("RECIPE_PARENT_NOT_FOUND");
    const conflict = await member.post("/api/recipes", {
      headers: { "X-Session-Owner": other },
      data,
    });
    expect(conflict.status()).toBe(409);
    expect((await conflict.json()).error.code).toBe("OWNER_CHANGED");
    expect(conflict.headers()["set-cookie"]).toBeUndefined();
    const invalid = await member.post("/api/recipes", {
      data: { ...data, counts: { unknown: 3 } },
    });
    expect(invalid.status()).toBe(400);
    expect((await invalid.json()).error.code).toBe("COUNTS_INVALID");
    const deleted = await member.delete(`/api/recipes/${recipe.id}`);
    expect(deleted.status()).toBe(200);
    expect((await deleted.json()).map((item: { id: string }) => item.id)).toEqual([child.id]);
    expect(await (await member.delete(`/api/recipes/${child.id}`)).json()).toEqual([]);
  } finally {
    await member.dispose();
    await stranger.dispose();
  }
});
