import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // Enforce TLS in production; allow unverified certs in dev (Replit managed DB)
  ...(process.env.NODE_ENV === "production"
    ? { ssl: { rejectUnauthorized: true } }
    : { ssl: { rejectUnauthorized: false } }),
});

export const db = drizzle(pool, { schema });
export { pool };
