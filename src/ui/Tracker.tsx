// The office tracker, as the app sees it.
//
// This screen answers "where are all our quotes actually at", using the
// spreadsheet the office already keeps rather than only the jobs the app has
// handled. Nothing here changes the spreadsheet.

import { useMemo, useState } from 'react';
import { buildTrackerScript } from '../lib/officeScript';
import { type TrackerRow, highlightUpdates, reconcile, summarise } from '../lib/tracker';
import type { Job } from '../lib/types';
import type { LocalProvider } from '../providers/local';
import { Icon, StagePill } from './bits';

type Filter = 'all' | 'with-us' | 'unflagged' | 'waiting' | 'off-board' | 'disagree';

const STAGE_LABEL = { review: 'To review', amend: 'To check & amend', ready: 'Ready to send', sent: 'Sent' } as const;

export function Tracker({ provider, jobs, onOpenJob, onAddJob }: { provider: LocalProvider; jobs: Job[]; onOpenJob: (id: string) => void; onAddJob: (row: TrackerRow) => void }) {
  const status = provider.trackerStatus();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [script, setScript] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const rows = status.tracker?.rows ?? [];
  const summary = useMemo(() => summarise(rows), [rows]);
  const lined = useMemo(() => reconcile(rows, jobs), [rows, jobs]);
  const byRow = useMemo(() => new Map(lined.matched.map((m) => [m.row.row, m])), [lined]);
  const updates = useMemo(() => highlightUpdates(lined.matched, status.tracker?.legend ?? []), [lined, status.tracker]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const m = byRow.get(r.row);
      if (filter === 'with-us' && !r.hasQuote) return false;
      if (filter === 'waiting' && r.hasQuote) return false;
      if (filter === 'unflagged' && !(r.hasQuote && !r.colour)) return false;
      if (filter === 'off-board' && m) return false;
      if (filter === 'disagree' && !m?.disagrees) return false;
      if (!q) return true;
      return [r.workOrder, r.purchaseOrder, r.address, r.assignedTo, r.workType, r.progress, r.notes].join(' ').toLowerCase().includes(q);
    });
  }, [rows, filter, query, byRow]);

  if (!status.tracker) {
    return (
      <>
        <div className="topbar">
          <div>
            <h1>Tracker</h1>
            <div className="sub">The office spreadsheet, read as it is.</div>
          </div>
        </div>
        <div className="content">
          <div className="panel" style={{ maxWidth: 680 }}>
            <h3>No tracker read yet</h3>
            <p className="small muted" style={{ marginTop: 0 }}>
              Put the tracker spreadsheet in the shared folder and the app reads it on its own, re-reading it whenever the office changes it. Or choose the file here to read it once on this PC. It is only ever read: the app never writes to it.
            </p>
            <input
              className="input file"
              type="file"
              accept=".xlsx"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBusy(true);
                try {
                  const s = await provider.loadTrackerFile(f);
                  setMsg(`Read ${s.total} rows.`);
                } catch (err) {
                  setMsg(err instanceof Error ? err.message : String(err));
                }
                setBusy(false);
              }}
            />
            {busy && <span className="small muted">Reading…</span>}
            {msg && (
              <div className="note">
                <Icon.info size={14} />
                <span>{msg}</span>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Tracker</h1>
          <div className="sub">
            {status.fileName} · {rows.length} quotes · {status.source === 'folder' ? 're-read from the shared folder when it changes' : 'read once on this PC'}
          </div>
        </div>
        <div className="search" style={{ width: 300 }}>
          <Icon.search />
          <input placeholder="Work order, PO, address, subcontractor" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="actions">
          <button className="btn" disabled={!updates.length} title={updates.length ? '' : 'The spreadsheet already matches the board'} onClick={() => setScript(buildTrackerScript(status.tracker?.sheet ?? 'Sheet1', updates))}>
            <Icon.sheet /> Update the spreadsheet{updates.length ? ` (${updates.length})` : ''}
          </button>
        </div>
      </div>

      <div className="content">
        <div className="tracker-tiles">
          <Tile n={summary.withUs} label="with us" hint="the quote is in from whoever attended" on={filter === 'with-us'} onClick={() => setFilter(filter === 'with-us' ? 'all' : 'with-us')} />
          <Tile n={summary.unflagged} label="in, not picked up" hint="received, but no colour on the row" tone="review" on={filter === 'unflagged'} onClick={() => setFilter(filter === 'unflagged' ? 'all' : 'unflagged')} />
          <Tile n={summary.waiting} label="waiting on a subcontractor" hint="they attended and owe us the quote" tone="amend" on={filter === 'waiting'} onClick={() => setFilter(filter === 'waiting' ? 'all' : 'waiting')} />
          <Tile n={lined.missingFromBoard.length} label="not on the board" hint="in the tracker but no card yet" on={filter === 'off-board'} onClick={() => setFilter(filter === 'off-board' ? 'all' : 'off-board')} />
          <Tile n={lined.matched.filter((m) => m.disagrees).length} label="board disagrees" hint="the colour and the card do not match" tone="amend" on={filter === 'disagree'} onClick={() => setFilter(filter === 'disagree' ? 'all' : 'disagree')} />
        </div>

        <div className="grid-2" style={{ marginTop: 16 }}>
          <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="tracker-head">
              <span>Row</span>
              <span>Work order</span>
              <span>Address</span>
              <span>Attended by</span>
              <span>Where it is</span>
              <span>On the board</span>
            </div>
            <div className="tracker-list">
              {shown.map((r) => {
                const m = byRow.get(r.row);
                return (
                  <div key={r.row} className={`tracker-row ${m?.disagrees ? 'disagrees' : ''}`}>
                    <span className="mono tiny muted">{r.row}</span>
                    <span className="mono">{r.workOrder || <span className="muted">{r.purchaseOrder || '—'}</span>}</span>
                    <span className="addr" title={r.address}>
                      {r.address || '—'}
                      {r.workType && <span className="chip outline tiny">{r.workType}</span>}
                    </span>
                    <span>{r.assignedTo || '—'}</span>
                    <span className="where">
                      {r.colour && <span className="swatch" style={{ background: `#${r.colour}` }} title={r.meaning} />}
                      <span className="tiny">{r.meaning ?? (r.hasQuote ? 'in, not picked up' : `with ${r.waitingOn ?? 'them'}`)}</span>
                      {r.progress && <span className="tiny muted">{r.progress}</span>}
                    </span>
                    <span>
                      {m?.job ? (
                        <button className="btn link" onClick={() => onOpenJob(m.job!.id)}>
                          <StagePill stage={m.job.stage} />
                        </button>
                      ) : (
                        <button className="btn sm" onClick={() => onAddJob(r)} disabled={!r.workOrder}>
                          <Icon.plus size={12} /> Add
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
              {!shown.length && <div className="empty" style={{ margin: 16 }}>Nothing matches that.</div>}
            </div>
          </div>

          <div className="stack">
            <div className="panel">
              <h3>What the colours mean</h3>
              <p className="small muted" style={{ margin: 0 }}>Read from the tracker's own KEY sheet, so it follows whatever the office writes there.</p>
              {status.tracker.legend.map((l) => (
                <div key={l.colour} className="legend-row">
                  <span className="swatch" style={{ background: `#${l.colour}` }} />
                  <span className="tiny">{l.meaning}</span>
                  <span className="tiny muted">{l.stage ? STAGE_LABEL[l.stage] : l.chase ? 'chasing' : 'not mapped'}</span>
                </div>
              ))}
            </div>

            <div className="panel">
              <h3>Who owes us a quote</h3>
              <div className="kv" style={{ gridTemplateColumns: '1fr 48px' }}>
                {summary.waitingBy.map((w) => (
                  <div key={w.company} style={{ display: 'contents' }}>
                    <span className="k">{w.company}</span>
                    <span className="mono">{w.count}</span>
                  </div>
                ))}
              </div>
              <span className="small muted">Rows where the quote has not come back yet, so the next move is theirs.</span>
            </div>

            {lined.missingFromTracker.length > 0 && (
              <div className="panel">
                <h3>On the board, not in the tracker</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {lined.missingFromTracker.slice(0, 12).map((j) => (
                    <button key={j.id} className="btn link" style={{ justifyContent: 'flex-start' }} onClick={() => onOpenJob(j.id)}>
                      <span className="mono tiny">{j.workOrder}</span> <span className="tiny muted">{j.address}</span>
                    </button>
                  ))}
                </div>
                <span className="small muted">Worth adding to the spreadsheet so the backup tracker stays complete.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {script && (
        <div className="modal-bg" onClick={() => setScript(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Bring the spreadsheet up to date</h2>
            <span className="small muted">
              {updates.length} row{updates.length === 1 ? '' : 's'} where the board has moved on and the tracker has not. Open the tracker in Excel on the web, Automate › New Script, paste this in and run it. It only changes the fill colour of those rows,
              and running it twice changes nothing the second time.
            </span>
            <pre className="code-block" style={{ maxHeight: 300 }}>{script}</pre>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="btn primary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(script);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2500);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                <Icon.file /> {copied ? 'Copied' : 'Copy the script'}
              </button>
              <button className="btn" onClick={() => setScript(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Tile({ n, label, hint, tone, on, onClick }: { n: number; label: string; hint: string; tone?: 'review' | 'amend'; on: boolean; onClick: () => void }) {
  return (
    <button className={`tile ${tone ?? ''} ${on ? 'on' : ''}`} onClick={onClick} title={hint}>
      <b>{n}</b>
      <span>{label}</span>
      <em>{hint}</em>
    </button>
  );
}
