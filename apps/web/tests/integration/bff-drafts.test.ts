import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET, PUT, DELETE } from "@/app/api/atelier/draft/route";

const guest = "11111111-1111-4111-8111-111111111111";
const draft = { counts: { rose: 2 }, name: "오후", label: "paper", step: "select" };
const upstream = vi.fn();
const request = (method = "GET", body?: unknown, headers = {}) =>
  new Request("https://mall.test/api/atelier/draft", {
    method,
    headers: { Cookie: `aura_guest=${guest}`, "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
beforeEach(() => {
  vi.stubEnv("API_URL", "https://backend.test");
  vi.stubEnv("APP_ORIGIN", "https://mall.test");
  vi.stubGlobal("fetch", upstream);
  upstream.mockReset();
  upstream.mockImplementation(async () => Response.json(draft));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("forwards only the visitor identifier and public draft fields", async () => {
  upstream.mockImplementation(async () =>
    Response.json({ ...draft, guestId: "private", userId: "private" }),
  );
  const result = await PUT(request("PUT", { ...draft, guestId: "forged", userId: "forged" }));
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual(draft);
  const options = upstream.mock.calls[0][1];
  expect(options.headers.get("x-guest-id")).toBe(guest);
  expect(options.headers.get("authorization")).toBeNull();
  expect(options.headers.get("cookie")).toBeNull();
  expect(JSON.parse(options.body)).toEqual(draft);
});

it("returns null for missing or deleted drafts and issues a guest cookie for new visitors", async () => {
  upstream.mockImplementation(async () => Response.json(null));
  const first = await GET(request("GET", undefined, { Cookie: "" }));
  expect(await first.json()).toBeNull();
  expect(first.headers.get("set-cookie")).toContain("aura_guest=");
  expect(await (await DELETE(request("DELETE"))).json()).toBeNull();
});

it.each([
  { ...draft, counts: { rose: "2" } },
  { ...draft, counts: { rose: -1 } },
  { ...draft, step: "unknown" },
  { ...draft, label: "unknown" },
])("rejects malformed upstream drafts", async (value) => {
  upstream.mockImplementation(async () => Response.json(value));
  expect((await GET(request())).status).toBe(502);
});

it("rejects cross-origin saves before contacting the backend", async () => {
  expect((await PUT(request("PUT", draft, { Origin: "https://attacker.invalid" }))).status).toBe(
    403,
  );
  expect(upstream).not.toHaveBeenCalled();
});
