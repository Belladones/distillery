import { test } from "node:test";
import assert from "node:assert/strict";
import { productMarkup, productCard } from "../public/storefront.js";
const p = {
  id: 1,
  slug: "gin-test",
  name: "Gin <script>alert(1)</script>",
  category: "GIN",
  price_cents: 4200,
  volume: "70 cl",
  abv: "42 %",
  stock: 0,
  color: "#b6c8bf",
  image: "/bottle.svg",
  images: ["/bottle.svg"],
  description: "Description sûre",
  composition: "Composition du gin",
  cocktail: "GIN TONIC\n5 cl de gin, tonic.",
};
test("les produits épuisés ne proposent pas de commande et les textes sont échappés", () => {
  const html = productMarkup(p);
  assert.ok(!html.includes("<script>"));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /data-product-add="1" disabled/);
  assert.match(html, /id="product-quantity"[^>]*>0</);
  assert.ok(!productCard(p).includes("<script>"));
});
test("une fiche conserve la composition et la recette du produit, sans recette générique de remplacement", () => {
  const html = productMarkup({ ...p, stock: 2 });
  assert.match(html, /Composition du gin/);
  assert.match(html, /GIN TONIC/);
  assert.match(html, /5 cl de gin, tonic/);
  assert.ok(!html.includes("White Highball"));
  assert.match(productMarkup(null), /Produit introuvable/);
});
