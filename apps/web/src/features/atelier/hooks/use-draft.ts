"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotify } from "@/components/feedback/notification-provider";
import { useSession } from "@/features/account/hooks/use-session";
import { draftKey, getDraft, saveDraft } from "@/features/atelier/api/draft";
export function useDraft() {
  const { guestId, ready } = useSession();
  const client = useQueryClient();
  const notify = useNotify();
  const key = draftKey(guestId);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getDraft(signal),
    enabled: ready,
  });
  // Save and delete share a queue, so an older save cannot resurrect a discarded draft.
  const mutation = useMutation({
    mutationFn: saveDraft,
    onError: (error) =>
      notify(error instanceof Error ? error.message : "초안을 저장하지 못했어요."),
    scope: { id: `draft:${guestId}` },
    async onSuccess(draft) {
      await client.cancelQueries({ queryKey: key });
      client.setQueryData(key, draft);
    },
  });
  return {
    draft: query.data ?? null,
    ready: ready && query.isSuccess,
    error: query.error,
    persist: mutation.mutate,
    async clear() {
      try {
        await mutation.mutateAsync(null);
        return true;
      } catch {
        return false;
      }
    },
  };
}
