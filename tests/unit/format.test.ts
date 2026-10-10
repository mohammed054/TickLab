import { describe, it, expect } from 'vitest';
import { fmtUsd, fmtPrice, fmtPct, fmtAge, fmtAddr, fmtCompleteness, fmtDate, pctColor } from '../../src/shared/format';

describe('format (docs/05 §5.2)', () => {
  it('null -> dash everywhere', () => {
    for (const f of [fmtUsd, fmtPrice, fmtPct, fmtAge, fmtAddr, fmtCompleteness, fmtDate]) expect(f(null as never)).toBe('—');
    expect(fmtUsd(NaN)).toBe('—');
  });
  it('fmtUsd tiers', () => {
    expect(fmtUsd(1.234e9)).toBe('$1.23B');
    expect(fmtUsd(1.234e6)).toBe('$1.23M');
    expect(fmtUsd(12345)).toBe('$12.3K');
    expect(fmtUsd(12.345)).toBe('$12.35');
    expect(fmtUsd(0.5)).toBe('$0.5000');
  });
  it('fmtPrice incl. tiny prices', () => {
    expect(fmtPrice(12.3456)).toBe('12.35');
    expect(fmtPrice(0.0123456)).toBe('0.0123');
    expect(fmtPrice(0.00001234)).toBe('0.00001234');
    expect(fmtPrice(0.000000001234)).toBe('0.000000001234');
    expect(fmtPrice(1e-15)).toBe('0.000000000000');
  });
  it('fmtPct signs', () => {
    expect(fmtPct(4.2)).toBe('+4.2%');
    expect(fmtPct(-12)).toBe('-12.0%');
    expect(fmtPct(0)).toBe('0.0%');
    expect(fmtPct(12.34, false)).toBe('12.3%');
    expect(pctColor(1)).toBe('good'); expect(pctColor(-1)).toBe('bad'); expect(pctColor(0)).toBe('neutral');
  });
  it('fmtAge', () => {
    expect(fmtAge(45_000)).toBe('45s');
    expect(fmtAge(245_000)).toBe('4m 05s');
    expect(fmtAge((2 * 3600 + 14 * 60) * 1000)).toBe('2h 14m');
    expect(fmtAge((3 * 86400 + 4 * 3600) * 1000)).toBe('3d 4h');
  });
  it('fmtAddr / completeness / date', () => {
    expect(fmtAddr('7xKfABCDEFGHIJKLMNOP9aQp')).toBe('7xKf…9aQp');
    expect(fmtCompleteness(0.72)).toBe('72%');
    const now = new Date(2026, 9, 7, 12, 0, 0).getTime();
    expect(fmtDate(new Date(2026, 9, 7, 9, 5, 3).getTime(), now)).toBe('09:05:03');
    expect(fmtDate(new Date(2026, 9, 5, 9, 5, 3).getTime(), now)).toBe('05 Oct 09:05');
  });
});
