import { NhostClient } from '@nhost/nhost-js';

export const nhost = new NhostClient({
  authUrl: process.env.NEXT_PUBLIC_NHOST_AUTH_URL || 'https://id.txtx.run/v1',
  graphqlUrl: process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL || 'https://id.gql.txtx.run/v1/graphql',
  storageUrl: process.env.NEXT_PUBLIC_NHOST_STORAGE_URL || 'https://coeemktozqwudjrkuddt.storage.us-east-1.nhost.run/v1',
  functionsUrl: process.env.NEXT_PUBLIC_NHOST_FUNCTIONS_URL || 'https://coeemktozqwudjrkuddt.functions.us-east-1.nhost.run/v1',
});
