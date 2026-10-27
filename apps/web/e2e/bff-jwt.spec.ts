import { createHmac, randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext } from "@playwright/test";

const credentials = { email: "member-a@example.com", password: "bff-password123" };
const cookieToken = async (request: APIRequestContext, name = "aura_access") =>
  (await request.storageState()).cookies.find((cookie) => cookie.name === name)?.value;

test("production FastAPI auth issues JWT cookies, rotates refresh and revokes logout", async ({
  request,
  playwright,
}) => {
  const guest = await (await request.get("/api/auth/me")).json();
  const login = await request.post("/api/auth/login", { data: credentials });
  expect(login.status()).toBe(200);
  const member = await login.json();
  expect(member.guestId).toBe(guest.guestId);
  expect(member.user.email).toBe(credentials.email);
  expect(login.headers()["set-cookie"]).toMatch(/Path=\/; HttpOnly; SameSite=Lax; Max-Age=900/);
  expect(login.headers()["set-cookie"]).toContain("Path=/api/auth; HttpOnly");
  const original = await cookieToken(request);
  const originalRefresh = await cookieToken(request, "aura_refresh");
  expect(await login.text()).not.toContain(original!);
  expect(await login.text()).not.toContain(originalRefresh!);
  expect(await (await request.get("/api/auth/me")).json()).toEqual(member);
  expect(await (await request.get("/api/recipes")).json()).toMatchObject([
    { id: `recipe-${member.user.id}` },
  ]);
  expect((await request.post("/api/auth/refresh")).status()).toBe(204);
  const rotated = await cookieToken(request);
  expect(rotated).not.toBe(original);
  expect(await cookieToken(request, "aura_refresh")).not.toBe(originalRefresh);
  const loggedOut = await request.post("/api/auth/logout");
  expect(loggedOut.status()).toBe(200);
  expect(await loggedOut.json()).toEqual(guest);
  expect(await cookieToken(request)).toBeUndefined();
  expect(await cookieToken(request, "aura_refresh")).toBeUndefined();
  expect(await (await request.get("/api/recipes")).json()).toEqual([]);
  const replay = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3200" });
  try {
    for (const token of [original, rotated]) {
      const rejected = await replay.get("/api/auth/me", {
        headers: { Cookie: `aura_access=${token}` },
      });
      expect(rejected.status()).toBe(401);
      expect(rejected.headers()["www-authenticate"]).toBe("Bearer");
    }
  } finally {
    await replay.dispose();
  }
});

test("production verifier rejects expired/forged JWTs and browser Authorization", async ({
  request,
}) => {
  const encode = (data: unknown) => Buffer.from(JSON.stringify(data)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const input = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: randomUUID(), jti: randomUUID(), iat: now - 100, exp: now - 1, iss: "bff-e2e", aud: "aura-api-test" })}`;
  const expired = `${input}.${createHmac("sha256", "bff-e2e-test-only-key-0123456789abcdef").update(input).digest("base64url")}`;
  await request.post("/api/auth/login", { data: credentials });
  const valid = (await cookieToken(request))!;
  const forged = `${valid.slice(0, valid.lastIndexOf(".") + 1)}forged`;
  for (const token of [expired, forged]) {
    const response = await request.get("/api/auth/me", {
      headers: { Cookie: `aura_access=${token}` },
    });
    expect(response.status()).toBe(401);
    expect(response.headers()["www-authenticate"]).toBe("Bearer");
    expect(response.headers()["set-cookie"] ?? "").not.toContain("aura_access=;");
    expect(await response.text()).not.toContain(token);
  }

  expect(
    await (
      await request.get("/api/recipes", {
        headers: { Cookie: "", Authorization: `Bearer ${valid}` },
      })
    ).json(),
  ).toEqual([]);
});

test("separate users retain their identities and origin/owner checks apply", async ({
  request,
  playwright,
}) => {
  const first = await (await request.post("/api/auth/login", { data: credentials })).json();
  const other = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3200" });
  try {
    const second = await (
      await other.post("/api/auth/login", {
        data: { ...credentials, email: "member-b@example.com" },
      })
    ).json();
    expect(await (await other.get("/api/recipes")).json()).toMatchObject([
      { id: `recipe-${second.user.id}` },
    ]);
    expect(await (await request.get("/api/recipes")).json()).toMatchObject([
      { id: `recipe-${first.user.id}` },
    ]);
    const conflict = await request.get("/api/recipes", {
      headers: { "X-Account-Owner": second.user.id },
    });
    expect(conflict.status()).toBe(409);
    expect(
      (
        await request.post("/api/auth/logout", { headers: { Origin: "https://attacker.invalid" } })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.post("/api/auth/refresh", { headers: { Origin: "https://attacker.invalid" } })
      ).status(),
    ).toBe(403);
    expect((await request.get("/api/recipes")).status()).toBe(200);
  } finally {
    await other.dispose();
  }
});

test("production registration returns a member through the same JWT contract", async ({
  request,
}) => {
  const email = `registration-${randomUUID()}@example.com`;
  const registered = await request.post("/api/auth/register", {
    data: { name: "JWT 회원", email, password: "password123" },
  });
  expect(registered.status()).toBe(201);
  expect((await registered.json()).user).toMatchObject({ email, role: "member", coupon: true });
  expect((await request.get("/api/auth/me")).status()).toBe(200);
  const duplicate = await request.post("/api/auth/register", {
    data: { name: "JWT 회원", email, password: "password123" },
  });
  expect(duplicate.status()).toBe(409);
});

test("replayed refresh revokes the family and clears both browser tokens", async ({
  request,
  playwright,
}) => {
  await request.post("/api/auth/login", { data: credentials });
  const old = await cookieToken(request, "aura_refresh");
  expect((await request.post("/api/auth/refresh")).status()).toBe(204);
  const replay = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3200" });
  try {
    const rejected = await replay.post("/api/auth/refresh", {
      headers: { Cookie: `aura_refresh=${old}` },
    });
    expect(rejected.status()).toBe(401);
    expect(rejected.headers()["set-cookie"]).toContain("aura_access=;");
    expect(rejected.headers()["set-cookie"]).toContain("aura_refresh=;");
    expect((await request.get("/api/auth/me")).status()).toBe(401);
  } finally {
    await replay.dispose();
  }
});

test("browser tabs share one refresh after access expiry and keep the member signed in", async ({
  context,
  page,
}) => {
  await context.request.post("/api/auth/login", { data: credentials });
  const oldRefresh = await cookieToken(context.request, "aura_refresh");
  await context.clearCookies({ name: "aura_access" });
  let refreshes = 0;
  context.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/auth/refresh") {
      refreshes += 1;
    }
  });
  const other = await context.newPage();
  try {
    await Promise.all([page.goto("/mypage"), other.goto("/mypage")]);
    await expect(page.getByRole("button", { name: "로그아웃", exact: true })).toBeVisible();
    await expect(other.getByRole("button", { name: "로그아웃", exact: true })).toBeVisible();
    expect(refreshes).toBe(1);
    expect(await cookieToken(context.request, "aura_refresh")).not.toBe(oldRefresh);
    expect(await page.evaluate(() => document.cookie)).not.toMatch(/aura_access|aura_refresh/);
    await page.getByRole("button", { name: "로그아웃", exact: true }).click();
    await expect(page.getByRole("link", { name: "로그인", exact: true }).first()).toBeVisible();
    expect(await cookieToken(context.request)).toBeUndefined();
  } finally {
    await other.close();
  }
});
