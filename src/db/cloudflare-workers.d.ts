declare module "cloudflare:workers" {
  export const env: {
    HYPERDRIVE?: { connectionString?: string };
    DATABASE_URL?: string;
  };
}
