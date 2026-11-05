import { pool, schema } from "../db.js";
import { products } from "../data.js";
if (!pool) throw new Error("DATABASE_URL est nécessaire.");
await pool.query(schema);
for (const p of products) {
  const { id, ...row } = p;
  const keys = Object.keys(row);
  await pool.query(
    `INSERT INTO products (${keys.join(",")}) VALUES (${keys.map((_, i) => "$" + (i + 1)).join(",")}) ON CONFLICT (slug) DO NOTHING`,
    Object.values(row),
  );
}
console.log("Schéma et catalogue initial prêts.");
await pool.end();
