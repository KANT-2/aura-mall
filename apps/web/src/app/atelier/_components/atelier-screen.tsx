"use client";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useAccount } from "@/features/account/hooks/use-account";
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
  const account = useAccount();
  const cart = useCart();
  const recipes = useRecipes();
  const draft = useDraft();
  const error = account.error ?? recipes.error ?? draft.error;
  if (error) {
    throw error;
  }

  if (!recipes.ready || !draft.ready) {
    return (
      <main className="page-width" aria-busy="true">
        <LoadingSkeleton variant="atelier" label="조향 정보를 불러오고 있어요." />
      </main>
    );
  }

  return (
    <AtelierEditor
      key={`${account.owner}:${recipeId ?? ""}:${resume}`}
      initialRecipe={recipes.recipes.find((recipe) => recipe.id === recipeId)}
      initialDraft={draft.draft}
      resume={resume}
      authenticated={!!account.user}
      onSave={recipes.save}
      onAddToCart={cart.addCustom}
      persistDraft={draft.persist}
      clearDraft={draft.clear}
      busy={cart.pending || recipes.pending}
    />
  );
}
