import { Shop } from "@/features/catalog/components/shop-client";
import { readShopSearch, type ShopSearchParams } from "@/features/catalog/model/catalog";

export default async function Page({ searchParams }: { searchParams: Promise<ShopSearchParams> }) {
  return <Shop {...readShopSearch(await searchParams)} />;
}
