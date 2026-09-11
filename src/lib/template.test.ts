import { describe, expect, it } from 'vitest';
import { buildCellMap, buildQuoteFileName, excelSerial, shortRef } from './template';
import type { Quote } from './types';

const quote: Quote = {
  version: 1,
  contractor: 'R Dunham',
  contactName: 'Bill Beach',
  contactPhone: '0208 7091700',
  email: 'admin@r-dunham.example',
  date: '2026-08-24',
  functionalLocation: '',
  propertyAddress: '31 Cathedral Drive, Basildon,SS15 5WF',
  locationOfWorks: 'Garage Door',
  typeOfWorks: 'Quoted Works',
  requestVersion: 1,
  purchaseOrder: '4501849778',
  workOrder: 'SANC004958',
  dateIssued: '2026-08-11',
  quoteRef: '',
  priority: 'Routine',
  summary: 'Attended on 24/08/2026 to assess garage door.',
  sorLines: [
    { code: '345613', qty: 1 },
    { code: '345611', qty: 1 },
  ],
  nonSorLines: [{ works: 'Labour', qty: 4, description: 'Size of garage door requires 2 engineers', uom: 'HR', rate: 34 }],
};

describe('buildCellMap', () => {
  const map = buildCellMap(quote);
  const at = (sheet: string, address: string) => map.find((w) => w.sheet === sheet && w.address === address)?.value;
  it('writes the header cells where the template expects them', () => {
    expect(at('Main Sheet', 'H5')).toBe('R Dunham');
    expect(at('Main Sheet', 'H7')).toBe('Bill Beach');
    expect(at('Main Sheet', 'AC7')).toBe('31 Cathedral Drive, Basildon,SS15 5WF');
    expect(at('Main Sheet', 'AV9')).toBe('SANC004958');
    expect(at('Main Sheet', 'AV7')).toBe('4501849778');
    expect(at('Main Sheet', 'C22')).toMatch(/^Attended/);
  });
  it('writes dates as Excel serials with a UK format', () => {
    const w = map.find((x) => x.address === 'H13');
    expect(w?.value).toBe(excelSerial('2026-08-24'));
    expect(w?.numberFormat).toBe('dd/mm/yyyy');
    expect(excelSerial('1899-12-31')).toBe(1);
  });
  it('ticks exactly one priority box', () => {
    expect(at('Main Sheet', 'BG5')).toBe(false);
    expect(at('Main Sheet', 'BG7')).toBe(false);
    expect(at('Main Sheet', 'BG9')).toBe(true);
  });
  it('puts SOR codes and quantities in rows 33 onwards, as numbers', () => {
    expect(at('Main Sheet', 'N33')).toBe(345613);
    expect(at('Main Sheet', 'Q33')).toBe(1);
    expect(at('Main Sheet', 'N34')).toBe(345611);
  });
  it('puts non-SOR lines on their own sheet from row 8', () => {
    expect(at('Non SOR Works', 'C8')).toBe('Labour');
    expect(at('Non SOR Works', 'N8')).toBe(4);
    expect(at('Non SOR Works', 'AO8')).toBe('HR');
    expect(at('Non SOR Works', 'AR8')).toBe(34);
  });
  it('spills line 32 to the continuation sheet row 8', () => {
    const big = { ...quote, sorLines: Array.from({ length: 32 }, () => ({ code: '345602', qty: 1 })) };
    const m = buildCellMap(big);
    expect(m.find((w) => w.sheet === 'Continuation Sheet' && w.address === 'N8')?.value).toBe(345602);
    expect(m.find((w) => w.sheet === 'Main Sheet' && w.address === 'N64')).toBeUndefined();
  });
});

describe('buildQuoteFileName', () => {
  it('reproduces the client-supplied example filename', () => {
    const name = buildQuoteFileName({ ref: '123b27db', purchaseOrder: '4501849778', workOrder: 'SANC004958', address: '31 Cathedral Drive, Basildon', job: 'Garage door', postcode: 'SS15 5WF' });
    expect(name).toBe('123b27db-4501849778_SANC004958_31_Cathedral_Drive_Garage_door_SS15_5WF.xlsx');
  });
  it('gives a stable short reference', () => {
    expect(shortRef('SANC004958', 1)).toBe(shortRef('SANC004958', 1));
    expect(shortRef('SANC004958', 1)).not.toBe(shortRef('SANC004958', 2));
    expect(shortRef('SANC004958', 1)).toMatch(/^[0-9a-f]{8}$/);
  });
});
