"use client";
import { useSession } from "@/features/account/hooks/use-session";
import { useCart } from "@/features/cart/hooks/use-cart";
import { useRecipes } from "@/features/atelier/hooks/use-recipes";
import { useDraft } from "@/features/atelier/hooks/use-draft";
import { AtelierEditor } from "@/features/atelier/components/atelier-client";

export function AtelierScreen({
  recipeId,
  resume = false,
}: {
  recipeId?: string;
  resume?: boolean;
}) {
  const session = useSession();
  const cart = useCart();
  const recipes = useRecipes();
  const draft = useDraft();
  const error = session.error ?? recipes.error ?? draft.error;
  if (error) {
    throw error;
  }
  if (!recipes.ready || !draft.ready) {
    return (
      <main className="page-width" aria-busy="true">
        <p role="status">조향 정보를 불러오고 있어요.</p>
      </main>
    );
  }
  return (
    <AtelierEditor
      key={`${session.owner}:${recipeId ?? ""}:${resume}`}
      initialRecipe={recipes.recipes.find((recipe) => recipe.id === recipeId)}
      initialDraft={draft.draft}
      resume={resume}
      authenticated={!!session.user}
      onSave={recipes.save}
      onAddToCart={cart.addCustom}
      persistDraft={draft.persist}
      clearDraft={draft.clear}
      busy={cart.pending || recipes.pending}
    />
  );
}
