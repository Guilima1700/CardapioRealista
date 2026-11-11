import { endpoint } from "@/lib/server/http";
import { getCatalog } from "@/lib/server/db";
import { publicCatalog } from "@/lib/public-catalog";
export const GET = endpoint(async (request) => {
  const catalog = await getCatalog();
  const token = request.nextUrl.searchParams.get("mesa");
  return {
    ...publicCatalog(catalog),
    tables: catalog.tables.filter((t) => t.active && t.token === token),
  };
});
