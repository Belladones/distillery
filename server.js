import "dotenv/config";
import express from "express";
import helmet from "helmet";
import session from "express-session";
import pgSession from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import Stripe from "stripe";
import crypto from "node:crypto";
import { pool } from "./db.js";
import { products } from "./data.js";
import { fileURLToPath } from "node:url";
const app = express(),
  production = process.env.NODE_ENV === "production";
if (
  production &&
  (!pool ||
    (process.env.SESSION_SECRET?.length || 0) < 32 ||
    !process.env.BASE_URL?.startsWith("https://"))
)
  throw new Error(
    "Production : DATABASE_URL, SESSION_SECRET (32 caractères) et BASE_URL HTTPS requis.",
  );
const base = (process.env.BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "img-src": ["'self'", "https:", "data:"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "font-src": ["'self'"],
        "connect-src": ["'self'"],
      },
    },
  }),
);
async function transaction(fn) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
async function paid(c, id) {
  const {
    rows: [o],
  } = await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [id]);
  if (!o) throw fail("Commande inconnue", 404);
  if (o.status === "pending") {
    await c.query("UPDATE orders SET status='paid' WHERE id=$1", [id]);
    for (const item of o.items)
      await c.query(
        "DELETE FROM carts WHERE user_id=$1 AND product_id=$2 AND quantity=$3",
        [o.user_id, item.id, item.quantity],
      );
  } else if (!["paid", "shipped"].includes(o.status))
    throw fail("Commande expirée : remboursement manuel nécessaire.", 409);
}
app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res, next) => {
    try {
      if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET)
        throw fail("Webhook non configuré", 503);
      let event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          req.headers["stripe-signature"],
          process.env.STRIPE_WEBHOOK_SECRET,
        );
      } catch {
        throw fail("Signature webhook invalide", 400);
      }
      if (
        [
          "checkout.session.completed",
          "checkout.session.async_payment_succeeded",
        ].includes(event.type)
      ) {
        const s = event.data.object;
        if (s.payment_status === "paid")
          await transaction(async (c) => {
            const { rowCount } = await c.query(
              "INSERT INTO payment_events(id) VALUES($1) ON CONFLICT DO NOTHING",
              [event.id],
            );
            if (!rowCount) return;
            const {
              rows: [o],
            } = await c.query("SELECT * FROM orders WHERE provider_id=$1", [
              s.id,
            ]);
            if (!o || o.total_cents !== s.amount_total || s.currency !== "eur")
              throw fail("Paiement incohérent");
            await paid(c, o.id);
          });
      }
      if (event.type === "checkout.session.expired") {
        const s = event.data.object;
        const {
          rows: [o],
        } = await pool.query(
          "SELECT id FROM orders WHERE provider_id=$1 AND provider=$2",
          [s.id, "stripe"],
        );
        if (o) await cancelOrder(o.id);
      }
      res.json({ received: true });
    } catch (e) {
      next(e);
    }
  },
);
app.post(
  "/api/webhooks/paypal",
  express.json({ limit: "200kb" }),
  async (req, res, next) => {
    try {
      if (!pool || !process.env.PAYPAL_WEBHOOK_ID)
        throw fail("Webhook PayPal non configuré", 503);
      const verification = await paypal(
        "/v1/notifications/verify-webhook-signature",
        {
          auth_algo: req.headers["paypal-auth-algo"],
          cert_url: req.headers["paypal-cert-url"],
          transmission_id: req.headers["paypal-transmission-id"],
          transmission_sig: req.headers["paypal-transmission-sig"],
          transmission_time: req.headers["paypal-transmission-time"],
          webhook_id: process.env.PAYPAL_WEBHOOK_ID,
          webhook_event: req.body,
        },
      );
      if (verification.verification_status !== "SUCCESS")
        throw fail("Signature PayPal invalide", 400);
      const event = req.body;
      if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
        const capture = event.resource;
        await transaction(async (c) => {
          const { rowCount } = await c.query(
            "INSERT INTO payment_events(id) VALUES($1) ON CONFLICT DO NOTHING",
            ["paypal-" + event.id],
          );
          if (!rowCount) return;
          const {
            rows: [o],
          } = await c.query(
            "SELECT * FROM orders WHERE provider_id=$1 AND provider='paypal'",
            [capture.supplementary_data?.related_ids?.order_id],
          );
          if (
            !o ||
            capture.status !== "COMPLETED" ||
            capture.amount?.currency_code !== "EUR" ||
            Math.round(Number(capture.amount.value) * 100) !== o.total_cents
          )
            throw fail("Paiement PayPal incohérent");
          await paid(c, o.id);
        });
      }
      res.json({ received: true });
    } catch (e) {
      next(e);
    }
  },
);
app.use(express.json({ limit: "200kb" }));
app.use(
  session({
    store: pool
      ? new (pgSession(session))({ pool, createTableIfMissing: false })
      : undefined,
    secret:
      process.env.SESSION_SECRET || crypto.randomBytes(48).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: production,
      maxAge: 7 * 86400000,
    },
  }),
);
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 160,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
);
app.use("/api", (req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    if (
      req.headers.origin &&
      !new Set([
        base,
        ...(!production
          ? [
              `http://localhost:${process.env.PORT || 3000}`,
              `http://127.0.0.1:${process.env.PORT || 3000}`,
            ]
          : []),
      ]).has(req.headers.origin)
    )
      return next(fail("Origine refusée", 403));
    if (!req.session.csrf || req.headers["x-csrf-token"] !== req.session.csrf)
      return next(fail("Session expirée. Rechargez la page.", 403));
  }
  next();
});
const db = (req, res, next) =>
  pool
    ? next()
    : next(
        fail(
          "Mode découverte : connectez PostgreSQL pour activer les comptes et les commandes.",
          503,
        ),
      );
const auth = (req, res, next) =>
  req.session.user ? next() : next(fail("Connectez-vous pour continuer.", 401));
const admin = (req, res, next) =>
  req.session.user?.role === "admin"
    ? next()
    : next(fail("Accès administrateur requis.", 403));
const safe = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role });
app.get("/api/config", (req, res) => {
  req.session.csrf ||= crypto.randomBytes(32).toString("hex");
  res.json({
    csrf: req.session.csrf,
    demo: !pool,
    stripe: !!(stripe && process.env.STRIPE_WEBHOOK_SECRET),
    paypal: !!(
      process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET
    ),
    shipping_cents: Number(process.env.SHIPPING_CENTS || 690),
  });
});
app.get("/api/products", async (req, res) =>
  res.json(
    pool
      ? (
          await pool.query(
            "SELECT * FROM products WHERE active=true ORDER BY id",
          )
        ).rows
      : products,
  ),
);
app.get("/api/me", (req, res) => res.json(req.session.user || null));
const loginLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: 25,
  legacyHeaders: false,
});
app.post("/api/register", db, loginLimit, async (req, res) => {
  let { email, password, name, adult } = req.body;
  email = String(email || "")
    .trim()
    .toLowerCase();
  name = String(name || "").trim();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    !name ||
    name.length > 100 ||
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 128 ||
    adult !== true
  )
    throw fail(
      "Nom, email valide, majorité et mot de passe de 12 à 128 caractères requis.",
    );
  const {
    rows: [u],
  } = await pool.query(
    "INSERT INTO users(email,password_hash,name) VALUES($1,$2,$3) RETURNING id,email,name,role",
    [email, await bcrypt.hash(password, 12), name],
  );
  await new Promise((resolve, reject) =>
    req.session.regenerate((e) => (e ? reject(e) : resolve())),
  );
  req.session.user = safe(u);
  req.session.csrf = crypto.randomBytes(32).toString("hex");
  res.json({ user: safe(u), csrf: req.session.csrf });
});
app.post("/api/login", db, loginLimit, async (req, res) => {
  const { email, password } = req.body;
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    password.length > 128
  )
    throw fail("Identifiants invalides", 401);
  const {
    rows: [u],
  } = await pool.query("SELECT * FROM users WHERE email=$1", [
    email.trim().toLowerCase(),
  ]);
  if (!u || !(await bcrypt.compare(password, u.password_hash)))
    throw fail("Email ou mot de passe incorrect.", 401);
  await new Promise((resolve, reject) =>
    req.session.regenerate((e) => (e ? reject(e) : resolve())),
  );
  req.session.user = safe(u);
  req.session.csrf = crypto.randomBytes(32).toString("hex");
  res.json({ user: safe(u), csrf: req.session.csrf });
});
app.post("/api/logout", (req, res, next) =>
  req.session.destroy((e) => (e ? next(e) : res.json({ ok: true }))),
);
app.get("/api/cart", db, auth, async (req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT p.*,c.quantity FROM carts c JOIN products p ON p.id=c.product_id WHERE user_id=$1 ORDER BY p.id",
        [req.session.user.id],
      )
    ).rows,
  ),
);
app.put("/api/cart", db, auth, async (req, res) => {
  const { product_id, quantity } = req.body;
  if (
    !Number.isInteger(product_id) ||
    !Number.isInteger(quantity) ||
    quantity < 0 ||
    quantity > 99
  )
    throw fail("Quantité invalide");
  if (quantity === 0)
    await pool.query("DELETE FROM carts WHERE user_id=$1 AND product_id=$2", [
      req.session.user.id,
      product_id,
    ]);
  else {
    const {
      rows: [p],
    } = await pool.query(
      "SELECT stock FROM products WHERE id=$1 AND active=true",
      [product_id],
    );
    if (!p || p.stock < quantity) throw fail("Stock insuffisant");
    await pool.query(
      "INSERT INTO carts(user_id,product_id,quantity) VALUES($1,$2,$3) ON CONFLICT(user_id,product_id) DO UPDATE SET quantity=$3",
      [req.session.user.id, product_id, quantity],
    );
  }
  res.json({ ok: true });
});
app.get("/api/orders", db, auth, async (req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC",
        [req.session.user.id],
      )
    ).rows,
  ),
);
async function paypal(path, body, method = "POST", requestId) {
  const host =
    process.env.PAYPAL_ENV === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";
  const token = await fetch(host + "/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_CLIENT_SECRET,
        ).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!token.ok) throw fail("Authentification PayPal indisponible", 502);
  const { access_token } = await token.json();
  const response = await fetch(host + path, {
    method,
    headers: {
      Authorization: "Bearer " + access_token,
      "Content-Type": "application/json",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw fail("Paiement PayPal indisponible", 502);
  return response.json();
}
async function cancelOrder(id) {
  await transaction(async (c) => {
    const {
      rows: [o],
    } = await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [id]);
    if (o?.status === "pending") {
      for (const i of o.items)
        await c.query("UPDATE products SET stock=stock+$1 WHERE id=$2", [
          i.quantity,
          i.id,
        ]);
      await c.query("UPDATE orders SET status='cancelled' WHERE id=$1", [id]);
    }
  });
}
app.post("/api/checkout", db, auth, async (req, res) => {
  const { provider, address, adult } = req.body;
  if (!["stripe", "paypal"].includes(provider) || adult !== true)
    throw fail("Confirmez votre majorité et choisissez un paiement.");
  if (
    (provider === "stripe" &&
      (!stripe || !process.env.STRIPE_WEBHOOK_SECRET)) ||
    (provider === "paypal" &&
      (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET))
  )
    throw fail("Ce moyen de paiement n’est pas encore configuré.", 503);
  if (
    !address ||
    ["name", "line1", "postal_code", "city", "country"].some(
      (k) =>
        typeof address[k] !== "string" ||
        !address[k].trim() ||
        address[k].length > 180,
    ) ||
    address.country !== "FR" ||
    !/^(0[1-9]|[1-8]\d|9[0-5])\d{3}$/.test(address.postal_code)
  )
    throw fail(
      "Adresse française complète et code postal à 5 chiffres requis.",
    );
  const o = await transaction(async (c) => {
    await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
      req.session.user.id,
    ]);
    const { rows: existing } = await c.query(
      "SELECT id FROM orders WHERE user_id=$1 AND status='pending'",
      [req.session.user.id],
    );
    if (existing.length)
      throw fail(
        "Un paiement est déjà en cours. Annulez-le depuis vos commandes avant de recommencer.",
        409,
      );
    const { rows } = await c.query(
      "SELECT p.*,c.quantity FROM carts c JOIN products p ON p.id=c.product_id WHERE user_id=$1 ORDER BY p.id FOR UPDATE OF p",
      [req.session.user.id],
    );
    if (!rows.length) throw fail("Votre panier est vide");
    for (const p of rows) {
      if (!p.active || p.stock < p.quantity)
        throw fail("Stock insuffisant pour " + p.name);
      await c.query("UPDATE products SET stock=stock-$1 WHERE id=$2", [
        p.quantity,
        p.id,
      ]);
    }
    const items = rows.map((p) => ({
      id: p.id,
      name: p.name,
      price_cents: p.price_cents,
      quantity: p.quantity,
    }));
    const shipping = Number(process.env.SHIPPING_CENTS || 690);
    const total = items.reduce(
      (s, i) => s + i.price_cents * i.quantity,
      shipping,
    );
    const {
      rows: [order],
    } = await c.query(
      "INSERT INTO orders(user_id,total_cents,shipping_cents,address,items,provider) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
      [
        req.session.user.id,
        total,
        shipping,
        address,
        JSON.stringify(items),
        provider,
      ],
    );
    return order;
  });
  try {
    let url, pid;
    if (provider === "stripe") {
      const s = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          payment_method_types: ["card"],
          customer_email: req.session.user.email,
          line_items: [
            ...o.items.map((i) => ({
              price_data: {
                currency: "eur",
                product_data: { name: i.name },
                unit_amount: i.price_cents,
              },
              quantity: i.quantity,
            })),
            {
              price_data: {
                currency: "eur",
                product_data: { name: "Livraison France" },
                unit_amount: o.shipping_cents,
              },
              quantity: 1,
            },
          ],
          metadata: { order_id: String(o.id) },
          success_url: base + "/?payment=success#compte",
          cancel_url: base + "/?payment=cancelled#compte",
          expires_at: Math.floor(Date.now() / 1000) + 1800,
        },
        { idempotencyKey: "order-" + o.id },
      );
      url = s.url;
      pid = s.id;
    } else {
      const p = await paypal("/v2/checkout/orders", {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: String(o.id),
            amount: {
              currency_code: "EUR",
              value: (o.total_cents / 100).toFixed(2),
            },
            shipping: {
              name: { full_name: address.name },
              address: {
                address_line_1: address.line1,
                admin_area_2: address.city,
                postal_code: address.postal_code,
                country_code: "FR",
              },
            },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              return_url: base + "/?paypal=" + o.id + "#compte",
              cancel_url: base + "/?payment=cancelled#compte",
              user_action: "PAY_NOW",
              shipping_preference: "SET_PROVIDED_ADDRESS",
            },
          },
        },
      });
      pid = p.id;
      url = p.links.find(
        (l) => l.rel === "payer-action" || l.rel === "approve",
      )?.href;
      if (!url) throw fail("Lien PayPal absent", 502);
    }
    await pool.query("UPDATE orders SET provider_id=$1 WHERE id=$2", [
      pid,
      o.id,
    ]);
    res.json({ url });
  } catch (e) {
    await cancelOrder(o.id);
    throw e;
  }
});
app.post("/api/paypal/capture", db, auth, async (req, res) => {
  const id = Number(req.body.order_id);
  await transaction(async (c) => {
    const {
      rows: [o],
    } = await c.query(
      "SELECT * FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [id, req.session.user.id],
    );
    if (!o || o.provider !== "paypal") throw fail("Commande inconnue", 404);
    if (["paid", "shipped"].includes(o.status)) return;
    if (o.status !== "pending") throw fail("Commande non payable", 409);
    let result = await paypal(
      "/v2/checkout/orders/" + encodeURIComponent(o.provider_id),
      undefined,
      "GET",
    );
    if (result.status !== "COMPLETED")
      result = await paypal(
        "/v2/checkout/orders/" + encodeURIComponent(o.provider_id) + "/capture",
        {},
        "POST",
        "capture-" + o.id,
      );
    const capture = result.purchase_units?.[0]?.payments?.captures?.[0];
    if (
      result.status !== "COMPLETED" ||
      capture?.status !== "COMPLETED" ||
      capture.amount.currency_code !== "EUR" ||
      Math.round(Number(capture.amount.value) * 100) !== o.total_cents
    )
      throw fail("Paiement non confirmé", 409);
    await paid(c, id);
  });
  res.json({ ok: true });
});
app.post("/api/orders/:id/cancel", db, auth, async (req, res) => {
  const {
    rows: [o],
  } = await pool.query("SELECT * FROM orders WHERE id=$1 AND user_id=$2", [
    Number(req.params.id),
    req.session.user.id,
  ]);
  if (!o || o.status !== "pending") throw fail("Commande non annulable", 409);
  if (o.provider === "stripe" && o.provider_id) {
    const payment = await stripe.checkout.sessions.retrieve(o.provider_id);
    if (payment.payment_status === "paid")
      throw fail(
        "Ce paiement est déjà confirmé. Attendez la mise à jour de la commande.",
        409,
      );
    if (payment.status === "open")
      await stripe.checkout.sessions.expire(o.provider_id);
    else if (payment.status !== "expired")
      throw fail("Le paiement doit être vérifié avant annulation.", 409);
  }
  if (o.provider === "paypal" && o.provider_id)
    throw fail(
      "Un paiement PayPal ouvert doit être vérifié par l’administrateur avant annulation.",
      409,
    );
  await cancelOrder(o.id);
  res.json({ ok: true });
});
app.get("/api/admin/products", db, auth, admin, async (req, res) =>
  res.json((await pool.query("SELECT * FROM products ORDER BY id")).rows),
);
app.get("/api/admin/orders", db, auth, admin, async (req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT o.*,u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC",
      )
    ).rows,
  ),
);
app.post("/api/admin/products", db, auth, admin, async (req, res) => {
  const p = req.body;
  p.images ??= [];
  const fields = [
    "slug",
    "name",
    "category",
    "price_cents",
    "volume",
    "abv",
    "stock",
    "color",
    "image",
    "images",
    "description",
    "composition",
    "cocktail",
    "active",
  ];
  if (
    fields
      .filter((k) => !["active", "price_cents", "stock", "images"].includes(k))
      .some(
        (k) => typeof p[k] !== "string" || !p[k].trim() || p[k].length > 10000,
      ) ||
    !Array.isArray(p.images) ||
    p.images.length > 8 ||
    p.images.some(
      (url) =>
        typeof url !== "string" ||
        url.length > 2000 ||
        !/^(https:\/\/|\/)/.test(url),
    ) ||
    !Number.isInteger(p.price_cents) ||
    p.price_cents <= 0 ||
    !Number.isInteger(p.stock) ||
    p.stock < 0 ||
    typeof p.active !== "boolean" ||
    !/^#[0-9a-f]{6}$/i.test(p.color) ||
    !/^(https:\/\/|\/)/.test(p.image) ||
    !/^[-a-z0-9]+$/.test(p.slug)
  )
    throw fail("Fiche produit invalide");
  const values = fields.map((k) =>
    k === "images" ? JSON.stringify(p[k]) : p[k],
  );
  if (p.id) {
    await pool.query(
      `UPDATE products SET ${fields.map((k, i) => k + "=$" + (i + 1)).join(",")} WHERE id=$${fields.length + 1}`,
      [...values, Number(p.id)],
    );
  } else
    await pool.query(
      `INSERT INTO products(${fields.join(",")}) VALUES(${fields.map((_, i) => "$" + (i + 1)).join(",")})`,
      values,
    );
  res.json({ ok: true });
});
app.patch("/api/admin/orders/:id", db, auth, admin, async (req, res) => {
  const { tracking_url, status } = req.body;
  let url;
  try {
    url = new URL(tracking_url);
  } catch {
    throw fail("Lien de suivi HTTPS requis");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    status !== "shipped"
  )
    throw fail("Lien de suivi HTTPS et statut expédié requis.");
  const { rowCount } = await pool.query(
    "UPDATE orders SET status='shipped',tracking_url=$1 WHERE id=$2 AND status IN ('paid','shipped')",
    [url.href, Number(req.params.id)],
  );
  if (!rowCount) throw fail("Seule une commande payée peut être expédiée.");
  res.json({ ok: true });
});
app.get("/api/health", async (req, res) => {
  if (pool) await pool.query("SELECT 1");
  res.json({ ok: true, database: !!pool });
});
app.use(express.static(fileURLToPath(new URL("./public", import.meta.url))));
// Uploaded page components refer to these photos. Real files in public/assets
// take precedence; use the current illustration until those assets are supplied.
const presentationAssets = new Set([
  "hero-banner.png",
  ...Array.from({ length: 6 }, (_, i) => `bento${i + 1}.png`),
  ...Array.from({ length: 3 }, (_, i) => `temoignage${i + 1}.png`),
]);
app.get("/assets/:name", (req, res, next) => {
  if (!presentationAssets.has(req.params.name)) return next();
  res.sendFile(
    fileURLToPath(new URL("./public/distillery.png", import.meta.url)),
  );
});
app.get(["/products", "/products/:slug"], (req, res) => {
  res.sendFile(fileURLToPath(new URL("./public/index.html", import.meta.url)));
});
app.use("/api", (req, res) =>
  res.status(404).json({ error: "Route inconnue" }),
);
app.use((err, req, res, next) => {
  if (err.code === "23505")
    return res
      .status(409)
      .json({ error: "Cet email ou cet identifiant existe déjà." });
  console.error(err.status ? err.message : err.code || err.name);
  res.status(err.status || 500).json({
    error: err.status
      ? err.message
      : "Une erreur est survenue. Réessayez plus tard.",
  });
});
export { app, stripe };
if (process.env.NODE_ENV !== "test")
  app.listen(process.env.PORT || 3000, "0.0.0.0", () =>
    console.log(
      "Distillerie — port " +
        (process.env.PORT || 3000) +
        (pool ? "" : " — mode découverte"),
    ),
  );
