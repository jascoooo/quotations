// Same maths as the client's sheet. Kept separate so it can be tested against
// the numbers in a real filled template.
//
// Main Sheet:   AN = ROUND(SOR rate, 2); AR = AN + AN * adjustment; AV = Qty * AR
//               BW5 = SUM(base rate * qty) over the Main Sheet lines only
//               CA5 = "Yes" (under 20k) when BW5 < 20,000 — this decides which adjustment applies
// Continuation: 46 more lines, same columns, using the Main Sheet's adjustment
// Non SOR:      AV = Qty * Rate
// Total cost    = Main Sheet total + Continuation total + Non SOR total

import type { NonSorLine, RateAdjustment, SorCode, SorLine } from './types';

export const MAIN_SHEET_LINES = 31; // rows 33..63
export const CONTINUATION_LINES = 46; // rows 8..53
export const NON_SOR_LINES = 46; // rows 8..53
export const UNDER_20K_THRESHOLD = 20000;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface PricedLine extends SorLine {
  found: boolean;
  short: string;
  element: string;
  uom: string;
  baseRate: number;
  adjustedRate: number;
  lineValue: number;
  sheet: 'main' | 'continuation';
}

export interface QuoteTotals {
  adjustment: number;
  under20k: boolean;
  mainBaseTotal: number;
  mainTotal: number;
  continuationTotal: number;
  nonSorTotal: number;
  total: number;
  lines: PricedLine[];
  overflow: number; // SOR lines beyond what the two sheets can hold
}

export function pickAdjustment(rates: RateAdjustment[], contractor: string, under20k: boolean): number {
  const r = rates.find((x) => x.contractor.trim().toLowerCase() === contractor.trim().toLowerCase());
  if (!r) return 0;
  return under20k ? r.under20k : r.over20k;
}

export function priceQuote(
  sorLines: SorLine[],
  nonSorLines: NonSorLine[],
  codes: Map<string, SorCode>,
  rates: RateAdjustment[],
  contractor: string,
): QuoteTotals {
  const capacity = MAIN_SHEET_LINES + CONTINUATION_LINES;
  const kept = sorLines.slice(0, capacity);
  const overflow = Math.max(0, sorLines.length - capacity);

  // Base totals decide the adjustment band, using the Main Sheet lines only (as the sheet does).
  let mainBaseTotal = 0;
  kept.forEach((l, i) => {
    if (i >= MAIN_SHEET_LINES) return;
    const c = codes.get(l.code);
    if (c) mainBaseTotal += round2(c.rate) * l.qty;
  });
  const under20k = mainBaseTotal < UNDER_20K_THRESHOLD;
  const adjustment = pickAdjustment(rates, contractor, under20k);

  const lines: PricedLine[] = kept.map((l, i) => {
    const c = codes.get(l.code);
    const baseRate = c ? round2(c.rate) : 0;
    const adjustedRate = c ? baseRate + baseRate * adjustment : 0;
    const lineValue = c ? l.qty * adjustedRate : 0;
    return {
      ...l,
      found: !!c,
      short: c?.short ?? '',
      element: c?.element ?? '',
      uom: c?.uom ?? '-',
      baseRate,
      adjustedRate,
      lineValue,
      sheet: i < MAIN_SHEET_LINES ? 'main' : 'continuation',
    };
  });

  const mainTotal = lines.filter((l) => l.sheet === 'main').reduce((s, l) => s + l.lineValue, 0);
  const continuationTotal = lines.filter((l) => l.sheet === 'continuation').reduce((s, l) => s + l.lineValue, 0);
  const nonSorTotal = nonSorLines.slice(0, NON_SOR_LINES).reduce((s, l) => s + l.qty * l.rate, 0);
  return {
    adjustment,
    under20k,
    mainBaseTotal,
    mainTotal,
    continuationTotal,
    nonSorTotal,
    total: mainTotal + continuationTotal + nonSorTotal,
    lines,
    overflow,
  };
}

export function gbp(n: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(round2(n));
}
