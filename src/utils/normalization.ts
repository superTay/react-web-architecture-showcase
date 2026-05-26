// ============================================================
// Identifier normalization — JS mirror of the SQL functions
// `normalize_identifier` and `pick_client_identifier`.
// ============================================================
// Kept in lock-step with the database so the frontend computes the
// SAME canonical identifier key the DB uses. This lets the UI detect
// collisions BEFORE calling the UPSERT and surface "this client
// already exists" suggestions to the user.
//
// The SQL functions are the source of truth. If these JS helpers
// diverge, the frontend would detect different collisions than the DB
// → duplicate client records. The unit tests pin the JS-side contract.
// ============================================================

/**
 * Normalizes a textual identifier: UPPER + strip spaces/dashes/dots.
 * Equivalent to `normalize_identifier(raw)` in SQL.
 * Returns null if the result is empty.
 */
export function normalizeIdentifier(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).toUpperCase().replace(/[\s\-.]/g, '');
  return trimmed === '' ? null : trimmed;
}

/**
 * Cascade: returns the canonical key for a client.
 * Equivalent to `pick_client_identifier(...)` in SQL.
 *
 * Priority:
 *   1. 'nif:XXX'    (normalize_identifier of the tax id)
 *   2. 'email:xx'   (lowercase + trim of the email)
 *   3. 'tel:XXX'    (normalize_identifier of the phone)
 *   4. 'nom:XXX:CP' (normalize_identifier of the name + optional postcode)
 *   5. null         (should not happen: name is NOT NULL in the DB)
 */
export function pickClientIdentifier(input: {
  nif?: string | null;
  email?: string | null;
  telefono?: string | null;
  nombre?: string | null;
  cp?: string | null;
}): string | null {
  const nif = normalizeIdentifier(input.nif);
  if (nif) return `nif:${nif}`;

  const emailTrim = String(input.email ?? '').trim().toLowerCase();
  if (emailTrim) return `email:${emailTrim}`;

  const tel = normalizeIdentifier(input.telefono);
  if (tel) return `tel:${tel}`;

  const nombre = normalizeIdentifier(input.nombre);
  if (nombre) {
    const cpTrim = String(input.cp ?? '').trim();
    return `nom:${nombre}:${cpTrim}`;
  }

  return null;
}
