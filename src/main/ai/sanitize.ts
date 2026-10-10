// docs/06 §6.6 — token-derived text is attacker-controlled. Sanitize before it goes anywhere near a model.
const REDACT_RE = /(ignore|instruction|system|assistant|prompt|http)/i;
export const REDACTED = '[redacted name]';

function strip(s: string): string {
  return s
    .normalize('NFKC')
    // keep printable ASCII + basic Latin letters with accents; drop everything else (control, emoji, RTL tricks, zero-width)
    .replace(/[^\x20-\x7EÀ-ɏ]/g, ' ')
    .replace(/[`{}<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
/** Symbol / name fields: strip, check for injection keywords on the FULL cleaned text, then cut to 24 chars. */
export function sanitizeName(raw: unknown): string {
  const s = strip(typeof raw === 'string' ? raw : '');
  if (!s) return '?';
  if (REDACT_RE.test(s)) return REDACTED;
  return s.slice(0, 24);
}
/** Free-text user question: same character stripping, 500 char cap. Keyword redaction is intentionally NOT applied (see QUESTIONS.md). */
export function sanitizeQuestion(raw: unknown): string {
  return strip(typeof raw === 'string' ? raw : '').slice(0, 500);
}
