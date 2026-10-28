export const paymentStatuses = ["READY", "IN_PROGRESS", "DONE", "FAILED", "CANCELED"] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

/** A payment attempt. The amount is the server's order total; the browser never sets it. */
export type Payment = {
  id: string;
  orderId: string;
  pgOrderId: string;
  orderName: string;
  amount: number;
  status: PaymentStatus;
  method: string | null;
  approved: string | null;
  failureCode: string | null;
  failureMessage: string | null;
};

/** What the PG success URL hands back; the server compares the amount with its own record. */
export type PaymentConfirmation = { paymentKey: string; orderId: string; amount: number };
