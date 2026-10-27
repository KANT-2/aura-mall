import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { issueAdminToken, requireAdmin, revokeTokens } from "../auth";
import type { MockDatabase } from "../data/store";
import { HttpError, requireJsonBody, requireString } from "../http";

function passwordValue(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 256) {
    throw new HttpError(400, "비밀번호를 확인해 주세요.");
  }

  return value;
}

export function adminAuthRoutes(database: MockDatabase) {
  const router = Router();
  router.post("/admin/auth/login", requireJsonBody, (req, res) => {
    const email = requireString(req.body.email, "이메일을 확인해 주세요.").toLowerCase();
    const password = passwordValue(req.body.password);
    const account = Object.values(database.state.accounts).find(
      (account) => account.role === "admin" && account.email === email,
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

    res.json(issueAdminToken(database, account.id));
  });
  router.get("/admin/session", (req, res) => {
    const { id, name, email } = requireAdmin(req, res, database);
    res.json({ id, name, email });
  });
  router.post("/admin/auth/logout", (req, res) => {
    requireAdmin(req, res, database);
    revokeTokens(req, database);
    res.status(204).end();
  });
  router.post("/admin/admins", requireJsonBody, (req, res) => {
    requireAdmin(req, res, database);
    const name = requireString(req.body.name, "이름을 입력해 주세요.", 100);
    const email = requireString(req.body.email, "이메일을 확인해 주세요.", 254).toLowerCase();
    const password = passwordValue(req.body.password);
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
      throw new HttpError(400, "회원 정보를 확인해 주세요.");
    }

    if (
      Object.values(database.state.accounts).some(
        (account) => account.role === "admin" && account.email === email,
      )
    ) {
      throw new HttpError(409, "이미 등록된 관리자 이메일이에요.");
    }

    const id = randomUUID(),
      salt = randomBytes(16).toString("hex");
    database.state.accounts[id] = {
      id,
      name,
      email,
      coupon: false,
      role: "admin",
      salt,
      passwordHash: scryptSync(password, salt, 32).toString("hex"),
    };
    database.persist();
    res.status(201).json({ id, name, email });
  });
  return router;
}
