import express, { type ErrorRequestHandler } from "express";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { createDatabase, catalog, type MockDatabase } from "./data/store";
import { accountRoutes } from "./routes/account";
import { cartRoutes } from "./routes/cart";
import { atelierRoutes } from "./routes/atelier";
import { checkoutRoutes } from "./routes/checkout";
import { resolveSession, ownerOf } from "./session";
import { HttpError } from "./http";
import { restoreCart } from "@/features/cart/model/cart";
import { restoreDraft, restoreRecipes } from "@/features/atelier/model/recipes";

export function createMockApp({
  database = createDatabase(),
  testMode = false,
}: { database?: MockDatabase; testMode?: boolean } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/catalog", (_req, res) => res.json(catalog));
  const aliases = new Map([
    ["bergamot-veil", "fresh-eau-de-parfum"],
    ["petal-haze", "soft-eau-de-parfum"],
    ["cedar-trace", "warm-eau-de-parfum"],
    ["soft-skin", "soft-eau-de-parfum"],
    ["fig-reverie", "soft-eau-de-parfum"],
    ["amber-dusk", "warm-eau-de-parfum"],
  ]);
  app.get("/api/catalog/products/:id", (req, res) => {
    const id = aliases.get(String(req.params.id)) ?? req.params.id;
    const product = catalog.products.find((product) => product.id === id);
    if (!product) throw new HttpError(404, "상품을 찾을 수 없어요.");
    res.json(product);
  });
  app.use(
    "/api",
    accountRoutes(database),
    cartRoutes(database),
    atelierRoutes(database),
    checkoutRoutes(database),
  );
  if (testMode)
    app.post("/__test__/seed", (req, res) => {
      const { session } = resolveSession(req, res, database);
      if (req.body.member) {
        const salt = randomBytes(16).toString("hex");
        const member = { ...req.body.member, id: req.body.member.id ?? randomUUID() };
        database.state.accounts[member.id] = {
          ...member,
          salt,
          passwordHash: scryptSync(req.body.password ?? "test-password", salt, 32).toString("hex"),
        };
        session.userId = member.id;
      }
      const owner = ownerOf(session);
      if (req.body.cart) database.state.carts[owner] = restoreCart(req.body.cart, catalog);
      if (req.body.recipes)
        database.state.recipes[owner] = restoreRecipes(req.body.recipes, catalog.ingredients);
      if (req.body.draft) {
        const draft = restoreDraft(req.body.draft, catalog.ingredients);
        if (!draft) throw new HttpError(400, "Invalid test draft");
        database.state.drafts[session.guestId] = draft;
      }
      database.persist();
      res.json({ guestId: session.guestId });
    });
  app.use((_req, res) =>
    res.status(404).json({ error: { message: "API 경로를 찾을 수 없어요." } }),
  );
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    const status =
      error instanceof HttpError ? error.status : error instanceof SyntaxError ? 400 : 500;
    if (status === 500) console.error(error);
    res.status(status).json({
      error: { message: status === 500 ? "서버 요청을 처리하지 못했어요." : error.message },
    });
  };
  app.use(handleError);
  return app;
}
