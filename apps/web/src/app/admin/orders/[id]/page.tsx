import { AdminOrderDetail } from "@/features/admin/components/order-screens";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminOrderDetail key={id} id={id} />;
}
