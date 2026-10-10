// docs/06 §6.6 — OpenRouter free models. Local limiter + daily counter + fallback + cache. The API key never leaves main and is never logged.
import type { Db } from '../db/open';
import type { Result } from '../../shared/types';
import { ok, err } from '../../shared/types';
import { OPENROUTER_BASE } from '../../shared/constants';
import { getJson, postJson } from '../net/http';
import { TokenBucket } from '../net/tokenBucket';
import { SettingsStore } from '../settings/store';
import { buildAiContext } from './context';
import { SYSTEM_PROMPT, userMessage, type Preset } from './prompts';
import { sanitizeQuestion } from './sanitize';
import { isResponseSafe, BLOCKED_MESSAGE } from './safety';
import { getCache, putCache, aiUsedToday, countAiAttempt } from '../db/queries/ai';
import type { AiAnswer } from '../../shared/api';

export interface AiDeps { db: Db; settings: SettingsStore; now: () => number; getKey: () => string | null; bucket?: TokenBucket; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> }
export const LIMIT_MESSAGE = 'Daily free AI limit reached. Resets at midnight UTC.';

export class OpenRouterClient {
  private bucket: TokenBucket;
  constructor(private d: AiDeps) { this.bucket = d.bucket ?? new TokenBucket(1, 0.25); } // 1 request / 4 s

  /** Only ids ending with ':free'. */
  async listModels(): Promise<Result<{ id: string; name: string }[]>> {
    const r = await getJson(`${OPENROUTER_BASE}/models`, { fetchImpl: this.d.fetchImpl, sleep: this.d.sleep });
    if (!r.ok) return err('AI_FAIL', 'Could not load the model list.');
    const data = (r.value.json as { data?: unknown } | null)?.data;
    if (!Array.isArray(data)) return err('PARSE_FAIL', 'unexpected models response');
    return ok(data.flatMap((m) => {
      const o = m as { id?: unknown; name?: unknown };
      return typeof o.id === 'string' && o.id.endsWith(':free') ? [{ id: o.id, name: typeof o.name === 'string' ? o.name : o.id }] : [];
    }));
  }

  usage(): { today: number; limit: number; remaining: number } {
    const limit = this.d.settings.get('ai.dailyLimit'); const today = aiUsedToday(this.d.db, this.d.now());
    return { today, limit, remaining: Math.max(0, limit - today) };
  }

  async explain(tokenId: number, preset: Preset, question?: string): Promise<Result<AiAnswer>> {
    const { db, settings } = this.d; const now = this.d.now();
    if (!settings.get('ai.enabled')) return err('VALIDATION', 'The AI helper is turned off in Settings.');
    const key = this.d.getKey();
    if (!key) return err('VALIDATION', 'Add your OpenRouter key in Settings first.');
    const models = settings.get('ai.models');
    if (models.length === 0) return err('VALIDATION', 'Pick at least one free model in Settings.');
    const q = preset === 'custom' ? sanitizeQuestion(question) : '';
    if (preset === 'custom' && q.length < 3) return err('VALIDATION', 'Type a question first.');
    const built = buildAiContext(db, tokenId, now, settings.get('judge.defaultPositionUsd'));
    if (!built) return err('VALIDATION', 'No data for this token yet.');
    const cacheKey = preset === 'custom' ? `custom:${q}` : preset;
    const hit = getCache(db, tokenId, built.dataHash, cacheKey);
    if (hit) return ok({ text: hit.text, cached: true, model: hit.model, remainingToday: this.usage().remaining });

    const messages = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMessage(preset, built.ctx, q) }];
    let lastFail = 'No model answered.';
    for (const model of models) {
      if (this.usage().remaining <= 0) return err('AI_LIMIT', LIMIT_MESSAGE);
      const slot = await this.bucket.take(1, 0, 60_000);
      if (!slot.ok) return err('AI_FAIL', 'Too many requests too fast. Try again in a moment.');
      countAiAttempt(db, this.d.now()); // every attempt counts, including fallbacks
      const r = await postJson(`${OPENROUTER_BASE}/chat/completions`, { model, messages, temperature: 0.2, max_tokens: 700 },
        { headers: { Authorization: `Bearer ${key}` }, timeoutMs: 30_000, retries: 0, fetchImpl: this.d.fetchImpl, sleep: this.d.sleep });
      if (!r.ok) { lastFail = r.error.code; continue; } // 429/402/5xx/timeout -> next model
      const text = (r.value.json as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim()) { lastFail = 'empty'; continue; }
      if (!isResponseSafe(text)) return err('AI_FAIL', BLOCKED_MESSAGE); // not cached; counter not refunded
      putCache(db, tokenId, built.dataHash, cacheKey, model, text.trim(), this.d.now());
      return ok({ text: text.trim(), cached: false, model, remainingToday: this.usage().remaining });
    }
    return err('AI_FAIL', `AI request failed (${lastFail}). Try again later.`);
  }
}
