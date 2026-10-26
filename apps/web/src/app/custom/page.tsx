import { AtelierScreen } from "@/app/atelier/_components/atelier-screen";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ recipe?: string; resume?: string }>;
}) {
  const params = await searchParams;
  return <AtelierScreen recipeId={params.recipe} resume={params.resume !== undefined} />;
}
