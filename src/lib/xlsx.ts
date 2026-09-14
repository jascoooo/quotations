// Reading the client's template in the browser, with no sign-in and no server.
//
// Only ever READS. The rule that the template must never be re-saved through a
// library still holds: writing an .xlsx with a library silently drops the
// INDIRECT data validations and the structured tables the form depends on.
// Reading touches nothing, so pulling the code list and the rate table out of
// the workbook this way is safe.
//
// An .xlsx is a zip of XML. We unzip it, find the named tables, work out which
// sheet each one lives on, and read the cells in its range.

import { unzipSync } from 'fflate';
import type { RateAdjustment, SorCode } from './types';

const dec = new TextDecoder();

interface TableRef {
  name: string;
  /** e.g. B1:R3582 */
  ref: string;
  /** e.g. xl/worksheets/sheet7.xml */
  sheetPath: string;
}

type Zip = Record<string, Uint8Array>;

function text(zip: Zip, path: string): string | null {
  const f = zip[path];
  return f ? dec.decode(f) : null;
}

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

/** "B12" -> { col: 1, row: 12 }, zero-based column. */
export function cellRef(ref: string): { col: number; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`Not a cell reference: ${ref}`);
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: Number(m[2]) };
}

/** Every table in the workbook, with the sheet it sits on. */
function findTables(zip: Zip): TableRef[] {
  const byTarget = new Map<string, string>(); // xl/tables/table2.xml -> xl/worksheets/sheet7.xml
  for (const path of Object.keys(zip)) {
    const m = /^xl\/worksheets\/_rels\/(sheet\d+\.xml)\.rels$/.exec(path);
    if (!m) continue;
    const rels = parseXml(text(zip, path) as string);
    for (const rel of Array.from(rels.getElementsByTagName('Relationship'))) {
      const target = rel.getAttribute('Target') ?? '';
      if (!target.includes('table')) continue;
      byTarget.set(`xl/${target.replace(/^\.\.\//, '')}`, `xl/worksheets/${m[1]}`);
    }
  }
  const out: TableRef[] = [];
  for (const path of Object.keys(zip)) {
    if (!/^xl\/tables\/table\d+\.xml$/.test(path)) continue;
    const doc = parseXml(text(zip, path) as string);
    const el = doc.documentElement;
    const name = el.getAttribute('name') ?? el.getAttribute('displayName') ?? '';
    const ref = el.getAttribute('ref') ?? '';
    const sheetPath = byTarget.get(path);
    if (name && ref && sheetPath) out.push({ name, ref, sheetPath });
  }
  return out;
}

function sharedStrings(zip: Zip): string[] {
  const xml = text(zip, 'xl/sharedStrings.xml');
  if (!xml) return [];
  const doc = parseXml(xml);
  return Array.from(doc.getElementsByTagName('si')).map((si) =>
    Array.from(si.getElementsByTagName('t'))
      .map((t) => t.textContent ?? '')
      .join(''),
  );
}

/** The cells of one table, as rows of plain strings. Row 0 is the header. */
function readTable(zip: Zip, table: TableRef, strings: string[]): string[][] {
  const [from, to] = table.ref.split(':').map(cellRef);
  const width = to.col - from.col + 1;
  const xml = text(zip, table.sheetPath);
  if (!xml) return [];
  const doc = parseXml(xml);
  const rows: string[][] = [];
  for (const row of Array.from(doc.getElementsByTagName('row'))) {
    const n = Number(row.getAttribute('r'));
    if (!n || n < from.row || n > to.row) continue;
    const out: string[] = new Array(width).fill('');
    for (const c of Array.from(row.getElementsByTagName('c'))) {
      const r = c.getAttribute('r');
      if (!r) continue;
      const { col } = cellRef(r);
      const i = col - from.col;
      if (i < 0 || i >= width) continue;
      const type = c.getAttribute('t');
      if (type === 'inlineStr') {
        out[i] = Array.from(c.getElementsByTagName('t'))
          .map((t) => t.textContent ?? '')
          .join('');
        continue;
      }
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      out[i] = type === 's' ? (strings[Number(v)] ?? '') : v;
    }
    rows[n - from.row] = out;
  }
  for (let i = 0; i < rows.length; i++) rows[i] ??= new Array(width).fill('');
  return rows;
}

export interface WorkbookData {
  codes: SorCode[];
  rates: RateAdjustment[];
  /** Names of the tables found, for reporting when one is missing. */
  tableNames: string[];
}

/**
 * Pull the schedule-of-rates code list and the contractor rate table out of the
 * client's workbook. Column positions are taken from the header names, not
 * guessed, so a re-ordered column in a future template still works.
 */
export function readWorkbook(bytes: Uint8Array): WorkbookData {
  const zip = unzipSync(bytes) as Zip;
  const tables = findTables(zip);
  const strings = sharedStrings(zip);
  const names = tables.map((t) => t.name);

  const sorTable = tables.find((t) => /^SOR/i.test(t.name));
  const codes: SorCode[] = [];
  if (sorTable) {
    const rows = readTable(zip, sorTable, strings);
    const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
    const at = (want: string, fallback: number) => {
      const i = header.findIndex((h) => h === want);
      return i === -1 ? fallback : i;
    };
    const iCode = at('document code', 0);
    const iShort = at('short description', 7);
    const iElement = at('element', 8);
    const iSection = at('section', 9);
    const iSub = at('subsection', 10);
    const iUom = at('uom', 11);
    const iRate = at('sor rate', 12);
    const iMedium = at('medium description', 13);
    for (const row of rows.slice(1)) {
      const code = (row[iCode] ?? '').trim();
      if (!code) continue;
      const rate = Number(row[iRate]);
      codes.push({
        code,
        short: (row[iShort] ?? '').trim(),
        medium: (row[iMedium] ?? '').trim() || undefined,
        element: (row[iElement] ?? '').trim(),
        section: (row[iSection] ?? '').trim() || undefined,
        subsection: (row[iSub] ?? '').trim() || undefined,
        uom: (row[iUom] ?? '').trim(),
        rate: Number.isFinite(rate) ? rate : 0,
      });
    }
  }

  const ratesTable = tables.find((t) => /rates/i.test(t.name));
  const rates: RateAdjustment[] = [];
  if (ratesTable) {
    const rows = readTable(zip, ratesTable, strings);
    for (const row of rows.slice(1)) {
      const contractor = (row[0] ?? '').trim();
      if (!contractor) continue;
      const under = Number(row[1]);
      const over = Number(row[2]);
      rates.push({ contractor, under20k: Number.isFinite(under) ? under : 0, over20k: Number.isFinite(over) ? over : 0 });
    }
  }

  return { codes, rates, tableNames: names };
}
