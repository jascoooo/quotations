import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { useEffect, useMemo, useState } from 'react';
import { gbp } from '../lib/pricing';
import { STAGES, type Email, type Job, type Stage } from '../lib/types';
import { Icon, fmtDate } from './bits';

interface Props {
  jobs: Job[];
  emails: Email[];
  needsJob: number;
  clientName: string;
  onMove: (id: string, stage: Stage) => void;
  onOpen: (id: string) => void;
  onInbox: () => void;
  onAddJob?: () => void;
}

export function Board({ jobs, emails, needsJob, clientName, onMove, onOpen, onInbox, onAddJob }: Props) {
  const [query, setQuery] = useState('');
  // Order within a column is kept for the session; new cards join at the top.
  const [order, setOrder] = useState<Record<Stage, string[]>>({ review: [], amend: [], ready: [], sent: [] });

  useEffect(() => {
    setOrder((prev) => {
      const next = { ...prev };
      for (const s of STAGES) {
        const ids = jobs.filter((j) => j.stage === s.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((j) => j.id);
        const kept = prev[s.id].filter((id) => ids.includes(id));
        const fresh = ids.filter((id) => !kept.includes(id));
        next[s.id] = [...fresh, ...kept];
      }
      return next;
    });
  }, [jobs]);

  const byId = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const q = query.trim().toLowerCase();
  const visible = (id: string) => {
    const j = byId.get(id);
    if (!j) return false;
    if (!q) return true;
    return [j.workOrder, j.purchaseOrder, j.address, j.postcode, j.title].filter(Boolean).join(' ').toLowerCase().includes(q);
  };
  const counts = (jobId: string) => {
    const es = emails.filter((e) => e.jobId === jobId);
    return { emails: es.length, hasReport: !!byId.get(jobId)?.report };
  };

  const onDragEnd = (r: DropResult) => {
    if (!r.destination) return;
    const from = r.source.droppableId as Stage;
    const to = r.destination.droppableId as Stage;
    setOrder((prev) => {
      const next = { ...prev, [from]: [...prev[from]], [to]: from === to ? prev[to] : [...prev[to]] };
      const [moved] = next[from].splice(r.source.index, 1);
      const target = from === to ? next[from] : next[to];
      target.splice(r.destination!.index, 0, moved);
      return next;
    });
    if (from !== to) onMove(r.draggableId, to);
  };

  return (
    <>
      <div className="topbar">
        <h1>Quote board</h1>
        <div className="search" style={{ width: 340 }}>
          <Icon.search />
          <input placeholder="Search work order, PO, address or postcode" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <span className="pill neutral">Client: {clientName}</span>
        <div className="spacer" />
        {onAddJob && (
          <button className="btn primary" onClick={onAddJob}>
            <Icon.plus /> Add job
          </button>
        )}
        {needsJob > 0 && (
          <button className="btn warn" onClick={onInbox}>
            <Icon.mail /> {needsJob} email{needsJob === 1 ? '' : 's'} need a job
          </button>
        )}
      </div>
      <div className="content">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="board">
            {STAGES.map((s) => {
              const ids = order[s.id].filter(visible);
              return (
                <Droppable droppableId={s.id} key={s.id}>
                  {(dp, snap) => (
                    <div ref={dp.innerRef} {...dp.droppableProps} className={`col ${s.id} ${snap.isDraggingOver ? 'over' : ''}`}>
                      <div className="col-head">
                        <span className="dot" style={{ background: `var(--${s.id})` }} />
                        <b>{s.label}</b>
                        <span className="count">{ids.length}</span>
                        <span className="hint">{s.id === 'review' ? 'new from inbox' : s.id === 'sent' ? 'spreadsheets only' : snap.isDraggingOver ? 'drop to move here' : ''}</span>
                      </div>
                      <div className="col-body">
                        {ids.map((id, i) => {
                          const job = byId.get(id)!;
                          return (
                            <Draggable draggableId={id} index={i} key={id}>
                              {(dg, ds) => (
                                <div ref={dg.innerRef} {...dg.draggableProps} {...dg.dragHandleProps} style={dg.draggableProps.style} onClick={() => !ds.isDragging && onOpen(id)}>
                                  {s.id === 'sent' ? <SentCard job={job} /> : <Card job={job} counts={counts(id)} dragging={ds.isDragging} />}
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {dp.placeholder}
                        {ids.length === 0 && <div className="empty">{q ? 'No matches here' : 'Nothing here yet'}</div>}
                      </div>
                    </div>
                  )}
                </Droppable>
              );
            })}
          </div>
        </DragDropContext>
      </div>
    </>
  );
}

function Card({ job, counts, dragging }: { job: Job; counts: { emails: number; hasReport: boolean }; dragging: boolean }) {
  const flagClass = job.flag?.kind === 'client-changes' ? 'amend' : job.flag?.kind === 'internal-check' ? 'review' : '';
  return (
    <div className={`card ${dragging ? 'dragging' : ''} ${job.flag?.kind === 'ready-to-build' && job.stage === 'review' ? 'focus' : ''}`}>
      <div className="row">
        <span className="wo">{job.workOrder}</span>
        <span className="date">{job.stage === 'amend' && job.quote ? `draft v${job.quote.requestVersion}` : job.dateIssued ? `issued ${fmtDate(job.dateIssued)}` : fmtDate(job.updatedAt)}</span>
      </div>
      <div className="addr">
        {job.address}
        {job.postcode ? ` ${job.postcode}` : ''}
      </div>
      <div className="sub">
        {job.title}
        {job.purchaseOrder ? ` · PO ${job.purchaseOrder}` : ''}
      </div>
      {job.stage === 'ready' && job.quoteFileName && (
        <div className="file">
          <Icon.sheet size={16} style={{ color: 'var(--ready)', flexShrink: 0 }} />
          <span>…{job.quoteFileName.slice(job.quoteFileName.indexOf('_'))}</span>
        </div>
      )}
      {job.flag && (job.flag.kind === 'client-changes' || job.flag.kind === 'internal-check') && (
        <div className={`flag-box ${flagClass}`}>
          <b>{job.flag.kind === 'client-changes' ? 'Client asked for changes' : 'Internal check'}</b>
          <span>{job.flag.text.replace(/^[^:]*asked for changes:\s*/i, '')}</span>
        </div>
      )}
      <div className="meta">
        <span className="row">
          <Icon.mail size={14} /> {counts.emails}
        </span>
        <span className="row">
          <Icon.image size={14} /> {job.photos.length}
        </span>
        {counts.hasReport && (
          <span className="row">
            <Icon.file size={14} /> report
          </span>
        )}
        {job.total != null && job.total > 0 ? (
          <span className="total">{gbp(job.total)}</span>
        ) : job.flag && !(job.flag.kind === 'client-changes' || job.flag.kind === 'internal-check') ? (
          <span className={`pill flag ${job.flag.kind === 'ready-to-build' || job.flag.kind === 'checked' ? (job.flag.kind === 'checked' ? 'ready' : 'review') : 'amend'}`}>{job.flag.text}</span>
        ) : null}
      </div>
    </div>
  );
}

function SentCard({ job }: { job: Job }) {
  return (
    <div className="card compact">
      <Icon.sheet size={22} style={{ color: 'var(--ready)', flexShrink: 0 }} />
      <div className="lines">
        <span className="name">{job.quoteFileName ? `…${job.quoteFileName.slice(job.quoteFileName.indexOf('_'))}` : job.workOrder}</span>
        <span className="info">
          {job.flag?.text ?? `Sent ${fmtDate(job.updatedAt)}`}
          {job.total ? ` · ${gbp(job.total)}` : ''}
        </span>
      </div>
    </div>
  );
}
