// Reading R Dunham's own extra-works tracker.
//
// The tracker is a plain spreadsheet the office keeps: one row per quote, with
// the row highlighted to show where it has got to, and a KEY sheet saying what
// each colour means. The app reads both, so it shows where every quote actually
// is rather than only the ones it has seen itself.
//
// The colour meanings are read from the KEY sheet, not hard-coded, so if the
// office adds or re-words a colour the app follows without a change here. Only
// the mapping from a meaning to one of the four board columns is our own, and
// the app shows that mapping so it can be checked.

import type { Stage } from './types';
import { readSheet, sheetNames } from './xlsx';

export interface LegendEntry {
  /** RRGGBB of the swatch on the KEY sheet. */
  colour: string;
  /** What the office wrote next to it. */
  meaning: string;
  /** Which board column that meaning corresponds to, if any. */
  stage?: Stage;
  /** A meaning that is about chasing rather than progress. */
  chase?: boolean;
}

export interface TrackerRow {
  /** 1-based row in the sheet, so a fix can be pointed at. */
  row: number;
  purchaseOrder: string;
  workOrder: string;
  address: string;
  assignedTo: string;
  workType: string;
  received: string;
  /** The quote has come back from whoever attended, so it is ours to act on. */
  hasQuote: boolean;
  /** Who attended and owes the quote, while it has not come back yet. */
  waitingOn?: string;
  /** The "EWRF Done" column: free text, usually initials and a date. */
  progress: string;
  notes: string;
  chased: string;
  colour?: string;
  meaning?: string;
  stage?: Stage;
  chase?: boolean;
}

export interface TrackerSummary {
  total: number;
  /** Quotes in from whoever attended, waiting on us. */
  withUs: number;
  /** Still with the company that attended. */
  waiting: number;
  /** In from them, but with no colour on the row: nobody has picked it up. */
  unflagged: number;
  byStage: Record<Stage, number>;
  /** Who owes us a quote, and how many. */
  waitingBy: { company: string; count: number }[];
}

export interface Tracker {
  rows: TrackerRow[];
  legend: LegendEntry[];
  /** Sheets that were present but not read. */
  ignored: string[];
  sheet: string;
}

/**
 * Turn a colour's written meaning into one of the four board columns.
 *
 * Deliberately keyword-based and forgiving: the office writes these by hand.
 * Anything it cannot place is left without a stage rather than guessed at, and
 * shown as-is in the app.
 */
export function stageForMeaning(meaning: string): { stage?: Stage; chase?: boolean } {
  const m = meaning.toLowerCase();
  if (/chas/.test(m)) return { chase: true };
  if (/quer|reject|amend|issue/.test(m)) return { stage: 'amend' };
  if (/ready to go|sent to admin|send off|to send/.test(m)) return { stage: 'ready' };
  if (/\bsent\b|issued|submitted/.test(m)) return { stage: 'sent' };
  if (/review|check/.test(m)) return { stage: 'amend' };
  if (/to do|to quote|awaiting|photos|outstanding/.test(m)) return { stage: 'review' };
  return {};
}

/** The colour swatches and their meanings from the KEY sheet. */
export function readLegend(bytes: Uint8Array, sheet: string): LegendEntry[] {
  const grid = readSheet(bytes, sheet);
  const out: LegendEntry[] = [];
  for (const row of grid) {
    if (!row) continue;
    const swatch = row.find((c) => c?.fill);
    const meaning = row
      .map((c) => c?.value ?? '')
      .find((v) => v.trim().length > 2);
    if (!swatch?.fill || !meaning) continue;
    out.push({ colour: swatch.fill, meaning: meaning.trim(), ...stageForMeaning(meaning) });
  }
  return out;
}

/** Match a header row to the columns we need, however they are worded. */
function columnsOf(header: { value: string }[]): Record<string, number> {
  const at = (...patterns: RegExp[]) => header.findIndex((c) => patterns.some((p) => p.test((c?.value ?? '').trim())));
  return {
    purchaseOrder: at(/^po\b/i, /purchase/i),
    workOrder: at(/^sh$/i, /work\s*order/i, /^sanc/i),
    address: at(/address/i),
    assignedTo: at(/assigned/i),
    received: at(/rec.?d/i),
    workType: at(/work\s*type/i, /^type/i),
    progress: at(/ewrf/i, /done/i, /progress/i, /status/i),
    notes: at(/notes/i),
    chased: at(/chased/i),
  };
}

const HAS_WORK_ORDER = /SANC\s?\d{6}/i;

/**
 * Read the tracker. The sheet to read and the key sheet are found by name
 * where possible, and everything else in the workbook is left alone.
 */
export function readTracker(bytes: Uint8Array, opts: { sheet?: string; keySheet?: string; skip?: string[] } = {}): Tracker {
  const names = sheetNames(bytes);
  const skip = (opts.skip ?? []).map((s) => s.trim().toLowerCase());
  const keyName = opts.keySheet ?? names.find((n) => /^key/i.test(n.trim()));
  const sheet =
    opts.sheet ??
    names.find((n) => {
      const t = n.trim().toLowerCase();
      return t !== keyName?.trim().toLowerCase() && !skip.includes(t);
    });
  if (!sheet) throw new Error(`Nothing to read in this workbook. It has: ${names.join(', ')}`);

  const legend = keyName ? readLegend(bytes, keyName) : [];
  const byColour = new Map(legend.map((l) => [l.colour, l]));

  const grid = readSheet(bytes, sheet);
  const headerIndex = grid.findIndex((r) => r?.some((c) => /address/i.test(c?.value ?? '')));
  if (headerIndex === -1) throw new Error(`Could not find the header row on "${sheet}". It needs a column headed Address.`);
  const cols = columnsOf(grid[headerIndex]);

  const rows: TrackerRow[] = [];
  for (let i = headerIndex + 1; i < grid.length; i++) {
    const cells = grid[i];
    if (!cells) continue;
    const get = (key: keyof typeof cols) => (cols[key] === -1 ? '' : (cells[cols[key]]?.value ?? '').trim());
    const address = get('address');
    const purchaseOrder = get('purchaseOrder');
    const workOrder = (HAS_WORK_ORDER.exec(get('workOrder'))?.[0] ?? '').replace(/\s/g, '').toUpperCase();
    // A row with nothing identifying on it is a spacer, not a quote.
    if (!address && !purchaseOrder && !workOrder) continue;

    // The row's colour: whichever highlight it carries, ignoring blanks. A
    // part-highlighted row still counts, which is how they are kept by hand.
    const colour = cells.map((c) => c?.fill).find((f): f is string => !!f);
    const entry = colour ? byColour.get(colour) : undefined;
    const received = get('received');
    const assignedTo = get('assignedTo');
    // "Rec'd" means the company that attended has sent their quote in, so it is
    // ours to review or rebuild. Until then the job is with them, which is not
    // one of the four board columns and is shown as waiting instead.
    const hasQuote = /^y/i.test(received);
    const stage = entry?.stage ?? (hasQuote ? 'review' : undefined);

    rows.push({
      row: i + 1,
      purchaseOrder,
      workOrder,
      address,
      assignedTo,
      workType: get('workType'),
      received,
      hasQuote,
      waitingOn: hasQuote ? undefined : assignedTo || undefined,
      progress: get('progress'),
      notes: get('notes'),
      chased: get('chased'),
      colour,
      meaning: entry?.meaning,
      stage,
      chase: entry?.chase,
    });
  }

  return { rows, legend, sheet, ignored: names.filter((n) => n !== sheet && n !== keyName) };
}

/** The headline numbers: where the quotes actually are. */
export function summarise(rows: TrackerRow[]): TrackerSummary {
  const byStage: Record<Stage, number> = { review: 0, amend: 0, ready: 0, sent: 0 };
  // The office types these by hand, so FRIERN and Friern are the same firm.
  const waitingBy = new Map<string, { label: string; count: number }>();
  let withUs = 0;
  let waiting = 0;
  let unflagged = 0;
  for (const r of rows) {
    if (r.stage) byStage[r.stage]++;
    if (r.hasQuote) {
      withUs++;
      if (!r.colour) unflagged++;
    } else {
      waiting++;
      const who = (r.waitingOn || 'not said').trim();
      const key = who.toUpperCase();
      const at = waitingBy.get(key);
      if (at) at.count++;
      else waitingBy.set(key, { label: who.replace(/\s+/g, ' '), count: 1 });
    }
  }
  return {
    total: rows.length,
    withUs,
    waiting,
    unflagged,
    byStage,
    waitingBy: [...waitingBy.values()].map((w) => ({ company: w.label, count: w.count })).sort((a, b) => b.count - a.count || a.company.localeCompare(b.company)),
  };
}

export interface HighlightUpdate {
  /** 1-based row in the tracker sheet. */
  row: number;
  /** RRGGBB to set the row to. */
  colour: string;
  /** Why, for the person checking before they run it. */
  because: string;
  workOrder: string;
}

/**
 * Where the board has moved on and the spreadsheet has not, the colour the row
 * should become. Only rows already matched to a job, and only where the colour
 * would actually change, so running it twice does nothing the second time.
 */
export function highlightUpdates<J extends { workOrder: string; stage: Stage }>(matched: { row: TrackerRow; job?: J }[], legend: LegendEntry[]): HighlightUpdate[] {
  const colourFor = new Map<Stage, string>();
  // First colour that means each stage wins, which is the order of the key.
  for (const l of legend) if (l.stage && !colourFor.has(l.stage)) colourFor.set(l.stage, l.colour);
  const out: HighlightUpdate[] = [];
  for (const { row, job } of matched) {
    if (!job) continue;
    const want = colourFor.get(job.stage);
    if (!want || want === row.colour) continue;
    const meaning = legend.find((l) => l.colour === want)?.meaning ?? job.stage;
    out.push({ row: row.row, colour: want, workOrder: job.workOrder, because: `board says ${job.stage}: ${meaning}` });
  }
  return out;
}

/** How a tracker row lines up with the board. */
export type TrackerMatch = 'work-order' | 'purchase-order' | 'address' | 'none';

export interface Reconciled<J> {
  row: TrackerRow;
  job?: J;
  how: TrackerMatch;
  /** The tracker and the board disagree about where this quote is. */
  disagrees: boolean;
}

/**
 * Line the tracker up against the board: by work order first, then purchase
 * order, then address. Nothing is changed; this only reports.
 */
export function reconcile<J extends { id: string; workOrder: string; purchaseOrder?: string; address: string; stage: Stage }>(
  rows: TrackerRow[],
  jobs: J[],
): { matched: Reconciled<J>[]; missingFromBoard: TrackerRow[]; missingFromTracker: J[] } {
  const byWorkOrder = new Map(jobs.map((j) => [j.workOrder.toUpperCase(), j]));
  const byPo = new Map(jobs.filter((j) => j.purchaseOrder).map((j) => [String(j.purchaseOrder), j]));
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const byAddress = new Map(jobs.map((j) => [key(j.address), j]));

  const used = new Set<string>();
  const matched: Reconciled<J>[] = [];
  const missingFromBoard: TrackerRow[] = [];

  for (const row of rows) {
    let job: J | undefined;
    let how: TrackerMatch = 'none';
    if (row.workOrder && byWorkOrder.has(row.workOrder)) {
      job = byWorkOrder.get(row.workOrder);
      how = 'work-order';
    } else if (row.purchaseOrder && byPo.has(row.purchaseOrder)) {
      job = byPo.get(row.purchaseOrder);
      how = 'purchase-order';
    } else if (row.address && byAddress.has(key(row.address))) {
      job = byAddress.get(key(row.address));
      how = 'address';
    }
    if (job) {
      used.add(job.id);
      matched.push({ row, job, how, disagrees: !!row.stage && row.stage !== job.stage });
    } else {
      missingFromBoard.push(row);
    }
  }

  return { matched, missingFromBoard, missingFromTracker: jobs.filter((j) => !used.has(j.id)) };
}
