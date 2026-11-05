// Shared schema and defaults: the public homepage and its editor use the same fields.
export const defaultHome = {
  branding: { logo: "", logoAlt: "Antoine Bravar Distillery" },
  seo: {
    title: "Antoine Bravar Distillery — L’indépendance distillée",
    description:
      "Antoine Bravar Distillery, distillerie indépendante. Whiskys, gins et rhums de caractère, élaborés en petits lots.",
  },
  hero: {
    name: "Antoine",
    title: "L’indépendance\ndistillée",
    note: "L’aventure d’une famille réunie autour d’une même passion.",
    firstLead: "Notre",
    firstAccent: "passion",
    secondLead: "Votre",
    secondAccent: "perfection",
    image: "/assets/hero-banner.png",
    imageAlt: "Alambics de la distillerie",
    buttonLabel: "Voir nos produits",
  },
  about: {
    enabled: true,
    kicker: "(À propos de nous)",
    text: "Indépendants, affranchis des traditions et à mille lieues des autres whiskies américains, nous sommes là pour repousser les limites de notre savoir faire.",
  },
  craft: {
    enabled: true,
    title: "Notre",
    accent: "Savoir Faire",
    images: [
      { url: "/assets/bento1.png", alt: "Verre de spiritueux cuivré" },
      { url: "/assets/bento4.png", alt: "Bouteilles de distillat artisanal" },
      { url: "/assets/bento3.png", alt: "Fûts de bois dans une cave" },
      { url: "/assets/bento2.png", alt: "Cuve et cuivre en distillerie" },
      { url: "/assets/bento5.png", alt: "Grains de malt" },
      { url: "/assets/bento6.png", alt: "Alambics en cuivre" },
    ],
  },
  testimonials: {
    enabled: true,
    kicker: "(Témoignages)",
    items: [
      {
        quote:
          "Quand je travaille un cocktail avec ces spiritueux, je sais que je pars d’un produit vivant, précis et artisanal : il suffit de l’accompagner, pas de le masquer.",
        author: "Quentin Giraud",
        role: "Le Broc, sommelier",
        image: "/assets/temoignage1.png",
        imageAlt: "Les spiritueux en dégustation",
      },
      {
        quote:
          "On retrouve une vraie signature aromatique : céréale, fraîcheur, tension et une finale nette. C’est exactement le genre de bouteille qui donne du caractère à une carte.",
        author: "Camille Morel",
        role: "Cave indépendante, Lyon",
        image: "/assets/temoignage2.png",
        imageAlt: "Le plaisir de la dégustation",
      },
      {
        quote:
          "Ces spiritueux ont suffisamment de personnalité pour être dégustés seuls, mais assez d’équilibre pour devenir la colonne vertébrale d’un cocktail simple et élégant.",
        author: "Nora Benali",
        role: "Mixologue, Paris",
        image: "/assets/temoignage3.png",
        imageAlt: "Les spiritueux en cocktail",
      },
    ],
  },
  collection: {
    enabled: true,
    brand: "ANTOINE\nBRAVAR\nDISTILLERY",
    title: "Nos Produits",
    linkLabel: "Voir toute la collection",
  },
  marquee: {
    enabled: true,
    text: "✦ Whisky disponible prochainement · Whisky disponible prochainement · Whisky disponible prochainement",
  },
  footer: {
    claim:
      "Micro-distillerie indépendante en circuit court,\ndédiée aux spiritueux en éditions limitées.",
    email: "antoinedistillery@gmail.com",
    caption: "Restez au cœur de la distillerie",
    buttonLabel: "Écrivez-nous",
  },
};
const field = (path, label, type = "text", max = 300) => ({
  path,
  label,
  type,
  max,
});
export const homeSections = [
  {
    title: "Logo de la distillerie",
    fields: [
      {
        ...field(
          "branding.logo",
          "Logo (facultatif, vide pour garder le logo texte)",
          "image",
          2048,
        ),
        required: false,
      },
      field("branding.logoAlt", "Description du logo"),
    ],
  },
  {
    title: "Bannière principale",
    fields: [
      field("hero.name", "Nom au-dessus du titre"),
      field("hero.title", "Titre d’introduction", "textarea"),
      field("hero.note", "Phrase de présentation", "textarea", 1000),
      field("hero.firstLead", "Première ligne — texte"),
      field("hero.firstAccent", "Première ligne — texte en italique"),
      field("hero.secondLead", "Deuxième ligne — texte"),
      field("hero.secondAccent", "Deuxième ligne — texte en italique"),
      field("hero.buttonLabel", "Libellé accessible du bouton"),
      field("hero.image", "Image de la bannière", "image", 2048),
      field("hero.imageAlt", "Description de l’image"),
    ],
  },
  {
    title: "À propos",
    fields: [
      field("about.enabled", "Afficher cette section", "checkbox"),
      field("about.kicker", "Surtitre"),
      field("about.text", "Texte de présentation", "textarea", 4000),
    ],
  },
  {
    title: "Savoir-faire",
    fields: [
      field("craft.enabled", "Afficher cette section", "checkbox"),
      field("craft.title", "Titre"),
      field("craft.accent", "Titre en italique"),
      ...defaultHome.craft.images.flatMap((_, i) => [
        field(`craft.images.${i}.url`, `Photo ${i + 1}`, "image", 2048),
        field(`craft.images.${i}.alt`, `Description de la photo ${i + 1}`),
      ]),
    ],
  },
  {
    title: "Témoignages",
    fields: [
      field("testimonials.enabled", "Afficher les témoignages", "checkbox"),
      field("testimonials.kicker", "Surtitre"),
      ...defaultHome.testimonials.items.flatMap((_, i) => [
        field(
          `testimonials.items.${i}.quote`,
          `Témoignage ${i + 1} — texte`,
          "textarea",
          2000,
        ),
        field(`testimonials.items.${i}.author`, `Témoignage ${i + 1} — nom`),
        field(`testimonials.items.${i}.role`, `Témoignage ${i + 1} — fonction`),
        field(
          `testimonials.items.${i}.image`,
          `Témoignage ${i + 1} — photo`,
          "image",
          2048,
        ),
        field(
          `testimonials.items.${i}.imageAlt`,
          `Témoignage ${i + 1} — description de la photo`,
        ),
      ]),
    ],
  },
  {
    title: "Collection et bandeau défilant",
    fields: [
      field("collection.enabled", "Afficher la collection", "checkbox"),
      field(
        "collection.brand",
        "Signature de la marque (une ligne par mot)",
        "textarea",
      ),
      field("collection.title", "Titre de la collection"),
      field("collection.linkLabel", "Libellé du lien vers les produits"),
      field("marquee.enabled", "Afficher le bandeau défilant", "checkbox"),
      field("marquee.text", "Texte du bandeau", "textarea", 1500),
    ],
  },
  {
    title: "Pied de page partagé sur le site",
    fields: [
      field("footer.claim", "Présentation de la distillerie", "textarea", 1000),
      field("footer.email", "Adresse de contact", "email", 254),
      field("footer.caption", "Texte sous l’email"),
      field("footer.buttonLabel", "Libellé du bouton de contact"),
    ],
  },
  {
    title: "Référencement de l’accueil",
    fields: [
      field("seo.title", "Titre de la page", "text", 150),
      field(
        "seo.description",
        "Description pour les moteurs de recherche",
        "textarea",
        400,
      ),
    ],
  },
];
export const homeFields = homeSections.flatMap((s) => s.fields);
export function getPath(value, path) {
  return path.split(".").reduce((obj, key) => obj?.[key], value);
}
export function setPath(value, path, next) {
  const keys = path.split(".");
  const key = keys.pop();
  const target = keys.reduce((obj, k) => obj[k], value);
  target[key] = next;
}
export function imageUrlValid(value) {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    /[\s<>"'\\]/.test(value)
  )
    return false;
  if (/^\/(?!\/)/.test(value)) return true;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}
export function validateHome(input) {
  const result = structuredClone(defaultHome);
  for (const f of homeFields) {
    const value =
      getPath(input, f.path) ?? (f.required === false ? "" : undefined);
    if (f.required === false && value === "") {
      setPath(result, f.path, "");
      continue;
    }
    if (f.type === "checkbox") {
      if (typeof value !== "boolean")
        throw new Error(`${f.label} : valeur invalide.`);
    } else {
      if (typeof value !== "string" || !value.trim() || value.length > f.max)
        throw new Error(
          `${f.label} : texte requis, ${f.max} caractères maximum.`,
        );
      if (f.type === "image" && !imageUrlValid(value))
        throw new Error(`${f.label} : image locale ou URL HTTPS requise.`);
      if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        throw new Error("Adresse email de contact invalide.");
    }
    setPath(result, f.path, typeof value === "string" ? value.trim() : value);
  }
  return result;
}

export function completeHome(input) {
  const result = structuredClone(defaultHome);
  for (const field of homeFields) {
    const value = getPath(input, field.path);
    if (value !== undefined) setPath(result, field.path, value);
  }
  return result;
}
