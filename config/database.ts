import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
  host: Bun.env.POSTGRES_HOST,
  port: Bun.env.POSTGRES_PORT,
  user: Bun.env.POSTGRES_USERNAME,
  password: Bun.env.POSTGRES_PASSWORD,
  database: Bun.env.POSTGRES_DBNAME,
});

export const db = drizzle(pool);
