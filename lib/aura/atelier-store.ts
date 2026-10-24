import { restoreDraft, type AtelierDraft } from "./recipes";

export const ATELIER_DRAFT_KEY = "aura_atelier_draft_v2";
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function createAtelierStore(getStorage: () => DraftStorage) {
  return {
    load(): AtelierDraft | null {
      try {
        return restoreDraft(JSON.parse(getStorage().getItem(ATELIER_DRAFT_KEY) || "null"));
      } catch {
        return null;
      }
    },
    save(draft: AtelierDraft): void {
      try { getStorage().setItem(ATELIER_DRAFT_KEY, JSON.stringify(draft)); } catch { /* Draft persistence is best effort. */ }
    },
    clear(): void {
      try { getStorage().removeItem(ATELIER_DRAFT_KEY); } catch { /* Editing remains available without storage. */ }
    },
  };
}

export const atelierStore = createAtelierStore(() => window.sessionStorage);
