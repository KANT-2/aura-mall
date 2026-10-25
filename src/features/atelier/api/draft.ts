import { request } from "@/lib/api/client";
import type { AtelierDraft } from "../model/recipes";
export const draftKey = (guestId?: string) => ["atelier-draft", guestId] as const;
export const getDraft = (signal?: AbortSignal) =>
  request<AtelierDraft | null>("/atelier/draft", { signal });
export const saveDraft = (draft: AtelierDraft | null) =>
  request<AtelierDraft | null>(
    "/atelier/draft",
    draft ? { method: "PUT", body: JSON.stringify(draft) } : { method: "DELETE" },
  );
