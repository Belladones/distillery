import {
  defaultHome,
  homeSections,
  homeFields,
  getPath,
  setPath,
} from "./home-content.js";
import { escape, homeMarkup, cards, rightArrow } from "./storefront.js";
let fieldSequence = 0;
const accept = "image/jpeg,image/png,image/webp,image/avif";
const formatSize = (bytes) =>
  bytes >= 1048576
    ? (bytes / 1048576).toFixed(1) + " Mo"
    : Math.ceil(bytes / 1024) + " Ko";
export function imageField(name, label, value = "", required = true) {
  const id = "media-field-" + ++fieldSequence;
  return `<div class="media-field"><label>${escape(label)}<input id="${id}" name="${escape(name)}" value="${escape(value)}" data-media-input="${id}" ${required ? "required" : ""} maxlength="2048" placeholder="URL HTTPS ou image importée"></label><div class="media-preview-row"><img ${value ? `src="${escape(value)}"` : "hidden"} data-media-preview="${id}" alt="Aperçu de l’image"><label class="upload-button">Importer une image<input type="file" accept="${accept}" data-upload-target="${id}"></label></div><small>JPG, PNG, WebP ou AVIF · 8 Mo maximum. L’image sera optimisée.</small><p class="upload-status" data-upload-status="${id}" role="status"></p></div>`;
}
export function galleryField(images = []) {
  const id = "media-gallery-" + ++fieldSequence;
  return `<div class="media-field"><label>Galerie complémentaire (8 images maximum)<textarea id="${id}" name="images" data-media-gallery-input="${id}" placeholder="Une URL par ligne">${escape(images.join("\n"))}</textarea></label><label class="upload-button">Importer des photos dans la galerie<input type="file" multiple accept="${accept}" data-upload-gallery="${id}"></label><small>Jusqu’à 8 images · 8 Mo par image.</small><div class="media-gallery-preview" data-media-gallery="${id}">${galleryPreviews(images, id)}</div><p class="upload-status" data-upload-status="${id}" role="status"></p></div>`;
}
function galleryPreviews(urls, id) {
  return urls
    .map(
      (url, i) =>
        `<div><img src="${escape(url)}" alt="Vue ${i + 1}"><button type="button" class="secondary" data-gallery-remove="${i}" data-gallery-target="${id}" aria-label="Retirer la vue ${i + 1}">Retirer</button></div>`,
    )
    .join("");
}
const lines = (value) =>
  value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
function updatePreview(input) {
  if (input.dataset.mediaInput) {
    const preview = document.querySelector(
      `[data-media-preview="${input.id}"]`,
    );
    if (preview) {
      preview.hidden = !input.value.trim();
      if (!preview.hidden) preview.src = input.value.trim();
    }
  }
  if (input.dataset.mediaGalleryInput) {
    const gallery = document.querySelector(
      `[data-media-gallery="${input.id}"]`,
    );
    if (gallery)
      gallery.innerHTML = galleryPreviews(lines(input.value), input.id);
  }
}
export function attachMediaUploads({ api }) {
  document.addEventListener("input", (event) => updatePreview(event.target));
  document.addEventListener("click", (event) => {
    const b = event.target.closest("[data-gallery-remove]");
    if (!b) return;
    const input = document.getElementById(b.dataset.galleryTarget);
    const urls = lines(input.value);
    urls.splice(Number(b.dataset.galleryRemove), 1);
    input.value = urls.join("\n");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  document.addEventListener("change", async (event) => {
    const fileInput = event.target;
    const id =
      fileInput.dataset.uploadTarget || fileInput.dataset.uploadGallery;
    if (!id) return;
    const field = document.getElementById(id),
      status = document.querySelector(`[data-upload-status="${id}"]`),
      form = fileInput.closest("form");
    const files = [...fileInput.files];
    if (!files.length) return;
    const gallery = !!fileInput.dataset.uploadGallery;
    const urls = gallery ? lines(field.value) : [];
    status.classList.remove("error");
    if (gallery && urls.length + files.length > 8) {
      status.textContent =
        "La galerie est limitée à 8 images. Retirez une vue avant d’en ajouter.";
      status.classList.add("error");
      fileInput.value = "";
      return;
    }
    fileInput.disabled = true;
    if (form) {
      form.dataset.uploading = String(Number(form.dataset.uploading || 0) + 1);
      form
        .querySelectorAll("button[type=submit]")
        .forEach((b) => (b.disabled = true));
    }
    try {
      for (let i = 0; i < files.length; i++) {
        if (files[i].size > 8 * 1024 * 1024)
          throw new Error(`${files[i].name} dépasse 8 Mo.`);
        status.textContent = `Import de l’image ${i + 1}/${files.length}…`;
        const data = new FormData();
        data.append("image", files[i]);
        const media = await api("/admin/media", { method: "POST", body: data });
        if (!field.isConnected) return;
        if (gallery) {
          urls.push(media.url);
          field.value = urls.join("\n");
        } else field.value = media.url;
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
      status.textContent =
        "Image(s) importée(s). Enregistrez le formulaire pour les utiliser sur le site.";
    } catch (error) {
      status.textContent = error.message;
      status.classList.add("error");
    } finally {
      fileInput.disabled = false;
      fileInput.value = "";
      if (form) {
        form.dataset.uploading = String(
          Math.max(0, Number(form.dataset.uploading) - 1),
        );
        if (!Number(form.dataset.uploading))
          form
            .querySelectorAll("button[type=submit]")
            .forEach((b) => (b.disabled = false));
      }
    }
  });
}
function renderHomeField(field, content) {
  const value = getPath(content, field.path);
  if (field.type === "image")
    return imageField(field.path, field.label, value, field.required !== false);
  if (field.type === "checkbox")
    return `<label class="check"><input type="checkbox" name="${field.path}" ${value ? "checked" : ""}>${escape(field.label)}</label>`;
  return `<label>${escape(field.label)}${field.type === "textarea" ? `<textarea name="${field.path}" maxlength="${field.max}" required>${escape(value)}</textarea>` : `<input type="${field.type}" name="${field.path}" value="${escape(value)}" maxlength="${field.max}" required>`}</label>`;
}
function readHomeForm(form) {
  const content = structuredClone(defaultHome),
    data = new FormData(form);
  for (const f of homeFields)
    setPath(
      content,
      f.path,
      f.type === "checkbox" ? data.has(f.path) : String(data.get(f.path) || ""),
    );
  return content;
}
export async function renderHomeEditor(
  container,
  { api, toast, onPublished, getProducts },
) {
  const row = await api("/admin/home");
  if (!container.isConnected) return;
  let revision = row.revision;
  container.innerHTML = `<form id="home-form" class="form home-editor"><div class="editor-toolbar"><div><h2>Page d’accueil</h2><p>Modifiez vos textes et images, prévisualisez, puis publiez vos changements.</p></div><div class="editor-actions"><button type="button" class="secondary" id="preview-home">Prévisualiser</button><button type="submit" class="primary">Enregistrer et publier ${rightArrow}</button></div></div><p class="editor-message" role="status">${row.updated_at ? "Dernière publication : " + new Date(row.updated_at).toLocaleString("fr-FR") : "Contenu initial"}</p>${homeSections.map((section, i) => `<details class="editor-section" ${i === 0 ? "open" : ""}><summary>${escape(section.title)}</summary><div class="form editor-fields">${section.fields.map((f) => renderHomeField(f, row.content)).join("")}</div></details>`).join("")}</form>`;
  const form = container.querySelector("form"),
    message = container.querySelector(".editor-message");
  form.addEventListener("input", () => {
    form.dataset.dirty = "true";
    message.textContent = "Modifications non publiées.";
    message.classList.remove("error");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (Number(form.dataset.uploading)) return;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    message.classList.remove("error");
    try {
      const result = await api("/admin/home", {
        method: "PUT",
        body: { content: readHomeForm(form), revision },
      });
      revision = result.revision;
      form.dataset.dirty = "false";
      onPublished(result.content);
      message.textContent =
        "Accueil publié le " +
        new Date(result.updated_at).toLocaleString("fr-FR") +
        ".";
      toast("La page d’accueil est publiée.");
    } catch (error) {
      message.textContent = error.message;
      message.classList.add("error");
      message.scrollIntoView({ block: "center", behavior: "smooth" });
    } finally {
      button.disabled = false;
    }
  });
  form.querySelector("#preview-home").addEventListener("click", () => {
    document.getElementById("home-preview")?.remove();
    const preview = document.createElement("dialog");
    preview.id = "home-preview";
    preview.className = "home-preview";
    preview.innerHTML = `<div class="preview-toolbar"><span>Aperçu — vos modifications ne sont pas encore publiées.</span><button type="button" class="secondary" data-preview-close>Fermer l’aperçu ×</button></div><div class="storefront">${homeMarkup(readHomeForm(form))}</div>`;
    const grid = preview.querySelector("#products-grid");
    if (grid) grid.innerHTML = cards(getProducts(), true);
    preview
      .querySelectorAll(".storefront [id]")
      .forEach((el) => el.removeAttribute("id"));
    preview.addEventListener("click", (event) => {
      event.stopPropagation();
      if (
        event.target.closest("[data-preview-close]") ||
        event.target === preview
      )
        preview.close();
      if (event.target.closest("a")) event.preventDefault();
    });
    preview.addEventListener("close", () => preview.remove());
    document.body.append(preview);
    preview.showModal();
  });
}
export async function renderMediaLibrary(container, { api, toast }) {
  container.innerHTML = `<div class="editor-toolbar"><div><h2>Médiathèque</h2><p>Retrouvez les images de vos produits et de votre page d’accueil.</p></div><label class="upload-button">Importer des images<input type="file" accept="${accept}" multiple id="library-upload"></label></div><p id="media-storage-status" class="notice" role="status"></p><p id="library-status" role="status"></p><div class="media-library-grid"></div><button type="button" class="secondary" id="load-more-media" hidden>Afficher plus d’images</button>`;
  let offset = 0;
  const status = container.querySelector("#library-status"),
    grid = container.querySelector(".media-library-grid"),
    more = container.querySelector("#load-more-media");
  async function load(reset = false) {
    if (reset) {
      offset = 0;
      grid.innerHTML = "";
    }
    const result = await api("/admin/media?offset=" + offset);
    const storage = result.storage;
    if (storage) {
      container.querySelector("#media-storage-status").textContent =
        storage.provider === "cloudinary"
          ? storage.configured
            ? "Nouveaux imports : Cloudinary. Les images déjà importées restent disponibles."
            : "Cloudinary doit être configuré dans Render : CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET."
          : "Stockage PostgreSQL activé explicitement.";
      container.querySelector("#library-upload").disabled = !storage.configured;
    }
    grid.insertAdjacentHTML(
      "beforeend",
      result.items
        .map(
          (m) =>
            `<article class="media-card"><img src="${m.url}" alt="${escape(m.filename)}" loading="lazy"><h3>${escape(m.filename)}</h3><p>${m.width} × ${m.height} · ${formatSize(m.size)} · ${m.storage === "cloudinary" ? "Cloudinary" : "PostgreSQL"}</p><input value="${m.url}" readonly aria-label="Lien de l’image ${escape(m.filename)}"><div><button type="button" class="secondary" data-copy-media="${m.url}">Copier le lien</button><button type="button" class="secondary" data-delete-media="${m.id}">Supprimer</button></div></article>`,
        )
        .join(""),
    );
    offset = result.nextOffset;
    more.hidden = offset === null;
    if (!grid.children.length)
      grid.innerHTML =
        '<p class="empty media-library-empty">Aucune image importée pour le moment.</p>';
  }
  more.addEventListener("click", async () => {
    more.disabled = true;
    try {
      await load();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      more.disabled = false;
    }
  });
  container
    .querySelector("#library-upload")
    .addEventListener("change", async (event) => {
      const input = event.currentTarget;
      input.disabled = true;
      status.classList.remove("error");
      try {
        const files = [...input.files];
        for (let i = 0; i < files.length; i++) {
          if (files[i].size > 8 * 1024 * 1024)
            throw new Error(files[i].name + " dépasse 8 Mo.");
          status.textContent = `Import ${i + 1}/${files.length}…`;
          const data = new FormData();
          data.append("image", files[i]);
          await api("/admin/media", { method: "POST", body: data });
        }
        status.textContent =
          "Images importées. Vous pouvez utiliser leurs liens dans vos produits ou sur l’accueil.";
        await load(true);
      } catch (error) {
        status.textContent = error.message;
        status.classList.add("error");
        await load(true).catch(() => {});
      } finally {
        input.value = "";
        input.disabled = false;
      }
    });
  container.addEventListener("click", async (event) => {
    const button = event.target.closest(
      "[data-copy-media],[data-delete-media]",
    );
    if (!button) return;
    button.disabled = true;
    try {
      if (button.dataset.copyMedia) {
        try {
          await navigator.clipboard.writeText(button.dataset.copyMedia);
          toast("Lien de l’image copié.");
        } catch {
          button.closest(".media-card").querySelector("input").select();
          toast("Sélectionnez et copiez le lien affiché.");
        }
      } else {
        await api("/admin/media/" + button.dataset.deleteMedia, {
          method: "DELETE",
        });
        await load(true);
        toast("Image supprimée.");
      }
    } catch (error) {
      status.textContent = error.message;
      status.classList.add("error");
    } finally {
      button.disabled = false;
    }
  });
  await load();
}
