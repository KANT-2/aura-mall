import "server-only";
import { boolean, integer, list, record, text } from "@/server/backend/decode";
import type { ProductQuestion, QuestionPage } from "@/features/questions/model/question";

export function questionResponse(value: unknown): ProductQuestion {
  const q = record(value);
  return {
    id: text(q.id),
    productId: text(q.productId),
    title: text(q.title),
    content: q.content === null ? null : text(q.content),
    private: boolean(q.private),
    mine: boolean(q.mine),
    answer: q.answer === null ? null : text(q.answer),
    answered: boolean(q.answered),
    answeredAt: q.answeredAt === null ? null : text(q.answeredAt),
    version: integer(q.version),
    created: text(q.created),
  };
}
export function questionPageResponse(value: unknown): QuestionPage {
  const page = record(value);
  return {
    items: list(page.items, questionResponse),
    total: integer(page.total),
    page: integer(page.page),
    pageSize: integer(page.pageSize),
  };
}
