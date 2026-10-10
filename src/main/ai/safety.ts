// docs/06 §6.6 — response safety filter.
export const BLOCKED_MESSAGE = 'Response blocked by the safety filter. Try again.';
const BAD = /\b(you should (buy|sell|enter|hold)|buy now|sell now|guaranteed|will (go up|moon|pump|10x)|financial advice:)/i;
const URL_RE = /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|io|xyz|org|net|app)\b\/?/i;
export const MAX_WORDS = 400;
export function isResponseSafe(text: string): boolean {
  if (BAD.test(text)) return false;
  if (URL_RE.test(text)) return false;
  if (text.trim().split(/\s+/).length > MAX_WORDS) return false;
  return true;
}
