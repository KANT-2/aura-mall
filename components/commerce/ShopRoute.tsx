import { readShopSearch, type ShopSearchParams } from "@/lib/aura/catalog";
import { Shop } from "./Shop";

/** Shared server entry for /shop and the compatible /products URL. */
export async function ShopRoute({ searchParams }: { searchParams: Promise<ShopSearchParams> }) {
  return <Shop {...readShopSearch(await searchParams)} />;
}
