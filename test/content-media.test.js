import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import bcrypt from "bcryptjs";
import { defaultHome } from "../public/home-content.js";
process.env.NODE_ENV = "test";
process.env.MEDIA_STORAGE = "postgres";
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
const { app } = await import("../server.js");
const { pool, schema } = await import("../db.js");
let server, base, originalHome, adminUser, customerUser, imageId, productId;
const password = "Media-Test-Password-2026";
before(async () => {
  if (pool) {
    await pool.query(schema);
    originalHome = (
      await pool.query("SELECT * FROM site_content WHERE key='home'")
    ).rows[0];
    const hash = await bcrypt.hash(password, 10);
    for (const role of ["admin", "customer"]) {
      const row = (
        await pool.query(
          "INSERT INTO users(email,password_hash,name,role) VALUES($1,$2,$3,$4) RETURNING *",
          [
            role + "-media-" + Date.now() + "@example.com",
            hash,
            "Test " + role,
            role,
          ],
        )
      ).rows[0];
      if (role === "admin") adminUser = row;
      else customerUser = row;
    }
  }
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  await new Promise((r) => server.close(r));
  if (pool) {
    if (originalHome)
      await pool.query(
        "INSERT INTO site_content(key,content,revision,updated_at) VALUES('home',$1,$2,$3) ON CONFLICT(key) DO UPDATE SET content=$1,revision=$2,updated_at=$3",
        [
          JSON.stringify(originalHome.content),
          originalHome.revision,
          originalHome.updated_at,
        ],
      );
    else await pool.query("DELETE FROM site_content WHERE key='home'");
    if (productId)
      await pool.query("DELETE FROM products WHERE id=$1", [productId]);
    if (imageId) await pool.query("DELETE FROM media WHERE id=$1", [imageId]);
    await pool.query(
      "DELETE FROM session WHERE (sess::jsonb->'user'->>'id')::integer IN ($1,$2)",
      [adminUser?.id, customerUser?.id],
    );
    await pool.query("DELETE FROM users WHERE id IN ($1,$2)", [
      adminUser?.id,
      customerUser?.id,
    ]);
    await pool.end();
  }
});
async function client(user) {
  let cookie, csrf;
  async function call(path, method = "GET", body, token = csrf) {
    const multipart = body instanceof FormData;
    const r = await fetch(base + "/api" + path, {
      method,
      headers: {
        ...(multipart ? {} : { "Content-Type": "application/json" }),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(token ? { "X-CSRF-Token": token } : {}),
      },
      body: multipart ? body : body ? JSON.stringify(body) : undefined,
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    const data = await r.json();
    if (data.csrf) csrf = data.csrf;
    return { status: r.status, body: data };
  }
  await call("/config");
  if (user) {
    const r = await call("/login", "POST", { email: user.email, password });
    assert.equal(r.status, 200);
  }
  return call;
}
const file = (buffer, type = "image/png", name = "photo.png") => {
  const form = new FormData();
  form.append("image", new Blob([buffer], { type }), name);
  return form;
};
test("le contenu public de l’accueil est disponible sans autorisation", async () => {
  const call = await client();
  const r = await call("/home");
  assert.equal(r.status, 200);
  assert.equal(typeof r.body.content.hero.title, "string");
  assert.ok(Number.isInteger(r.body.revision));
  assert.equal((await call("/admin/home")).status, pool ? 401 : 503);
});
test(
  "PostgreSQL : upload protégé, optimisation et lecture persistante des images",
  { skip: !pool },
  async () => {
    const anonymous = await client(),
      customer = await client(customerUser),
      admin = await client(adminUser);
    const png = await sharp({
      create: { width: 3200, height: 1000, channels: 3, background: "#ff643d" },
    })
      .png()
      .toBuffer();
    assert.equal(
      (await anonymous("/admin/media", "POST", file(png))).status,
      401,
    );
    assert.equal(
      (await customer("/admin/media", "POST", file(png))).status,
      403,
    );
    assert.equal(
      (await admin("/admin/media", "POST", file(png), "incorrect")).status,
      403,
    );
    const r = await admin("/admin/media", "POST", file(png));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    imageId = r.body.id;
    assert.equal(r.body.width, 2400);
    assert.equal(r.body.height, 750);
    const image = await fetch(base + r.body.url);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/webp");
    const meta = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.width, 2400);
    assert.equal(meta.exif, undefined);
    assert.match(image.headers.get("cache-control"), /immutable/);
    assert.equal(
      (
        await fetch(base + r.body.url, {
          cache: "no-cache",
          headers: { "If-None-Match": image.headers.get("etag") },
        })
      ).status,
      304,
    );
    const stored = await pool.query(
      "SELECT size,octet_length(data) AS length FROM media WHERE id=$1",
      [imageId],
    );
    assert.equal(stored.rows[0].size, stored.rows[0].length);
    const duplicate = await admin("/admin/media", "POST", file(png));
    assert.equal(duplicate.body.id, imageId);
    const list = await admin("/admin/media");
    assert.ok(list.body.items.some((m) => m.id === imageId));
    assert.ok(!JSON.stringify(list.body).includes("sha256"));
  },
);
test(
  "les faux fichiers image, SVG et images trop volumineuses sont refusés",
  { skip: !pool },
  async () => {
    const admin = await client(adminUser);
    assert.equal(
      (
        await admin(
          "/admin/media",
          "POST",
          file(Buffer.from('<svg onload="alert(1)"></svg>')),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await admin(
          "/admin/media",
          "POST",
          file(Buffer.from("<svg/>"), "image/svg+xml", "logo.svg"),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await admin(
          "/admin/media",
          "POST",
          file(Buffer.alloc(8 * 1024 * 1024 + 1)),
        )
      ).status,
      413,
    );
  },
);
test(
  "l’accueil est publié, les conflits sont détectés et les images utilisées sont protégées",
  { skip: !pool },
  async () => {
    const admin = await client(adminUser),
      customer = await client(customerUser);
    const row = (await admin("/admin/home")).body;
    const content = structuredClone(defaultHome);
    content.hero.name = "La nouvelle distillerie";
    content.hero.note = "Texte publié $& <script>alert(1)</script>";
    content.hero.image = "/media/" + imageId;
    content.branding.logo = "/media/" + imageId;
    content.craft.enabled = false;
    assert.equal(
      (
        await customer("/admin/home", "PUT", {
          revision: row.revision,
          content,
        })
      ).status,
      403,
    );
    const invalid = structuredClone(content);
    invalid.hero.image = "javascript:alert(1)";
    assert.equal(
      (
        await admin("/admin/home", "PUT", {
          revision: row.revision,
          content: invalid,
        })
      ).status,
      400,
    );
    const saved = await admin("/admin/home", "PUT", {
      revision: row.revision,
      content,
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.revision, row.revision + 1);
    const published = (await admin("/home")).body;
    assert.equal(published.content.hero.name, "La nouvelle distillerie");
    assert.equal(published.content.craft.enabled, false);
    const html = await (await fetch(base)).text();
    assert.match(html, /La nouvelle distillerie/);
    assert.match(html, /<nav\b[^>]*aria-label="Navigation principale"[^>]*>/);
    assert.match(html, /class="header-brand-image"/);
    assert.ok(
      html.includes(
        "Texte publié $&amp; &lt;script&gt;alert(1)&lt;/script&gt;",
      ),
    );
    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.equal(
      (await admin("/admin/home", "PUT", { revision: row.revision, content }))
        .status,
      409,
    );
    assert.equal(
      (await admin("/admin/media/" + imageId, "DELETE")).status,
      409,
    );
    const product = {
      slug: "media-test-" + Date.now(),
      name: "Produit upload",
      category: "GIN",
      price_cents: 4200,
      volume: "70 cl",
      abv: "42 %",
      stock: 1,
      color: "#abcdef",
      image: "/media/" + imageId,
      images: ["/media/" + imageId],
      description: "Test",
      composition: "Test",
      cocktail: "Test",
      active: true,
    };
    assert.equal((await admin("/admin/products", "POST", product)).status, 200);
    productId = (
      await pool.query("SELECT id FROM products WHERE slug=$1", [product.slug])
    ).rows[0].id;
    assert.equal(
      (
        await admin("/admin/home", "PUT", {
          revision: saved.body.revision,
          content: defaultHome,
        })
      ).status,
      200,
    );
    assert.equal(
      (await admin("/admin/media/" + imageId, "DELETE")).status,
      409,
    );
    const textureProduct = {
      ...product,
      id: productId,
      image: "/bottle.svg",
      images: [],
      texture_image: "/media/" + imageId,
    };
    assert.equal(
      (await admin("/admin/products", "POST", textureProduct)).status,
      200,
    );
    assert.equal(
      (await admin("/admin/media/" + imageId, "DELETE")).status,
      409,
    );
    assert.equal(
      (
        await admin("/admin/products", "POST", {
          ...textureProduct,
          texture_image: "javascript:alert(1)",
        })
      ).status,
      400,
    );
    const { texture_image, ...oldClientProduct } = textureProduct;
    assert.equal(
      (await admin("/admin/products", "POST", oldClientProduct)).status,
      200,
    );
    assert.equal(
      (
        await pool.query("SELECT texture_image FROM products WHERE id=$1", [
          productId,
        ])
      ).rows[0].texture_image,
      "/media/" + imageId,
    );
    await pool.query("DELETE FROM products WHERE id=$1", [productId]);
    productId = undefined;
    assert.equal(
      (await admin("/admin/media/" + imageId, "DELETE")).status,
      200,
    );
    assert.equal((await fetch(base + "/media/" + imageId)).status, 404);
  },
);
