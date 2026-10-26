import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { HttpError, requireJsonBody, requireString } from "../http";
import { publicMember, resolveSession } from "../session";
import type { MockDatabase } from "../data/store";

export function accountRoutes(database: MockDatabase) {
  const router = Router();
  router.get("/session", (req, res) => {
    const { session, user } = resolveSession(req, res, database);
    res.json({ user, guestId: session.guestId });
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

    if (Object.values(database.state.accounts).some((account) => account.email === email)) {
      throw new HttpError(409, "이미 가입된 이메일입니다.");
    }

    const { session } = resolveSession(req, res, database);
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
    session.userId = account.id;
    database.persist();
    res.status(201).json({ user: publicMember(account), guestId: session.guestId });
  });
  router.post("/auth/login", requireJsonBody, (req, res) => {
    const email = requireString(req.body.email, "이메일을 확인해 주세요.").toLowerCase();
    const password = req.body.password;
    if (typeof password !== "string" || !password || password.length > 256) {
      throw new HttpError(400, "비밀번호를 입력해 주세요.");
    }

    const account = Object.values(database.state.accounts).find((item) => item.email === email);
    if (
      !account ||
      !timingSafeEqual(
        Buffer.from(account.passwordHash, "hex"),
        scryptSync(password, account.salt, 32),
      )
    ) {
      throw new HttpError(401, "이메일 또는 비밀번호를 확인해 주세요.");
    }

    const { session } = resolveSession(req, res, database);
    session.userId = account.id;
    database.persist();
    res.json({ user: publicMember(account), guestId: session.guestId });
  });
  router.post("/auth/logout", (req, res) => {
    const { session } = resolveSession(req, res, database);
    delete session.userId;
    database.persist();
    res.json({ user: null, guestId: session.guestId });
  });
  return router;
}
