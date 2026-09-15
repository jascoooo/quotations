// @vitest-environment happy-dom
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildTrackerScript } from './officeScript';
import { highlightUpdates, readTracker, reconcile, stageForMeaning, summarise } from './tracker';

describe('stageForMeaning', () => {
  it("reads the office's own wording", () => {
    expect(stageForMeaning('Quote for Jake to do')).toEqual({ stage: 'review' });
    expect(stageForMeaning('Query sent to subby/SH')).toEqual({ stage: 'amend' });
    expect(stageForMeaning('Quote ready to go to SH & Sent to admin to send off')).toEqual({ stage: 'ready' });
    expect(stageForMeaning('Quote made by Jake for Bill to review')).toEqual({ stage: 'amend' });
    expect(stageForMeaning('Bill has been chasing multiple times')).toEqual({ chase: true });
  });

  it('leaves a meaning it cannot place alone rather than guessing', () => {
    expect(stageForMeaning('purple ones')).toEqual({});
  });
});

const SAMPLE = process.env.TRACKER_XLSX ?? '/tmp/claude-0/tracker-sample.xlsx';

describe.runIf(existsSync(SAMPLE))("R Dunham's real tracker", () => {
  let t: ReturnType<typeof readTracker>;
  beforeAll(() => {
    t = readTracker(new Uint8Array(readFileSync(SAMPLE)), { skip: ['Wayne Work'] });
  }, 60_000);

  it('reads the key sheet for what each colour means', () => {
    expect(t.legend).toHaveLength(5);
    const amber = t.legend.find((l) => l.colour === 'FFC000');
    expect(amber?.meaning).toContain('ready to go');
    expect(amber?.stage).toBe('ready');
    expect(t.legend.find((l) => l.colour === '00B0F0')?.stage).toBe('review');
    expect(t.legend.find((l) => l.colour === 'FF0000')?.stage).toBe('amend');
    expect(t.legend.find((l) => l.colour === '873737')?.chase).toBe(true);
  });

  it('reads every quote row, and leaves the sheet we were told to ignore', () => {
    expect(t.sheet).toBe('Sheet1');
    expect(t.ignored).toContain('Wayne Work ');
    expect(t.rows).toHaveLength(183);
  });

  it('reads the columns, including an address written as a formula', () => {
    const first = t.rows[0];
    expect(first.purchaseOrder).toBe('4501640949');
    expect(first.workOrder).toBe('SANC000769');
    expect(first.address).toBe('9 TEMPLE CLOSE, BASILDON, SS15 5FX');
    expect(first.assignedTo).toBe('FRIERN');
    expect(first.workType).toBe('FLOORING');
    expect(first.progress).toContain('QUERY');
    expect(first.notes).toContain('CHASING AN UPDATE');
  });

  it('gives each highlighted row the stage its colour means', () => {
    const byColour = { review: 0, amend: 0, ready: 0, sent: 0, none: 0 };
    for (const r of t.rows) byColour[r.meaning ? (r.stage ?? 'none') : 'none']++;
    expect(byColour).toEqual({ review: 11, amend: 27, ready: 35, sent: 0, none: 110 });
  });

  it("treats a quote that is in but uncoloured as ours to review, and one that is not in as still with the company that attended", () => {
    const s = summarise(t.rows);
    expect(s.total).toBe(183);
    expect(s.withUs).toBe(119);
    expect(s.waiting).toBe(64);
    // In from the subcontractor, but nobody has marked the row: the real backlog.
    expect(s.unflagged).toBe(61);
    expect(s.byStage.review).toBe(11 + 61);
    expect(s.waitingBy[0].count).toBeGreaterThan(0);
    expect(s.waitingBy.map((w) => w.company)).toContain('PBES');
  });

  it('names who owes us a quote', () => {
    const s = summarise(t.rows);
    const total = s.waitingBy.reduce((n, w) => n + w.count, 0);
    expect(total).toBe(s.waiting);
  });

  it('keeps rows that have a status but no work order, because they still need chasing', () => {
    const noRef = t.rows.filter((r) => !r.workOrder);
    expect(noRef.length).toBeGreaterThan(0);
    expect(noRef.every((r) => r.address || r.purchaseOrder)).toBe(true);
  });
});

describe('reconcile', () => {
  const rows = [
    { row: 2, purchaseOrder: '4501640949', workOrder: 'SANC000769', address: '9 Temple Close', assignedTo: '', workType: '', received: 'YES', hasQuote: true, progress: '', notes: '', chased: '', stage: 'ready' as const },
    { row: 3, purchaseOrder: '4501700555', workOrder: '', address: 'Savernake Road', assignedTo: '', workType: '', received: '', hasQuote: false, progress: '', notes: '', chased: '' },
    { row: 4, purchaseOrder: '', workOrder: 'SANC999999', address: 'Nowhere', assignedTo: '', workType: '', received: '', hasQuote: false, progress: '', notes: '', chased: '' },
  ];
  const jobs = [
    { id: 'SANC000769', workOrder: 'SANC000769', address: '9 Temple Close', stage: 'review' as const },
    { id: 'SANC002305', workOrder: 'SANC002305', purchaseOrder: '4501700555', address: 'Savernake Road', stage: 'ready' as const },
    { id: 'SANC005555', workOrder: 'SANC005555', address: 'Not in the tracker', stage: 'review' as const },
  ];

  it('matches on the work order first, then the purchase order', () => {
    const { matched } = reconcile(rows, jobs);
    expect(matched[0].how).toBe('work-order');
    expect(matched[1].how).toBe('purchase-order');
  });

  it('flags where the tracker and the board disagree', () => {
    const { matched } = reconcile(rows, jobs);
    expect(matched[0].disagrees).toBe(true); // tracker says ready, board says review
    expect(matched[1].disagrees).toBe(false); // the tracker row has no colour
  });

  it('reports what each side is missing', () => {
    const { missingFromBoard, missingFromTracker } = reconcile(rows, jobs);
    expect(missingFromBoard.map((r) => r.workOrder)).toEqual(['SANC999999']);
    expect(missingFromTracker.map((j) => j.id)).toEqual(['SANC005555']);
  });
});

describe('highlightUpdates', () => {
  const legend = [
    { colour: '00B0F0', meaning: 'Quote for Jake to do', stage: 'review' as const },
    { colour: 'FF0000', meaning: 'Query sent to subby/SH', stage: 'amend' as const },
    { colour: 'FFC000', meaning: 'Quote ready to go', stage: 'ready' as const },
  ];
  const row = (n: number, colour?: string) => ({
    row: n, purchaseOrder: '', workOrder: `SANC00000${n}`, address: '', assignedTo: '', workType: '',
    received: 'YES', hasQuote: true, progress: '', notes: '', chased: '', colour,
  });

  it('asks for the colour the board says, only where it differs', () => {
    const matched: { row: ReturnType<typeof row>; job?: { workOrder: string; stage: 'review' | 'amend' | 'ready' | 'sent' } }[] = [
      { row: row(2, '00B0F0'), job: { workOrder: 'SANC000002', stage: 'ready' } },
      { row: row(3, 'FFC000'), job: { workOrder: 'SANC000003', stage: 'ready' } },
      { row: row(4), job: { workOrder: 'SANC000004', stage: 'amend' } },
    ];
    const out = highlightUpdates(matched, legend);
    expect(out.map((u) => [u.row, u.colour])).toEqual([
      [2, 'FFC000'],
      [4, 'FF0000'],
    ]);
    expect(out[0].because).toContain('ready');
  });

  it('leaves rows with no matching job, and stages the key has no colour for', () => {
    expect(highlightUpdates([{ row: row(9, 'FF0000') }], legend)).toEqual([]);
    expect(highlightUpdates([{ row: row(9), job: { workOrder: 'x', stage: 'sent' as const } }], legend)).toEqual([]);
  });

  it('produces a script that only sets fills', () => {
    const updates = highlightUpdates([{ row: row(2, '00B0F0'), job: { workOrder: 'SANC000002', stage: 'ready' as const } }], legend);
    const script = buildTrackerScript('Sheet1', updates);
    expect(script).toContain('function main(workbook: ExcelScript.Workbook)');
    expect(script).toContain('{ row: 2, colour: "#FFC000" }');
    expect(script).toContain('getFill().setColor');
    expect(script).not.toMatch(/setValue|delete|insert|addWorksheet|clear\(/i);
  });
});
