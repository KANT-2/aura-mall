import "server-only";
import type { Catalog, Product } from "@/features/catalog/model/catalog";
import type { Recipe } from "@/features/atelier/model/recipes";
import { ApiError } from "@/lib/api/errors";
import { isRecord } from "@/lib/validation";

function invalid(): never {
  throw new ApiError(502, "API 서버의 응답을 확인하지 못했어요.", "INVALID_BACKEND_RESPONSE");
}

function record(value: unknown) {
  return isRecord(value) ? value : invalid();
}

function text(value: unknown): string {
  return typeof value === "string" ? value : invalid();
}

function integer(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : invalid();
}

function boolean(value: unknown): boolean {
  return typeof value === "boolean" ? value : invalid();
}

function list<T>(value: unknown, decode: (item: unknown) => T): T[] {
  return Array.isArray(value) ? value.map(decode) : invalid();
}

function dictionary<T>(value: unknown, decode: (item: unknown) => T): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record(value)).map(([key, item]) => [key, decode(item)]),
  );
}

/** Keep the web's public DTO even if the backend adds ORM or operational fields. */
export function productResponse(value: unknown): Product {
  const item = record(value);
  return {
    id: text(item.id),
    collection: text(item.collection),
    type: text(item.type),
    typeName: text(item.typeName),
    name: text(item.name),
    englishName: text(item.englishName),
    volume: text(item.volume),
    price: item.price === null ? null : integer(item.price),
    stock: integer(item.stock),
    image: text(item.image),
    description: text(item.description),
    notes: list(item.notes, text),
    featured: boolean(item.featured),
    imageUrl: text(item.imageUrl),
    category: text(item.category),
    isNew: boolean(item.isNew),
    ...(item.noteImages !== undefined ? { noteImages: dictionary(item.noteImages, text) } : {}),
    ...(item.giftImages !== undefined ? { giftImages: list(item.giftImages, text) } : {}),
  };
}

export function catalogResponse(value: unknown): Catalog {
  const item = record(value);
  const atelier = record(item.atelier);
  const names = record(atelier.suggestedNames);
  const home = record(item.home);
  const promotion = (value: unknown) => {
    const item = record(value);
    return {
      title: text(item.title),
      copy: text(item.copy),
      cta: text(item.cta),
      url: text(item.url),
      image: text(item.image),
    };
  };
  return {
    products: list(item.products, productResponse),
    collections: list(item.collections, (value) => {
      const item = record(value);
      return {
        id: text(item.id),
        name: text(item.name),
        title: text(item.title),
        description: text(item.description),
        color: text(item.color),
        notes: list(item.notes, text),
      };
    }),
    types: list(item.types, (value) => {
      const item = record(value);
      return { id: text(item.id), name: text(item.name), label: text(item.label) };
    }),
    ingredients: list(item.ingredients, (value) => {
      const item = record(value);
      const stage = item.stage;
      if (stage !== "top" && stage !== "middle" && stage !== "base") {
        return invalid();
      }

      return {
        id: text(item.id),
        name: text(item.name),
        stage,
        color: text(item.color),
        description: text(item.description),
      };
    }),
    scentFamilies: list(item.scentFamilies, (value) => {
      const item = record(value);
      return {
        id: text(item.id),
        name: text(item.name),
        english: text(item.english),
        asset: text(item.asset),
        description: text(item.description),
        notes: list(item.notes, text),
      };
    }),
    atelier: {
      suggestedNames: {
        fresh: list(names.fresh, text),
        soft: list(names.soft, text),
        warm: list(names.warm, text),
      },
    },
    home: {
      bestsellerIds: list(home.bestsellerIds, text),
      guestPromotions: list(home.guestPromotions, promotion),
      memberPromotions: list(home.memberPromotions, promotion),
    },
  };
}

export function recipeResponse(value: unknown): Recipe {
  const item = record(value);
  return {
    id: text(item.id),
    version: integer(item.version),
    name: text(item.name),
    label: text(item.label),
    counts: dictionary(item.counts, integer),
    color: text(item.color),
    created: text(item.created),
    ...(item.parent !== undefined ? { parent: text(item.parent) } : {}),
  };
}

export function recipesResponse(value: unknown): Recipe[] {
  return list(value, recipeResponse);
}

export function inquiryResponse(value: unknown): { id: string } {
  return { id: text(record(value).id) };
}
