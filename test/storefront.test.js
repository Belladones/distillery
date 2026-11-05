import { test } from "node:test";
import assert from "node:assert/strict";
import {
  productMarkup,
  productCard,
  productPhotos,
  catalogMarkup,
} from "../public/storefront.js";
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

test("les sections masquées disparaissent et les textes de l’accueil restent du texte", async () => {
  const { defaultHome, validateHome } =
    await import("../public/home-content.js");
  const { homeMarkup } = await import("../public/storefront.js");
  const content = structuredClone(defaultHome);
  content.about.enabled = false;
  content.testimonials.enabled = false;
  content.hero.name = "<img src=x onerror=alert(1)>";
  const valid = validateHome(content),
    html = homeMarkup(valid);
  assert.ok(!html.includes('id="about"'));
  assert.ok(!html.includes('class="testimonial"'));
  assert.ok(!html.includes("<img src=x"));
  assert.match(html, /&lt;img src=x/);
  assert.throws(() =>
    validateHome({
      ...content,
      hero: { ...content.hero, image: "javascript:alert(1)" },
    }),
  );
});

test("la carte d’accueil utilise la photo sans fond ajouté et sa texture facultative", () => {
  const html = productCard(
    { ...p, texture_image: "/media/texture-test" },
    0,
    true,
  );
  assert.match(html, /src="\/media\/texture-test"/);
  assert.match(html, /src="\/bottle.svg"/);
  assert.ok(!html.includes("background-color"));
  assert.ok(!html.includes("<script>"));
  const plain = productCard(p, 0, true);
  assert.ok(!plain.includes('class="product-card__texture"'));
});

test("la fiche rassemble la photo principale et les photos complémentaires sans doublons", () => {
  const product = {
    ...p,
    images: [p.image, "/media/photo2", "/media/photo3", "/media/photo2"],
  };
  assert.deepEqual(productPhotos(product), [
    p.image,
    "/media/photo2",
    "/media/photo3",
  ]);
  const html = productMarkup(product);
  assert.equal(
    (html.match(/aria-roledescription="diapositive"/g) || []).length,
    3,
  );
  assert.ok(!html.includes('<section class="product-gallery'));
  assert.ok(!html.includes("--product-color"));
  const single = productMarkup({ ...p, images: [p.image] });
  assert.ok(!single.includes('aria-label="Photo suivante"'));
  assert.ok(!single.includes('aria-label="Photo précédente"'));
});
test("le catalogue utilise aussi la texture personnalisée et n’ajoute pas d’aplat coloré", () => {
  const html = catalogMarkup([
    { ...p, texture_image: "/media/texture-catalogue" },
  ]);
  assert.match(html, /src="\/media\/texture-catalogue"/);
  assert.ok(!html.includes("background-color"));
  assert.match(html, /42,00/);
});
