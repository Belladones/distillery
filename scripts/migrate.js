import { pool, schema } from "../db.js";
import { products } from "../data.js";
import { defaultHome } from "../public/home-content.js";
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
await pool.query(
  "INSERT INTO site_content(key,content) VALUES('home',$1) ON CONFLICT(key) DO NOTHING",
  [JSON.stringify(defaultHome)],
);
console.log("Schéma, catalogue et contenu de l’accueil prêts.");
await pool.end();
