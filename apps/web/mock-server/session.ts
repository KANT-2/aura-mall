import { randomUUID } from "node:crypto";
import { HttpError } from "./http";
import type { Request, Response } from "express";
import type { Member } from "@/features/account/model/account";
import type { Account, MockDatabase, MockSession } from "./data/store";

export const SESSION_COOKIE = "aura_mock_session";
export function publicMember(account: Account): Member {
  const { id, name, email, coupon, marketing, role = "member" } = account;
  return { id, name, email, coupon, marketing, role };
}
export function resolveSession(request: Request, response: Response, database: MockDatabase) {
  const cookies = Object.fromEntries(
    (request.headers.cookie ?? "").split(";").map((part) => {
      const index = part.indexOf("=");
      return index < 0 ? [part.trim(), ""] : [part.slice(0, index).trim(), part.slice(index + 1)];
    }),
  );
  let token = cookies[SESSION_COOKIE];
  if (!token || !Object.hasOwn(database.state.sessions, token)) {
    token = randomUUID();
    database.state.sessions[token] = { guestId: randomUUID() };
    response.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 86_400_000,
    });
    database.persist();
  }

  const session = database.state.sessions[token];
  const expectedOwner = request.get("X-Session-Owner");
  if (expectedOwner && expectedOwner !== (session.userId ?? session.guestId)) {
    throw new HttpError(409, "계정이 변경되었어요. 다시 시도해 주세요.");
  }

  const account = session.userId ? database.state.accounts[session.userId] : undefined;
  return {
    session,
    owner: session.userId ? `member:${session.userId}` : `guest:${session.guestId}`,
    user: account ? publicMember(account) : null,
  };
}
export const ownerOf = (session: MockSession) =>
  session.userId ? `member:${session.userId}` : `guest:${session.guestId}`;
/** Checks the stored account on every request, so logout or role removal applies immediately. */
export function requireAdmin(request: Request, response: Response, database: MockDatabase) {
  const { user } = resolveSession(request, response, database);
  if (!user) {
    throw new HttpError(401, "로그인이 필요해요.");
  }

  if (database.state.accounts[user.id].role !== "admin") {
    throw new HttpError(403, "관리자 권한이 필요해요.");
  }

  return user;
}
