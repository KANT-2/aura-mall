import { test, expect } from "./fixtures/test";

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
  for (const path of ["/api/__test__/seed", "/api/openapi.json", "/api/docs"])
    expect((await request.get(path)).status()).toBe(404);
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
