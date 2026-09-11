import { useMemo, useState } from 'react';
import { classifyEmail, matchEmail, type MatchResult } from '../lib/match';
import { findRefs } from '../lib/refs';
import type { Email, Job, MatchRule } from '../lib/types';
import type { LiveStatus, ProviderSettings } from '../providers/types';
import { Icon, fmtDateTime, highlight } from './bits';

interface Props {
  emails: Email[];
  jobs: Job[];
  settings: ProviderSettings;
  initialEmailId?: string;
  live: LiveStatus;
  mode: 'demo' | 'm365';
  onFile: (emailId: string, jobId: string, rule: MatchRule) => Promise<void>;
  onCreate: (emailId: string) => Promise<void>;
  onIgnore: (emailId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onOpenJob: (id: string) => void;
}

type Tab = 'needs' | 'filed' | 'ignored' | 'all';

export function Inbox({ emails, jobs, settings, initialEmailId, live, mode, onFile, onCreate, onIgnore, onRefresh, onOpenJob }: Props) {
  const [tab, setTab] = useState<Tab>('needs');
  const [selected, setSelected] = useState<string | undefined>(initialEmailId);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<string>('');

  const filed = useMemo(() => emails.filter((e) => e.jobId), [emails]);
  const matches = useMemo(() => {
    const m = new Map<string, MatchResult>();
    for (const e of emails) if (!e.jobId && !e.ignored) m.set(e.id, matchEmail(e, jobs, filed));
    return m;
  }, [emails, jobs, filed]);

  const rows = emails.filter((e) => {
    if (tab === 'all') return true;
    if (tab === 'filed') return !!e.jobId;
    if (tab === 'ignored') return !!e.ignored;
    return !e.jobId && !e.ignored;
  });
  const needsCount = emails.filter((e) => !e.jobId && !e.ignored).length;
  const sel = emails.find((e) => e.id === selected) ?? rows[0];
  const selMatch = sel ? matches.get(sel.id) : undefined;
  const selJob = sel?.jobId ? jobs.find((j) => j.id === sel.jobId) : selMatch?.jobId ? jobs.find((j) => j.id === selMatch.jobId) : undefined;

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Shared inbox</h1>
          <div className="sub">
            {mode === 'demo' ? 'Demo mailbox' : 'Reading the shared mailbox in Outlook'} · {live.lastSync ? `checked ${fmtDateTime(live.lastSync)}` : 'not checked yet'} · emails stay where they are
          </div>
        </div>
        <div className="tabs" style={{ marginLeft: 12 }}>
          <button className={tab === 'needs' ? 'on' : ''} onClick={() => setTab('needs')}>
            Needs a job {needsCount > 0 && <span className="pill review">{needsCount}</span>}
          </button>
          <button className={tab === 'filed' ? 'on' : ''} onClick={() => setTab('filed')}>
            Filed · {filed.length}
          </button>
          <button className={tab === 'ignored' ? 'on' : ''} onClick={() => setTab('ignored')}>
            Ignored
          </button>
          <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>
            Everything
          </button>
        </div>
        <div className="spacer" />
        <button className="btn" disabled={busy} onClick={() => act(onRefresh)}>
          <Icon.refresh /> Check now
        </button>
      </div>
      <div className="content">
        <div className="grid-inbox">
          <div className="panel" style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
            <div className="inbox-head">
              <span>From</span>
              <span>Subject</span>
              <span>Found in the email</span>
              <span>Files</span>
              <span>What happens</span>
            </div>
            <div className="inbox-list">
              {rows.map((e) => (
                <Row key={e.id} email={e} match={matches.get(e.id)} jobs={jobs} selected={sel?.id === e.id} onClick={() => setSelected(e.id)} />
              ))}
              {rows.length === 0 && <div className="empty" style={{ margin: 16 }}>Nothing waiting. Everything has found its job.</div>}
            </div>
            <div className="note" style={{ margin: 12, marginTop: 'auto' }}>
              <Icon.lock size={14} />
              <span>Matching runs on this PC. Copies of matched emails and photos go into the job's folder in your SharePoint. Nothing is uploaded anywhere else.</span>
            </div>
          </div>

          <div className="stack">
            {sel && (
              <div className="panel fade-in" key={sel.id}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{sel.subject || '(no subject)'}</div>
                  <div className="small muted">
                    {sel.from.name || sel.from.address} · {fmtDateTime(sel.receivedAt)} · {sel.attachments.length ? `${sel.attachments.length} file${sel.attachments.length === 1 ? '' : 's'}` : 'no files'}
                  </div>
                </div>
                <div className="report-text">{highlight(sel.bodyText, [...findRefs(`${sel.subject}\n${sel.bodyText}`).workOrders, ...findRefs(sel.bodyText).purchaseOrders, ...findRefs(sel.bodyText).postcodes, ...(selJob ? [selJob.address.split(',')[0]] : [])])}</div>
                {sel.attachments.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {sel.attachments.map((a) => (
                      <span key={a.id} className="chip outline">
                        {a.contentType.startsWith('image/') ? <Icon.image size={12} /> : <Icon.file size={12} />} {a.name}
                      </span>
                    ))}
                  </div>
                )}

                {sel.jobId && selJob ? (
                  <div className="note">
                    <Icon.check size={14} />
                    <span>
                      Filed to <button className="btn link" onClick={() => onOpenJob(selJob.id)}>{selJob.workOrder}</button> · {selJob.address} {selJob.postcode} · by rule: {ruleLabel(sel.matchedBy)}
                    </span>
                  </div>
                ) : sel.ignored ? (
                  <div className="note">
                    <Icon.x size={14} />
                    <span>Ignored as not a job email.</span>
                    <button className="btn sm" style={{ marginLeft: 'auto' }} disabled={busy} onClick={() => act(() => onRefresh())}>
                      Look again
                    </button>
                  </div>
                ) : (
                  <Decision email={sel} match={selMatch} job={selJob} jobs={jobs} busy={busy} pick={pick} setPick={setPick} settings={settings} onFile={(jobId, rule) => act(() => onFile(sel.id, jobId, rule))} onCreate={() => act(() => onCreate(sel.id))} onIgnore={() => act(() => onIgnore(sel.id))} />
                )}
              </div>
            )}
            <div className="panel">
              <h3>How emails find their job</h3>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>A {settings.clientName} work order number (SANC + 6 digits) in the subject, body or a file name.</li>
                <li>A 10-digit purchase order number that a job already knows.</li>
                <li>A reply in a conversation that is already filed.</li>
                <li>The property address or postcode, suggested for a person to confirm.</li>
              </ol>
              <span className="small muted">Anything else waits here for a person. Nothing is filed on a guess.</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ruleLabel(r?: MatchRule): string {
  return { 'work-order': 'work order number', 'purchase-order': 'purchase order', address: 'address', conversation: 'same conversation', manual: 'filed by hand' }[r ?? 'manual'] ?? 'filed by hand';
}

function Row({ email, match, jobs, selected, onClick }: { email: Email; match?: MatchResult; jobs: Job[]; selected: boolean; onClick: () => void }) {
  const refs = findRefs(`${email.subject}\n${email.bodyText}\n${email.attachments.map((a) => a.name).join(' ')}`);
  const images = email.attachments.filter((a) => a.contentType.startsWith('image/')).length;
  const others = email.attachments.length - images;
  const filedJob = email.jobId ? jobs.find((j) => j.id === email.jobId) : undefined;
  const chips: { t: string; c: string }[] = [];
  refs.workOrders.forEach((w) => chips.push({ t: w, c: 'chip code' }));
  refs.purchaseOrders.forEach((p) => chips.push({ t: `PO ${p}`, c: 'chip code' }));
  refs.postcodes.forEach((p) => chips.push({ t: p, c: 'chip' }));
  if (match?.rule === 'address' && match.evidence) chips.push({ t: match.evidence, c: 'chip outline' });
  if (!chips.length) chips.push(email.ignored ? { t: 'not a job email', c: 'chip' } : { t: 'nothing recognised', c: 'chip warn' });

  let what: { cls: string; icon: React.ReactNode; text: string };
  if (email.ignored) what = { cls: 'ignored', icon: <Icon.x size={14} />, text: 'Ignored' };
  else if (filedJob) {
    const changes = filedJob.flag?.kind === 'client-changes' && filedJob.stage === 'amend' && /chang|amend|revis|reject/i.test(email.subject + email.bodyText);
    what = changes ? { cls: 'moved', icon: <Icon.arrow size={14} />, text: 'Moved to check & amend' } : { cls: 'ok', icon: <Icon.check size={14} />, text: `Filed to ${filedJob.workOrder}` };
  } else if (match?.confidence === 'certain' && match.jobId) what = { cls: 'ok', icon: <Icon.check size={14} />, text: `Files to ${match.jobId}` };
  else if (match?.newWorkOrder) what = { cls: 'ok', icon: <Icon.plus size={14} />, text: 'New job' };
  else if (match?.confidence === 'likely' && match.jobId) what = { cls: 'likely', icon: <Icon.info size={14} />, text: `Probably ${match.jobId}` };
  else what = { cls: 'none', icon: <Icon.question size={14} />, text: 'Pick a job' };

  return (
    <div className={`inbox-row ${selected ? 'sel' : ''}`} onClick={onClick}>
      <div className="from">
        <b>{email.from.name || email.from.address}</b>
        <span>{fmtDateTime(email.receivedAt)}</span>
      </div>
      <span className="subj">{email.subject || '(no subject)'}</span>
      <div className="found">
        {chips.map((c, i) => (
          <span key={i} className={c.c}>
            {c.t}
          </span>
        ))}
      </div>
      <span className="small muted">{images ? `${images} photo${images === 1 ? '' : 's'}` : others ? `${others} file${others === 1 ? '' : 's'}` : '—'}</span>
      <span className={`what ${what.cls}`}>
        {what.icon} {what.text}
      </span>
    </div>
  );
}

function Decision(props: {
  email: Email;
  match?: MatchResult;
  job?: Job;
  jobs: Job[];
  busy: boolean;
  pick: string;
  setPick: (s: string) => void;
  settings: ProviderSettings;
  onFile: (jobId: string, rule: MatchRule) => void;
  onCreate: () => void;
  onIgnore: () => void;
}) {
  const { email, match, job, jobs, busy, pick, setPick, settings, onFile, onCreate, onIgnore } = props;
  const kind = classifyEmail(email, settings);
  const open = jobs.filter((j) => j.stage !== 'sent');
  return (
    <div className="stack">
      {match?.newWorkOrder && (
        <div className="note">
          <Icon.plus size={14} />
          <span>
            New work order <b className="mono">{match.newWorkOrder}</b> with no job yet{kind === 'request' ? ' (looks like a request from the client)' : ''}.
          </span>
        </div>
      )}
      {job && match?.confidence === 'likely' && (
        <div className="note warn">
          <Icon.info size={14} />
          <span>
            No work order number in this email. Best match on the {match.rule}: <b className="mono">{job.workOrder}</b> · {job.address} {job.postcode}
          </span>
        </div>
      )}
      {!job && !match?.newWorkOrder && (
        <div className="note danger">
          <Icon.question size={14} />
          <span>Nothing recognised. Choose the job by hand, create a new one, or ignore it.</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {match?.newWorkOrder && (
          <button className="btn primary" disabled={busy} onClick={onCreate}>
            <Icon.plus /> Create job {match.newWorkOrder}
          </button>
        )}
        {job && (
          <button className="btn primary" disabled={busy} onClick={() => onFile(job.id, match?.rule ?? 'manual')}>
            <Icon.check /> File to {job.workOrder}
          </button>
        )}
        <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ minWidth: 220 }}>
          <option value="">Different job…</option>
          {open.map((j) => (
            <option key={j.id} value={j.id}>
              {j.workOrder} · {j.address}
            </option>
          ))}
        </select>
        {pick && (
          <button className="btn" disabled={busy} onClick={() => onFile(pick, 'manual')}>
            File there
          </button>
        )}
        {!match?.newWorkOrder && (
          <button className="btn" disabled={busy} onClick={onCreate}>
            New job
          </button>
        )}
        <button className="btn" disabled={busy} onClick={onIgnore} style={{ marginLeft: 'auto' }}>
          <Icon.x /> Ignore
        </button>
      </div>
    </div>
  );
}
