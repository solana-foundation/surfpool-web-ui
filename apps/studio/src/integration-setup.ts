/**
 * Global setup for integration tests.
 * Checks that a Surfpool instance is running before tests execute.
 */
export async function setup() {
  const rpcUrl = process.env.SURFPOOL_RPC_URL || 'http://127.0.0.1:8899';

  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`RPC responded with status ${response.status}`);
    }

    console.log(`\n  Surfpool is running at ${rpcUrl}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  ❌ Cannot reach Surfpool at ${rpcUrl}: ${message}`);
    console.error('  Integration tests require a running Surfpool instance.');
    console.error('  Start one with: surfpool start\n');
    process.exit(1);
  }
}

export async function teardown() {
  // Nothing to clean up — we don't manage the Surfpool lifecycle
}
