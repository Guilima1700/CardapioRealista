import { notFound } from "next/navigation";
import { findOrder, getCatalog } from "@/lib/server/db";
import OrderTracking from "@/components/order-tracking";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const order = await findOrder(token);
  if (!order) notFound();
  const catalog = await getCatalog();
  return (
    <OrderTracking
      initial={order}
      name={catalog.settings.name}
      timezone={catalog.settings.timezone}
      tableToken={
        catalog.tables.find((t) => t.id === order.tableId)?.token || ""
      }
    />
  );
}
