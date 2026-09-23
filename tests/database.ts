import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { createDatabase } from "../src/db";

// Reset helpers must never accept the application's database or a hosted URL.
export function testDatabaseUrl(
  value = process.env.TEST_DATABASE_URL ??
    "postgresql://postgres@127.0.0.1:54329/bench_adoption_test",
) {
  const url = new URL(value);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !/^\/bench_adoption(?:_e2e)?_test$/.test(url.pathname)
  ) {
    throw new Error(
      "Tests require a local database named bench_adoption_test or bench_adoption_e2e_test.",
    );
  }
  return value;
}
export async function prepareDatabase(url: string) {
  const { db, pool } = createDatabase(testDatabaseUrl(url));
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
    await db.execute(
      sql`TRUNCATE import_batch, audit_event, adoption, donor, bench, staff_user, submission_limit CASCADE`,
    );
  } finally {
    await pool.end();
  }
}
