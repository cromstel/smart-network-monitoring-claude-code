/** Next.js calls register() once per server process at startup. */
export async function register(): Promise<void> {
  // The condition must wrap the import so the edge bundle never sees Node-only modules.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node')
  }
}
