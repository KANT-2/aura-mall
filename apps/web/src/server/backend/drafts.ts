import "server-only";
import type { AtelierDraft } from "@/features/atelier/model/recipes";
import { integer, invalidResponse, record, text } from "@/server/backend/decode";

export function draftResponse(value: unknown): AtelierDraft | null {
  if (value === null) {
    return null;
  }

  const item = record(value);
  const counts = Object.fromEntries(
    Object.entries(record(item.counts)).map(([id, value]) => [id, integer(value)]),
  );
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const name = text(item.name);
  const label = text(item.label);
  if (
    Object.values(counts).some((count) => count < 0) ||
    total < 1 ||
    total > 20 ||
    name.length > 30 ||
    !["classic", "paper", "minimal"].includes(label) ||
    (item.step !== "select" && item.step !== "result")
  ) {
    return invalidResponse();
  }

  return { counts, name, label, step: item.step };
}
