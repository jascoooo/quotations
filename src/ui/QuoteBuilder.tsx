import { useEffect, useMemo, useRef, useState } from 'react';
import { gbp, priceQuote } from '../lib/pricing';
import { buildIndex, searchSor } from '../lib/sor';
import { PRIORITIES, TYPES_OF_WORKS, type Job, type Quote, type RateAdjustment, type SorCode, type Stage } from '../lib/types';
import { buildOfficeScript } from '../lib/officeScript';
import type { ExportResult, ProviderSettings } from '../providers/types';
import { Icon, StagePill, fmtDateTime } from './bits';
import { seedQuote } from './JobPack';

interface Props {
  job: Job;
  sor: SorCode[];
  rates: RateAdjustment[];
  settings: ProviderSettings;
  mode: 'demo' | 'local' | 'm365';
  onBack: () => void;
  onSave: (jobId: string, quote: Quote) => Promise<void>;
  onExport: (jobId: string) => Promise<ExportResult | null>;
  onMove: (id: string, stage: Stage) => void;
}

export function QuoteBuilder({ job, sor, rates, settings, mode, onBack, onSave, onExport, onMove }: Props) {
  const [q, setQ] = useState<Quote>(job.quote ?? seedQuote(job, settings));
  const [savedAt, setSavedAt] = useState<string | undefined>(job.quote ? job.updatedAt : undefined);
  const [query, setQuery] = useState('');
  const [hl, setHl] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [scriptCopied, setScriptCopied] = useState(false);
  const dirty = useRef(false);

  const index = useMemo(() => buildIndex(sor), [sor]);
  const codes = useMemo(() => new Map(sor.map((c) => [c.code, c])), [sor]);
  const hits = useMemo(() => searchSor(index, query, 8), [index, query]);
  const totals = useMemo(() => priceQuote(q.sorLines, q.nonSorLines, codes, rates, q.contractor), [q, codes, rates]);

  // Save shortly after each change so colleagues see the draft.
  useEffect(() => {
    if (!dirty.current) return;
    const t = window.setTimeout(async () => {
      await onSave(job.id, q);
      setSavedAt(new Date().toISOString());
      dirty.current = false;
    }, 800);
    return () => clearTimeout(t);
  }, [q, job.id, onSave]);

  const set = <K extends keyof Quote>(k: K, v: Quote[K]) => {
    dirty.current = true;
    setQ((prev) => ({ ...prev, [k]: v }));
  };
  const addCode = (code: string) => {
    if (!q.sorLines.some((l) => l.code === code)) set('sorLines', [...q.sorLines, { code, qty: 1 }]);
    setQuery('');
    setHl(0);
  };
  const setLine = (i: number, patch: Partial<Quote['sorLines'][number]>) => set('sorLines', q.sorLines.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  const delLine = (i: number) => set('sorLines', q.sorLines.filter((_, n) => n !== i));
  const setNon = (i: number, patch: Partial<Quote['nonSorLines'][number]>) => set('nonSorLines', q.nonSorLines.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  const delNon = (i: number) => set('nonSorLines', q.nonSorLines.filter((_, n) => n !== i));
  const addNon = () => set('nonSorLines', [...q.nonSorLines, { works: 'Labour', qty: 1, description: '', uom: 'HR', rate: 0 }]);

  const checks = [
    { ok: !!q.workOrder && !!q.purchaseOrder, text: q.purchaseOrder ? 'Work order and PO present' : 'Purchase order missing' },
    { ok: !!q.propertyAddress, text: 'Address and postcode filled' },
    { ok: q.summary.trim().length > 20, text: 'Summary of works written' },
    { ok: q.sorLines.length + q.nonSorLines.length > 0 && q.sorLines.every((l) => l.qty > 0) && q.nonSorLines.every((l) => l.qty > 0), text: 'Every line has a quantity' },
    { ok: totals.lines.every((l) => l.found), text: totals.lines.every((l) => l.found) ? 'All SOR codes recognised' : 'A code is not in the SOR list' },
    { ok: job.photos.some((p) => p.include), text: `${job.photos.filter((p) => p.include).length} photo${job.photos.filter((p) => p.include).length === 1 ? '' : 's'} selected as evidence` },
  ];
  const canExport = checks.slice(0, 5).every((c) => c.ok);

  const doExport = async () => {
    setExporting(true);
    dirty.current = false;
    await onSave(job.id, q);
    const r = await onExport(job.id);
    setExporting(false);
    if (r) setResult(r);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!hits.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHl((h) => Math.min(hits.length - 1, h + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHl((h) => Math.max(0, h - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); addCode(hits[hl].code.code); }
    if (e.key === 'Escape') setQuery('');
  };

  return (
    <>
      <div className="topbar">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1>Extra Works Request</h1>
            <span className="mono" style={{ color: 'var(--accent)', fontSize: 13 }}>{job.workOrder}</span>
            <span className="small muted">version {q.requestVersion}</span>
          </div>
          <div className="sub">
            {job.address} {job.postcode} · {job.title} · {settings.clientName} template V1.0 (2025)
          </div>
        </div>
        <StagePill stage={job.stage} />
        <div className="actions">
          <span className="small muted-2">{savedAt ? `Saved ${fmtDateTime(savedAt)}` : 'Not saved yet'}</span>
          <button className="btn" onClick={onBack}>
            <Icon.back /> Back to job pack
          </button>
          <button className="btn primary" disabled={!canExport || exporting} onClick={doExport} title={canExport ? '' : 'Finish the checks on the right first'}>
            <Icon.sheet /> {exporting ? 'Writing…' : `Export ${settings.clientName} spreadsheet`}
          </button>
        </div>
      </div>

      <div className="content">
        <div className="grid-2">
          <div className="stack" style={{ gap: 14 }}>
            <div className="panel fade-in">
              <h3>
                Request details <span className="muted tiny">same fields as the top of the client's Main Sheet</span>
              </h3>
              <div className="form-grid">
                <F label="Contractor"><input value={q.contractor} onChange={(e) => set('contractor', e.target.value)} list="contractors" /><datalist id="contractors">{rates.map((r) => <option key={r.contractor} value={r.contractor} />)}</datalist></F>
                <F label="Contact name"><input value={q.contactName} onChange={(e) => set('contactName', e.target.value)} /></F>
                <F label="Contact no."><input value={q.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} /></F>
                <F label="Email"><input value={q.email} onChange={(e) => set('email', e.target.value)} /></F>
                <F label="Date"><input type="date" value={q.date} onChange={(e) => set('date', e.target.value)} /></F>
                <F label="Property address" span><input value={q.propertyAddress} onChange={(e) => set('propertyAddress', e.target.value)} /></F>
                <F label="Functional location (if available)"><input value={q.functionalLocation} placeholder="optional" onChange={(e) => set('functionalLocation', e.target.value)} /></F>
                <F label="Location of works in property"><input value={q.locationOfWorks} onChange={(e) => set('locationOfWorks', e.target.value)} /></F>
                <F label="Type of works">
                  <select value={q.typeOfWorks} onChange={(e) => set('typeOfWorks', e.target.value as Quote['typeOfWorks'])}>
                    <option value="">choose…</option>
                    {TYPES_OF_WORKS.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </F>
                <F label="Original work order"><input className="mono" value={q.workOrder} onChange={(e) => set('workOrder', e.target.value)} /></F>
                <F label="Original purchase order"><input className="mono" value={q.purchaseOrder} onChange={(e) => set('purchaseOrder', e.target.value)} /></F>
                <F label="Date issued"><input type="date" value={q.dateIssued} onChange={(e) => set('dateIssued', e.target.value)} /></F>
                <F label="Request version no."><input type="number" min={1} value={q.requestVersion} onChange={(e) => set('requestVersion', Math.max(1, Number(e.target.value) || 1))} /></F>
                <F label="Quote (if applicable)"><input value={q.quoteRef} placeholder="optional" onChange={(e) => set('quoteRef', e.target.value)} /></F>
                <F label="Priority">
                  <div className="seg">
                    {PRIORITIES.map((p) => (
                      <button key={p} className={q.priority === p ? 'on' : ''} onClick={() => set('priority', p)} type="button">
                        {p}
                      </button>
                    ))}
                  </div>
                </F>
              </div>
            </div>

            <div className="panel fade-in">
              <h3>
                Summary of works required &amp; additional comments <span className="muted tiny">{job.report ? "brought in from the engineer's report · edit freely" : 'in your own words'}</span>
              </h3>
              <textarea rows={5} value={q.summary} onChange={(e) => set('summary', e.target.value)} placeholder="What was found, what needs doing, anything the client should know." />
            </div>

            <div className="panel fade-in" style={{ overflow: 'visible' }}>
              <h3>
                Schedule of works <span className="muted tiny">SOR codes · {sor.length.toLocaleString('en-GB')} codes {mode === 'demo' ? '(demo sample)' : "from the client's own template"}</span>
              </h3>
              <div className="search">
                <Icon.search />
                <input placeholder="Type a code or plain words, e.g. garage door lock · Enter adds the highlighted line" value={query} onChange={(e) => { setQuery(e.target.value); setHl(0); }} onKeyDown={onKey} />
                {query && hits.length > 0 && (
                  <div className="menu">
                    {hits.map((h, i) => (
                      <button key={h.code.code} className={i === hl ? 'hl' : ''} onMouseEnter={() => setHl(i)} onClick={() => addCode(h.code.code)} type="button">
                        <span className="mono" style={{ color: 'var(--accent)' }}>{h.code.code}</span>
                        <span style={{ fontWeight: i === hl ? 500 : 400 }}>{h.code.short}</span>
                        <span className="muted">{h.code.element}</span>
                        <span className="muted">{h.code.uom}</span>
                        <span style={{ textAlign: 'right' }}>£{h.code.rate.toFixed(2)}</span>
                      </button>
                    ))}
                    <div className="foot">Searching the code list on this PC · {hits.length} shown</div>
                  </div>
                )}
                {query && hits.length === 0 && (
                  <div className="menu">
                    <div className="foot">No codes match "{query}"</div>
                  </div>
                )}
              </div>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>#</th><th>Works</th><th>SOR</th><th>Qty</th><th>Short description</th><th>UOM</th><th className="num">Base rate</th><th className="num">Adjusted ({(totals.adjustment * 100).toFixed(1)}%)</th><th className="num">Line value</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {totals.lines.map((l, i) => (
                    <tr key={`${l.code}-${i}`} style={l.sheet === 'continuation' && i === 31 ? { borderTop: '2px dashed var(--border)' } : undefined}>
                      <td className="muted-2">{i + 1}</td>
                      <td className="muted">{l.element || <span className="chip warn">unknown code</span>}</td>
                      <td className="mono" style={{ color: 'var(--accent)' }}>{l.code}</td>
                      <td><input className="qty" type="number" min={0} step={1} value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} /></td>
                      <td>{l.short}</td>
                      <td className="muted">{l.uom}</td>
                      <td className="num">{l.found ? gbp(l.baseRate) : '—'}</td>
                      <td className="num">{l.found ? gbp(l.adjustedRate) : '—'}</td>
                      <td className="num" style={{ fontWeight: 500 }}>{l.found ? gbp(l.lineValue) : '—'}</td>
                      <td><button className="del" onClick={() => delLine(i)} title="Remove line" type="button"><Icon.trash size={14} /></button></td>
                    </tr>
                  ))}
                  {totals.lines.length === 0 && (
                    <tr><td colSpan={10} className="muted" style={{ textAlign: 'center', padding: 18 }}>No lines yet. Search above, or add the likely codes from the job pack.</td></tr>
                  )}
                </tbody>
              </table>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--muted)' }}>
                <span>
                  {Math.min(31, totals.lines.length)} of 31 lines on the Main Sheet
                  {totals.lines.length > 31 ? ` · ${totals.lines.length - 31} on the Continuation Sheet` : ' · the Continuation Sheet fills automatically after line 31'}
                  {totals.overflow > 0 ? ` · ${totals.overflow} line(s) will not fit` : ''}
                </span>
                <span className="spacer" />
                <b style={{ color: 'var(--text)' }}>Main Sheet total {gbp(totals.mainTotal)}</b>
              </div>
            </div>

            <div className="panel fade-in">
              <h3>
                Non-SOR works <span className="muted tiny">labour, materials and anything without a code · goes to the Non SOR Works sheet</span>
              </h3>
              <table className="tbl">
                <thead>
                  <tr><th>#</th><th>Works</th><th>Qty</th><th>Description</th><th>UOM</th><th className="num">Rate</th><th className="num">Line value</th><th></th></tr>
                </thead>
                <tbody>
                  {q.nonSorLines.map((l, i) => (
                    <tr key={i}>
                      <td className="muted-2">{i + 1}</td>
                      <td><input className="narrow" value={l.works} onChange={(e) => setNon(i, { works: e.target.value })} /></td>
                      <td><input className="qty" type="number" min={0} value={l.qty} onChange={(e) => setNon(i, { qty: Number(e.target.value) })} /></td>
                      <td><input className="wide" value={l.description} onChange={(e) => setNon(i, { description: e.target.value })} /></td>
                      <td><input className="qty" value={l.uom} onChange={(e) => setNon(i, { uom: e.target.value })} /></td>
                      <td className="num"><input className="narrow" type="number" min={0} step={0.01} value={l.rate} onChange={(e) => setNon(i, { rate: Number(e.target.value) })} /></td>
                      <td className="num" style={{ fontWeight: 500 }}>{gbp(l.qty * l.rate)}</td>
                      <td><button className="del" onClick={() => delNon(i)} title="Remove line" type="button"><Icon.trash size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn link" onClick={addNon} style={{ alignSelf: 'flex-start' }}>
                <Icon.plus size={14} /> Add a line
              </button>
            </div>
          </div>

          <div className="stack" style={{ gap: 14, position: 'sticky', top: 0 }}>
            <div className="totals fade-in">
              <span className="fine">Totals · {settings.clientName} rate adjustment applied</span>
              <div className="l"><span>Main Sheet</span><span>{gbp(totals.mainTotal)}</span></div>
              <div className="l"><span>Continuation Sheet</span><span>{gbp(totals.continuationTotal)}</span></div>
              <div className="l"><span>Non-SOR works</span><span>{gbp(totals.nonSorTotal)}</span></div>
              <hr />
              <div className="big"><span style={{ fontWeight: 500 }}>Total cost</span><b>{gbp(totals.total)}</b></div>
              <span className="fine">
                {q.contractor} {totals.adjustment >= 0 ? '+' : '−'}{Math.abs(totals.adjustment * 100).toFixed(1)}% on SOR base rates. Base total {gbp(totals.mainBaseTotal)} is {totals.under20k ? 'under' : 'over'} £20,000, so the {totals.under20k ? 'under' : 'over'}-20k rate applies. Same maths as the client's sheet.
              </span>
            </div>
            <div className="panel fade-in">
              <h3>Before it goes out</h3>
              <div className="checks">
                {checks.map((c, i) => (
                  <div key={i}>
                    {c.ok ? <Icon.check size={15} style={{ color: 'var(--ready)' }} /> : <Icon.info size={15} style={{ color: 'var(--review)' }} />}
                    <span>{c.text}</span>
                  </div>
                ))}
                <div>
                  <Icon.info size={15} style={{ color: 'var(--review)' }} />
                  <span>Not yet checked by a second person</span>
                </div>
              </div>
            </div>
            <div className="panel fade-in" style={{ fontSize: 12, color: 'var(--text-2)' }}>
              <h3>What export does</h3>
              <span>Copies {settings.clientName}'s own template into the job folder and writes these values into it. Excel does the saving, so formulas, dropdowns, hidden sheets and the SOR table are left exactly as the client supplied them.</span>
              <span>The card moves to "Ready to send". Then a colleague checks it and drags it to "Sent" once emailed{settings.clientQuotesMailbox ? ` to ${settings.clientQuotesMailbox}` : ''}.</span>
              {job.stage === 'ready' && (
                <button className="btn success" onClick={() => onMove(job.id, 'sent')}>
                  <Icon.send /> Mark as sent
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {result && (
        <div className="modal-bg" onClick={() => setResult(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{mode === 'demo' ? 'What would be written' : mode === 'local' ? 'Your quote, ready for Excel' : 'Spreadsheet saved'}</h2>
            <span className="mono small" style={{ color: 'var(--accent)', wordBreak: 'break-all' }}>{result.fileName}</span>
            {result.webUrl && (
              <a className="btn primary" href={result.webUrl} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start' }}>
                <Icon.sheet /> Open in Excel
              </a>
            )}
            {mode === 'demo' && <div className="note">Demo mode has no template to write into. In Microsoft 365 mode these {result.writes.length} cells are written into a fresh copy of the client's template in the job folder, and the sheet's own totals are read back and compared with the app's before the card moves on.</div>}
            {mode === 'local' && (
              <>
                <div className="note">
                  <Icon.info size={14} />
                  <span>
                    Make a copy of {settings.clientName}'s blank template, rename it to the file name above, and open the copy in <b>Excel on the web</b>. Then Automate › New Script, paste this in, and press Run. Excel writes the {result.writes.length} cells itself, so the
                    dropdowns, tables and hidden sheets are left exactly as they came.
                  </span>
                </div>
                <pre className="code-block" style={{ maxHeight: 260 }}>{buildOfficeScript(result.writes, result.fileName)}</pre>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn primary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(buildOfficeScript(result.writes, result.fileName));
                        setScriptCopied(true);
                        window.setTimeout(() => setScriptCopied(false), 2500);
                      } catch {
                        setScriptCopied(false);
                      }
                    }}
                  >
                    <Icon.file /> {scriptCopied ? 'Copied' : 'Copy the script'}
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      const blob = new Blob([buildOfficeScript(result.writes, result.fileName)], { type: 'text/plain' });
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(blob);
                      a.download = `${result.fileName.replace(/\.xlsx$/i, '')}.osts.ts`;
                      a.click();
                      URL.revokeObjectURL(a.href);
                    }}
                  >
                    <Icon.download /> Save it as a file
                  </button>
                </div>
                <span className="small muted">After running it, check the sheet's own total against the {gbp(totals.total)} above. They should match to the penny.</span>
              </>
            )}
            {result.sheetTotals && (
              <div className={`note ${result.mismatch ? 'danger' : ''}`}>
                {result.mismatch ? <Icon.info size={14} /> : <Icon.check size={14} />}
                <span>
                  The saved sheet says {gbp(result.sheetTotals.total)} (main {gbp(result.sheetTotals.main)}, continuation {gbp(result.sheetTotals.continuation)}, non-SOR {gbp(result.sheetTotals.nonSor)}); the app says {gbp(totals.total)}.
                  {result.mismatch ? ' They differ, so the card has not moved to Ready to send. Open the workbook and check.' : ' They agree.'}
                </span>
              </div>
            )}
            <div className="kv">
              {result.writes.map((w, i) => (
                <div key={i} style={{ display: 'contents' }}>
                  <span className="k">{w.sheet}</span>
                  <span className="mono">{w.address}</span>
                  <span>{w.numberFormat ? `${String(w.value)} (date)` : String(w.value)}</span>
                </div>
              ))}
            </div>
            <button className="btn" onClick={() => setResult(null)} style={{ alignSelf: 'flex-end' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function F({ label, span, children }: { label: string; span?: boolean; children: React.ReactNode }) {
  return (
    <div className={`f ${span ? 'span2' : ''}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}
