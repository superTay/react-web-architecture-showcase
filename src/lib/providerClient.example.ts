// ============================================================
// lib/providerClient.ts — Backend-as-a-service client  (EXAMPLE / TEMPLATE)
// ============================================================
// Copy to `providerClient.ts` and fill with your own values.
//
// Lesson baked in: the connection URL and the public (anon) key come
// from environment variables, NEVER hardcoded in source. Even a
// "public" anon key should not be committed — if it ever needs rotating,
// you do not want it frozen in git history.
//
// This is a thin stub so the example API client compiles conceptually.
// Swap in your real BaaS SDK (the production app uses a Postgres-backed
// provider with Auth + row-level security + realtime).
// ============================================================

const PROVIDER_URL = import.meta.env?.VITE_PROVIDER_URL as string | undefined;
const PROVIDER_ANON_KEY = import.meta.env?.VITE_PROVIDER_ANON_KEY as string | undefined;

if (!PROVIDER_URL || !PROVIDER_ANON_KEY) {
  // Fail fast in dev so a missing env var is obvious, not a silent 401 later.
  // eslint-disable-next-line no-console
  console.warn('[providerClient] Missing VITE_PROVIDER_URL / VITE_PROVIDER_ANON_KEY');
}

type QueryResult<T> = Promise<{ data: T | null; error: { message: string } | null }>;

interface QueryBuilder {
  select(columns: string): QueryBuilder;
  order(column: string, opts?: { ascending?: boolean }): QueryResult<unknown[]>;
}

/**
 * Placeholder client. In production this is the real BaaS SDK instance
 * created from the env vars above, with persisted session + auto refresh.
 */
export const providerClient = {
  from(_table: string): QueryBuilder {
    throw new Error('providerClient is a showcase stub — wire up your real BaaS SDK.');
  },
};
