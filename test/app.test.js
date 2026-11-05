import { test, before, after } from "node:test";
import assert from "node:assert/strict";
process.env.NODE_ENV = "test";
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.STRIPE_SECRET_KEY = "sk_test_local";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_local_test";
} else delete process.env.DATABASE_URL;
const { app, stripe } = await import("../server.js");
const { pool, schema } = await import("../db.js");
let server,
  base,
  csrf,
  cookie,
  email = "test-" + Date.now() + "@example.com",
  uid,
  pid;
before(async () => {
  if (pool) await pool.query(schema);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  if (pool) {
    if (uid) {
      await pool.query("DELETE FROM orders WHERE user_id=$1", [uid]);
      await pool.query("DELETE FROM users WHERE id=$1", [uid]);
    }
    if (pid) await pool.query("DELETE FROM products WHERE id=$1", [pid]);
    await pool.query("DELETE FROM session WHERE sid=$1", [
      decodeURIComponent(cookie?.split("=")[1]?.split(".")[0] || "").replace(
        /^s:/,
        "",
      ),
    ]);
    await pool.end();
  }
  await new Promise((r) => server.close(r));
});
async function request(path, method = "GET", body, token = csrf) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(token ? { "X-CSRF-Token": token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.headers.get("set-cookie"))
    cookie = r.headers.get("set-cookie").split(";")[0];
  return { status: r.status, body: await r.json() };
}
test("configuration, catalogue et interface sont servis", async () => {
  let r = await request("/config");
  assert.equal(r.status, 200);
  csrf = r.body.csrf;
  assert.ok(csrf.length >= 32);
  r = await request("/products");
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body));
  if (!pool) assert.equal(r.body.length, 3);
  const html = await fetch(base);
  assert.equal(html.status, 200);
  assert.match(
    (await html.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
    /Notre passion/,
  );
});
test("les pages produits sont accessibles directement et les visuels absents ont un remplacement", async () => {
  for (const path of ["/products", "/products/gin-sauvage"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /storefront.js|app.js/);
  }
  const image = await fetch(base + "/assets/hero-banner.png");
  assert.equal(image.status, 200);
  assert.match(image.headers.get("content-type"), /image\/png/);
  assert.equal((await fetch(base + "/api/route-inconnue")).status, 404);
});
test("les mutations sans CSRF et les accès administrateur sont refusés", async () => {
  assert.equal(
    (await request("/login", "POST", { email, password: "invalid" }, "wrong"))
      .status,
    403,
  );
  assert.equal((await request("/admin/orders")).status, pool ? 401 : 503);
});
test(
  "PostgreSQL : inscription, panier persistant, permissions et stock",
  { skip: !pool },
  async () => {
    let r = await request("/register", "POST", {
      email,
      password: "a-strong-password-123",
      name: "Client test",
      adult: true,
    });
    assert.equal(r.status, 200);
    uid = r.body.user.id;
    csrf = r.body.csrf;
    assert.equal(r.body.user.role, "customer");
    assert.equal((await request("/me")).body.id, uid);
    const {
      rows: [p],
    } = await pool.query(
      "INSERT INTO products(slug,name,category,price_cents,volume,abv,stock,description,composition,cocktail) VALUES($1,'Produit test','GIN',4200,'70 cl','42 %',2,'Test','Test','Test') RETURNING id",
      ["test-" + Date.now()],
    );
    pid = p.id;
    assert.equal(
      (await request("/cart", "PUT", { product_id: pid, quantity: 3 })).status,
      400,
    );
    assert.equal(
      (await request("/cart", "PUT", { product_id: pid, quantity: 2 })).status,
      200,
    );
    r = await request("/cart");
    assert.equal(r.body.find((i) => i.id === pid).quantity, 2);
    assert.equal((await request("/admin/products")).status, 403);
    assert.equal(
      (
        await request("/checkout", "POST", {
          provider: "stripe",
          adult: true,
          address: {},
        })
      ).status,
      400,
    );
    assert.equal(
      (await pool.query("SELECT stock FROM products WHERE id=$1", [pid]))
        .rows[0].stock,
      2,
    );
    assert.equal(
      (await request("/cart", "PUT", { product_id: pid, quantity: 0 })).status,
      200,
    );
    assert.deepEqual((await request("/cart")).body, []);
    await request("/logout", "POST");
    assert.equal((await request("/me")).body, null);
    const conf = await request("/config");
    csrf = conf.body.csrf;
    r = await request("/login", "POST", {
      email,
      password: "a-strong-password-123",
    });
    assert.equal(r.status, 200);
    csrf = r.body.csrf;
    await pool.query("UPDATE users SET role='admin' WHERE id=$1", [uid]);
    await request("/logout", "POST");
    csrf = (await request("/config")).body.csrf;
    r = await request("/login", "POST", {
      email,
      password: "a-strong-password-123",
    });
    csrf = r.body.csrf;
    assert.equal((await request("/admin/products")).status, 200);
    r = await request("/admin/products", "POST", {
      id: pid,
      slug: "test-" + pid,
      name: "Produit modifié",
      category: "GIN",
      price_cents: 4500,
      volume: "70 cl",
      abv: "42 %",
      stock: 5,
      color: "#abcdef",
      image: "/bottle.svg",
      description: "Description test",
      composition: "Composition test",
      cocktail: "Cocktail test",
      active: true,
    });
    assert.equal(r.status, 200);
    assert.equal(
      (await pool.query("SELECT stock FROM products WHERE id=$1", [pid]))
        .rows[0].stock,
      5,
    );
    // Payment gateway is stubbed: verifies local order logic, not live Stripe behavior.
    let sessionId = "cs_test_" + Date.now();
    stripe.checkout.sessions.create = async () => ({
      id: sessionId,
      url: "https://checkout.stripe.com/test",
    });
    stripe.checkout.sessions.expire = async () => ({ status: "expired" });
    stripe.checkout.sessions.retrieve = async () => ({
      status: "open",
      payment_status: "unpaid",
    });
    await request("/cart", "PUT", { product_id: pid, quantity: 2 });
    const checkout = {
      provider: "stripe",
      adult: true,
      address: {
        name: "Client test",
        line1: "1 rue du Test",
        postal_code: "75001",
        city: "Paris",
        country: "FR",
      },
    };
    r = await request("/checkout", "POST", checkout);
    assert.equal(r.status, 200);
    assert.equal(
      (await pool.query("SELECT stock FROM products WHERE id=$1", [pid]))
        .rows[0].stock,
      3,
    );
    assert.equal((await request("/checkout", "POST", checkout)).status, 409);
    let orders = (await request("/orders")).body;
    let order = orders[0];
    assert.equal(order.total_cents, 9690);
    const event = {
      id: "evt_" + Date.now(),
      type: "checkout.session.completed",
      data: {
        object: {
          id: sessionId,
          payment_status: "paid",
          amount_total: order.total_cents,
          currency: "eur",
        },
      },
    };
    async function webhook(payload, valid = true) {
      const raw = JSON.stringify(payload);
      return fetch(base + "/api/webhooks/stripe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": valid
            ? stripe.webhooks.generateTestHeaderString({
                payload: raw,
                secret: process.env.STRIPE_WEBHOOK_SECRET,
              })
            : "bad",
        },
        body: raw,
      });
    }
    assert.equal((await webhook(event, false)).status, 400);
    assert.equal((await webhook(event)).status, 200);
    assert.equal((await webhook(event)).status, 200);
    assert.equal((await request("/orders")).body[0].status, "paid");
    assert.deepEqual((await request("/cart")).body, []);
    assert.equal(
      (await request("/orders/" + order.id + "/cancel", "POST")).status,
      409,
    );
    assert.equal(
      (
        await request("/admin/orders/" + order.id, "PATCH", {
          status: "shipped",
          tracking_url: "javascript:alert(1)",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/admin/orders/" + order.id, "PATCH", {
          status: "shipped",
          tracking_url:
            "https://www.laposte.fr/outils/suivre-vos-envois?code=TEST",
        })
      ).status,
      200,
    );
    assert.equal((await request("/orders")).body[0].status, "shipped");
    // Cancel a second pending payment and ensure its reservation is returned once.
    await request("/cart", "PUT", { product_id: pid, quantity: 1 });
    sessionId += "second";
    assert.equal((await request("/checkout", "POST", checkout)).status, 200);
    order = (await request("/orders")).body[0];
    assert.equal(
      (await request("/orders/" + order.id + "/cancel", "POST")).status,
      200,
    );
    assert.equal(
      (await request("/orders/" + order.id + "/cancel", "POST")).status,
      409,
    );
    assert.equal(
      (await pool.query("SELECT stock FROM products WHERE id=$1", [pid]))
        .rows[0].stock,
      3,
    );
  },
);
