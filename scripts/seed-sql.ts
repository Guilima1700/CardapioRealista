import { writeFileSync } from "node:fs";
import { seed } from "../src/lib/seed";
const q = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
const text = (v: string) => `'${v.replace(/'/g, "''")}'`;
const lines = [
  "-- Demo catalog only. No synthetic orders, payments or analytics.",
  "begin;",
  `insert into public.restaurant_settings values (1,${q(seed.settings)}) on conflict(id) do nothing;`,
];
seed.categories.forEach((c) =>
  lines.push(
    `insert into public.menu_categories values (${text(c.id)},${q(c)}) on conflict(id) do nothing;`,
  ),
);
seed.products.forEach((p) =>
  lines.push(
    `insert into public.menu_items values (${text(p.id)},${text(p.categoryId)},${q(p)}) on conflict(id) do nothing;`,
  ),
);
seed.tables.forEach((t) => {
  const token = crypto.randomUUID();
  lines.push(
    `insert into public.restaurant_tables values (${text(t.id)},${text(token)},${q({ ...t, token })}) on conflict(id) do nothing;`,
  );
});
lines.push("commit;");
writeFileSync("supabase/seed.sql", lines.join("\n") + "\n");
console.log("supabase/seed.sql atualizado.");
