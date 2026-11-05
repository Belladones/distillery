// Presentation adapted from the supplied HomePage, ProductsPage and ProductDetailPage.
// All commercial information remains sourced from the existing PostgreSQL catalogue.
export const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (value) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    value / 100,
  );
export const rightArrow =
  '<svg class="arrow-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18m-7-7 7 7-7 7"/></svg>';
const barrel =
  '<svg class="brand-barrel" viewBox="0 0 60 70" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 5h40q12 30 0 60H10Q-2 35 10 5Zm-3 12h46M5 29h50M5 41h50M7 53h46M20 5q-9 30 0 60M30 5v60M40 5q9 30 0 60"/></svg>';
export const brand = `<span class="brand-lockup"><span>ANTOINE<br>BRAVAR<br><small>DISTILLERY</small></span>${barrel}</span>`;
export const testimonials = [
  {
    quote:
      "Quand je travaille un cocktail avec ces spiritueux, je sais que je pars d’un produit vivant, précis et artisanal : il suffit de l’accompagner, pas de le masquer.",
    author: "Quentin Giraud",
    role: "Le Broc, sommelier",
    image: "temoignage1.png",
  },
  {
    quote:
      "On retrouve une vraie signature aromatique : céréale, fraîcheur, tension et une finale nette. C’est exactement le genre de bouteille qui donne du caractère à une carte.",
    author: "Camille Morel",
    role: "Cave indépendante, Lyon",
    image: "temoignage2.png",
  },
  {
    quote:
      "Ces spiritueux ont suffisamment de personnalité pour être dégustés seuls, mais assez d’équilibre pour devenir la colonne vertébrale d’un cocktail simple et élégant.",
    author: "Nora Benali",
    role: "Mixologue, Paris",
    image: "temoignage3.png",
  },
];
export const asset = (name, alt, classes = "", extra = "") =>
  `<img class="${classes}" src="/assets/${escape(name)}" data-fallback="/distillery.png" alt="${escape(alt)}" loading="lazy" ${extra}>`;
export function productCard(p, index = 0) {
  const href = "/products/" + encodeURIComponent(p.slug);
  return `<article class="product-card product-card--${index % 3}"><div class="product-card__texture" aria-hidden="true"></div><a class="product-card__image" href="${href}" style="background-color:${escape(p.color)}"><img src="${escape(p.image)}" alt="Bouteille ${escape(p.name)}" loading="lazy"></a><div class="product-card__meta"><div><h3><a href="${href}">${escape(p.name)}</a></h3><p>${escape(p.category)} · ${money(p.price_cents)}</p>${p.stock <= 0 ? "<p>Épuisé</p>" : ""}</div><a href="${href}" aria-label="Voir ${escape(p.name)}">${rightArrow}</a></div></article>`;
}
export function cards(products) {
  return (
    products.map(productCard).join("") ||
    '<p class="empty">Aucun produit disponible pour le moment.</p>'
  );
}
export function homeMarkup() {
  return `<section class="hero" id="accueil"><div class="hero__background" aria-hidden="true"><img src="/assets/hero-banner.png" data-fallback="/distillery.png" alt="" fetchpriority="high"></div><div class="hero__intro"><p><span>•</span>Antoine</p><h1>L’indépendance<br>distillée</h1></div><p class="hero__note">L’aventure d’une famille réunie autour d’une même passion.</p><div class="hero__headline"><div class="hero__headline-line hero__headline-line--first"><span>Notre</span><em>passion</em></div><div class="hero__headline-line hero__headline-line--second"><span>Votre</span><a class="hero__cta" href="/products" aria-label="Voir nos produits">${rightArrow}</a><em>perfection</em></div></div></section>
<section class="about-section container" id="about"><p class="section-kicker">(À propos de nous)</p><h2>Indépendants, affranchis des traditions et à mille lieues des autres whiskies américains, nous sommes là pour repousser les limites de notre savoir faire.</h2></section>
<section class="craft container" id="savoir-faire"><h2>Notre<br><em>Savoir Faire</em></h2><div class="craft__grid">${asset("bento1.png", "Verre de spiritueux cuivré", "craft__item craft__item--small")}${asset("bento4.png", "Bouteilles de distillat artisanal", "craft__item craft__item--wide")}${asset("bento3.png", "Fûts de bois dans une cave", "craft__item craft__item--small")}${asset("bento2.png", "Cuve et cuivre en distillerie", "craft__item craft__item--large")}${asset("bento5.png", "Grains de malt", "craft__item craft__item--square")}${asset("bento6.png", "Alambics en cuivre", "craft__item craft__item--small")}</div></section>
<section class="testimonial" aria-label="Témoignages"><div class="testimonial__viewport"><div class="testimonial__track">${testimonials.map((t, i) => `<article class="testimonial__panel" aria-hidden="${i !== 0}">${asset(t.image, "", "testimonial-photo")}<div class="testimonial__content container"><p class="section-kicker">(Témoignages)</p><blockquote>“${escape(t.quote)}”</blockquote><cite>${escape(t.author)}<br><span>${escape(t.role)}</span></cite></div></article>`).join("")}</div></div><div class="testimonial__ui container"><div class="testimonial__counter" aria-live="polite">01 / 03</div><div class="testimonial__controls" aria-label="Navigation des témoignages"><button type="button" data-testimonial-step="-1" aria-label="Témoignage précédent"><span class="reverse-arrow">${rightArrow}</span></button><div class="testimonial__dots" role="group" aria-label="Choisir un témoignage">${testimonials.map((t, i) => `<button type="button" data-testimonial="${i}" class="${i === 0 ? "is-active" : ""}" aria-label="Voir le témoignage de ${escape(t.author)}" aria-pressed="${i === 0}"></button>`).join("")}</div><button type="button" data-testimonial-step="1" aria-label="Témoignage suivant">${rightArrow}</button><button type="button" class="testimonial-pause" id="testimonial-pause" aria-label="Mettre les témoignages en pause">Pause</button></div></div></section>
<section class="products-home container"><div class="products-home__brand">${brand}</div><h2>Nos Produits</h2><div class="products-home__list" id="products-grid"><p>Chargement des produits…</p></div><a class="collection-link" href="/products">Voir toute la collection ${rightArrow}</a></section><div class="marquee" aria-hidden="true"><span>✦ Whisky disponible prochainement · Whisky disponible prochainement · Whisky disponible prochainement</span></div>`;
}
export function catalogMarkup(products, filter = "all") {
  const categories = [...new Set(products.map((p) => p.category))];
  const selected =
    filter === "all" ? products : products.filter((p) => p.category === filter);
  return `<section class="catalog-page container page-offset"><p class="section-kicker">(Boutique)</p><h1>Nos Produits</h1><p class="catalog-page__intro">Des spiritueux en petites séries, produits avec une approche artisanale et un goût marqué pour les profils atypiques.</p><div class="catalog-filters" role="group" aria-label="Filtrer les spiritueux"><button data-catalog-filter="all" class="${filter === "all" ? "active" : ""}" aria-pressed="${filter === "all"}">Tous les spiritueux</button>${categories.map((c) => `<button data-catalog-filter="${escape(c)}" class="${filter === c ? "active" : ""}" aria-pressed="${filter === c}">${escape(c)}</button>`).join("")}</div><div class="catalog-grid">${cards(selected)}</div></section>`;
}
export function productMarkup(p) {
  if (!p)
    return `<section class="empty-state container"><h1>Produit introuvable</h1><p>Ce spiritueux n’est plus disponible ou cette adresse est incorrecte.</p><a class="text-link" href="/products">Retour aux produits ${rightArrow}</a></section>`;
  const gallery = [...new Set(p.images || [])];
  const recipe = String(p.cocktail || "").split("\n");
  return `<div class="container product-detail-breadcrumb"><nav class="breadcrumb" aria-label="Fil d’Ariane"><a href="/">Accueil</a><span>/</span><a href="/products">Nos Produits</a><span>/</span><span aria-current="page">${escape(p.name)}</span></nav></div><section class="product-hero container page-offset"><div class="product-hero__image" style="--product-color:${escape(p.color)}"><img id="product-main-image" src="${escape(p.image)}" alt="Bouteille ${escape(p.name)}"></div><div class="product-hero__content"><h1>${escape(p.name)}</h1><div class="product-hero__meta"><strong>${money(p.price_cents)}</strong><span>${escape(p.volume)}</span></div><p class="product-hero__subtitle">${escape(p.category)}</p><p>${escape(p.description)}</p><h2>Composition</h2><p class="product-hero__story">${escape(p.composition)}</p><p class="product-hero__abv">${escape(p.abv)} vol. · ${p.stock > 0 ? "Stock : " + p.stock + " bouteille" + (p.stock > 1 ? "s" : "") : "Épuisé"}</p><div class="product-hero__actions"><div class="quantity" role="group" aria-label="Sélecteur de quantité"><button type="button" data-product-step="-1" aria-label="Diminuer la quantité" disabled>−</button><span id="product-quantity" aria-live="polite">${p.stock > 0 ? 1 : 0}</span><button type="button" data-product-step="1" aria-label="Augmenter la quantité" ${p.stock <= 1 ? "disabled" : ""}>+</button></div><button type="button" class="button button--dark" data-product-add="${p.id}" ${p.stock <= 0 ? "disabled" : ""}>${p.stock > 0 ? "Ajouter au panier" : "Bientôt de retour"}<span>${rightArrow}</span></button></div><p class="product-delivery">Prix TTC · Livraison calculée dans votre panier.<br>Paiement sécurisé par carte bancaire ou PayPal.</p></div></section>
${gallery.length ? `<section class="product-gallery container" aria-label="Galerie ${escape(p.name)}">${gallery.map((url, i) => `<button class="product-gallery__item" data-product-image="${escape(url)}" aria-label="Agrandir la vue ${i + 1}"><img src="${escape(url)}" alt="${escape(p.name)}, vue ${i + 1}" loading="lazy"></button>`).join("")}</section>` : ""}
<section class="manufacturing"><div class="container manufacturing__inner"><h2>La fabrication</h2><div class="manufacturing__intro"><p>${escape(p.description)}</p>${asset("bento6.png", "Alambics en cuivre")}</div><div class="manufacturing__collage manufacturing__collage--one">${asset("bento2.png", "Le travail en distillerie")}<div><p class="section-kicker">(Les ingrédients)</p><p>${escape(p.composition)}</p><p>Retrouvez la composition et les caractéristiques de chaque spiritueux pour choisir le profil qui vous ressemble.</p></div></div><div class="manufacturing__row">${asset("bento1.png", "Les nuances du spiritueux")}${asset("bento4.png", "La mise en bouteille")}${asset("bento3.png", "Le temps et le savoir-faire")}</div></div></section>
<section class="recipes container"><h2>Nos recettes</h2><div class="recipe-card"><p class="eyebrow">Cocktail signature</p><h3>${escape(recipe[0] || "À découvrir")}</h3><p>${escape(recipe.slice(1).join("\n") || "Découvrez bientôt une recette pour ce spiritueux.")}</p></div><a class="collection-link" href="/products">Découvrir les autres spiritueux ${rightArrow}</a></section>`;
}
