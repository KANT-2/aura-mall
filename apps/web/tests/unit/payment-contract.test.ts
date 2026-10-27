import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { paymentResponse } from "@/server/backend/payments";

const PAYMENT = {
  id: "5d6f6a3c-1d7e-4c1a-9a43-6f1e2f6b9c01",
  orderId: "0c1a9a43-6f1e-4c1a-9a43-2f6b9c015d6f",
  pgOrderId: "aura-5d6f6a3c1d7e4c1a9a436f1e2f6b9c01",
  orderName: "핸드크림",
  amount: 31000,
  status: "DONE",
  method: "카드",
  approved: "2026-10-27T18:00:00+09:00",
  failureCode: null,
  failureMessage: null,
};

describe("payment BFF adapter", () => {
  it("keeps only the public payment fields", () => {
    expect(paymentResponse({ ...PAYMENT, paymentKey: "pk_secret", reviewReason: "x" })).toEqual(
      PAYMENT,
    );
  });

  it.each([{ status: "REFUNDED" }, { amount: "31000" }, { method: undefined }, { pgOrderId: 1 }])(
    "rejects malformed backend data %o",
    (change) => {
      expect(() => paymentResponse({ ...PAYMENT, ...change })).toThrow();
    },
  );
});
