import { execFileSync } from "node:child_process";
import { prepareDatabase } from "../database";
export default async function setup() {
  await prepareDatabase(process.env.DATABASE_URL!);
  execFileSync(process.execPath, ["--import", "tsx", "scripts/seed.ts"], {
    env: process.env,
    stdio: "inherit",
  });
}
