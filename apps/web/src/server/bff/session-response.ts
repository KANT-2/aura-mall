import "server-only";
import type { Member, Session } from "@/features/account/model/account";
import { ApiError } from "@/lib/api/errors";
import { isRecord } from "@/lib/validation";

/** Auth endpoints expose only the public Session DTO, never upstream token material. */
export function publicSession(data: unknown): Session {
  const invalid = () =>
    new ApiError(502, "API 서버의 인증 응답을 확인하지 못했어요.", "INVALID_BACKEND_RESPONSE");
  if (!isRecord(data) || typeof data.guestId !== "string" || !data.guestId) {
    throw invalid();
  }

  if (data.user === null) {
    return { user: null, guestId: data.guestId };
  }

  const user = data.user;
  if (
    !isRecord(user) ||
    typeof user.id !== "string" ||
    !user.id ||
    typeof user.email !== "string" ||
    typeof user.name !== "string" ||
    typeof user.coupon !== "boolean" ||
    (user.marketing !== undefined && typeof user.marketing !== "boolean") ||
    (user.role !== undefined && user.role !== "member" && user.role !== "admin")
  ) {
    throw invalid();
  }

  const member: Member = {
    id: user.id,
    email: user.email,
    name: user.name,
    coupon: user.coupon,
    ...(user.marketing !== undefined ? { marketing: user.marketing } : {}),
    ...(user.role !== undefined ? { role: user.role } : {}),
  };
  return { user: member, guestId: data.guestId };
}
