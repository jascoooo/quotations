// Deterministic extraction of the references that identify a Sanctuary job.
// These are fixed patterns; no model is involved and nothing is guessed.

export const WORK_ORDER_RE = /(?<![A-Za-z0-9])SANC\s?\d{6}(?![A-Za-z0-9])/gi;
export const PURCHASE_ORDER_RE = /(?<![A-Za-z0-9])45\d{8}(?![A-Za-z0-9])/g; // Sanctuary POs are 10 digits starting 45 (SAP)
export const ANY_10_DIGIT_RE = /\b\d{10}\b/g;
// UK postcode, outward + inward, tolerant of a missing space.
export const POSTCODE_RE = /(?<![A-Za-z0-9])([A-Z]{1,2}\d[A-Z\d]?)\s?(\d[A-Z]{2})(?![A-Za-z0-9])/gi;

export interface FoundRefs {
  workOrders: string[];
  purchaseOrders: string[];
  postcodes: string[];
}

export function normaliseWorkOrder(s: string): string {
  return s.replace(/\s+/g, '').toUpperCase();
}

export function normalisePostcode(s: string): string {
  const m = s.replace(/\s+/g, '').toUpperCase().match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  return m ? `${m[1]} ${m[2]}` : s.trim().toUpperCase();
}

function unique(xs: string[]): string[] {
  return Array.from(new Set(xs));
}

export function findRefs(text: string): FoundRefs {
  const workOrders = unique((text.match(WORK_ORDER_RE) ?? []).map(normaliseWorkOrder));
  const purchaseOrders = unique(text.match(PURCHASE_ORDER_RE) ?? []);
  const postcodes = unique(Array.from(text.matchAll(POSTCODE_RE)).map((m) => normalisePostcode(m[0])));
  return { workOrders, purchaseOrders, postcodes };
}

/** Normalise an address for comparison: lower case, no punctuation, single spaces. */
export function normaliseAddress(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first line of an address ("31 Cathedral Drive") — enough to recognise it in prose. */
export function addressFirstLine(address: string): string {
  const first = address.split(/[,\n]/)[0] ?? address;
  return normaliseAddress(first);
}

/** Does the text mention this address (by first line or by postcode)? */
export function mentionsAddress(text: string, address: string, postcode: string): 'address' | 'postcode' | null {
  const t = normaliseAddress(text);
  const first = addressFirstLine(address);
  if (first.length >= 6 && t.includes(first)) return 'address';
  const pcs = findRefs(text).postcodes;
  if (postcode && pcs.includes(normalisePostcode(postcode))) return 'postcode';
  return null;
}
