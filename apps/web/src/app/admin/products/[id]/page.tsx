import { AdminProductEditor } from "@/features/admin/components/product-editor";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminProductEditor key={id} id={id} />;
}
