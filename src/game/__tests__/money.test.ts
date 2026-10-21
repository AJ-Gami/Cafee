import { describe, expect, it } from 'vitest';
import { applyBps, formatRM, marginPercent, mulDivRound, parseRinggit, senToInput } from '../money';

describe('money helpers', () => {
  it('formats sen as Malaysian Ringgit', () => {
    expect(formatRM(0)).toBe('RM0.00');
    expect(formatRM(350)).toBe('RM3.50');
    expect(formatRM(500_000)).toBe('RM5,000.00');
    expect(formatRM(123_456_789)).toBe('RM1,234,567.89');
    expect(formatRM(-1_250)).toBe('−RM12.50');
    expect(formatRM(1_250, { signed: true })).toBe('+RM12.50');
    expect(formatRM(500_000, { trimZeroSen: true })).toBe('RM5,000');
  });

  it('parses player input without floating point', () => {
    expect(parseRinggit('7')).toBe(700);
    expect(parseRinggit('7.5')).toBe(750);
    expect(parseRinggit('7.05')).toBe(705);
    expect(parseRinggit('RM 3,50')).toBe(350);
    expect(parseRinggit('0.10')).toBe(10);
    expect(parseRinggit('abc')).toBeNull();
    expect(parseRinggit('1.234')).toBeNull();
    expect(parseRinggit('-3')).toBeNull();
    expect(senToInput(705)).toBe('7.05');
  });

  it('rounds integer ratios correctly', () => {
    expect(mulDivRound(10, 1, 3)).toBe(3);
    expect(mulDivRound(20, 1, 3)).toBe(7);
    expect(mulDivRound(5, 1, 2)).toBe(3); // half rounds up
    expect(applyBps(10_000, 500)).toBe(500);
    expect(applyBps(999, 500)).toBe(50);
    expect(applyBps(-999, 500)).toBe(-50);
    expect(Number.isInteger(applyBps(1_234_567, 777))).toBe(true);
  });

  it('computes margin percentage', () => {
    expect(marginPercent(700, 220)).toBe(68.6);
    expect(marginPercent(0, 100)).toBe(0);
  });
});
