import { describe, expect, it } from "vitest";
import { safeReturnPath } from "@/lib/navigation";

describe("safeReturnPath", () => {
  it.each([undefined, "https://other.test", "//other.test", "/\\other.test", "/\t/other.test"])(
    "rejects external or normalized external paths: %s",
    (value) => {
      expect(safeReturnPath(value)).toBe("/mypage");
    },
  );
  it("preserves an internal path, query and hash", () => {
    expect(safeReturnPath("/atelier?resume=1#recipe")).toBe("/atelier?resume=1#recipe");
    expect(safeReturnPath(["/cart", "/checkout"])).toBe("/cart");
  });
});
