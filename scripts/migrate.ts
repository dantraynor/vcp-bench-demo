import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase, LOCAL_DATABASE_URL } from "../src/db/index";
const { db, pool } = createDatabase(
  process.env.DATABASE_URL_UNPOOLED ??
    process.env.DATABASE_URL ??
    LOCAL_DATABASE_URL,
);
try {
  await migrate(db, { migrationsFolder: "drizzle" });
  console.info("Database migrations applied.");
} finally {
  await pool.end();
}
