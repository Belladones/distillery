import "dotenv/config";
import pg from "pg";
export const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : null;
export const schema = `
CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')), created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL, price_cents INTEGER NOT NULL CHECK(price_cents>0), volume TEXT NOT NULL, abv TEXT NOT NULL, stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0), color TEXT NOT NULL DEFAULT '#dfb74e', image TEXT NOT NULL DEFAULT '/bottle.svg', description TEXT NOT NULL, composition TEXT NOT NULL, cocktail TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT true);
ALTER TABLE products ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS carts (user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, product_id INTEGER REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 99), PRIMARY KEY(user_id,product_id));
CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','shipped','cancelled','expired')), total_cents INTEGER NOT NULL, shipping_cents INTEGER NOT NULL, address JSONB NOT NULL, items JSONB NOT NULL, provider TEXT NOT NULL, provider_id TEXT UNIQUE, tracking_url TEXT, created_at TIMESTAMPTZ DEFAULT now(), expires_at TIMESTAMPTZ DEFAULT now()+interval '30 minutes');
CREATE TABLE IF NOT EXISTS payment_events (id TEXT PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS site_content (key TEXT PRIMARY KEY, content JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS media (id UUID PRIMARY KEY, filename TEXT NOT NULL, mime_type TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, size INTEGER NOT NULL, sha256 TEXT UNIQUE NOT NULL, data BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS session (sid varchar NOT NULL PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL);
CREATE INDEX IF NOT EXISTS session_expire_idx ON session(expire);
`;
