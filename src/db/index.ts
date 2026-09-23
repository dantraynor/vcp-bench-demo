import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { workerDatabase } from "@/db/worker-database";

export const LOCAL_DATABASE_URL =
  "postgresql://postgres@127.0.0.1:54329/bench_adoption";
export function createDatabase(connectionString: string, max = 5) {
  const pool = new Pool({
    connectionString,
    max,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return { db: drizzle(pool, { schema }), pool };
}
type Connection = ReturnType<typeof createDatabase>;
const globalDb = globalThis as typeof globalThis & {
  benchConnection?: Connection;
  benchConnectionKey?: string;
};
function resolveDatabase() {
  const worker = workerDatabase();
  if (worker)
    return {
      connectionString: worker.connectionString,
      // Hyperdrive already pools upstream connections. One socket per isolate is enough.
      max: worker.hyperdrive ? 1 : 5,
    };
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is required.");
  return {
    connectionString: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL,
    max: 5,
  };
}
export function connection() {
  const database = resolveDatabase();
  const key = `${database.max}:${database.connectionString}`;
  if (!globalDb.benchConnection || globalDb.benchConnectionKey !== key) {
    globalDb.benchConnection = createDatabase(
      database.connectionString,
      database.max,
    );
    globalDb.benchConnectionKey = key;
  }
  return globalDb.benchConnection;
}
export const getDb = () => connection().db;
export type Database = Connection["db"];
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
