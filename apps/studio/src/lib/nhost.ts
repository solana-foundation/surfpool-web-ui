import { NhostClient } from '@nhost/nhost-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const nhost = new NhostClient({
  authUrl: requireEnv('NEXT_PUBLIC_NHOST_AUTH_URL'),
  graphqlUrl: requireEnv('NEXT_PUBLIC_NHOST_GRAPHQL_URL'),
  storageUrl: requireEnv('NEXT_PUBLIC_NHOST_STORAGE_URL'),
  functionsUrl: requireEnv('NEXT_PUBLIC_NHOST_FUNCTIONS_URL'),
});
