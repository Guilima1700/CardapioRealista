import type { Catalog } from "./types";
/** Costs are administrative data and must not reach public JSON or RSC payloads. */
export function publicCatalog(catalog: Catalog): Catalog {
  return {
    ...catalog,
    products: catalog.products
      .filter((p) => p.available)
      .map(({ costs: _costs, ...p }) => p),
  };
}
