// ============================================================
// lib/config.ts — Shared configuration constants  (EXAMPLE / TEMPLATE)
// ============================================================
// Copy to `config.ts` and fill with your own values. All real domains,
// keys and project identifiers have been replaced with placeholders.
//
// Base URL for all automation-backend webhooks (the write backend).
//
// In PRODUCTION (build): points straight at the public automation
// domain. That backend pins CORS to the app's own origin, so requests
// only succeed from the deployed app.
//
// In DEV (`npm run dev`): points at a relative path that the dev server
// proxies to the automation backend (see vite.config.ts → server.proxy).
// Because the browser sees same-origin (localhost), there is no CORS
// preflight and fetches behave exactly like production. This also
// sidesteps backends that hardcode `Access-Control-Allow-Origin` to the
// production origin.
//
// To override (e.g. point at a staging backend), set the env var
// `VITE_AUTOMATION_BASE_URL` in `.env.local`.
//
// ⚠️ War story — why the normalization below exists:
// The original `.env.example` (and production) defined the variable
// WITHOUT the trailing `/webhook` segment. The old code ignored the env
// var and used a hardcoded constant WITH `/webhook`, so the mismatch was
// harmless. The day the env-var override was enabled, every download in
// production broke (URLs missing `/webhook`). To stop that recurring we
// normalize: if the value does not end in `/webhook`, we append it.
const rawOverride = import.meta.env?.VITE_AUTOMATION_BASE_URL as
  | string
  | undefined;

function normalizeWebhookBase(value: string): string {
  const trimmed = value.replace(/\/+$/, '');
  return trimmed.endsWith('/webhook') ? trimmed : `${trimmed}/webhook`;
}

const envOverride =
  rawOverride && rawOverride.length > 0
    ? normalizeWebhookBase(rawOverride)
    : undefined;

export const AUTOMATION_BASE_URL =
  envOverride ??
  (import.meta.env?.DEV
    ? '/automation-dev/webhook'
    : 'https://automation.example.com/webhook');
