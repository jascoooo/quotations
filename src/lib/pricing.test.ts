import { describe, expect, it } from 'vitest';
import { priceQuote, round2 } from './pricing';
import type { RateAdjustment, SorCode } from './types';

// The six lines from the real filled example and its Non SOR labour line.
const codes = new Map<string, SorCode>(
  (
    [
      ['345613', 'GARAGE DOOR:RENEW ROLLERS AND CHANNELS', 'IT', 72.64],
      ['345611', 'GARAGE DOOR:RENEW LOCK TO UP AND OVER', 'NO', 26.47],
      ['345605', 'GARAGE DOOR:RENEW SPINDLE/ROLLER/CABLE', 'NO', 39.73],
      ['345601', 'GARAGE DOOR:REMOVE AND REFIX UP AND OVER', 'IT', 86.31],
      ['345602', 'GARAGE DOOR:EASE AND ADJUST UP AND OVER', 'IT', 36.28],
      ['345603', 'GARAGE DOOR:REPAIR UP AND OVER METAL', 'IT', 58.81],
    ] as const
  ).map(([code, short, uom, rate]) => [code, { code, short, element: 'Garage Doors and Frames', uom, rate }]),
);
const rates: RateAdjustment[] = [{ contractor: 'R Dunham', under20k: -0.075, over20k: -0.075 }];

describe('priceQuote', () => {
  it('reproduces the totals in the filled example', () => {
    const t = priceQuote(
      ['345613', '345611', '345605', '345601', '345602', '345603'].map((code) => ({ code, qty: 1 })),
      [{ works: 'Labour', qty: 4, description: '2 engineers', uom: 'HR', rate: 34 }],
      codes,
      rates,
      'R Dunham',
    );
    expect(t.adjustment).toBe(-0.075);
    expect(t.under20k).toBe(true);
    expect(round2(t.mainBaseTotal)).toBe(320.24);
    expect(round2(t.mainTotal)).toBe(296.22);
    expect(t.continuationTotal).toBe(0);
    expect(t.nonSorTotal).toBe(136);
    expect(round2(t.total)).toBe(432.22);
    expect(round2(t.lines[0].adjustedRate)).toBe(67.19);
  });
  it('spills line 32 onwards to the continuation sheet', () => {
    const lines = Array.from({ length: 33 }, () => ({ code: '345602', qty: 1 }));
    const t = priceQuote(lines, [], codes, rates, 'R Dunham');
    expect(t.lines.filter((l) => l.sheet === 'main')).toHaveLength(31);
    expect(t.lines.filter((l) => l.sheet === 'continuation')).toHaveLength(2);
    expect(t.overflow).toBe(0);
  });
  it('switches to the over-20k adjustment on the main sheet base total', () => {
    const r: RateAdjustment[] = [{ contractor: 'Test Co', under20k: 0.05, over20k: 0.04 }];
    const t = priceQuote([{ code: '345601', qty: 300 }], [], codes, r, 'Test Co'); // 86.31 * 300 = 25,893
    expect(t.under20k).toBe(false);
    expect(t.adjustment).toBe(0.04);
  });
  it('flags unknown codes instead of pricing them', () => {
    const t = priceQuote([{ code: '999999', qty: 1 }], [], codes, rates, 'R Dunham');
    expect(t.lines[0].found).toBe(false);
    expect(t.total).toBe(0);
  });
});
