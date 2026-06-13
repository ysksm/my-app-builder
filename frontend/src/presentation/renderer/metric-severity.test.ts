import { describe, expect, it } from 'vitest';
import { severityOf, type MetricThresholds } from './NodeRenderer';

const T = (p: Partial<MetricThresholds> = {}): MetricThresholds => ({
  warnAbove: null, critAbove: null, warnBelow: null, critBelow: null, ...p,
});

describe('severityOf(しきい値アラート FR-RT-04)', () => {
  it('しきい値未設定なら常に normal(0 として誤判定しない)', () => {
    expect(severityOf(0, T())).toBe('normal');
    expect(severityOf(-50, T())).toBe('normal');
    expect(severityOf(9999, T())).toBe('normal');
  });

  it('上限: warnAbove/critAbove は「以上」で発火し crit を優先', () => {
    const t = T({ warnAbove: 70, critAbove: 90 });
    expect(severityOf(69.9, t)).toBe('normal');
    expect(severityOf(70, t)).toBe('warn');
    expect(severityOf(89.9, t)).toBe('warn');
    expect(severityOf(90, t)).toBe('crit');
    expect(severityOf(100, t)).toBe('crit');
  });

  it('下限: warnBelow/critBelow は「以下」で発火(低アラーム)', () => {
    const t = T({ warnBelow: 20, critBelow: 10 });
    expect(severityOf(21, t)).toBe('normal');
    expect(severityOf(20, t)).toBe('warn');
    expect(severityOf(10, t)).toBe('crit');
  });

  it('上下限の併用: どちらかの crit が立てば crit', () => {
    const t = T({ warnAbove: 70, critAbove: 90, warnBelow: 20, critBelow: 10 });
    expect(severityOf(5, t)).toBe('crit');
    expect(severityOf(50, t)).toBe('normal');
    expect(severityOf(95, t)).toBe('crit');
  });
});
