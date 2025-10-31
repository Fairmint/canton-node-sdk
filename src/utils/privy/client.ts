import { PrivyClient } from '@privy-io/node';
import type { PrivyClientOptions } from './types';

/**
 * Creates a Privy client instance for wallet operations
 *
 * @example
 *   ```typescript
 *   import { createPrivyClient } from '@fairmint/canton-node-sdk';
 *
 *   const privy = createPrivyClient({
 *     appId: process.env.PRIVY_APP_ID!,
 *     appSecret: process.env.PRIVY_APP_SECRET!
 *   });
 *   ```;
 *
 * @param options - Configuration options for the Privy client
 * @returns Configured PrivyClient instance
 * @throws Error if appId or appSecret are missing
 */
export function createPrivyClient(options: PrivyClientOptions): PrivyClient {
  const { appId, appSecret } = options;

  if (!appId) {
    throw new Error('Privy App ID is required. Set PRIVY_APP_ID environment variable or provide appId option.');
  }

  if (!appSecret) {
    throw new Error(
      'Privy App Secret is required. Set PRIVY_APP_SECRET environment variable or provide appSecret option.'
    );
  }

  return new PrivyClient({
    appId,
    appSecret,
  });
}

/**
 * Creates a Privy client from environment variables
 *
 * @example
 *   ```typescript
 *   import { createPrivyClientFromEnv } from '@fairmint/canton-node-sdk';
 *
 *   // Requires PRIVY_APP_ID and PRIVY_APP_SECRET in environment
 *   const privy = createPrivyClientFromEnv();
 *   ```;
 *
 * @returns Configured PrivyClient instance
 * @throws Error if PRIVY_APP_ID or PRIVY_APP_SECRET are not set
 */
export function createPrivyClientFromEnv(): PrivyClient {
  return createPrivyClient({
    appId: process.env['PRIVY_APP_ID'] ?? '',
    appSecret: process.env['PRIVY_APP_SECRET'] ?? '',
  });
}
