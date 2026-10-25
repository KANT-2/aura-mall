import { request } from "@/lib/api/client";
import type { Order } from "../model/order";
export const orderKey = (owner?: string) => ["orders", owner] as const;
export const getOrders = (signal?: AbortSignal) => request<Order[]>("/orders", { signal });
