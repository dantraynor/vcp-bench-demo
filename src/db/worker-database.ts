// Node, tests, and `next dev` have no Worker binding. The Vite build aliases
// this module to the Cloudflare implementation.
export function workerDatabase():
  { connectionString: string; hyperdrive: boolean } | undefined {
  return undefined;
}
