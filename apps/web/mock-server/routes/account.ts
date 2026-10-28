import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { HttpError, requireJsonBody, requireString } from "../http";
import { issueTokens, resolveIdentity, revokeTokens, rotateTokens } from "../auth";
import type { MockDatabase } from "../data/store";

export function accountRoutes(database: MockDatabase) {
  const router = Router();
  router.get("/auth/me", (req, res) => {
    const { user } = resolveIdentity(req, res, database);
    if (!user) {
      throw new HttpError(401, "로그인이 필요해요.");
    }

    res.json(user);
  });
  router.post("/auth/register", requireJsonBody, (req, res) => {
    const name = requireString(req.body.name, "이름을 입력해 주세요.", 100);
    const email = requireString(req.body.email, "이메일을 확인해 주세요.", 254).toLowerCase();
    const password = req.body.password;
    if (typeof password !== "string" || password.length > 256) {
      throw new HttpError(400, "비밀번호를 확인해 주세요.");
    }

    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
      throw new HttpError(400, "회원 정보를 확인해 주세요.");
    }

    if (
      Object.values(database.state.accounts).some(
        (account) => account.role !== "admin" && account.email === email,
      )
    ) {
      throw new HttpError(409, "이미 가입된 이메일입니다.");
    }

    resolveIdentity(req, res, database);
    const salt = randomBytes(16).toString("hex");
    const account = {
      id: randomUUID(),
      name,
      email,
      coupon: true,
      marketing: Boolean(req.body.marketing),
      // Registration never grants admin access, even when the body contains a role.
      role: "member" as const,
      salt,
      passwordHash: scryptSync(password, salt, 32).toString("hex"),
    };
    database.state.accounts[account.id] = account;
    database.persist();
    res.status(201).json(issueTokens(database, account.id));
  });
  router.post("/auth/login", requireJsonBody, (req, res) => {
    const email = requireString(req.body.email, "이메일을 확인해 주세요.").toLowerCase();
    const password = req.body.password;
    if (typeof password !== "string" || !password || password.length > 256) {
      throw new HttpError(400, "비밀번호를 입력해 주세요.");
    }

    const account = Object.values(database.state.accounts).find(
      (item) => item.role !== "admin" && item.email === email,
    );
    if (
      !account ||
      !timingSafeEqual(
        Buffer.from(account.passwordHash, "hex"),
        scryptSync(password, account.salt, 32),
      )
    ) {
      throw new HttpError(401, "이메일 또는 비밀번호를 확인해 주세요.");
    }

    resolveIdentity(req, res, database);
    database.persist();
    res.json(issueTokens(database, account.id));
  });
  router.post("/auth/refresh", requireJsonBody, (req, res) => {
    res.json(rotateTokens(database, req.body.refreshToken));
  });
  router.post("/auth/logout", (req, res) => {
    revokeTokens(req, database);
    res.status(204).end();
  });
  return router;
}
