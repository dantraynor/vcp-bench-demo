import { env } from "cloudflare:workers";

type WorkerEnv = {
  HYPERDRIVE?: { connectionString?: string };
  DATABASE_URL?: string;
};

export function workerDatabase():
  { connectionString: string; hyperdrive: boolean } | undefined {
  const workers = env as WorkerEnv;
  if (workers.HYPERDRIVE?.connectionString)
    return {
      connectionString: workers.HYPERDRIVE.connectionString,
      hyperdrive: true,
    };
  if (workers.DATABASE_URL)
    return { connectionString: workers.DATABASE_URL, hyperdrive: false };
  return undefined;
}
