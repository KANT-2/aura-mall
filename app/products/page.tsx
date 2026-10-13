import { Shop } from "@/components/editorial/Aura";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ collection?: string; type?: string; q?: string }>;
}) {
  const s = await searchParams;
  return (
    <Shop
      initialCollection={s.collection}
      initialType={s.type}
      initialQuery={s.q}
    />
  );
}
