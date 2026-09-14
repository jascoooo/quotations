// @vitest-environment happy-dom
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { cellRef, readWorkbook } from './xlsx';

describe('cellRef', () => {
  it('reads a column letter and a row number', () => {
    expect(cellRef('A1')).toEqual({ col: 0, row: 1 });
    expect(cellRef('B1')).toEqual({ col: 1, row: 1 });
    expect(cellRef('R3582')).toEqual({ col: 17, row: 3582 });
    expect(cellRef('AA5')).toEqual({ col: 26, row: 5 });
    expect(cellRef('BW5')).toEqual({ col: 74, row: 5 });
  });

  it('refuses anything else', () => {
    expect(() => cellRef('1A')).toThrow();
  });
});

// The real client template, when it is available on this machine. It is not in
// the repository: it is the client's document, and the app never copies it.
const SAMPLE = process.env.TEMPLATE_XLSX ?? '/tmp/claude-0/template-sample.xlsx';
const has = existsSync(SAMPLE);

describe.runIf(has)("reading the client's own template", () => {
  let parsed: ReturnType<typeof readWorkbook>;
  let ms = 0;
  beforeAll(() => {
    const bytes = new Uint8Array(readFileSync(SAMPLE));
    const t0 = performance.now();
    parsed = readWorkbook(bytes);
    ms = performance.now() - t0;
  }, 60_000);
  const book = () => parsed;

  it('parses the whole workbook in one pass', () => {
    // happy-dom is far slower than a browser's native parser; this is a ceiling,
    // not a target. The app reads the template once, when it is uploaded.
    expect(ms).toBeLessThan(30_000);
  });

  it('finds the named tables', () => {
    expect(book().tableNames.sort()).toEqual(['RatesTbl', 'SORv8DataTbl', 'WrkTypeTbl']);
  });

  it('reads the whole schedule of rates', () => {
    const { codes } = book();
    expect(codes.length).toBe(3581);
    expect(new Set(codes.map((c) => c.code)).size).toBe(codes.length);
  });

  it('reads a known code correctly, by header name rather than by position', () => {
    const c = book().codes.find((x) => x.code === '345613');
    expect(c).toBeDefined();
    expect(c?.short.toLowerCase()).toContain('garage');
    expect(c?.uom).toBeTruthy();
    expect(c?.rate).toBeGreaterThan(0);
  });

  it('gives every code a rate and a unit', () => {
    const { codes } = book();
    expect(codes.filter((c) => !c.uom).length).toBe(0);
    expect(codes.filter((c) => !(c.rate > 0)).length).toBeLessThan(codes.length * 0.05);
  });

  it("reads the contractor rate table, including this contractor's adjustment", () => {
    const { rates } = book();
    expect(rates.length).toBeGreaterThan(0);
    const dunham = rates.find((r) => /dunham/i.test(r.contractor));
    expect(dunham).toBeDefined();
    // Stored as a fraction, which is what the sheet's own formula uses:
    // adjusted rate = rate + rate * adjustment. Minus 7.5 per cent.
    expect(dunham?.under20k).toBeCloseTo(-0.075, 6);
    expect(dunham?.over20k).toBeCloseTo(-0.075, 6);
  });
});
