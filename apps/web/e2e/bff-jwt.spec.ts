import { createHmac, randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext } from "@playwright/test";

const credentials = { email: "member-a@example.com", password: "bff-password123" };
const cookieToken = async (request: APIRequestContext) =>
  (await request.storageState()).cookies.find((cookie) => cookie.name === "aura_session")!.value;

test("real FastAPI JWT login, rotation, logout revocation and guest continuity", async ({
  request,
  playwright,
}) => {
  const guest = await (await request.get("/api/session")).json();
  const login = await request.post("/api/auth/login", { data: credentials });
  expect(login.status()).toBe(200);
  const member = await login.json();
  expect(member.guestId).toBe(guest.guestId);
  expect(member.user.id).toBe("member-a");
  expect(login.headers()["set-cookie"]).toMatch(/Path=\/; HttpOnly; SameSite=Lax; Max-Age=900/);
  const token = await cookieToken(request);
  expect(await login.text()).not.toContain(token);
  expect(await (await request.get("/api/session")).json()).toEqual(member);
  expect(await (await request.get("/api/recipes")).json()).toEqual([{ id: "recipe-member-a" }]);

  const loggedOut = await request.post("/api/auth/logout");
  expect(loggedOut.status()).toBe(200);
  expect(await loggedOut.json()).toEqual(guest);
  expect(await cookieToken(request)).not.toBe(token);
  expect((await request.get("/api/recipes")).status()).toBe(403);
  const replay = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3200" });
  try {
    const rejected = await replay.get("/api/recipes", {
      headers: { Cookie: `aura_session=${token}` },
    });
    expect(rejected.status()).toBe(401);
    expect(rejected.headers()["www-authenticate"]).toBe("Bearer");
    expect(rejected.headers()["set-cookie"]).toContain("Max-Age=0");
  } finally {
    await replay.dispose();
  }
});

test("real verifier rejects expired and forged JWTs; browser Authorization cannot authenticate", async ({
  request,
}) => {
  const encode = (data: unknown) => Buffer.from(JSON.stringify(data)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    sub: "member-a",
    jti: randomUUID(),
    iat: now - 100,
    exp: now - 1,
    iss: "bff-e2e",
    aud: "aura-api-test",
  });
  const input = `${header}.${payload}`;
  const expired = `${input}.${createHmac("sha256", "bff-e2e-test-only-key-0123456789abcdef").update(input).digest("base64url")}`;
  await request.post("/api/auth/login", { data: credentials });
  const valid = await cookieToken(request);
  const forged = `${valid.slice(0, valid.lastIndexOf(".") + 1)}forged`;
  for (const token of [expired, forged]) {
    const response = await request.get("/api/recipes", {
      headers: { Cookie: `aura_session=${token}` },
    });
    expect(response.status()).toBe(401);
    expect(response.headers()["set-cookie"]).toContain("Max-Age=0");
    expect(response.headers()["x-request-id"]).toBeTruthy();
    expect(await response.text()).not.toContain(token);
  }

  expect(
    (await request.get("/api/recipes", { headers: { Authorization: `Bearer ${valid}` } })).status(),
  ).toBe(401);
});

test("separate users retain their identities; origin and owner checks still apply", async ({
  request,
  playwright,
}) => {
  await request.post("/api/auth/login", { data: credentials });
  const other = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3200" });
  try {
    await other.post("/api/auth/login", {
      data: { ...credentials, email: "member-b@example.com" },
    });
    expect(await (await other.get("/api/recipes")).json()).toEqual([{ id: "recipe-member-b" }]);
    expect(await (await request.get("/api/recipes")).json()).toEqual([{ id: "recipe-member-a" }]);
    const conflict = await request.get("/api/recipes", {
      headers: { "X-Session-Owner": "member-b" },
    });
    expect(conflict.status()).toBe(409);
    expect(conflict.headers()["set-cookie"]).toBeUndefined();
    expect(
      (
        await request.post("/api/auth/logout", { headers: { Origin: "https://attacker.invalid" } })
      ).status(),
    ).toBe(403);
    expect((await request.get("/api/recipes")).status()).toBe(200);
  } finally {
    await other.dispose();
  }
});
