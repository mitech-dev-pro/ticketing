// The return shape every Server Action uses (CLAUDE.md "Architecture rules"). Forms
// reuse the same Zod schema on the client, so `fieldErrors` keys line up with field
// names from that schema.

export type ActionResult<T> =
  { ok: true; data: T } | { ok: false; fieldErrors: Record<string, string[]> };

/** Wraps a top-level (non-field) failure under a `_form` key, the react-hook-form convention. */
export function formError<T>(message: string): ActionResult<T> {
  return { ok: false, fieldErrors: { _form: [message] } };
}
