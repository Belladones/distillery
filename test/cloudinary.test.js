import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { v2 as cloudinary } from "cloudinary";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { createMediaStorage, isCloudinaryUrl } from "../cloudinary-storage.js";
process.env.NODE_ENV = "test";
process.env.MEDIA_STORAGE = "cloudinary";
process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
process.env.CLOUDINARY_API_KEY = "test-public-key";
process.env.CLOUDINARY_API_SECRET = "test-private-secret";
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
const uploads = [],
  deletions = [];
let failUpload = false,
  failDelete = false;
// Stub only the official SDK transport. No real credentials or network requests.
cloudinary.uploader.upload_stream = (options, callback) => {
  const stream = new PassThrough(),
    buffers = [];
  stream.on("data", (part) => buffers.push(part));
  stream.once("finish", () => {
    uploads.push({ options, buffer: Buffer.concat(buffers) });
    if (failUpload) callback(new Error("Provider error test-private-secret"));
    else
      callback(null, {
        public_id: options.public_id,
        resource_type: "image",
        secure_url: `https://res.cloudinary.com/${options.cloud_name}/image/upload/v123/${options.public_id}.webp`,
      });
  });
  return stream;
};
cloudinary.uploader.destroy = async (publicId, options) => {
  deletions.push({ publicId, options });
  if (failDelete) throw new Error("Provider error test-private-secret");
  return { result: "ok" };
};
const { app } = await import("../server.js");
const { pool, schema } = await import("../db.js");
let server, base, uid, productId, cookie, csrf;
const imageIds = new Set();
before(async () => {
  if (pool) {
    await pool.query(schema);
    uid = (
      await pool.query(
        "INSERT INTO users(email,password_hash,name,role) VALUES($1,$2,'Cloudinary test','admin') RETURNING id",
        [
          "cloudinary-" + Date.now() + "@example.com",
          await bcrypt.hash("Cloudinary-Test-Password-2026", 10),
        ],
      )
    ).rows[0].id;
  }
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  await new Promise((r) => server.close(r));
  if (pool) {
    if (productId)
      await pool.query("DELETE FROM products WHERE id=$1", [productId]);
    for (const id of imageIds)
      await pool.query("DELETE FROM media WHERE id=$1", [id]);
    await pool.query(
      "DELETE FROM session WHERE (sess::jsonb->'user'->>'id')::integer=$1",
      [uid],
    );
    await pool.query("DELETE FROM users WHERE id=$1", [uid]);
    await pool.end();
  }
});
async function call(path, method = "GET", body) {
  const multipart = body instanceof FormData;
  const response = await fetch(base + "/api" + path, {
    method,
    headers: {
      ...(multipart ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    body: multipart ? body : body ? JSON.stringify(body) : undefined,
  });
  if (response.headers.get("set-cookie"))
    cookie = response.headers.get("set-cookie").split(";")[0];
  const data = await response.json();
  if (data.csrf) csrf = data.csrf;
  return { status: response.status, body: data };
}
function file(buffer, name = "cloudinary-test.png") {
  const data = new FormData();
  data.append("image", new Blob([buffer], { type: "image/png" }), name);
  return data;
}
test("la configuration Cloudinary est privée et les URL de redirection sont bornées au compte", async () => {
  const storage = createMediaStorage({ env: {} });
  assert.deepEqual(storage.info(), {
    provider: "cloudinary",
    configured: false,
  });
  await assert.rejects(
    () => storage.upload(Buffer.from("x"), "x"),
    (error) => error.status === 503,
  );
  assert.equal(
    isCloudinaryUrl(
      "https://res.cloudinary.com/test-cloud/image/upload/v1/photo.webp",
      "test-cloud",
    ),
    true,
  );
  assert.equal(
    isCloudinaryUrl(
      "https://evil.example/test-cloud/image/upload/photo.webp",
      "test-cloud",
    ),
    false,
  );
  assert.equal(
    isCloudinaryUrl(
      "https://res.cloudinary.com/other-cloud/image/upload/photo.webp",
      "test-cloud",
    ),
    false,
  );
  assert.ok(
    !JSON.stringify((await call("/config")).body).includes(
      "test-private-secret",
    ),
  );
});
test(
  "PostgreSQL + Cloudinary simulé : promotion sans changer le lien, pas de binaire en base, erreurs et suppression",
  { skip: !pool },
  async () => {
    await call("/config");
    const user = (
      await pool.query("SELECT email FROM users WHERE id=$1", [uid])
    ).rows[0];
    assert.equal(
      (
        await call("/login", "POST", {
          email: user.email,
          password: "Cloudinary-Test-Password-2026",
        })
      ).status,
      200,
    );
    const png = await sharp({
      create: { width: 120, height: 80, channels: 3, background: "#2543a8" },
    })
      .png()
      .toBuffer();
    // Existing PostgreSQL images remain readable even with no Cloudinary credential.
    process.env.MEDIA_STORAGE = "postgres";
    const legacy = await call("/admin/media", "POST", file(png));
    assert.equal(legacy.status, 201);
    imageIds.add(legacy.body.id);
    process.env.MEDIA_STORAGE = "cloudinary";
    delete process.env.CLOUDINARY_API_SECRET;
    assert.equal((await fetch(base + legacy.body.url)).status, 200);
    const missing = await call("/admin/media", "POST", file(png));
    assert.equal(missing.status, 503);
    assert.equal(uploads.length, 0);
    assert.equal((await call("/admin/media")).body.storage.configured, false);
    process.env.CLOUDINARY_API_SECRET = "test-private-secret";
    const promoted = await call("/admin/media", "POST", file(png));
    assert.equal(promoted.status, 201, JSON.stringify(promoted.body));
    assert.equal(promoted.body.id, legacy.body.id);
    assert.equal(promoted.body.url, legacy.body.url);
    assert.equal(promoted.body.storage, "cloudinary");
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].options.api_secret, "test-private-secret");
    assert.equal(uploads[0].options.overwrite, false);
    assert.equal((await sharp(uploads[0].buffer).metadata()).format, "webp");
    let row = (
      await pool.query("SELECT * FROM media WHERE id=$1", [legacy.body.id])
    ).rows[0];
    assert.equal(row.data, null);
    assert.equal(row.storage, "cloudinary");
    assert.ok(row.cloudinary_public_id.startsWith("distillery/"));
    const redirect = await fetch(base + legacy.body.url, {
      redirect: "manual",
    });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get("location"), row.cloudinary_url);
    assert.ok(!JSON.stringify(promoted.body).includes("test-private-secret"));
    const duplicate = await call("/admin/media", "POST", file(png));
    assert.equal(duplicate.body.id, legacy.body.id);
    assert.equal(uploads.length, 1);
    const otherPng = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#98234a" },
    })
      .png()
      .toBuffer();
    failUpload = true;
    const denied = await call(
      "/admin/media",
      "POST",
      file(otherPng, "cloudinary-failed.png"),
    );
    failUpload = false;
    assert.equal(denied.status, 502);
    assert.ok(!JSON.stringify(denied.body).includes("test-private-secret"));
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM media WHERE filename='cloudinary-failed.png'",
        )
      ).rows[0].count,
      0,
    );
    // Referencing the public CDN URL directly also prevents deletion.
    productId = (
      await pool.query(
        "INSERT INTO products(slug,name,category,price_cents,volume,abv,stock,image,description,composition,cocktail) VALUES($1,'Cloud image test','GIN',4200,'70 cl','42 %',1,$2,'Test','Test','Test') RETURNING id",
        ["cloudinary-test-" + Date.now(), row.cloudinary_url],
      )
    ).rows[0].id;
    assert.equal((await call("/admin/media/" + row.id, "DELETE")).status, 409);
    assert.equal(deletions.length, 0);
    await pool.query("DELETE FROM products WHERE id=$1", [productId]);
    productId = undefined;
    process.env.CLOUDINARY_CLOUD_NAME = "other-cloud";
    assert.equal((await call("/admin/media/" + row.id, "DELETE")).status, 409);
    assert.equal(deletions.length, 0);
    process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
    failDelete = true;
    const failedDelete = await call("/admin/media/" + row.id, "DELETE");
    assert.equal(failedDelete.status, 502);
    assert.ok(
      !JSON.stringify(failedDelete.body).includes("test-private-secret"),
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM media WHERE id=$1",
          [row.id],
        )
      ).rows[0].count,
      1,
    );
    failDelete = false;
    assert.equal((await call("/admin/media/" + row.id, "DELETE")).status, 200);
    assert.equal(deletions.at(-1).publicId, row.cloudinary_public_id);
    assert.equal(deletions.at(-1).options.invalidate, true);
    assert.equal(
      (await fetch(base + legacy.body.url, { redirect: "manual" })).status,
      404,
    );
  },
);
