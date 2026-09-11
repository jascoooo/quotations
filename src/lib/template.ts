// Where each value goes in the client's template. The template is never
// re-saved by a library: these writes are applied by Excel itself (Office
// Script in Layer A, the Graph workbook API in Layer B), so formulas,
// tables, dropdowns and hidden sheets stay exactly as the client supplied them.
//
// Cell addresses come from Sanctuary's Extra Works Request V1.0 (2025).

import type { Quote } from './types';
import { CONTINUATION_LINES, MAIN_SHEET_LINES, NON_SOR_LINES } from './pricing';

export type SheetName = 'Main Sheet' | 'Continuation Sheet' | 'Non SOR Works';

export interface CellWrite {
  sheet: SheetName;
  address: string;
  value: string | number | boolean;
  /** Excel number format to apply, for dates. */
  numberFormat?: string;
}

export const MAIN_HEADER = {
  contractor: 'H5',
  contactName: 'H7',
  contactPhone: 'H9',
  email: 'H11',
  date: 'H13',
  functionalLocation: 'AC5',
  propertyAddress: 'AC7',
  locationOfWorks: 'AC13',
  typeOfWorks: 'AC15',
  requestVersion: 'AV5',
  purchaseOrder: 'AV7',
  workOrder: 'AV9',
  dateIssued: 'AV11',
  quoteRef: 'AV13',
  emergency: 'BG5',
  urgent: 'BG7',
  routine: 'BG9',
  summary: 'C22',
} as const;

export const MAIN_FIRST_ROW = 33; // ..63
export const CONTINUATION_FIRST_ROW = 8; // ..53
export const NON_SOR_FIRST_ROW = 8; // ..53

/** Days since 1899-12-30, the serial Excel uses for dates. */
export function excelSerial(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d);
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((utc - epoch) / 86400000);
}

const DATE_FORMAT = 'dd/mm/yyyy';

export function buildCellMap(q: Quote): CellWrite[] {
  const w: CellWrite[] = [];
  const main = (address: string, value: string | number | boolean, numberFormat?: string) => {
    if (value === '' || value === undefined || value === null) return;
    w.push({ sheet: 'Main Sheet', address, value, numberFormat });
  };
  main(MAIN_HEADER.contractor, q.contractor);
  main(MAIN_HEADER.contactName, q.contactName);
  main(MAIN_HEADER.contactPhone, q.contactPhone);
  main(MAIN_HEADER.email, q.email);
  if (q.date) main(MAIN_HEADER.date, excelSerial(q.date), DATE_FORMAT);
  main(MAIN_HEADER.functionalLocation, q.functionalLocation);
  main(MAIN_HEADER.propertyAddress, q.propertyAddress);
  main(MAIN_HEADER.locationOfWorks, q.locationOfWorks);
  main(MAIN_HEADER.typeOfWorks, q.typeOfWorks);
  main(MAIN_HEADER.requestVersion, q.requestVersion);
  main(MAIN_HEADER.purchaseOrder, q.purchaseOrder);
  main(MAIN_HEADER.workOrder, q.workOrder);
  if (q.dateIssued) main(MAIN_HEADER.dateIssued, excelSerial(q.dateIssued), DATE_FORMAT);
  main(MAIN_HEADER.quoteRef, q.quoteRef);
  w.push({ sheet: 'Main Sheet', address: MAIN_HEADER.emergency, value: q.priority === 'Emergency' });
  w.push({ sheet: 'Main Sheet', address: MAIN_HEADER.urgent, value: q.priority === 'Urgent' });
  w.push({ sheet: 'Main Sheet', address: MAIN_HEADER.routine, value: q.priority === 'Routine' });
  main(MAIN_HEADER.summary, q.summary);

  q.sorLines.slice(0, MAIN_SHEET_LINES + CONTINUATION_LINES).forEach((line, i) => {
    const onMain = i < MAIN_SHEET_LINES;
    const sheet: SheetName = onMain ? 'Main Sheet' : 'Continuation Sheet';
    const row = onMain ? MAIN_FIRST_ROW + i : CONTINUATION_FIRST_ROW + (i - MAIN_SHEET_LINES);
    w.push({ sheet, address: `N${row}`, value: Number(line.code) || line.code });
    w.push({ sheet, address: `Q${row}`, value: line.qty });
    if (line.comment) w.push({ sheet, address: `AZ${row}`, value: line.comment });
  });

  q.nonSorLines.slice(0, NON_SOR_LINES).forEach((line, i) => {
    const row = NON_SOR_FIRST_ROW + i;
    const sheet: SheetName = 'Non SOR Works';
    w.push({ sheet, address: `C${row}`, value: line.works });
    w.push({ sheet, address: `N${row}`, value: line.qty });
    w.push({ sheet, address: `P${row}`, value: line.description });
    w.push({ sheet, address: `AO${row}`, value: line.uom });
    w.push({ sheet, address: `AR${row}`, value: line.rate });
    if (line.comment) w.push({ sheet, address: `AZ${row}`, value: line.comment });
  });
  return w;
}

function slug(s: string): string {
  return s
    .replace(/[,.'"()]+/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

/** Short reference used at the front of the filename. Stable for a given work order and version. */
export function shortRef(workOrder: string, version: number): string {
  let h = 2166136261;
  const s = `${workOrder}:${version}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** {ref}-{PO}_{work order}_{address}_{job}_{postcode}.xlsx, as in the client's example. */
export function buildQuoteFileName(opts: {
  ref: string;
  purchaseOrder: string;
  workOrder: string;
  address: string;
  job: string;
  postcode: string;
}): string {
  const addr = slug(opts.address.split(/[,\n]/)[0] ?? opts.address);
  return `${opts.ref}-${opts.purchaseOrder}_${opts.workOrder}_${addr}_${slug(opts.job)}_${slug(opts.postcode)}.xlsx`;
}
