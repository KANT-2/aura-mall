"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/account/hooks/use-session";
import { useNotify } from "@/components/feedback/notification-provider";
import {
  getRecipes,
  recipesKey,
  saveRecipe,
  type RecipeInput,
} from "@/features/atelier/api/recipes";
export function useRecipes() {
  const { owner, ready } = useSession();
  const client = useQueryClient();
  const notify = useNotify();
  const key = recipesKey(owner);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getRecipes(signal),
    enabled: ready,
    throwOnError: true,
  });
  const mutation = useMutation({
    mutationFn: ({ recipe, owner }: { recipe: RecipeInput; owner: string }) =>
      saveRecipe(recipe, owner),
    onSuccess: (_recipe, variables) =>
      client.invalidateQueries({ queryKey: recipesKey(variables.owner) }),
  });
  return {
    recipes: query.data ?? [],
    ready: ready && query.isSuccess,
    pending: mutation.isPending,
    error: query.error,
    async save(recipe: RecipeInput) {
      try {
        if (!owner) {
          return false;
        }
        await mutation.mutateAsync({ recipe, owner });
        notify("내가 만든 향에 저장했어요.");
        return true;
      } catch (error) {
        notify(error instanceof Error ? error.message : "저장하지 못했어요.");
        return false;
      }
    },
  };
}
