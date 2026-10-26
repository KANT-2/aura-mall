import { randomUUID } from "node:crypto";
import { Router } from "express";
import { mixColor, restoreDraft, restoreRecipes } from "@/features/atelier/model/recipes";
import { catalog, type MockDatabase } from "../data/store";
import { resolveSession } from "../session";
import { HttpError } from "../http";

export function atelierRoutes(database: MockDatabase) {
  const router = Router();
  router.get("/recipes", (req, res) => {
    const { owner } = resolveSession(req, res, database);
    res.json(database.state.recipes[owner] ?? []);
  });
  router.post("/recipes", (req, res) => {
    const { owner, user } = resolveSession(req, res, database);
    if (!user) throw new HttpError(401, "로그인 후 향을 저장할 수 있어요.");
    const previous = database.state.recipes[owner] ?? [];
    const parent = req.body.parent
      ? previous.find((recipe) => recipe.id === req.body.parent)
      : undefined;
    if (req.body.parent && !parent) throw new HttpError(404, "저장한 원본 향을 찾을 수 없어요.");
    const [recipe] = restoreRecipes(
      [
        {
          ...req.body,
          id: randomUUID(),
          version: parent ? parent.version + 1 : 1,
          created: new Date().toISOString(),
        },
      ],
      catalog.ingredients,
    );
    if (!recipe) throw new HttpError(400, "향 이름과 향료 조합을 확인해 주세요.");
    recipe.color = mixColor(recipe.counts, catalog.ingredients);
    database.state.recipes[owner] = [recipe, ...previous];
    database.persist();
    res.status(201).json(recipe);
  });
  router.delete("/recipes/:id", (req, res) => {
    const { owner, user } = resolveSession(req, res, database);
    if (!user) throw new HttpError(401, "로그인이 필요해요.");
    const previous = database.state.recipes[owner] ?? [];
    if (!previous.some((recipe) => recipe.id === req.params.id))
      throw new HttpError(404, "저장한 향을 찾을 수 없어요.");
    database.state.recipes[owner] = previous.filter((recipe) => recipe.id !== req.params.id);
    database.persist();
    res.json(database.state.recipes[owner]);
  });
  router.get("/atelier/draft", (req, res) => {
    const { session } = resolveSession(req, res, database);
    res.json(database.state.drafts[session.guestId] ?? null);
  });
  router.put("/atelier/draft", (req, res) => {
    const { session } = resolveSession(req, res, database);
    const draft = restoreDraft(req.body, catalog.ingredients);
    if (!draft) throw new HttpError(400, "조향 초안을 확인해 주세요.");
    database.state.drafts[session.guestId] = draft;
    database.persist();
    res.json(draft);
  });
  router.delete("/atelier/draft", (req, res) => {
    const { session } = resolveSession(req, res, database);
    delete database.state.drafts[session.guestId];
    database.persist();
    res.json(null);
  });
  return router;
}
