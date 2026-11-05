import { pool } from "../db.js";
import bcrypt from "bcryptjs";
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase(),
  password = process.env.ADMIN_PASSWORD;
if (!pool || !email || !password || password.length < 12)
  throw new Error(
    "Définissez DATABASE_URL, ADMIN_EMAIL et ADMIN_PASSWORD (12 caractères minimum) dans votre environnement.",
  );
await pool.query(
  "INSERT INTO users(email,password_hash,name,role) VALUES($1,$2,'Administrateur','admin') ON CONFLICT(email) DO UPDATE SET role='admin',password_hash=EXCLUDED.password_hash",
  [email, await bcrypt.hash(password, 12)],
);
console.log("Administrateur configuré.");
await pool.end();
