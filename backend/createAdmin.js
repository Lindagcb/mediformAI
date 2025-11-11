import bcrypt from "bcrypt";
import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pkg;

// =====================================
// PostgreSQL connection
// =====================================
const pool = new Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: process.env.PG_PORT || 5432,
  ssl: { rejectUnauthorized: false }
});

const createAdmin = async () => {
  const username = "admin";
  const password = "mY4Rg2"; // change after first login
  const hash = await bcrypt.hash(password, 10);

  await pool.query(
    "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING",
    [username, hash, "admin"]
  );

  console.log("✅ Admin user created:");
  console.log("   Username:", username);
  console.log("   Password:", password);
  process.exit(0);
};

createAdmin();
