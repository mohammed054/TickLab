// All code reads time via clock.now() so tests can freeze it (docs/01 §1.5).
let frozen: number | null = null;
export const clock = {
  now(): number { return frozen ?? Date.now(); },
  freeze(ts: number): void { frozen = ts; },
  advance(ms: number): void { frozen = (frozen ?? Date.now()) + ms; },
  unfreeze(): void { frozen = null; },
};
