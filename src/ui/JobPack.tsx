import { useEffect, useMemo, useState } from 'react';
import { reportToSummary } from '../lib/match';
import { buildIndex, suggestFromReport } from '../lib/sor';
import type { Email, Job, Quote, SorCode, Stage } from '../lib/types';
import { blankQuote } from '../providers/demoData';
import type { DataProvider, ProviderSettings } from '../providers/types';
import { Icon, StagePill, fmtDateTime, fmtLong, initials } from './bits';

interface Props {
  job: Job;
  emails: Email[];
  sor: SorCode[];
  settings: ProviderSettings;
  provider: DataProvider;
  onBack: () => void;
  onUpdate: (job: Job) => Promise<void>;
  onMove: (id: string, stage: Stage) => void;
  onBuild: (id: string) => void;
  onSaveQuote: (jobId: string, quote: Quote) => Promise<void>;
}

/** The quote a job starts with: header fields from the job, summary from the report. */
export function seedQuote(job: Job, settings: ProviderSettings): Quote {
  return blankQuote({
    contractor: settings.contractor,
    email: settings.contractorEmail,
    contactName: job.contact?.name ?? '',
    contactPhone: job.contact?.phone ?? '',
    date: job.attended ?? new Date().toISOString().slice(0, 10),
    propertyAddress: [job.address, job.postcode].filter(Boolean).join(', '),
    locationOfWorks: job.locationOfWorks,
    typeOfWorks: job.typeOfWorks ?? '',
    purchaseOrder: job.purchaseOrder ?? '',
    workOrder: job.workOrder,
    dateIssued: job.dateIssued ?? '',
    priority: job.priority ?? 'Routine',
    summary: job.report ? reportToSummary(job.report.text) : '',
  });
}

export function JobPack({ job, emails, sor, settings, provider, onBack, onUpdate, onMove, onBuild, onSaveQuote }: Props) {
  const [full, setFull] = useState<Job>(job);
  useEffect(() => {
    setFull(job);
    let alive = true;
    void provider.getJob(job.id).then((j) => alive && j && setFull(j));
    return () => {
      alive = false;
    };
  }, [job, provider]);

  const jobEmails = useMemo(() => emails.filter((e) => e.jobId === job.id).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)), [emails, job.id]);
  const index = useMemo(() => buildIndex(sor), [sor]);
  const suggestions = useMemo(() => (full.report ? suggestFromReport(index, full.report.text, 5) : []), [index, full.report]);
  const inQuote = new Set(full.quote?.sorLines.map((l) => l.code) ?? []);
  const src = (k: keyof Job['sources']) => {
    const s = full.sources[k];
    if (!s) return null;
    const e = emails.find((x) => x.id === s.emailId);
    return `${s.where}${e ? ` · ${fmtLong(e.receivedAt)}` : ''}`;
  };

  const togglePhoto = (id: string) => {
    const next = { ...full, photos: full.photos.map((p) => (p.id === id ? { ...p, include: !p.include } : p)) };
    setFull(next);
    void onUpdate(next);
  };

  const addCode = async (code: string) => {
    const q = full.quote ?? seedQuote(full, settings);
    if (q.sorLines.some((l) => l.code === code)) return;
    const next = { ...q, sorLines: [...q.sorLines, { code, qty: 1 }] };
    setFull({ ...full, quote: next });
    await onSaveQuote(full.id, next);
  };

  const build = async () => {
    if (!full.quote) await onSaveQuote(full.id, seedQuote(full, settings));
    onBuild(full.id);
  };

  const useReport = async () => {
    const q = full.quote ?? seedQuote(full, settings);
    const next = { ...q, summary: full.report ? reportToSummary(full.report.text) : q.summary };
    await onSaveQuote(full.id, next);
    onBuild(full.id);
  };

  const rulesUsed = new Set(jobEmails.map((e) => e.matchedBy).filter(Boolean));
  const included = full.photos.filter((p) => p.include).length;

  return (
    <>
      <div className="topbar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <div className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="btn link" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon.back size={12} /> Quote board
          </button>
          <span>›</span>
          <span>{{ review: 'Quotes to review', amend: 'Quotes to check & amend', ready: 'Quotes ready to send', sent: 'Quotes sent' }[full.stage]}</span>
          <span>›</span>
          <span className="mono" style={{ color: 'var(--accent)' }}>
            {full.workOrder}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2 }}>
              {full.address} {full.postcode}
            </div>
            <div className="sub">
              {full.title} · {full.client}
              {full.purchaseOrder ? ` · PO ${full.purchaseOrder}` : ''}
            </div>
          </div>
          <StagePill stage={full.stage} />
          <div className="actions">
          {full.folderUrl && (
            <a className="btn" href={full.folderUrl} target="_blank" rel="noreferrer">
              <Icon.folder /> Open job folder
            </a>
          )}
          <select value={full.stage} onChange={(e) => onMove(full.id, e.target.value as Stage)} style={{ height: 36 }}>
            <option value="review">Move to: To review</option>
            <option value="amend">Move to: To check &amp; amend</option>
            <option value="ready">Move to: Ready to send</option>
            <option value="sent">Move to: Sent</option>
          </select>
          <button className="btn primary" onClick={build}>
            {full.quote ? 'Open quote' : 'Build quote'} <Icon.arrow />
          </button>
          </div>
        </div>
      </div>

      <div className="content">
        <div className="grid-3">
          <div className="stack fade-in">
            <div className="panel">
              <h3>
                Job details <span className="muted tiny">found automatically</span>
              </h3>
              <Field label="Work order" value={<span className="mono" style={{ fontWeight: 500 }}>{full.workOrder}</span>} src={src('workOrder')} ok />
              <Field label="Purchase order" value={full.purchaseOrder ? <span className="mono" style={{ fontWeight: 500 }}>{full.purchaseOrder}</span> : <span className="muted">not seen yet</span>} src={src('purchaseOrder')} ok={!!full.purchaseOrder} />
              <Field label="Property address" value={`${full.address}${full.postcode ? `, ${full.postcode}` : ''}`} src={src('address') ?? src('postcode')} />
              <Field label="Location of works in property" value={full.locationOfWorks || <span className="muted">—</span>} src={src('locationOfWorks')} />
              <Field label="Client contact" value={full.contact ? `${full.contact.name} · ${full.contact.phone}` : <span className="muted">not seen yet</span>} src={src('contact')} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Date issued" value={fmtLong(full.dateIssued) || <span className="muted">—</span>} />
                <Field label="Attended" value={fmtLong(full.attended) || <span className="muted">not yet</span>} src={src('attended')} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field" style={{ border: 0, paddingBottom: 0 }}>
                  <label>Type of works</label>
                  <span className="chip outline" style={{ width: 'fit-content', borderStyle: 'dashed' }}>
                    {full.typeOfWorks ?? '—'} <span className="muted-2 tiny">suggested</span>
                  </span>
                </div>
                <div className="field" style={{ border: 0, paddingBottom: 0 }}>
                  <label>Urgency</label>
                  <span className="chip outline" style={{ width: 'fit-content', borderStyle: 'dashed' }}>
                    {full.priority ?? '—'} <span className="muted-2 tiny">suggested</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="panel" style={{ fontSize: 12, color: 'var(--text-2)' }}>
              <h3>
                <Icon.link size={15} style={{ color: 'var(--accent)' }} /> How this pack was put together
              </h3>
              <span>
                {jobEmails.length} email{jobEmails.length === 1 ? '' : 's'} and {full.photos.length} photo{full.photos.length === 1 ? '' : 's'}
                {rulesUsed.size ? `, matched by ${Array.from(rulesUsed).map((r) => ({ 'work-order': 'work order number', 'purchase-order': 'purchase order', address: 'address', conversation: 'conversation', manual: 'hand' })[r!]).join(' and ')}` : ''}.
              </span>
              {full.updatedBy && (
                <span className="muted">
                  Last change by {full.updatedBy}, {fmtDateTime(full.updatedAt)}
                </span>
              )}
            </div>
            <div className="note">
              <Icon.lock size={14} />
              <span>Everything on this page was read on this PC from your own mailbox and folders. No email, photo or quote data has been sent anywhere else.</span>
            </div>
          </div>

          <div className="stack fade-in">
            <div className="panel">
              <h3>
                Emails in this job <span className="muted tiny">{jobEmails.length} · newest first</span>
              </h3>
              {jobEmails.map((e) => {
                const us = settings.ownDomains.some((d) => e.from.address.toLowerCase().endsWith(d.toLowerCase()));
                const isReport = full.report?.emailId === e.id;
                const imgs = e.attachments.filter((a) => a.contentType.startsWith('image/') && !a.isInline).length;
                const files = e.attachments.length - imgs;
                return (
                  <div className={`email ${isReport ? 'report' : ''}`} key={e.id}>
                    <div className={`avatar ${us ? 'us' : ''}`}>{initials(e.from.name || e.from.address)}</div>
                    <div className="body">
                      <div className="row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <b style={{ fontSize: 13, fontWeight: 600 }}>{e.from.name || e.from.address}</b>
                        {isReport && <span className="pill ready">job report</span>}
                        <span className="tiny muted-2" style={{ marginLeft: 'auto' }}>
                          {fmtDateTime(e.receivedAt)}
                        </span>
                      </div>
                      <span className="subj">{e.subject}</span>
                      {e.attachments.length > 0 ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                          {imgs > 0 && (
                            <span className="chip outline">
                              <Icon.image size={12} /> {imgs} photo{imgs === 1 ? '' : 's'}
                            </span>
                          )}
                          {e.attachments
                            .filter((a) => !a.contentType.startsWith('image/'))
                            .slice(0, 3)
                            .map((a) => (
                              <span className="chip outline" key={a.id}>
                                <Icon.file size={12} /> {a.name}
                              </span>
                            ))}
                          {files > 3 && <span className="chip">+{files - 3}</span>}
                        </div>
                      ) : (
                        <span className="snip">{e.bodyText.split('\n').find(Boolean)}</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {jobEmails.length === 0 && <div className="empty">No emails filed to this job yet.</div>}
            </div>

            <div className="panel">
              <h3>
                Engineer's report{' '}
                <span className="muted tiny">{full.report ? `from the ${fmtLong(emails.find((e) => e.id === full.report?.emailId)?.receivedAt)} email · becomes the Summary of Works` : 'none yet'}</span>
                <span className="spacer" />
                {full.report && (
                  <button className="btn sm" onClick={useReport}>
                    <Icon.arrow size={14} /> Use in quote
                  </button>
                )}
              </h3>
              {full.report ? <div className="report-text">{reportToSummary(full.report.text)}</div> : <div className="empty">When the engineer's email arrives it will appear here and can be used as the summary of works.</div>}
              {suggestions.length > 0 && (
                <>
                  <h3 style={{ marginTop: 4 }}>
                    Likely SOR codes <span className="muted tiny">matched from the report wording · checked on this PC</span>
                  </h3>
                  <div className="stack" style={{ gap: 6 }}>
                    {suggestions.map((s) => (
                      <div className="sug" key={s.code.code}>
                        <span className="mono" style={{ color: 'var(--accent)' }}>
                          {s.code.code}
                        </span>
                        <span>
                          {s.code.short} <span className="why">· "{s.matched.slice(0, 3).join('", "')}"</span>
                        </span>
                        <span className="muted">{s.code.uom}</span>
                        <span style={{ textAlign: 'right' }}>£{s.code.rate.toFixed(2)}</span>
                        {inQuote.has(s.code.code) ? (
                          <span className="tiny" style={{ textAlign: 'center', color: 'var(--ready)' }}>
                            added
                          </span>
                        ) : (
                          <button className="btn link" style={{ textAlign: 'center' }} onClick={() => addCode(s.code.code)}>
                            Add
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="stack fade-in">
            <div className="panel">
              <h3>
                Photos <span className="muted tiny">{full.photos.length} · {included} ticked</span>
                <span className="spacer" />
                {full.folderUrl && (
                  <a className="btn link small" href={full.folderUrl} target="_blank" rel="noreferrer">
                    <Icon.download size={14} /> Open folder
                  </a>
                )}
              </h3>
              {full.photos.length ? (
                <div className="photos">
                  {full.photos.map((p, i) => (
                    <div className={`thumb ${p.include ? '' : 'out'}`} key={p.id} onClick={() => togglePhoto(p.id)} title={p.include ? 'Ticked: goes with the quote' : 'Not included'}>
                      <div className="img" style={{ background: p.url ? undefined : `linear-gradient(160deg, hsl(${210 + i * 9} 10% ${78 - (i % 3) * 5}%), hsl(${210 + i * 9} 10% ${58 - (i % 3) * 5}%))` }}>
                        {p.url ? <img src={p.url} alt={p.name} loading="lazy" /> : <Icon.image size={26} />}
                        <span className={`tick ${p.include ? '' : 'off'}`}>{p.include && <Icon.check size={12} />}</span>
                      </div>
                      <span className="name">
                        {p.name}
                        {p.note ? <span className="muted-2"> · {p.note}</span> : ''}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty">No photos yet. They arrive with the engineer's report.</div>
              )}
              <div className="note" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text-2)' }}>
                <Icon.check size={14} />
                <span>Ticked photos go with the quote: copied into the job folder and attached to the email to {settings.clientName} alongside the spreadsheet.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Field({ label, value, src, ok }: { label: string; value: React.ReactNode; src?: string | null; ok?: boolean }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="val">
        <span>{value}</span>
        {ok && <Icon.check size={14} style={{ color: 'var(--ready)' }} />}
        {src && <span className="src">{src}</span>}
      </div>
    </div>
  );
}
