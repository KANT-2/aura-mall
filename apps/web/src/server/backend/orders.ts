import "server-only";
import type { Order } from "@/features/checkout/model/order";
import { productResponse } from "@/server/backend/storefront";
import { invalidResponse, integer, list, record, text } from "@/server/backend/decode";

import { orderStatuses, type OrderStatus } from "@/features/checkout/model/order";
export function orderStatusResponse(value: unknown): OrderStatus {
  return orderStatuses.includes(value as OrderStatus) ? (value as OrderStatus) : invalidResponse();
}
/** Keep the server-calculated prices and snapshots, excluding persistence/auth fields. */
export function orderResponse(value: unknown): Order {
  const item = record(value);
  return {
    id: text(item.id),
    total: integer(item.total),
    recipient: text(item.recipient),
    address: text(item.address),
    created: text(item.created),
    ...(item.status !== undefined ? { status: orderStatusResponse(item.status) } : {}),
    ...Object.fromEntries(
      ["recipientPhone", "deliveryNote", "courier", "trackingNumber"]
        .filter((key) => item[key] !== undefined)
        .map((key) => [key, text(item[key])]),
    ),
    items: list(item.items, (value) => {
      const line = record(value);
      const custom = line.custom == null ? undefined : record(line.custom);
      return {
        key: text(line.key),
        product: productResponse(line.product),
        quantity: integer(line.quantity),
        selection: list(line.selection, text),
        unitPrice: integer(line.unitPrice),
        ...(custom
          ? {
              custom: {
                name: text(custom.name),
                label: text(custom.label),
                color: text(custom.color),
                counts: Object.fromEntries(
                  Object.entries(record(custom.counts)).map(([key, count]) => [
                    key,
                    integer(count),
                  ]),
                ),
                ...(custom.productType !== undefined
                  ? { productType: text(custom.productType) }
                  : {}),
              },
            }
          : {}),
      };
    }),
  };
}
export const ordersResponse = (value: unknown) => list(value, orderResponse);
