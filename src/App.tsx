import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { matchEmail } from './lib/match';
import type { Email, Job, MatchRule, Quote, RateAdjustment, SorCode, Stage } from './lib/types';
import { type AppConfig, LOCAL_MODE_KEY, clearStoredConfig, loadConfig } from './providers/config';
import { diagnose } from './providers/provision';
import { DemoProvider } from './providers/demo';
import type { DataProvider, ExportResult } from './providers/types';
import { Board } from './ui/Board';
import { Connect } from './ui/Connect';
import { Icon } from './ui/bits';
import { Inbox } from './ui/Inbox';
import { JobPack } from './ui/JobPack';
import { QuoteBuilder } from './ui/QuoteBuilder';
import { Tracker } from './ui/Tracker';
import { Setup } from './ui/Setup';

export type View = { kind: 'board' } | { kind: 'inbox'; emailId?: string } | { kind: 'job'; id: string } | { kind: 'quote'; id: string } | { kind: 'tracker' } | { kind: 'setup' };

interface Toast {
  id: number;
  text: string;
}

const DEMO_ONLY = import.meta.env.VITE_DEMO_ONLY === '1';

interface Booted {
  provider: DataProvider;
  config?: AppConfig;
  configSource?: 'browser' | 'published';
}

/**
 * Demo mode when asked for, Microsoft 365 when this browser has settings, and
 * otherwise nothing: the setup screen takes over so the first run is a form
 * rather than a stack trace.
 */
async function boot(): Promise<Booted | null> {
  if (DEMO_ONLY || window.location.hash.includes('demo')) return { provider: new DemoProvider() };
  if (window.location.hash.includes('local') || localStorage.getItem(LOCAL_MODE_KEY) === '1') {
    const { LocalProvider } = await import('./providers/local');
    return { provider: new LocalProvider() };
  }
  const found = await loadConfig();
  if (!found) return null;
  const { GraphProvider } = await import('./providers/graph');
  return { provider: new GraphProvider(found.config), config: found.config, configSource: found.source };
}

export function App() {
  const [provider, setProvider] = useState<DataProvider | null>(null);
  const [booted, setBooted] = useState<Booted | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [adding, setAdding] = useState<{ workOrder: string; address: string; postcode: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [sor, setSor] = useState<SorCode[]>([]);
  const [rates, setRates] = useState<RateAdjustment[]>([]);
  const [view, setView] = useState<View>({ kind: 'board' });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [, setTick] = useState(0);
  const toastId = useRef(0);

  const toast = useCallback((text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const reload = useCallback(async (p: DataProvider) => {
    const [j, e] = await Promise.all([p.listJobs(), p.listEmails()]);
    setJobs(j);
    setEmails(e);
  }, []);

  useEffect(() => {
    let off = () => undefined as void;
    (async () => {
      try {
        const b = await boot();
        if (!b) {
          setNeedsSetup(true);
          return;
        }
        const p = b.provider;
        await p.init();
        setBooted(b);
        setProvider(p);
        const [s, r] = await Promise.all([p.getSorCodes(), p.getRates()]);
        setSor(s);
        setRates(r);
        await reload(p);
        off = p.subscribe((ev) => {
          void reload(p);
          if (ev.note) toast(ev.note);
          setTick((t) => t + 1);
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => off();
  }, [reload, toast]);

  // Heartbeat so "last checked" text stays fresh.
  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const needsJob = useMemo(() => {
    const filed = emails.filter((e) => e.jobId);
    return emails.filter((e) => !e.jobId && !e.ignored && matchEmail(e, jobs, filed).confidence !== 'certain').length;
  }, [emails, jobs]);

  const moveJob = useCallback(
    async (id: string, stage: Stage) => {
      if (!provider) return;
      setJobs((js) => js.map((j) => (j.id === id ? { ...j, stage } : j)));
      try {
        await provider.moveJob(id, stage);
      } catch (e) {
        toast(`Could not move the card: ${e instanceof Error ? e.message : e}`);
        await reload(provider);
      }
    },
    [provider, reload, toast],
  );

  const updateJob = useCallback(
    async (job: Job) => {
      if (!provider) return;
      setJobs((js) => js.map((j) => (j.id === job.id ? job : j)));
      await provider.updateJob(job);
    },
    [provider],
  );

  const saveQuote = useCallback(
    async (jobId: string, quote: Quote) => {
      if (!provider) return;
      setJobs((js) => js.map((j) => (j.id === jobId ? { ...j, quote } : j)));
      await provider.saveQuote(jobId, quote);
    },
    [provider],
  );

  const exportQuote = useCallback(
    async (jobId: string): Promise<ExportResult | null> => {
      if (!provider) return null;
      try {
        const r = await provider.exportQuote(jobId);
        toast(`Saved ${r.fileName}`);
        await reload(provider);
        return r;
      } catch (e) {
        toast(`Export failed: ${e instanceof Error ? e.message : e}`);
        return null;
      }
    },
    [provider, reload, toast],
  );

  const fileEmail = useCallback(
    async (emailId: string, jobId: string, rule: MatchRule) => {
      if (!provider) return;
      await provider.fileEmail(emailId, jobId, rule);
      await reload(provider);
      toast(`Filed to ${jobId}`);
    },
    [provider, reload, toast],
  );

  const createJob = useCallback(
    async (emailId: string) => {
      if (!provider) return;
      const job = await provider.createJobFromEmail(emailId);
      await reload(provider);
      setView({ kind: 'job', id: job.id });
    },
    [provider, reload],
  );

  const ignoreEmail = useCallback(
    async (emailId: string) => {
      if (!provider) return;
      await provider.ignoreEmail(emailId);
      await reload(provider);
    },
    [provider, reload],
  );

  const refreshInbox = useCallback(async () => {
    if (!provider) return;
    await provider.refreshInbox();
    await reload(provider);
  }, [provider, reload]);

  if (needsSetup) {
    return (
      <Connect
        onDemo={() => {
          window.location.hash = 'demo';
          window.location.reload();
        }}
        onLocal={() => {
          try {
            localStorage.setItem(LOCAL_MODE_KEY, '1');
          } catch {
            window.location.hash = 'local';
          }
          window.location.reload();
        }}
      />
    );
  }
  if (error) {
    const fix = diagnose(error);
    return (
      <div className="connect">
        <div className="connect-card">
          <div className="panel">
            <h3>The app could not start</h3>
            {fix && <p style={{ margin: 0, fontSize: 13 }}>{fix}</p>}
            <p className="small muted" style={{ margin: 0 }}>What Microsoft said: {error}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => window.location.reload()}>
                <Icon.refresh /> Try again
              </button>
              <button
                className="btn"
                onClick={() => {
                  clearStoredConfig();
                  window.location.reload();
                }}
              >
                Change the connection settings
              </button>
              <button
                className="btn"
                onClick={() => {
                  window.location.hash = 'demo';
                  window.location.reload();
                }}
              >
                Open with example data
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (!provider) {
    return (
      <div className="content" style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <div className="muted">Signing in and reading the board…</div>
      </div>
    );
  }

  const settings = provider.settings();
  const live = provider.liveStatus();
  const currentJob = view.kind === 'job' || view.kind === 'quote' ? jobs.find((j) => j.id === view.id) : undefined;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">
            <Icon.sheet size={18} />
          </div>
          <div>
            <b>{settings.contractor}</b>
            <span>Quotes · {settings.clientName}</span>
          </div>
        </div>
        <button className={`nav ${view.kind === 'board' || view.kind === 'job' || view.kind === 'quote' ? 'active' : ''}`} onClick={() => setView({ kind: 'board' })}>
          <Icon.board /> Quote board
        </button>
        <button className={`nav ${view.kind === 'inbox' ? 'active' : ''}`} onClick={() => setView({ kind: 'inbox' })}>
          <Icon.mail /> Shared inbox {needsJob > 0 && <span className="badge">{needsJob}</span>}
        </button>
        {provider.mode === 'local' && (
          <button className={`nav ${view.kind === 'tracker' ? 'active' : ''}`} onClick={() => setView({ kind: 'tracker' })}>
            <Icon.sheet /> Tracker
          </button>
        )}
        <button className={`nav ${view.kind === 'setup' ? 'active' : ''}`} onClick={() => setView({ kind: 'setup' })}>
          <Icon.settings /> Setup &amp; data
        </button>
        <div className="live">
          <span className="dot" />
          <span>
            {provider.mode === 'demo' ? 'Demo · ' : 'Live · '}
            {live.lastSync ? `checked ${Math.max(0, Math.round((Date.now() - Date.parse(live.lastSync)) / 1000))}s ago` : 'connecting'}
          </span>
        </div>
        {live.recentEditors.length > 0 && (
          <div className="live" style={{ paddingTop: 2 }}>
            <Icon.users size={12} />
            <span>{live.recentEditors.join(', ')}</span>
          </div>
        )}
        <div className="side-foot">
          <b>
            <Icon.lock size={14} /> Data stays in-house
          </b>
          <span>
            {provider.mode === 'demo'
              ? 'Demo mode: made-up data, nothing leaves this browser.'
              : provider.mode === 'local'
                ? 'Everything stays in your own folder and this browser. Nothing is sent to outside services.'
                : 'Emails, photos and quotes live in your Microsoft 365. Nothing is sent to outside services.'}
          </span>
        </div>
      </aside>

      <main className="main">
        {view.kind === 'board' && (
          <Board
            jobs={jobs}
            emails={emails}
            onMove={moveJob}
            onOpen={(id) => setView({ kind: 'job', id })}
            onInbox={() => setView({ kind: 'inbox' })}
            needsJob={needsJob}
            clientName={settings.clientName}
            onAddJob={provider.mode === 'local' ? () => setAdding({ workOrder: '', address: '', postcode: '', title: '' }) : undefined}
          />
        )}
        {view.kind === 'inbox' && (
          <Inbox emails={emails} jobs={jobs} settings={settings} initialEmailId={view.emailId} onFile={fileEmail} onCreate={createJob} onIgnore={ignoreEmail} onRefresh={refreshInbox} onOpenJob={(id) => setView({ kind: 'job', id })} live={live} mode={provider.mode} />
        )}
        {view.kind === 'job' && currentJob && (
          <JobPack job={currentJob} emails={emails} sor={sor} settings={settings} provider={provider} onBack={() => setView({ kind: 'board' })} onUpdate={updateJob} onMove={moveJob} onBuild={(id) => setView({ kind: 'quote', id })} onSaveQuote={saveQuote} />
        )}
        {view.kind === 'quote' && currentJob && (
          <QuoteBuilder job={currentJob} sor={sor} rates={rates} settings={settings} mode={provider.mode} onBack={() => setView({ kind: 'job', id: currentJob.id })} onSave={saveQuote} onExport={exportQuote} onMove={moveJob} />
        )}
        {(view.kind === 'job' || view.kind === 'quote') && !currentJob && (
          <div className="content">
            <div className="empty">That job is no longer on the board.</div>
          </div>
        )}
        {view.kind === 'tracker' && provider.mode === 'local' && (
          <Tracker
            provider={provider as unknown as import('./providers/local').LocalProvider}
            jobs={jobs}
            onOpenJob={(id) => setView({ kind: 'job', id })}
            onAddJob={(row) => setAdding({ workOrder: row.workOrder, address: row.address, postcode: '', title: row.workType || 'Extra works' })}
          />
        )}
        {view.kind === 'setup' && <Setup provider={provider} jobs={jobs} emails={emails} sor={sor} rates={rates} config={booted?.config} configSource={booted?.configSource} onReset={() => window.location.reload()} />}
      </main>

      {adding && (
        <div className="modal-bg" onClick={() => setAdding(null)}>
          <div className="modal" style={{ width: 'min(520px, 100%)' }} onClick={(e) => e.stopPropagation()}>
            <h2>Add a job</h2>
            <span className="small muted">The work order is what everything else hangs off. The rest can be filled in later on the job page.</span>
            <div className="form-grid">
              <label className="wide">
                <span>Work order</span>
                <input className="input mono" autoFocus value={adding.workOrder} placeholder="SANC004958" onChange={(e) => setAdding({ ...adding, workOrder: e.target.value })} />
              </label>
              <label className="wide">
                <span>Address</span>
                <input className="input" value={adding.address} placeholder="31 Cathedral Drive, Basildon" onChange={(e) => setAdding({ ...adding, address: e.target.value })} />
              </label>
              <label>
                <span>Postcode</span>
                <input className="input" value={adding.postcode} placeholder="SS15 5WF" onChange={(e) => setAdding({ ...adding, postcode: e.target.value })} />
              </label>
              <label>
                <span>What the job is</span>
                <input className="input" value={adding.title} placeholder="Garage door" onChange={(e) => setAdding({ ...adding, title: e.target.value })} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setAdding(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={!adding.workOrder.trim()}
                onClick={async () => {
                  const p = provider as unknown as { createJob: (s: typeof adding) => Promise<{ id: string }> };
                  try {
                    const job = await p.createJob(adding);
                    setAdding(null);
                    await reload(provider);
                    setView({ kind: 'job', id: job.id });
                  } catch (e) {
                    toast(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                Add it <Icon.arrow />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <Icon.users size={14} /> {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
