import { describe, expect, it } from 'vitest';
import { buildOfficeScript } from './officeScript';
import type { CellWrite } from './template';

const writes: CellWrite[] = [
  { sheet: 'Main Sheet', address: 'H5', value: 'R Dunham' },
  { sheet: 'Main Sheet', address: 'H13', value: 46279, numberFormat: 'dd/mm/yyyy' },
  { sheet: 'Main Sheet', address: 'BG9', value: true },
  { sheet: 'Continuation Sheet', address: 'N8', value: '345613' },
];

describe('buildOfficeScript', () => {
  const script = buildOfficeScript(writes, 'quote.xlsx');

  it('is a complete Office Script with the expected entry point', () => {
    expect(script).toContain('function main(workbook: ExcelScript.Workbook)');
    expect(script.match(/\{/g)?.length).toBe(script.match(/\}/g)?.length);
  });

  it('carries every cell, with its sheet and address', () => {
    for (const w of writes) {
      expect(script).toContain(`sheet: ${JSON.stringify(w.sheet)}`);
      expect(script).toContain(`cell: ${JSON.stringify(w.address)}`);
    }
    // Count only data rows: the type annotation above them also reads "{ sheet:".
    expect(script.match(/\{ sheet: "/g)?.length).toBe(writes.length);
  });

  it('keeps the three value types distinct, so Excel stores them as they are meant', () => {
    expect(script).toContain('value: "R Dunham"');
    expect(script).toContain('value: 46279');
    expect(script).toContain('value: true');
  });

  it('applies a number format only where one was given', () => {
    expect(script).toContain('format: "dd/mm/yyyy"');
    expect(script.match(/format:/g)?.length).toBe(1);
  });

  it('escapes a value that would otherwise break the script', () => {
    const nasty = buildOfficeScript([{ sheet: 'Main Sheet', address: 'C22', value: 'Renew "front" door\\back' }], 'q.xlsx');
    expect(nasty).toContain(String.raw`value: "Renew \"front\" door\\back"`);
  });

  it('names the file it was generated for, so the right copy gets it', () => {
    expect(script).toContain('quote.xlsx');
  });

  it('never re-saves anything: it only sets values and formats', () => {
    expect(script).not.toMatch(/\b(delete|insert|addWorksheet|clear|remove)\w*\(/i);
    expect(script).toContain('range.setValue(w.value)');
  });
});
