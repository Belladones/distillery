const arrow =
  '<svg class="arrow-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg>';
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const escape = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    n / 100,
  );
let config,
  products = [],
  user = null,
  cart = [],
  filter = "all",
  authMode = "login",
  adminTab = "orders",
  toastTimer;
try {
  cart = JSON.parse(localStorage.getItem("libres-cart") || "[]");
  if (!Array.isArray(cart)) cart = [];
  cart = cart.filter(
    (i) =>
      Number.isInteger(i.id) &&
      Number.isInteger(i.quantity) &&
      i.quantity > 0 &&
      i.quantity <= 99,
  );
} catch {
  cart = [];
}
async function api(path, options = {}) {
  const response = await fetch("/api" + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": config?.csrf || "",
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Erreur réseau");
  return data;
}
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 4000);
}
function modal(html, wide = false) {
  $("#modal").classList.toggle("wide", wide);
  $("#modal-content").innerHTML = html.replaceAll("↗", arrow);
  if (!$("#modal").open) $("#modal").showModal();
}
function closeModal() {
  $("#modal").close();
}
function errorIn(form, e) {
  let el = form.querySelector(".error");
  if (!el) {
    el = document.createElement("p");
    el.className = "error";
    el.setAttribute("role", "alert");
    form.append(el);
  }
  el.textContent = e.message;
}
async function submit(form, fn) {
  const button = form.querySelector("button[type=submit]");
  if (button) button.disabled = true;
  try {
    await fn();
  } catch (e) {
    errorIn(form, e);
  } finally {
    if (button) button.disabled = false;
  }
}
function persist() {
  localStorage.setItem("libres-cart", JSON.stringify(cart));
  $("#cart-count").textContent = cart.reduce((s, i) => s + i.quantity, 0);
}
function renderProducts() {
  const list = products.filter(
    (p) => filter === "all" || p.category.includes(filter),
  );
  $("#products-grid").innerHTML = list.length
    ? list
        .map(
          (p, index) =>
            `<article class="product-card"><button class="product-art" data-product="${p.id}" style="--product-color:${escape(p.color)}" aria-label="Découvrir ${escape(p.name)}"><span class="product-index">0${index + 1} / LES LIBRES</span><span class="badge">${p.stock > 0 ? "PETIT LOT" : "ÉPUISÉ"}</span><img src="${escape(p.image)}" alt="Bouteille ${escape(p.name)}" loading="lazy"></button><div class="product-meta"><span class="product-category">${escape(p.category)}</span><div><button class="product-name" data-product="${p.id}">${escape(p.name)}</button><span class="price">${money(p.price_cents)}</span></div><span class="product-details">${escape(p.volume)} &nbsp; / &nbsp; ${escape(p.abv)} vol.</span></div><button class="add-cart" data-add="${p.id}" ${p.stock <= 0 ? "disabled" : ""}>${p.stock > 0 ? "Ajouter au panier" : "Bientôt de retour"}<span>${arrow}</span></button></article>`,
        )
        .join("")
    : '<p class="empty">Aucun spiritueux dans cette catégorie pour le moment.</p>';
}
function showProduct(id) {
  const p = products.find((p) => p.id === id);
  if (!p) return;
  modal(
    `<div class="product-modal"><div><div class="product-art" style="--product-color:${escape(p.color)}"><img id="gallery-image" src="${escape(p.image)}" alt="${escape(p.name)}"></div>${p.images?.length ? `<div class="gallery-thumbs">${[p.image, ...p.images].map((src, i) => `<button data-gallery="${escape(src)}" aria-label="Vue ${i + 1}"><img src="${escape(src)}" alt="Vue ${i + 1}"></button>`).join("")}</div>` : ""}</div><div><div class="eyebrow">${escape(p.category)}</div><h2>${escape(p.name)}</h2><span>${money(p.price_cents)} <small> / ${escape(p.volume)} · ${escape(p.abv)} vol.</small></span><p>${escape(p.description)}</p><h3>COMPOSITION</h3><p>${escape(p.composition)}</p><h3>LE COCKTAIL DE LA MAISON</h3><p class="cocktail">${escape(p.cocktail)}</p><button class="primary full" data-add="${id}" ${p.stock <= 0 ? "disabled" : ""}>${p.stock > 0 ? "Ajouter au panier — " + money(p.price_cents) : "Épuisé"} <span>↗</span></button></div></div>`,
    true,
  );
}
async function add(id) {
  const p = products.find((p) => p.id === id),
    old = cart.find((i) => i.id === id);
  if (!p) return;
  const quantity = (old?.quantity || 0) + 1;
  if (quantity > p.stock || quantity > 99)
    return toast("La quantité disponible est atteinte.");
  try {
    if (user)
      await api("/cart", { method: "PUT", body: { product_id: id, quantity } });
    if (old) old.quantity = quantity;
    else cart.push({ id, quantity });
    persist();
    toast(p.name + " a rejoint votre panier.");
  } catch (e) {
    toast(e.message);
  }
}
async function changeQuantity(id, quantity) {
  try {
    if (user)
      await api("/cart", { method: "PUT", body: { product_id: id, quantity } });
    if (quantity === 0) cart = cart.filter((i) => i.id !== id);
    else {
      const p = products.find((p) => p.id === id);
      if (quantity > p.stock || quantity > 99)
        return toast("Stock disponible atteint.");
      cart.find((i) => i.id === id).quantity = quantity;
    }
    persist();
    showCart();
  } catch (e) {
    toast(e.message);
  }
}
function cartItems() {
  return cart
    .map((i) => ({
      ...products.find((p) => p.id === i.id),
      quantity: i.quantity,
    }))
    .filter((i) => i.name);
}
function showCart() {
  const items = cartItems(),
    subtotal = items.reduce((s, p) => s + p.price_cents * p.quantity, 0);
  modal(
    `<div class="eyebrow">LES BONS MOMENTS COMMENCENT ICI</div><h2 class="modal-title">Votre panier <em>(${items.reduce((s, p) => s + p.quantity, 0)})</em></h2>${!items.length ? '<div class="empty">Votre panier attend ses premiers caractères.<br><br><button class="primary" id="browse-products">Découvrir nos spiritueux ↗</button></div>' : items.map((p) => `<div class="cart-line"><img class="cart-thumb" style="--product-color:${escape(p.color)}" src="${escape(p.image)}" alt=""><div><h3>${escape(p.name)}</h3><p>${escape(p.volume)} · ${money(p.price_cents)}</p><div class="quantity"><button data-quantity="${p.id}" data-value="${p.quantity - 1}" aria-label="Retirer une bouteille">−</button><span>${p.quantity}</span><button data-quantity="${p.id}" data-value="${p.quantity + 1}" aria-label="Ajouter une bouteille">+</button><button class="remove" data-quantity="${p.id}" data-value="0">Retirer</button></div></div><strong>${money(p.price_cents * p.quantity)}</strong></div>`).join("") + `<div class="cart-totals"><span>Sous-total TTC</span><span>${money(subtotal)}</span></div><div class="cart-totals"><span>Livraison en France</span><span>${money(config.shipping_cents)}</span></div><div class="cart-totals total"><span>Total TTC</span><span>${money(subtotal + config.shipping_cents)}</span></div>${config.demo ? '<p class="notice">Mode découverte : les commandes seront disponibles après connexion à PostgreSQL et configuration des paiements.</p>' : ""}<button class="primary full orange" id="checkout-button">${user ? "Passer commande" : "Se connecter pour commander"} <span>↗</span></button><p class="modal-subtitle">Paiement sécurisé · Carte bancaire & PayPal<br>Vente réservée aux personnes majeures.</p>`}`,
  );
}
function showAuth(mode = "login") {
  authMode = mode;
  const register = mode === "register";
  modal(
    `<div class="eyebrow">VOTRE ESPACE LES LIBRES</div><h2 class="modal-title">${register ? "Bienvenue parmi nous." : "Heureux de vous revoir."}</h2><p class="modal-subtitle">${register ? "Créez votre compte pour retrouver vos commandes et votre panier." : "Connectez-vous pour retrouver vos envies et vos commandes."}</p>${config.demo ? '<p class="notice">Les comptes nécessitent la connexion à PostgreSQL. Vous pouvez déjà découvrir la collection et composer votre panier.</p>' : ""}<form id="auth-form" class="form">${register ? '<label>Votre nom<input name="name" autocomplete="name" maxlength="100" required></label>' : ""}<label>Adresse email<input type="email" name="email" autocomplete="email" maxlength="254" required></label><label>Mot de passe<input type="password" name="password" autocomplete="${register ? "new-password" : "current-password"}" minlength="${register ? 12 : 1}" maxlength="128" required>${register ? "<small>12 caractères minimum</small>" : ""}</label>${register ? '<label class="check"><input type="checkbox" name="adult" required> Je certifie avoir 18 ans ou plus et accepte les conditions de vente.</label>' : ""}<button type="submit" class="primary full">${register ? "Créer mon compte" : "Se connecter"} ↗</button></form><button class="switch-auth" id="switch-auth">${register ? "Déjà un compte ? Se connecter" : "Pas encore de compte ? Rejoignez-nous"}</button>`,
  );
  $("#auth-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    submit(form, async () => {
      const values = Object.fromEntries(new FormData(form));
      values.adult = !!values.adult;
      const data = await api(register ? "/register" : "/login", {
        method: "POST",
        body: values,
      });
      user = data.user;
      config.csrf = data.csrf;
      const local = [...cart];
      cart = (await api("/cart")).map((p) => ({
        id: p.id,
        quantity: p.quantity,
      }));
      for (const i of local) {
        const existing = cart.find((p) => p.id === i.id);
        const p = products.find((p) => p.id === i.id);
        if (!p) continue;
        const quantity = Math.min(
          p.stock,
          99,
          Math.max(i.quantity, existing?.quantity || 0),
        );
        if (!quantity) continue;
        await api("/cart", {
          method: "PUT",
          body: { product_id: i.id, quantity },
        });
        if (existing) existing.quantity = quantity;
        else cart.push({ id: i.id, quantity });
      }
      persist();
      closeModal();
      location.hash = "compte";
      await route();
      toast("Bienvenue " + user.name + ".");
    });
  });
}
function showCheckout() {
  if (!user) return showAuth();
  const total = cartItems().reduce(
    (s, p) => s + p.price_cents * p.quantity,
    config.shipping_cents,
  );
  modal(
    `<div class="eyebrow">DERNIÈRE ÉTAPE</div><h2 class="modal-title">À votre adresse.</h2><form class="form" id="checkout-form"><div class="form-grid"><label class="span2">Nom et prénom<input name="name" value="${escape(user.name)}" autocomplete="shipping name" required maxlength="180"></label><label class="span2">Adresse<input name="line1" autocomplete="shipping address-line1" required maxlength="180"></label><label>Code postal<input name="postal_code" pattern="[0-9]{5}" autocomplete="shipping postal-code" required></label><label>Ville<input name="city" autocomplete="shipping address-level2" required maxlength="180"></label><label class="span2">Pays<select name="country"><option value="FR">France métropolitaine</option></select></label></div><div class="payment-options"><label><input type="radio" name="provider" value="stripe" ${config.stripe ? "checked" : "disabled"}> Carte bancaire</label><label><input type="radio" name="provider" value="paypal" ${config.paypal ? (!config.stripe ? "checked" : "") : "disabled"}> PayPal</label></div>${!config.stripe && !config.paypal ? '<p class="notice">Les paiements ne sont pas encore activés. Aucune somme ne sera débitée.</p>' : ""}<label class="check"><input type="checkbox" name="adult" required> Je certifie avoir 18 ans ou plus et accepte les conditions générales de vente.</label><div class="cart-totals total"><span>Total TTC, livraison incluse</span><span>${money(total)}</span></div><button type="submit" class="primary orange full" ${!config.stripe && !config.paypal ? "disabled" : ""}>Payer ${money(total)} en toute sécurité ↗</button><p class="modal-subtitle">Vous serez redirigé vers notre prestataire de paiement. Votre commande sera confirmée après validation du paiement.</p></form>`,
  );
  $("#checkout-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    submit(form, async () => {
      const { provider, adult, ...address } = Object.fromEntries(
        new FormData(form),
      );
      const result = await api("/checkout", {
        method: "POST",
        body: { provider, adult: !!adult, address },
      });
      location.assign(result.url);
    });
  });
}
const statuses = {
  pending: "Paiement en attente",
  paid: "Payée · en préparation",
  shipped: "Expédiée",
  cancelled: "Annulée",
  expired: "Expirée",
};
function orderHTML(o, isAdmin = false) {
  return `<article class="order"><div class="order-top"><h3>Commande n° LL-${String(o.id).padStart(5, "0")}</h3><span class="status ${escape(o.status)}">${statuses[o.status] || escape(o.status)}</span><strong>${money(o.total_cents)}</strong></div><p>${new Date(o.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}${isAdmin ? " · " + escape(o.email) : ""}</p><ul>${o.items.map((i) => `<li>${i.quantity} × ${escape(i.name)} <span>— ${money(i.price_cents * i.quantity)}</span></li>`).join("")}</ul><p>Livraison : ${escape(o.address.name)}, ${escape(o.address.line1)}, ${escape(o.address.postal_code)} ${escape(o.address.city)}</p><div class="order-actions">${o.tracking_url ? `<a class="primary" href="${escape(o.tracking_url)}" target="_blank" rel="noopener noreferrer">Suivre mon colis ↗</a>` : ""}${!isAdmin && o.status === "pending" && o.provider === "stripe" ? `<button class="secondary" data-cancel-order="${o.id}">Annuler le paiement en attente</button>` : ""}${!isAdmin && o.status === "pending" && o.provider === "paypal" ? `<button class="secondary" data-capture="${o.id}">Vérifier mon paiement PayPal</button>` : ""}${isAdmin && ["paid", "shipped"].includes(o.status) ? `<button class="secondary" data-ship="${o.id}" data-tracking="${escape(o.tracking_url || "")}">Renseigner le suivi ↗</button>` : ""}</div></article>`;
}
async function renderAccount() {
  const el = $("#account-page");
  if (!user) {
    showAuth();
    return;
  }
  el.innerHTML = `<div class="account-heading"><div><div class="eyebrow">VOTRE ESPACE PERSONNEL</div><h1>Bonjour, ${escape(user.name)}.</h1><p>${escape(user.email)} · Votre panier et vos commandes, au même endroit.</p></div><button id="logout" class="secondary">Se déconnecter ↗</button></div><div class="tabs"><button data-account-tab="orders" class="${adminTab === "orders" ? "active" : ""}">Mes commandes</button>${user.role === "admin" ? `<button data-account-tab="admin-orders" class="${adminTab === "admin-orders" ? "active" : ""}">Toutes les commandes</button><button data-account-tab="admin-products" class="${adminTab === "admin-products" ? "active" : ""}">Produits & stocks</button>` : ""}</div><div id="account-body" class="loader">Chargement…</div>`;
  try {
    if (adminTab === "admin-products" && user.role === "admin") {
      const list = await api("/admin/products");
      $("#account-body").className = "";
      $("#account-body").innerHTML =
        `<button class="primary" id="new-product">Ajouter un produit +</button><div class="admin-list">${list.map((p) => `<div class="admin-row"><div><h3>${escape(p.name)} ${!p.active ? "(masqué)" : ""}</h3><p>${money(p.price_cents)} · ${p.stock} bouteille${p.stock > 1 ? "s" : ""} en stock</p></div><button class="secondary" data-edit="${p.id}">Modifier ↗</button></div>`).join("")}</div>`;
      window.adminProducts = list;
    } else {
      const list = await api(
        adminTab === "admin-orders" && user.role === "admin"
          ? "/admin/orders"
          : "/orders",
      );
      $("#account-body").className = "";
      $("#account-body").innerHTML = list.length
        ? list.map((o) => orderHTML(o, adminTab === "admin-orders")).join("")
        : '<div class="empty">Aucune commande pour le moment.<br><br><a class="text-link" href="#produits">Découvrir la collection ↗</a></div>';
    }
  } catch (e) {
    $("#account-body").className = "error";
    $("#account-body").textContent = e.message;
  }
}
function editProduct(id) {
  const p = window.adminProducts?.find((p) => p.id === id) || {
    active: true,
    color: "#dfb74e",
    image: "/bottle.svg",
    volume: "70 cl",
    abv: "40 %",
    stock: 0,
  };
  const field = (key, label, type = "text") =>
    `<label>${label}<input type="${type}" name="${key}" value="${escape(p[key] ?? "")}" ${type === "number" ? 'min="0" step="1"' : ""} required></label>`;
  modal(
    `<div class="eyebrow">ADMINISTRATION</div><h2 class="modal-title">${id ? "Modifier le produit" : "Un nouvel esprit."}</h2><form id="product-form" class="form"><div class="form-grid">${field("name", "Nom")}${field("slug", "Identifiant URL (lettres, chiffres, tirets)")}${field("category", "Catégorie")}${field("price_cents", "Prix TTC en centimes (5900 = 59 €)", "number")}${field("volume", "Contenance")}${field("abv", "Degré d’alcool")}${field("stock", "Quantité disponible", "number")}${field("color", "Couleur du fond", "color")}<label class="span2">Image de présentation (URL HTTPS ou chemin local)<input name="image" value="${escape(p.image)}" required></label><label class="span2">Galerie complémentaire (8 URL maximum, une par ligne)<textarea name="images">${escape((p.images || []).join("\n"))}</textarea></label>${["description", "composition", "cocktail"].map((k) => `<label class="span2">${{ description: "Description", composition: "Composition", cocktail: "Recette de cocktail" }[k]}<textarea name="${k}" required>${escape(p[k] || "")}</textarea></label>`).join("")}</div><label class="check"><input type="checkbox" name="active" ${p.active ? "checked" : ""}> Visible dans la boutique</label><button type="submit" class="primary">Enregistrer le produit ↗</button></form>`,
    true,
  );
  $("#product-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    submit(form, async () => {
      const values = Object.fromEntries(new FormData(form));
      await api("/admin/products", {
        method: "POST",
        body: {
          ...values,
          id,
          images: values.images
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean),
          price_cents: Number(values.price_cents),
          stock: Number(values.stock),
          active: !!values.active,
        },
      });
      products = await api("/products");
      renderProducts();
      closeModal();
      await renderAccount();
      toast("Produit enregistré.");
    });
  });
}
function showTracking(id, current) {
  modal(
    `<h2 class="modal-title">Un colis en route.</h2><form class="form" id="tracking-form"><label>Lien de suivi du transporteur<input type="url" name="tracking_url" value="${escape(current)}" placeholder="https://…" required></label><p class="modal-subtitle">L’enregistrement marque la commande comme expédiée. Le client retrouvera ce lien dans son compte.</p><button type="submit" class="primary">Enregistrer le suivi ↗</button></form>`,
  );
  $("#tracking-form").addEventListener("submit", (e) => {
    e.preventDefault();
    submit(e.currentTarget, async () => {
      await api("/admin/orders/" + id, {
        method: "PATCH",
        body: {
          status: "shipped",
          tracking_url: new FormData(e.currentTarget).get("tracking_url"),
        },
      });
      closeModal();
      await renderAccount();
      toast("Suivi enregistré.");
    });
  });
}
function legal(type) {
  const texts = {
    mentions: [
      "Mentions légales",
      "<p>Les Libres est une identité de démonstration pour ce projet de boutique. Les coordonnées et descriptions présentées sont provisoires.</p><h3>Avant toute ouverture commerciale</h3><p>Renseignez la raison sociale de l’exploitant, l’adresse du siège, le SIRET, le numéro de TVA, les coordonnées de contact, le directeur de publication et les informations de l’hébergeur. Vérifiez les licences et obligations applicables à la vente de spiritueux.</p>",
    ],
    conditions: [
      "Conditions de vente & livraison",
      "<p>Document provisoire à compléter et faire valider avant ouverture des ventes.</p><h3>Vente réservée aux majeurs</h3><p>La vente d’alcool aux personnes de moins de 18 ans est interdite. Une vérification de majorité est demandée avant commande.</p><h3>Prix et paiement</h3><p>Les prix sont exprimés en euros TTC. Les frais de livraison sont indiqués avant paiement. Le règlement s’effectue par carte bancaire via Stripe ou par PayPal. Une commande est confirmée uniquement après réception du paiement.</p><h3>Livraison et retours</h3><p>La boutique est prévue pour la France métropolitaine. Le suivi est disponible dans le compte client après expédition. Les délais, transporteurs, modalités de rétractation de 14 jours, frais de retour, garanties légales et coordonnées du médiateur doivent être précisés par le vendeur avant lancement.</p>",
    ],
    confidentialite: [
      "Votre confidentialité",
      "<p>Le compte client contient votre nom, votre email, une empreinte sécurisée du mot de passe, votre panier, vos commandes et votre adresse de livraison. Les données de carte bancaire sont traitées par Stripe ; elles ne sont pas enregistrées sur ce site.</p><p>Un cookie strictement nécessaire maintient votre session. Le panier des visiteurs et la confirmation de majorité sont conservés dans le stockage local de votre navigateur. Aucun outil d’analyse ou cookie publicitaire n’est installé.</p><p>Les durées de conservation, le responsable du traitement, les coordonnées pour exercer vos droits et la liste des sous-traitants doivent être complétés avant mise en production. Les polices sont hébergées localement. Les illustrations de présentation ne représentent pas une distillerie réelle.</p>",
    ],
  };
  const [title, body] = texts[type];
  modal(
    `<div class="legal"><h2 class="modal-title">${title}</h2>${body}</div>`,
  );
}
async function route() {
  const account = location.hash === "#compte";
  $("#home").hidden = account;
  $("#account-page").hidden = !account;
  $$(".header nav a").forEach((a) =>
    a.classList.toggle("active", a.hash === (location.hash || "#accueil")),
  );
  if (account) {
    await renderAccount();
    window.scrollTo(0, 0);
  } else if (location.hash) {
    setTimeout(
      () => document.getElementById(location.hash.slice(1))?.scrollIntoView(),
      0,
    );
  }
}
function ageGate() {
  if (localStorage.getItem("libres-adult") === "yes") return;
  modal(
    `<div class="age-content"><div class="eyebrow">DISTILLERIE LES LIBRES</div><h2>Les esprits libres<br><em>ont l’âge de choisir.</em></h2><p>Ce site présente des boissons alcoolisées.<br>Avez-vous 18 ans ou plus ?</p><div class="age-actions"><button class="primary orange" id="age-yes">Oui, j’ai 18 ans ou plus ↗</button><button class="secondary" id="age-no">Non, j’ai moins de 18 ans</button></div><p><small>L’abus d’alcool est dangereux pour la santé.<br>À consommer avec modération.</small></p></div>`,
  );
  $("#modal").classList.add("age-gate");
}
$("#modal").addEventListener("cancel", (e) => {
  if ($("#modal").classList.contains("age-gate")) e.preventDefault();
});
$(".close-modal").addEventListener("click", () => {
  if (!$("#modal").classList.contains("age-gate")) closeModal();
});
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal") && !$("#modal").classList.contains("age-gate"))
    closeModal();
});
$("#cart-button").addEventListener("click", showCart);
$("#account-button").addEventListener("click", () =>
  user ? (location.hash = "compte") : showAuth(),
);
$("#menu-button").addEventListener("click", () => {
  $(".header nav").classList.toggle("open");
  $("#menu-button").setAttribute(
    "aria-expanded",
    $(".header nav").classList.contains("open"),
  );
});
document.addEventListener("click", async (e) => {
  const el = e.target.closest("button,a");
  if (!el) return;
  if (el.closest(".header nav")) $(".header nav").classList.remove("open");
  if (el.dataset.gallery && $("#gallery-image"))
    $("#gallery-image").src = el.dataset.gallery;
  if (el.dataset.product) showProduct(Number(el.dataset.product));
  if (el.dataset.add) await add(Number(el.dataset.add));
  if (el.dataset.filter) {
    filter = el.dataset.filter;
    $$("[data-filter]").forEach((b) => b.classList.toggle("active", b === el));
    renderProducts();
  }
  if (el.dataset.quantity)
    await changeQuantity(Number(el.dataset.quantity), Number(el.dataset.value));
  if (el.dataset.legal) legal(el.dataset.legal);
  if (el.id === "browse-products") {
    closeModal();
    location.hash = "produits";
  }
  if (el.id === "switch-auth")
    showAuth(authMode === "login" ? "register" : "login");
  if (el.id === "checkout-button") showCheckout();
  if (el.id === "logout") {
    try {
      await api("/logout", { method: "POST" });
      user = null;
      cart = [];
      persist();
      config = await api("/config");
      location.hash = "accueil";
      toast("Vous êtes déconnecté.");
    } catch (err) {
      toast(err.message);
    }
  }
  if (el.dataset.accountTab) {
    adminTab = el.dataset.accountTab;
    await renderAccount();
  }
  if (el.id === "new-product") editProduct();
  if (el.dataset.edit) editProduct(Number(el.dataset.edit));
  if (el.dataset.ship)
    showTracking(Number(el.dataset.ship), el.dataset.tracking);
  if (el.dataset.cancelOrder) {
    el.disabled = true;
    try {
      await api("/orders/" + el.dataset.cancelOrder + "/cancel", {
        method: "POST",
      });
      await renderAccount();
      products = await api("/products");
      renderProducts();
      toast("Paiement annulé, stock libéré.");
    } catch (err) {
      toast(err.message);
      el.disabled = false;
    }
  }
  if (el.dataset.capture) {
    el.disabled = true;
    try {
      await api("/paypal/capture", {
        method: "POST",
        body: { order_id: Number(el.dataset.capture) },
      });
      await renderAccount();
      toast("Paiement confirmé.");
    } catch (err) {
      toast(err.message);
      el.disabled = false;
    }
  }
  if (el.id === "age-yes") {
    localStorage.setItem("libres-adult", "yes");
    $("#modal").classList.remove("age-gate");
    closeModal();
  }
  if (el.id === "age-no") {
    $("#modal-content").innerHTML =
      '<div class="no-access"><h2 class="modal-title">À chaque âge ses découvertes.</h2><p>Cette boutique est réservée aux personnes majeures.</p><a class="text-link" href="https://www.alcool-info-service.fr/">Alcool Info Service ↗</a></div>';
  }
});
document.querySelectorAll("a,button,span").forEach((el) => {
  if (el.children.length === 0 && el.textContent.includes("↗"))
    el.innerHTML = el.innerHTML.replaceAll("↗", arrow);
  if (el.children.length === 0 && el.textContent.includes("✳"))
    el.innerHTML = el.innerHTML.replaceAll(
      "✳",
      '<span class="star-icon">✦</span>',
    );
});
window.addEventListener("hashchange", route);
$("#year").textContent = new Date().getFullYear();
try {
  config = await api("/config");
  [products, user] = await Promise.all([api("/products"), api("/me")]);
  if (user)
    cart = (await api("/cart")).map((p) => ({
      id: p.id,
      quantity: p.quantity,
    }));
  persist();
  renderProducts();
  await route();
  if (config.demo) {
    const el = document.createElement("div");
    el.className = "demo-label";
    el.textContent = "MODE DÉCOUVERTE · Boutique de démonstration";
    document.body.append(el);
  }
  const params = new URLSearchParams(location.search);
  if (params.has("paypal") && user) {
    try {
      await api("/paypal/capture", {
        method: "POST",
        body: { order_id: Number(params.get("paypal")) },
      });
      await renderAccount();
      toast("Merci ! Votre paiement PayPal est confirmé.");
    } catch (e) {
      toast(e.message);
    }
    history.replaceState(null, "", location.pathname + location.hash);
  } else if (params.get("payment") === "success") {
    toast("Merci ! La confirmation de paiement apparaîtra dans vos commandes.");
    history.replaceState(null, "", location.pathname + location.hash);
  } else if (params.get("payment") === "cancelled") {
    toast("Paiement interrompu. Retrouvez la commande dans votre compte.");
    history.replaceState(null, "", location.pathname + location.hash);
  }
  ageGate();
} catch (e) {
  $("#products-grid").innerHTML =
    '<p class="error">Impossible de charger la collection. Vérifiez votre connexion puis rechargez la page.</p>';
  toast(e.message);
}
