import { createHmac, randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext } from "@playwright/test";

const credentials = { email: "member-a@example.com", password: "bff-password123" };

test("password and deactivation confirmations are independent and empty deactivation never submits", async ({
  page,
  context,
}) => {
  expect(
    (
      await context.request.post("/api/auth/register", {
        data: {
          name: "Separate forms",
          email: `cra36-${randomUUID()}@example.com`,
          password: credentials.password,
        },
      })
    ).status(),
  ).toBe(201);
  await page.goto("/mypage");
  await page.getByRole("button", { name: "계정 관리", exact: true }).click();
  const current = page.getByLabel("현재 비밀번호", { exact: true });
  const confirmation = page.getByLabel("확인용 현재 비밀번호", { exact: true });
  const deactivate = page.getByRole("button", { name: "계정 사용 중지", exact: true });
  await current.fill(credentials.password);
  await expect(confirmation).toHaveValue("");
  await expect(deactivate).toBeDisabled();
  await confirmation.fill("separate-confirmation");
  await expect(current).toHaveValue(credentials.password);
  await current.fill("");
  await expect(confirmation).toHaveValue("separate-confirmation");
  await confirmation.fill("");
  await current.fill(credentials.password);
  await page.getByLabel("계정 사용 중지 확인").check();
  await expect(confirmation).toHaveValue("");
  await expect(deactivate).toBeDisabled();
  const deletions: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "DELETE" && new URL(request.url()).pathname === "/api/auth/me") {
      deletions.push(request.url());
    }
  });
  // Also exercise the React boundary without relying on native required/disabled controls.
  await page
    .locator("form")
    .filter({ has: confirmation })
    .evaluate((form) => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  await expect(
    page.getByRole("region", { name: "회원 계정 관리" }).getByRole("alert"),
  ).toContainText("현재 비밀번호를 1~256자로");
  expect(deletions).toHaveLength(0);
  // A correct password in the other form must not rescue a wrong confirmation here.
  await confirmation.fill("wrong-confirmation-password");
  await deactivate.click();
  await expect(
    page.getByRole("region", { name: "회원 계정 관리" }).getByRole("alert"),
  ).toContainText("현재 비밀번호를 확인해 주세요.");
  expect(deletions).toHaveLength(1);
  expect((await context.request.get("/api/auth/me")).status()).toBe(200);
});

test("member settings update across tabs, reject bad passwords, and end sessions only on success", async ({
  page,
  context,
}) => {
  const email = `cra36-${randomUUID()}@example.com`;
  const registered = await context.request.post("/api/auth/register", {
    data: { name: "Before", email, password: credentials.password },
  });
  expect(registered.status()).toBe(201);
  const initial = await cookieToken(context.request);
  expect((await context.request.patch("/api/auth/me", { data: { name: null } })).status()).toBe(
    422,
  );
  expect(await cookieToken(context.request)).toBe(initial);
  await page.goto("/mypage");
  await page.getByRole("button", { name: "계정 관리", exact: true }).click();
  await page.screenshot({ path: "test-results/cra36-member-settings.png", fullPage: true });
  const other = await context.newPage();
  await other.goto("/mypage");
  await expect(other.getByRole("heading", { name: /님의 취향 기록/ })).toBeVisible();
  await page.getByLabel("이름", { exact: true }).fill("새로운 회원");
  await page.getByLabel("마케팅 수신 동의").check();
  await page.getByRole("button", { name: "회원 정보 저장" }).click();
  await expect(other.getByRole("heading", { name: "새로운 회원님의 취향 기록" })).toBeVisible();
  const before = await cookieToken(context.request);
  await page.getByLabel("현재 비밀번호", { exact: true }).fill("wrong-password");
  await page.getByLabel("새 비밀번호", { exact: true }).fill("changed-password123");
  await page.getByRole("button", { name: "비밀번호 변경", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "회원 계정 관리" }).getByRole("alert"),
  ).toContainText("현재 비밀번호");
  expect(await cookieToken(context.request)).toBe(before);
  await page.getByLabel("현재 비밀번호", { exact: true }).fill(credentials.password);
  await page.getByLabel("새 비밀번호", { exact: true }).fill("changed-password123");
  await page.getByRole("button", { name: "비밀번호 변경", exact: true }).click();
  await expect(page.getByText("로그인하면 저장한 향과 쿠폰을 확인할 수 있어요.")).toBeVisible();
  await expect(other.getByText("로그인하면 저장한 향과 쿠폰을 확인할 수 있어요.")).toBeVisible();
  expect(await cookieToken(context.request)).toBeUndefined();
  expect(await cookieToken(context.request, "aura_refresh")).toBeUndefined();
  expect(
    (
      await context.request.post("/api/auth/login", {
        data: { email, password: "changed-password123" },
      })
    ).status(),
  ).toBe(200);
  await other.close();
});

test("member deactivation removes only that member's cart, ends other tabs and keeps other data", async ({
  page,
  context,
}) => {
  const email = `cra36-${randomUUID()}@example.com`;
  expect(
    (
      await context.request.post("/api/auth/register", {
        data: { name: "Private", email, password: credentials.password },
      })
    ).status(),
  ).toBe(201);
  const { user } = await (await context.request.get("/api/auth/me")).json();
  await context.addCookies([
    { name: "aura_admin_access", value: "header.payload.signature", url: "http://127.0.0.1:3200" },
  ]);
  await page.goto("/mypage");
  await page.getByRole("button", { name: "계정 관리", exact: true }).click();
  await expect(page.getByText(/개인정보 완전 파기를 의미하지 않습니다/)).toBeVisible();
  const cart = '[{"product":{"id":"warm-candle"},"quantity":1,"selection":[]}]';
  const keys = {
    member: `aura_cart_v2:member:${encodeURIComponent(user.id)}`,
    other: "aura_cart_v2:member:someone-else",
    guest: "aura_cart_v2:guest",
    legacy: "aura_cart_v1",
  };
  await page.evaluate(
    ({ keys, cart }) => Object.values(keys).forEach((key) => localStorage.setItem(key, cart)),
    { keys, cart },
  );
  // A second tab of the same member must end when the first tab withdraws.
  const second = await context.newPage();
  await second.goto("/mypage");
  await page.getByLabel("계정 사용 중지 확인").check();
  await page.getByLabel("확인용 현재 비밀번호").fill(credentials.password);
  await page.getByRole("button", { name: "계정 사용 중지", exact: true }).click();
  await expect(page.getByText("로그인하면 저장한 향과 쿠폰을 확인할 수 있어요.")).toBeVisible();
  await expect(second.getByText("로그인하면 저장한 향과 쿠폰을 확인할 수 있어요.")).toBeVisible();
  expect(await cookieToken(context.request)).toBeUndefined();
  expect(await cookieToken(context.request, "aura_admin_access")).toBe("header.payload.signature");
  const stored = await page.evaluate(
    (keys) =>
      Object.fromEntries(
        Object.entries(keys).map(([name, key]) => [name, localStorage.getItem(key)]),
      ),
    keys,
  );
  // Only the withdrawn member's cart is gone: guests, other members and legacy data stay.
  expect(stored).toEqual({ member: null, other: cart, guest: cart, legacy: cart });
  await second.close();
  expect(
    (
      await context.request.post("/api/auth/login", {
        data: { email, password: credentials.password },
      })
    ).status(),
  ).toBe(401);
  // The same email can register again as a new member who starts with an empty cart.
  const again = await context.request.post("/api/auth/register", {
    data: { name: "New identity", email, password: credentials.password },
  });
  expect(again.status()).toBe(201);
  const fresh = (await (await context.request.get("/api/auth/me")).json()).user;
  expect(fresh.id).not.toBe(user.id);
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "아직 담은 향이 없어요." })).toBeVisible();
});

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

test("repeated login failures are limited through the BFF without revealing the account", async ({
  request,
}) => {
  const data = { email: `locked-${randomUUID()}@example.com`, password: "wrong-password123" };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    expect((await request.post("/api/auth/login", { data })).status()).toBe(401);
  }

  const locked = await request.post("/api/auth/login", { data });
  expect(locked.status()).toBe(429);
  const body = await locked.json();
  expect(body.error.code).toBe("LOGIN_LOCKED");
  expect(JSON.stringify(body)).not.toContain(data.email);
  expect(locked.headers()["set-cookie"] ?? "").not.toContain("aura_access=");
});
