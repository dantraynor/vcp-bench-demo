import { env } from "cloudflare:workers";

export function workerDatabase() {
  if (!env.HYPERDRIVE?.connectionString)
    throw new Error("HYPERDRIVE is required in the Worker.");
  return {
    connectionString: env.HYPERDRIVE.connectionString,
    hyperdrive: true,
  };
}
