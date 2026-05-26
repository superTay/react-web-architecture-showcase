// ============================================================
// lib/supabase.ts — Supabase client  (EXAMPLE / TEMPLATE)
// ============================================================
// Copy to `supabase.ts` and fill with your own values.
//
// Lesson baked in: the project URL and the public (anon) key come from
// environment variables, NEVER hardcoded in source. Even a "public" anon
// key should not be committed — if it ever needs rotating you do not want
// it frozen in git history.
//
// In production this is a real `createClient(...)` from `@supabase/supabase-js`
// with persisted session + auto token refresh. Reads go through it directly
// and row-level security (RLS) isolates each user's rows.
// ============================================================

const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Fail fast in dev so a missing env var is obvious, not a silent 401 later.
  // eslint-disable-next-line no-console
  console.warn('[supabase] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
}

// In the real app:
//   import { createClient } from '@supabase/supabase-js';
//   export const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
//     auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
//   });
//
// Below is a thin typed stub so the illustrative extracts read coherently.
type QueryResult<T> = Promise<{ data: T | null; error: { message: string } | null }>;

export const supabase = {
  from(_table: string) {
    return {
      select(_columns: string) {
        return {
          order(_c: string, _o?: { ascending?: boolean }): QueryResult<unknown[]> {
            throw new Error('supabase is a showcase stub — wire up @supabase/supabase-js.');
          },
        };
      },
    };
  },
} as const;
