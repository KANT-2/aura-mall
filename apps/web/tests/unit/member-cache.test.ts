import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi, afterEach } from "vitest";
import { applyMemberChange } from "@/features/account/hooks/member-cache";
import {
  AUTH_CHANGED_KEY,
  publishMemberChange,
  subscribeMemberChanges,
} from "@/lib/api/auth-events";

afterEach(() => vi.unstubAllGlobals());

it("clears only the affected owner's private cache and preserves admin/other-member/cart data", () => {
  const client = new QueryClient();
  client.setQueryData(["account"], { user: { id: "alice" }, guestId: "guest" });
  for (const key of [
    ["orders", "alice"],
    ["recipes", "alice"],
    ["orders", "bob"],
    ["recipes", "bob"],
    ["admin"],
    ["cart"],
  ]) {
    client.setQueryData(key, ["private"]);
  }

  applyMemberChange(client, { owner: "alice", kind: "ended", remote: false });
  expect(client.getQueryData(["account"])).toEqual({ user: null, guestId: "guest" });
  expect(client.getQueryData(["orders", "alice"])).toBeUndefined();
  expect(client.getQueryData(["recipes", "alice"])).toBeUndefined();
  for (const key of [["orders", "bob"], ["recipes", "bob"], ["admin"], ["cart"]]) {
    expect(client.getQueryData(key)).toEqual(["private"]);
  }
});

it("never replaces a newly selected member with an older owner's signed-out state", () => {
  const client = new QueryClient();
  const bob = { user: { id: "bob" }, guestId: "guest" };
  client.setQueryData(["account"], bob);
  applyMemberChange(client, { owner: "alice", kind: "ended", remote: false });
  expect(client.getQueryData(["account"])).toEqual(bob);
});

it("uses non-secret invalidation messages for local and cross-tab updates", () => {
  const surface = new EventTarget();
  const storage = { setItem: vi.fn() };
  vi.stubGlobal("window", surface);
  vi.stubGlobal("localStorage", storage);
  const listener = vi.fn();
  const dispose = subscribeMemberChanges(listener);
  publishMemberChange("alice", "ended");
  expect(listener).toHaveBeenCalledWith({ owner: "alice", kind: "ended", remote: false });
  const raw = storage.setItem.mock.calls[0][1];
  expect(Object.keys(JSON.parse(raw)).sort()).toEqual(["kind", "nonce", "owner"]);
  const event = new Event("storage");
  Object.assign(event, { key: AUTH_CHANGED_KEY, newValue: raw });
  surface.dispatchEvent(event);
  expect(listener).toHaveBeenLastCalledWith({ owner: "alice", kind: "ended", remote: true });
  dispose();
});
