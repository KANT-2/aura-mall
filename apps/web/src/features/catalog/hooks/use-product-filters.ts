"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Collection, ProductType } from "@/features/catalog/model/catalog";

type InitialFilters = { initialCollection?: string; initialType?: string; initialQuery?: string };
export function useProductFilters(
  { initialCollection = "", initialType = "", initialQuery = "" }: InitialFilters,
  collections: Collection[],
  types: ProductType[],
) {
  const router = useRouter();
  const parameters = useSearchParams();
  const collectionId = collections.some((item) => item.id === initialCollection)
    ? initialCollection
    : "";
  const typeId = types.some((item) => item.id === initialType) ? initialType : "";
  const [sort, changeSort] = useState("default");
  const [draft, setDraft] = useState({
    source: initialQuery,
    submitted: initialQuery,
    value: initialQuery,
  });
  // A server echo must retain the user's untrimmed input; external navigation replaces it.
  if (draft.source !== initialQuery) {
    setDraft({
      source: initialQuery,
      submitted: initialQuery,
      value: initialQuery === draft.submitted ? draft.value : initialQuery,
    });
  }

  const query = draft.value;
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(parameters.toString());
      const normalized = query.trim();
      if (normalized) {
        next.set("q", normalized);
      } else {
        next.delete("q");
      }

      if (normalized !== initialQuery) {
        setDraft((current) => ({ ...current, submitted: normalized }));
        router.replace(`/shop${next.size ? `?${next}` : ""}`, { scroll: false });
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [query, initialQuery, router, parameters]);
  useEffect(() => {
    if (collectionId === initialCollection && typeId === initialType) {
      return;
    }

    const next = new URLSearchParams(parameters.toString());
    if (collectionId !== initialCollection) {
      next.delete("collection");
    }

    if (typeId !== initialType) {
      next.delete("type");
    }

    router.replace(`/shop${next.size ? `?${next}` : ""}`, { scroll: false });
  }, [collectionId, typeId, initialCollection, initialType, parameters, router]);
  function select(collection: string, type: string, search = query) {
    setDraft((current) => ({ ...current, submitted: search.trim(), value: search }));
    const next = new URLSearchParams();
    if (collection) {
      next.set("collection", collection);
    }

    if (type) {
      next.set("type", type);
    }

    if (search.trim()) {
      next.set("q", search.trim());
    }

    router.replace(`/shop${next.size ? `?${next}` : ""}`, { scroll: false });
  }
  return {
    collectionId,
    typeId,
    query,
    sort,
    changeQuery: (value: string) => setDraft((current) => ({ ...current, value })),
    changeSort,
    select,
  };
}
