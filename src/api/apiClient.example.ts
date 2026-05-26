// ============================================================
// api/apiClient.ts — Data-layer pattern  (EXAMPLE / TEMPLATE)
// ============================================================
// A faithful, neutralized extract of the read/write split this SPA uses.
// Product name, table names, routes and keys are placeholders.
//
// The rule the whole data layer enforces:
//   • READS  go straight to the provider backend (Auth + row-level
//     security). RLS isolates each user's rows, so the client never
//     filters by user_id itself.
//   • WRITES of business entities go ONLY through the automation backend
//     via webhooks, carrying an internal `session_key` — never the
//     provider JWT. This decouples the automation layer from the
//     provider's auth tokens (they can rotate independently).
//
// React Query sits on top of these functions (queries for reads,
// mutations for writes); this file is just the transport + auth + error
// mapping primitives.
// ============================================================

import { AUTOMATION_BASE_URL } from '../lib/config.example';

// Reads use the Supabase client directly; RLS does the user isolation.
// Writes go to the n8n automation backend (see AUTOMATION_BASE_URL).
import { supabase } from '../lib/supabase.example';

/** Per-call timeout. Long-running automation (PDF generation, OCR) needs a
 *  generous ceiling; plain CRUD uses a shorter one. */
const DEFAULT_TIMEOUT_MS = 30_000;
const LONG_TIMEOUT_MS = 90_000;

interface ActionPayload {
  action: string;
  token: string; // internal session_key — NOT the provider JWT
  [key: string]: unknown;
}

/**
 * Single choke point for every write. Wraps fetch with an AbortController
 * timeout and maps transport/HTTP failures to human-readable errors so the
 * UI can surface a friendly toast instead of a raw status code.
 */
async function postAction(
  path: string,
  payload: ActionPayload,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${AUTOMATION_BASE_URL}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const error = new Error(`Error ${response.status}: ${text.slice(0, 200)}`) as Error & {
        status?: number;
      };
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      // Human-readable, never technical (the end user is non-technical).
      throw new Error('La operación tardó demasiado. Inténtalo de nuevo.');
    }
    throw err;
  }
}

export const documentApi = {
  // ---- READ: Supabase directly, RLS enforces user isolation ------------
  list: async (): Promise<unknown[]> => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`No hemos podido cargar tus documentos. ${error.message}`);
    return data ?? [];
  },

  // ---- WRITES: automation backend via webhook + session_key ------------
  remove: ({ id, session_key }: { id: string; session_key: string }) =>
    postAction('document-action', { action: 'DELETE', token: session_key, id }),

  send: ({ id, session_key, recipient }: { id: string; session_key: string; recipient: string }) =>
    postAction('document-action', { action: 'SEND', token: session_key, id, recipient }),

  // PDF generation is slow → use the long timeout.
  generatePdf: ({ id, session_key }: { id: string; session_key: string }) =>
    postAction('document-pdf', { action: 'CREATE_PDF', token: session_key, id }, LONG_TIMEOUT_MS),
};
