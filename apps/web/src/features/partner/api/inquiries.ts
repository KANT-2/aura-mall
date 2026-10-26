import { request } from "@/lib/api/client";
export const submitInquiry = (input: Record<string, FormDataEntryValue>) =>
  request<{ id: string }>("/partner", { method: "POST", body: JSON.stringify(input) });
