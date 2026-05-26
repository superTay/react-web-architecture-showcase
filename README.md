# React + TypeScript Web Architecture — Showcase

A **curated, sanitized extract** of selected patterns from a private production
web app I built solo: an invoicing / quoting SaaS for self-employed tradespeople
in Spain (painters, electricians, plumbers, builders). It is the web companion to
a Flutter mobile app (see my `flutter-mobile-architecture-showcase`), both in
private beta with real users.

> ⚠️ **This is not the full app.** It is a small set of representative files,
> chosen because they show interesting engineering decisions *without* exposing
> business logic, real endpoints, database schema or credentials. Product name,
> table names, API routes and keys have been replaced with neutral placeholders.
> The full app (~34k lines of TypeScript, 172 files, 48 SQL migrations, 31
> automation workflows) stays in a private repository.

---

## Why these files

The interesting parts of this app aren't the screens — they're the **correctness
guarantees**: how a client with *no backend of its own* keeps financial math
exact, stays consistent with the database, and meets Spanish tax law.

| File | Pattern it demonstrates |
|------|-------------------------|
| [`src/utils/fiscal.ts`](src/utils/fiscal.ts) | Exact financial math — Spanish VAT (IVA) / withholding (IRPF), cent-level rounding, NIF/NIE/CIF validation, and a **fail-closed** rule that *refuses* to total a mixed-VAT invoice rather than silently computing it wrong. |
| [`src/__tests__/fiscal.test.ts`](src/__tests__/fiscal.test.ts) | 30+ unit tests for the fiscal module — rounding edge cases, VAT/IRPF, ID validation, fail-closed behaviour. **Runnable** (`npm test`). |
| [`src/utils/normalization.ts`](src/utils/normalization.ts) | A **JS mirror of SQL functions**, kept in lock-step so the client computes the same canonical client-identifier key as the database — preventing duplicate records from client/server drift. |
| [`src/__tests__/normalization.test.ts`](src/__tests__/normalization.test.ts) | Tests that pin the JS-side contract of that mirror. **Runnable.** |
| [`src/api/apiClient.example.ts`](src/api/apiClient.example.ts) | The **read/write split + dual-auth** transport: reads via the provider SDK (RLS), writes via automation webhooks carrying an internal `session_key`, with `AbortController` timeouts and human-readable error mapping. |
| [`src/lib/config.example.ts`](src/lib/config.example.ts) | Environment-aware backend base URL with a dev proxy to dodge CORS — and a real war story about an env-var mismatch that broke production. |
| [`db/reserve_invoice_number.sql`](db/reserve_invoice_number.sql) | **Atomic, gap-free invoice numbering** in PL/pgSQL using a `FOR UPDATE` row lock + audit trail. A gap is a tax infringement, so this lives in the DB, not in app code. |
| [`db/verifactu_hash.sql`](db/verifactu_hash.sql) | **Chained SHA-256 hashing** of invoice records (Spain's VeriFactu / RD 1007/2023): each record's hash includes the previous one, making the ledger verifiably append-only. |

---

## Architecture in one picture

```
            ┌──────────────────────────── React SPA (this repo) ───────────────────────┐
            │                                                                           │
   reads    │   React Query  ──►  api/ clients  ──►  fetch + AbortController            │  writes
 ◄──────────┼───────────────────────────────────────────────────────────────────────┼──────────►
            │         │                                   │                             │
            │         ▼                                   ▼                             │
            │   provider SDK (RLS)                 session-key (not the JWT)            │
            └─────────┬─────────────────────────────────────┬───────────────────────────┘
                      │                                     │
                      ▼                                     ▼
         ┌────────────────────────┐            ┌──────────────────────────────┐
         │  Provider backend       │            │  Automation/write backend     │
         │  (Auth + RLS reads +    │            │  (webhooks; all business      │
         │   Realtime)             │            │   writes + PDF + OCR + AI)    │
         └────────────────────────┘            └──────────────────────────────┘
```

Two rules the codebase enforces:

1. **Reads** go straight to the provider backend, trusting row-level security by
   `user_id` — the client never filters by user itself. **Writes** of business
   entities go *only* through the automation backend, carrying an internal
   `session_key` — never the provider JWT.
2. The `session_key` is auto-renewed (7-day TTL, renewed within a 2-day margin)
   and decoupled from the provider's auth tokens, so the two can rotate
   independently without logging the user out.

---

## Notable engineering decisions

- **Correctness that can't fail lives in the database, not the app.** Invoice
  numbering must be gap-free under concurrency (a gap is a legal infringement),
  so it's a PL/pgSQL function with a `FOR UPDATE` lock and an audit trail — not
  an app-side read-modify-write that two parallel requests could race.
- **Fail-closed over silently-wrong.** Mixed VAT rates in a single invoice are
  rare and hard to total correctly. Instead of half-supporting them, the totals
  function detects the case and returns zeros + a clear error, and the UI blocks
  submission. A wrong tax total is worse than a blocked one.
- **One money formula, everywhere.** All rounding goes through `redondear2`
  (`Math.round(x*100)/100`); currency formatting through a single cached
  `Intl.NumberFormat`. The same fiscal rules are ported 1:1 to the Flutter app
  to guarantee cross-language parity (no cent drift between web and mobile).
- **The client mirrors SQL, on purpose.** `normalization.ts` re-implements two
  SQL functions so the UI can detect "this client already exists" *before* the
  UPSERT. The mirror is a divergence risk, so it's pinned by unit tests.
- **No backend of its own.** Reads lean on the provider's row-level security;
  every write is a webhook to an automation backend authenticated by an internal
  session token, keeping the SPA thin and the auth layers decoupled.

---

## Running the tests

The two utility modules are self-contained and their tests are runnable:

```bash
npm install
npm test
```

The `*.example.*` files (config, provider client, API client) are templates —
copy them without the `.example` suffix and fill in your own values to wire them
into a real project. This repo is intentionally not a runnable application.

---

## License

Source-available for **portfolio and evaluation only** — not open source.
See [`LICENSE`](LICENSE). © 2026 Christian Marzal Della Rovere. All rights reserved.
