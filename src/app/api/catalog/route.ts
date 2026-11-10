import { endpoint } from "@/lib/server/http";
import { getCatalog } from "@/lib/server/db";
export const GET = endpoint(async (request) => {
  const catalog = await getCatalog();
  const token = request.nextUrl.searchParams.get("mesa");
  return {
    ...catalog,
    products: catalog.products.filter((p) => p.available),
    tables: catalog.tables.filter((t) => t.active && t.token === token),
  };
});
