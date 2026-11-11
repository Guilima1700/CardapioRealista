import { getCatalog } from "@/lib/server/db";
import Menu from "@/components/menu";
import { publicCatalog } from "@/lib/public-catalog";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { settings } = await getCatalog();
  return {
    title: `${settings.name} · ${settings.tagline}`,
    description: settings.description,
  };
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mesa?: string }>;
}) {
  const params = await searchParams;
  const catalog = await getCatalog();
  const demo = !params.mesa && catalog.backend === "sqlite";
  const table = catalog.tables.find(
    (t) =>
      t.active &&
      t.token === (params.mesa || (demo ? "brasa-mesa-7-demo" : "")),
  );
  return (
    <Menu
      initial={{
        ...publicCatalog(catalog),
        tables: table ? [table] : [],
      }}
      table={table}
      demo={demo}
    />
  );
}
