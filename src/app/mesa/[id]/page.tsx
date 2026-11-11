import { notFound } from "next/navigation";
import { getCatalog } from "@/lib/server/db";
import Menu from "@/components/menu";
import { publicCatalog } from "@/lib/public-catalog";
export const dynamic = "force-dynamic";
export default async function TablePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const catalog = await getCatalog();
  const table = catalog.tables.find(
    (t) => t.active && (t.id === id || t.id === "table-" + id),
  );
  if (!table) notFound();
  return (
    <Menu
      initial={{
        ...publicCatalog(catalog),
        tables: [table],
      }}
      table={table}
      demo={false}
    />
  );
}
