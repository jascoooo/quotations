// SOR code search and suggestion. Deterministic word matching over the code
// descriptions read from the client's own template at run time. A small local
// embedding model can be layered on later for paraphrases; nothing leaves the PC.

import type { SorCode } from './types';

const STOP = new Set(
  'the and to of a an in on for with as at be is are was were or it its this that by from all any we our will would need needs required require carry out please also then than into onto up down over under per each new old can could should may might has have had been being do does did not no yes if so such via etc which who whom whose when where while'.split(' '),
);

export function stem(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
  if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('es') && w.length > 4 && !w.endsWith('ses')) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map(stem);
}

interface Entry {
  code: SorCode;
  shortTokens: Set<string>;
  otherTokens: Set<string>;
  shortText: string;
}

export interface SorIndex {
  entries: Entry[];
  byCode: Map<string, SorCode>;
}

export interface SorHit {
  code: SorCode;
  score: number;
  matched: string[];
}

export function buildIndex(codes: SorCode[]): SorIndex {
  const entries = codes.map((code) => ({
    code,
    shortTokens: new Set(tokenize(code.short)),
    otherTokens: new Set(tokenize([code.medium ?? '', code.element, code.section ?? '', code.subsection ?? ''].join(' '))),
    shortText: code.short.toLowerCase(),
  }));
  return { entries, byCode: new Map(codes.map((c) => [c.code, c])) };
}

export function searchSor(index: SorIndex, query: string, limit = 10): SorHit[] {
  const q = query.trim();
  if (!q) return [];
  if (/^\d{3,}$/.test(q)) {
    return index.entries
      .filter((e) => e.code.code.startsWith(q))
      .slice(0, limit)
      .map((e) => ({ code: e.code, score: 10, matched: [q] }));
  }
  const qTokens = Array.from(new Set(tokenize(q)));
  if (qTokens.length === 0) return [];
  const phrase = q.toLowerCase().replace(/\s+/g, ' ');
  const hits: SorHit[] = [];
  for (const e of index.entries) {
    let score = 0;
    const matched: string[] = [];
    for (const t of qTokens) {
      if (e.shortTokens.has(t)) {
        score += 3;
        matched.push(t);
        continue;
      }
      if (e.otherTokens.has(t)) {
        score += 1.5;
        matched.push(t);
        continue;
      }
      if (t.length >= 4) {
        let pre = false;
        for (const st of e.shortTokens) if (st.startsWith(t) || t.startsWith(st) && st.length >= 4) { pre = true; break; }
        if (pre) { score += 1.5; matched.push(t); continue; }
        for (const ot of e.otherTokens) if (ot.startsWith(t)) { pre = true; break; }
        if (pre) { score += 0.75; matched.push(t); }
      }
    }
    if (score === 0) continue;
    if (e.shortText.includes(phrase)) score += 4;
    // Prefer codes where most of the query matched, then the more specific (shorter) description.
    score += (matched.length / qTokens.length) * 2 + matched.length / Math.max(1, e.shortTokens.size);
    hits.push({ code: e.code, score, matched });
  }
  hits.sort((a, b) => b.score - a.score || a.code.code.localeCompare(b.code.code));
  return hits.slice(0, limit);
}

/** Codes whose descriptions overlap the wording of an engineer's report. */
export function suggestFromReport(index: SorIndex, report: string, limit = 6): SorHit[] {
  const rTokens = new Set(tokenize(report));
  if (rTokens.size === 0) return [];
  const hits: SorHit[] = [];
  for (const e of index.entries) {
    const matched: string[] = [];
    let score = 0;
    for (const t of e.shortTokens) if (rTokens.has(t)) { matched.push(t); score += 2; }
    for (const t of e.otherTokens) if (rTokens.has(t) && !matched.includes(t)) { matched.push(t); score += 0.5; }
    // Need at least two words from the short description to count.
    const shortHits = matched.filter((m) => e.shortTokens.has(m)).length;
    if (shortHits < 2) continue;
    score += shortHits / Math.max(1, e.shortTokens.size);
    hits.push({ code: e.code, score, matched });
  }
  hits.sort((a, b) => b.score - a.score || a.code.code.localeCompare(b.code.code));
  return hits.slice(0, limit);
}
