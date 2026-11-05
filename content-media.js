import multer from "multer";
import sharp from "sharp";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { homeMarkup, footerMarkup, escape } from "./public/storefront.js";
import rateLimit from "express-rate-limit";
import {
  defaultHome,
  validateHome,
  completeHome,
} from "./public/home-content.js";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const publicMedia = (row) => ({
  id: row.id,
  url: "/media/" + row.id,
  filename: row.filename,
  width: row.width,
  height: row.height,
  size: row.size,
  created_at: row.created_at,
});
export function registerContentRoutes(app, { pool, db, auth, admin, fail }) {
  async function home() {
    if (!pool) return { content: defaultHome, revision: 0 };
    const {
      rows: [row],
    } = await pool.query(
      "SELECT content,revision,updated_at FROM site_content WHERE key='home'",
    );
    return row
      ? { ...row, content: completeHome(row.content) }
      : { content: defaultHome, revision: 0 };
  }
  const template = readFileSync(
    new URL("./public/index.html", import.meta.url),
    "utf8",
  );
  app.get("/", async (req, res) => {
    const { content } = await home();
    const html = template
      .replace(
        /(<main id="home" class="storefront">)[\s\S]*?(<\/main>)/,
        (_, start, end) => start + homeMarkup(content) + end,
      )
      .replace(
        /(<div id="storefront-footer" class="storefront">)[\s\S]*?<\/footer>\s*<\/div>/,
        (_, start) => start + footerMarkup(content) + "</div>",
      )
      .replace(
        /<title>[\s\S]*?<\/title>/,
        () => "<title>" + escape(content.seo.title) + "</title>",
      )
      .replace(
        /(<meta\s+name="description"\s+content=")[^"]*("\s*\/>)/,
        (_, start, end) => start + escape(content.seo.description) + end,
      );
    const result = content.branding?.logo
      ? html.replace(
          /(<a\b[^>]*class="logo"[^>]*>)[\s\S]*?(<\/a\s*>)/,
          (_, start, end) =>
            start +
            `<img class="header-brand-image" src="${escape(content.branding.logo)}" alt="${escape(content.branding.logoAlt)}">` +
            end,
        )
      : html;
    res.set("Cache-Control", "no-store").type("html").send(result);
  });
  app.get("/api/home", async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await home());
  });
  app.get("/api/admin/home", db, auth, admin, async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await home());
  });
  app.put("/api/admin/home", db, auth, admin, async (req, res) => {
    let content;
    try {
      content = validateHome(req.body.content);
    } catch (e) {
      throw fail(e.message);
    }
    const revision = req.body.revision;
    if (!Number.isInteger(revision) || revision < 0)
      throw fail("Version de la page invalide.");
    const result =
      revision === 0
        ? await pool.query(
            "INSERT INTO site_content(key,content) VALUES('home',$1) ON CONFLICT DO NOTHING RETURNING content,revision,updated_at",
            [JSON.stringify(content)],
          )
        : await pool.query(
            "UPDATE site_content SET content=$1,revision=revision+1,updated_at=now() WHERE key='home' AND revision=$2 RETURNING content,revision,updated_at",
            [JSON.stringify(content), revision],
          );
    if (!result.rowCount)
      throw fail(
        "La page a été modifiée depuis son ouverture. Rechargez l’éditeur avant de recommencer ; votre formulaire reste affiché.",
        409,
      );
    res.json(result.rows[0]);
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
    fileFilter: (req, file, cb) =>
      cb(
        ["image/jpeg", "image/png", "image/webp", "image/avif"].includes(
          file.mimetype,
        )
          ? null
          : fail("Formats acceptés : JPG, PNG, WebP et AVIF."),
        true,
      ),
  }).single("image");
  const uploadLimit = rateLimit({
    windowMs: 60000,
    limit: 25,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({
        error:
          "Trop d’images envoyées. Patientez une minute avant de recommencer.",
      }),
  });
  app.post(
    "/api/admin/media",
    db,
    auth,
    admin,
    uploadLimit,
    (req, res, next) =>
      upload(req, res, (error) => {
        if (error)
          return next(
            fail(
              error.code === "LIMIT_FILE_SIZE"
                ? "L’image dépasse 8 Mo."
                : error.status
                  ? error.message
                  : "Envoyez une seule image de 8 Mo maximum.",
              error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
            ),
          );
        next();
      }),
    async (req, res) => {
      if (!req.file) throw fail("Choisissez une image à envoyer.");
      let output;
      try {
        const pipeline = sharp(req.file.buffer, {
          limitInputPixels: 36_000_000,
          failOn: "error",
        });
        const metadata = await pipeline.metadata();
        if (
          !["jpeg", "png", "webp", "heif"].includes(metadata.format) ||
          metadata.pages > 1
        )
          throw new Error("Unsupported image");
        output = await pipeline
          .rotate()
          .resize({
            width: 2400,
            height: 2400,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 85, effort: 4 })
          .toBuffer({ resolveWithObject: true });
      } catch {
        throw fail(
          "Image illisible ou non prise en charge. Utilisez une image fixe JPG, PNG, WebP ou AVIF de 36 mégapixels maximum.",
        );
      }
      const hash = crypto
        .createHash("sha256")
        .update(output.data)
        .digest("hex");
      const filename =
        String(req.file.originalname)
          .split(/[\\/]/)
          .pop()
          .replace(/[\x00-\x1f]/g, "")
          .slice(0, 180) || "Image";
      const {
        rows: [row],
      } = await pool.query(
        `INSERT INTO media(id,filename,mime_type,width,height,size,sha256,data) VALUES($1,$2,'image/webp',$3,$4,$5,$6,$7) ON CONFLICT(sha256) DO UPDATE SET sha256=EXCLUDED.sha256 RETURNING id,filename,width,height,size,created_at`,
        [
          crypto.randomUUID(),
          filename,
          output.info.width,
          output.info.height,
          output.data.length,
          hash,
          output.data,
        ],
      );
      res.status(201).json(publicMedia(row));
    },
  );
  app.get("/api/admin/media", db, auth, admin, async (req, res) => {
    const offset = Number(req.query.offset || 0);
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw fail("Page invalide.");
    const { rows } = await pool.query(
      "SELECT id,filename,width,height,size,created_at FROM media ORDER BY created_at DESC,id LIMIT 31 OFFSET $1",
      [offset],
    );
    res.set("Cache-Control", "no-store");
    res.json({
      items: rows.slice(0, 30).map(publicMedia),
      nextOffset: rows.length > 30 ? offset + 30 : null,
    });
  });
  app.delete("/api/admin/media/:id", db, auth, admin, async (req, res) => {
    if (!uuid.test(req.params.id)) throw fail("Image inconnue.", 404);
    const url = "/media/" + req.params.id;
    const {
      rows: [usage],
    } = await pool.query(
      "SELECT EXISTS(SELECT 1 FROM products WHERE position($1 IN image)>0 OR position($1 IN images::text)>0) OR EXISTS(SELECT 1 FROM site_content WHERE position($1 IN content::text)>0) AS used",
      [url],
    );
    if (usage.used)
      throw fail(
        "Cette image est utilisée sur le site ou dans un produit. Remplacez-la avant de la supprimer.",
        409,
      );
    const { rowCount } = await pool.query("DELETE FROM media WHERE id=$1", [
      req.params.id,
    ]);
    if (!rowCount) throw fail("Image inconnue.", 404);
    res.json({ ok: true });
  });
  app.get("/media/:id", async (req, res) => {
    if (!pool || !uuid.test(req.params.id)) return res.sendStatus(404);
    const {
      rows: [row],
    } = await pool.query(
      "SELECT data,mime_type,sha256 FROM media WHERE id=$1",
      [req.params.id],
    );
    if (!row) return res.sendStatus(404);
    res.set({
      "Content-Type": row.mime_type,
      "Content-Disposition": `inline; filename="${req.params.id}.webp"`,
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: '"' + row.sha256 + '"',
      "X-Content-Type-Options": "nosniff",
    });
    if (req.fresh) return res.status(304).end();
    res.send(row.data);
  });
}
