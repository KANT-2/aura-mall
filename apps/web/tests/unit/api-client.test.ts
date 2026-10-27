import { afterEach, expect, it, vi } from "vitest";
import { request } from "@/lib/api/client";

const json = (value: unknown, status = 200) => Response.json(value, { status });
afterEach(() => vi.unstubAllGlobals());

it("shares one refresh among simultaneous requests and retries each request once", async () => {
  let renewed = false;
  let refreshes = 0;
  const fetcher = vi.fn(async (url: string) => {
    if (url === "/api/auth/refresh") {
      refreshes += 1;
      renewed = true;
      return new Response(null, { status: 204 });
    }

    return renewed
      ? json(url === "/api/auth/me" ? { user: { id: "member" } } : [url])
      : json({}, 401);
  });
  vi.stubGlobal("fetch", fetcher);
  expect(await Promise.all([request("/recipes"), request("/orders")])).toEqual([
    ["/api/recipes"],
    ["/api/orders"],
  ]);
  expect(refreshes).toBe(1);
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/recipes")).toHaveLength(2);
});

it("checks credentials again before rotation so another tab's refresh is reused", async () => {
  const fetcher = vi.fn(async (url: string) => {
    if (url === "/api/auth/me") {
      return json({ user: { id: "member" } });
    }

    return fetcher.mock.calls.filter(([value]) => value === url).length === 1
      ? json({}, 401)
      : json([]);
  });
  vi.stubGlobal("fetch", fetcher);
  expect(await request("/recipes")).toEqual([]);
  expect(fetcher.mock.calls.some(([url]) => url === "/api/auth/refresh")).toBe(false);
});

it("never rotates on login failure, forbidden/conflict or a backend failure", async () => {
  for (const [path, status] of [
    ["/auth/login", 401],
    ["/auth/register", 401],
    ["/recipes", 403],
    ["/orders", 409],
    ["/orders", 502],
  ] as const) {
    const fetcher = vi.fn(async () => json({ error: { message: "Denied" } }, status));
    vi.stubGlobal("fetch", fetcher);
    await expect(request(path, { method: "POST" })).rejects.toMatchObject({ status });
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});

it("stops after one authenticated retry and does not loop on a second 401", async () => {
  const fetcher = vi.fn(async (url: string) =>
    url === "/api/auth/refresh" ? new Response(null, { status: 204 }) : json({}, 401),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(request("/orders", { method: "POST", body: "{}" })).rejects.toMatchObject({
    status: 401,
  });
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/orders")).toHaveLength(2);
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/auth/refresh")).toHaveLength(1);
});

it("returns anonymous account state after refresh rejection clears credentials", async () => {
  let cleared = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/auth/refresh") {
        cleared = true;
        return json({}, 401);
      }

      return cleared ? json({ user: null, guestId: "visitor" }) : json({}, 401);
    }),
  );
  expect(await request("/auth/me")).toEqual({ user: null, guestId: "visitor" });
});

it("propagates refresh outages without retrying protected writes", async () => {
  const fetcher = vi.fn(async (url: string) => json({}, url === "/api/auth/refresh" ? 502 : 401));
  vi.stubGlobal("fetch", fetcher);
  await expect(request("/orders", { method: "POST", body: "{}" })).rejects.toMatchObject({
    status: 502,
  });
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/orders")).toHaveLength(1);
});

it("never refreshes customer tokens or retries administrator requests", async () => {
  for (const path of [
    "/admin/products",
    "/admin/auth/login",
    "/admin/auth/logout",
    "/admin/auth/me",
  ]) {
    const fetcher = vi.fn(async () => json({}, 401));
    vi.stubGlobal("fetch", fetcher);
    await expect(request(path)).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
