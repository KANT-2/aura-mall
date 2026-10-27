import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { HttpError } from "./http";
import type { Member } from "@/features/account/model/account";
import type { Account, MockDatabase } from "./data/store";

// Mock-only process key. Never imported by the Next BFF or the production API.
const signingKey = randomBytes(32);
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export function publicMember(account: Account): Member {
  const { id, name, email, coupon, marketing, role = "member" } = account;
  return { id, name, email, coupon, marketing, role };
}

export function issueTokens(
  database: MockDatabase,
  userId: string,
  familyId: string = randomUUID(),
) {
  const now = Math.floor(Date.now() / 1000);
  database.state.tokenFamilies[familyId] ??= { userId, revoked: false };
  const input = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, fid: familyId, jti: randomUUID(), iat: now, exp: now + 900, iss: "aura-mock", aud: "aura-api" })}`;
  const accessToken = `${input}.${createHmac("sha256", signingKey).update(input).digest("base64url")}`;
  const refreshToken = "r1_" + randomBytes(48).toString("base64url");
  database.state.refreshTokens[digest(refreshToken)] = {
    familyId,
    consumed: false,
    expires: now + 604800,
  };
  database.persist();
  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresIn: 900,
    refreshExpiresIn: 604800,
  };
}

/** Mock-only administrator Access JWT: no customer token family or Refresh is issued. */
export function issueAdminToken(database: MockDatabase, userId: string) {
  const now = Math.floor(Date.now() / 1000),
    familyId = randomUUID();
  database.state.tokenFamilies[familyId] = { userId, revoked: false, principal: "admin" };
  const input = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, fid: familyId, jti: randomUUID(), iat: now, exp: now + 3600, iss: "aura-mock", aud: "aura-api", principal_type: "admin", permissions: ["admin"] })}`;
  const accessToken = `${input}.${createHmac("sha256", signingKey).update(input).digest("base64url")}`;
  database.persist();
  const { id, name, email } = database.state.accounts[userId];
  return { accessToken, tokenType: "Bearer", expiresIn: 3600, admin: { id, name, email } };
}

function claimsFor(request: Request, database: MockDatabase) {
  const authorization = request.get("Authorization");
  if (!authorization) {
    return undefined;
  }

  try {
    if (!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)) {
      throw new Error();
    }

    const token = authorization.slice(7);
    const [header, payload, signature] = token.split(".");
    const expected = createHmac("sha256", signingKey).update(`${header}.${payload}`).digest();
    const received = Buffer.from(signature, "base64url");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      throw new Error();
    }

    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    const family = database.state.tokenFamilies[claims.fid];
    if (
      JSON.parse(Buffer.from(header, "base64url").toString()).alg !== "HS256" ||
      claims.iss !== "aura-mock" ||
      claims.aud !== "aura-api" ||
      claims.exp <= Date.now() / 1000 ||
      !family ||
      family.revoked ||
      family.userId !== claims.sub ||
      (family.principal ?? "member") !== (claims.principal_type ?? "member") ||
      !database.state.accounts[claims.sub]
    ) {
      throw new Error();
    }

    return claims as { sub: string; fid: string; principal_type?: string };
  } catch {
    throw new HttpError(401, "다시 로그인해 주세요.");
  }
}

export function resolveIdentity(request: Request, _response: Response, database: MockDatabase) {
  const claims = claimsFor(request, database);
  if (claims?.principal_type === "admin") {
    throw new HttpError(401, "회원 로그인이 필요해요.");
  }

  const value = request.get("X-Guest-ID");
  const guestId = value && /^[0-9a-f-]{36}$/i.test(value) ? value : randomUUID();
  const identity = { guestId, userId: claims?.sub };
  const expected = request.get("X-Account-Owner");
  if (expected && expected !== (identity.userId ?? guestId)) {
    throw new HttpError(409, "계정이 변경되었어요. 다시 시도해 주세요.");
  }

  return {
    identity,
    owner: ownerOf(identity),
    user: claims ? publicMember(database.state.accounts[claims.sub]) : null,
  };
}
export const ownerOf = (identity: { guestId: string; userId?: string }) =>
  identity.userId ? `member:${identity.userId}` : `guest:${identity.guestId}`;

export function rotateTokens(database: MockDatabase, token: unknown) {
  if (typeof token !== "string" || !/^r1_[A-Za-z0-9_-]{64}$/.test(token)) {
    throw new HttpError(401, "다시 로그인해 주세요.");
  }

  const row = database.state.refreshTokens[digest(token)];
  const family = row && database.state.tokenFamilies[row.familyId];
  if (!row || !family || family.revoked || row.expires <= Date.now() / 1000) {
    throw new HttpError(401, "다시 로그인해 주세요.");
  }

  if (row.consumed) {
    family.revoked = true;
    database.persist();
    throw new HttpError(401, "다시 로그인해 주세요.");
  }

  row.consumed = true;
  return issueTokens(database, family.userId, row.familyId);
}

export function revokeTokens(request: Request, database: MockDatabase) {
  const claims = claimsFor(request, database);
  if (!claims) {
    throw new HttpError(401, "로그인이 필요해요.");
  }

  database.state.tokenFamilies[claims.fid].revoked = true;
  database.persist();
}

/** Roles are read from the stored account on every request. */
export function requireAdmin(request: Request, _response: Response, database: MockDatabase) {
  const claims = claimsFor(request, database);
  if (!claims) {
    throw new HttpError(401, "관리자 로그인이 필요해요.");
  }

  if (claims.principal_type !== "admin") {
    throw new HttpError(403, "관리자 권한이 필요해요.");
  }

  const account = database.state.accounts[claims.sub];
  if (account.role !== "admin") {
    throw new HttpError(401, "관리자 로그인이 필요해요.");
  }

  return publicMember(account);
}
