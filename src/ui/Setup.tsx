import { useMemo, useState } from 'react';
import type { Email, Job, RateAdjustment, SorCode } from '../lib/types';
import { type AppConfig, clearStoredConfig, configJson } from '../providers/config';
import type { LocalProvider } from '../providers/local';
import { Provisioner, type Step, createMsal, ensureSignedIn } from '../providers/provision';
import { SCOPES } from '../providers/scopes';
import type { DataProvider } from '../providers/types';
import { Icon, fmtDateTime } from './bits';

interface Props {
  provider: DataProvider;
  jobs: Job[];
  emails: Email[];
  sor: SorCode[];
  rates: RateAdjustment[];
  config?: AppConfig;
  configSource?: 'browser' | 'published';
  onReset: () => void;
}

export function Setup({ provider, jobs, emails, sor, rates, config, configSource, onReset }: Props) {
  const me = provider.me();
  const live = provider.liveStatus();
  const s = provider.settings();
  const [steps, setSteps] = useState<Step[]>([]);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const local = provider.mode === 'local' ? (provider as unknown as LocalProvider) : null;
  const ls = local?.localSettings();
  const json = useMemo(() => (config ? configJson(config) : ''), [config]);

  const check = async () => {
    if (!config) return;
    setChecking(true);
    setSteps([]);
    try {
      const msal = createMsal(config.tenantId, config.clientId, config.redirectUri);
      await ensureSignedIn(msal);
      await new Provisioner(msal, SCOPES).check(config, (st) =>
        setSteps((prev) => {
          const i = prev.findIndex((x) => x.key === st.key);
          if (i === -1) return [...prev, st];
          const next = [...prev];
          next[i] = st;
          return next;
        }),
      );
    } catch (e) {
      setSteps((prev) => [...prev, { key: 'error', label: 'Check failed', status: 'fail', detail: e instanceof Error ? e.message : String(e) }]);
    }
    setChecking(false);
  };

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Setup &amp; data</h1>
          <div className="sub">Where things live, who can see them, and how the app is connected.</div>
        </div>
        {config && (
          <div className="actions">
            <button className="btn" onClick={check} disabled={checking}>
              <Icon.refresh /> {checking ? 'Checking…' : 'Check connection'}
            </button>
          </div>
        )}
      </div>
      <div className="content">
        <div className="grid-2">
          <div className="stack">
            <div className="panel">
              <h3>This session</h3>
              <div className="kv" style={{ gridTemplateColumns: '160px 1fr' }}>
                <span className="k">Mode</span><span>{provider.mode === 'demo' ? 'Demo: made-up data, no sign-in, nothing leaves this browser' : 'Microsoft 365: your own tenant, via Microsoft Graph'}</span>
                <span className="k">Signed in as</span><span>{me.name}{me.email ? ` · ${me.email}` : ''}</span>
                <span className="k">Shared with</span><span>{provider.mode === 'demo' ? 'nobody (demo)' : 'everyone in your tenant who can open the SharePoint site'}</span>
                <span className="k">Settings from</span><span>{configSource === 'browser' ? 'this browser (set up on this machine)' : configSource === 'published' ? 'config.json published with the app' : 'the demo'}</span>
                <span className="k">Last checked</span><span>{live.lastSync ? fmtDateTime(live.lastSync) : '—'}{live.polling ? ' · refreshing automatically' : ''}</span>
                <span className="k">Recently editing</span><span>{live.recentEditors.length ? live.recentEditors.join(', ') : 'just you'}</span>
                <span className="k">On the board</span><span>{jobs.length} jobs · {emails.length} emails seen · {sor.length.toLocaleString('en-GB')} SOR codes · {rates.length} contractor rate{rates.length === 1 ? '' : 's'}</span>
                <span className="k">Contractor</span><span>{s.contractor}{s.contractorEmail ? ` · ${s.contractorEmail}` : ''}</span>
                <span className="k">Client</span><span>{s.clientName}{s.clientDomains.length ? ` · ${s.clientDomains.join(', ')}` : ''}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {provider.mode === 'demo' ? (
                  <button className="btn" onClick={async () => { await provider.signOut(); onReset(); }}>
                    <Icon.refresh /> Reset demo data
                  </button>
                ) : (
                  <button className="btn" onClick={() => provider.signOut()}>
                    Sign out
                  </button>
                )}
                {configSource === 'browser' && (
                  <button
                    className="btn"
                    onClick={() => {
                      clearStoredConfig();
                      window.location.reload();
                    }}
                  >
                    <Icon.trash /> Forget these settings
                  </button>
                )}
              </div>
            </div>

            {steps.length > 0 && (
              <div className="panel">
                <h3>Connection check</h3>
                <div className="steps">
                  {steps.map((st) => (
                    <div key={st.key} className={`step ${st.status}`}>
                      <span className="step-mark">
                        {st.status === 'ok' && <Icon.check size={14} />}
                        {st.status === 'warn' && <Icon.info size={14} />}
                        {st.status === 'fail' && <Icon.x size={14} />}
                        {st.status === 'running' && <span className="spin" />}
                      </span>
                      <div>
                        <b>{st.label}</b>
                        {st.detail && <span className="step-detail">{st.detail}</span>}
                        {st.fix && <span className="step-fix">{st.fix}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="panel">
              <h3>
                <Icon.lock size={15} style={{ color: 'var(--accent)' }} /> Where the data lives
              </h3>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
                <li>The shared mailbox stays in Outlook; the app only reads it on your behalf.</li>
                <li>Each job is a folder in a SharePoint document library: the emails as files, the photos, the report, the finished quote.</li>
                <li>The board is a SharePoint list. Every colleague sees the same list; a drag on one screen shows on the others within seconds.</li>
                <li>The SOR code list and rate table are read from the client's template in that library, never copied out.</li>
                <li>Matching, searching and pricing run in this browser. No AI service, no third-party server, nothing sent outside your tenant.</li>
                <li>Filing happens while someone has the app open. For overnight and weekend filing, the companion Power Automate flow (see docs) writes to the same lists and folders.</li>
              </ul>
            </div>
          </div>

          <div className="stack">
            {local && (
              <div className="panel">
                <h3>The client's template</h3>
                {ls?.templateName ? (
                  <div className="note ok">
                    <Icon.check size={14} />
                    <span>
                      Read from <b>{ls.templateName}</b>. {sor.length.toLocaleString('en-GB')} codes and {rates.length} contractor rate{rates.length === 1 ? '' : 's'} are stored on this PC.
                    </span>
                  </div>
                ) : (
                  <div className="note warn">
                    <Icon.info size={14} />
                    <span>Load the client's blank template once. The app reads the code list and the rate table out of it; the file itself is not kept or sent anywhere.</span>
                  </div>
                )}
                <input
                  className="input file"
                  type="file"
                  accept=".xlsx"
                  disabled={loading}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f || !local) return;
                    setLoading(true);
                    setMsg(null);
                    try {
                      const r = await local.loadTemplate(f);
                      setMsg({ ok: true, text: `Read ${r.codes.toLocaleString('en-GB')} codes and ${r.rates} rate row(s). Reload to use them.` });
                    } catch (err) {
                      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
                    }
                    setLoading(false);
                  }}
                />
                {loading && <span className="small muted">Reading the workbook, this takes a few seconds…</span>}
                {msg && (
                  <div className={`note ${msg.ok ? 'ok' : 'danger'}`}>
                    <Icon.info size={14} />
                    <span>{msg.text}</span>
                  </div>
                )}
                {msg?.ok && (
                  <button className="btn primary" onClick={() => window.location.reload()}>
                    <Icon.refresh /> Reload
                  </button>
                )}
              </div>
            )}
            {local && (
              <div className="panel">
                <h3>Your copy of the board</h3>
                <p className="small muted" style={{ margin: 0 }}>
                  In this mode everything lives in this browser on this PC. Nothing is shared and nothing is backed up, so save a copy somewhere safe now and then. The file it saves can be loaded on another machine.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    className="btn"
                    onClick={async () => {
                      if (!local) return;
                      const blob = new Blob([await local.exportAll()], { type: 'application/json' });
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(blob);
                      a.download = `quote-desk-backup-${new Date().toISOString().slice(0, 10)}.json`;
                      a.click();
                      URL.revokeObjectURL(a.href);
                    }}
                  >
                    <Icon.download /> Save a copy
                  </button>
                  <label className="btn" style={{ cursor: 'pointer' }}>
                    <Icon.file /> Load a copy
                    <input
                      type="file"
                      accept="application/json,.json"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f || !local) return;
                        try {
                          const r = await local.importAll(await f.text());
                          setMsg({ ok: true, text: `Loaded ${r.jobs} job(s). Reload to see them.` });
                        } catch (err) {
                          setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
            )}
            {config ? (
              <div className="panel">
                <h3>Set everyone else up in one go</h3>
                <p className="small muted" style={{ marginTop: 0 }}>
                  Save this as <span className="mono">public/config.json</span> in the code repository and push it. Colleagues then open the app and are connected straight away, with no setup of their own. Nothing here is secret: it is addresses and
                  identifiers, and each person still signs in as themselves and sees only what they could already open.
                </p>
                <pre className="code-block">{json}</pre>
                <button
                  className="btn"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(json);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 2500);
                    } catch {
                      setCopied(false);
                    }
                  }}
                >
                  <Icon.file /> {copied ? 'Copied' : 'Copy config.json'}
                </button>
              </div>
            ) : (
              <div className="panel">
                <h3>Connecting to Microsoft 365</h3>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
                  <li>Register the app once in Entra ID: single tenant, single-page app, this page's address as the redirect. Anyone can do this unless the directory has been locked down.</li>
                  <li>Point the app at a SharePoint site you own. It creates the board list, the filing list and the job folders itself.</li>
                  <li>Use a shared mailbox you already open in Outlook. No new mailbox permission is needed.</li>
                  <li>Save the settings it produces as <span className="mono">config.json</span> so colleagues skip all of this.</li>
                </ol>
                <span className="small muted">The step-by-step version, and what to do when something is blocked, is in docs/setup.md.</span>
              </div>
            )}

            <div className="panel">
              <h3>What the app can reach</h3>
              <div className="kv" style={{ gridTemplateColumns: '170px 1fr' }}>
                <span className="k">Your name</span><span>To show who moved a card.</span>
                <span className="k">The shared mailbox</span><span>Read only, and only the mailbox named in the settings.</span>
                <span className="k">The quotes site</span><span>The board list, the filing list and the job folders.</span>
                <span className="k">Files</span><span>Enough to copy the template and fill the copy through Excel.</span>
              </div>
              <span className="small muted">All four are delegated permissions: the app can never reach anything you could not open yourself, and it acts only while you have it open.</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
