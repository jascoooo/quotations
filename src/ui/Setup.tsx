import { useMemo, useState } from 'react';
import type { Email, Job, RateAdjustment, SorCode } from '../lib/types';
import { type AppConfig, clearChosenMode, clearStoredConfig, configJson } from '../providers/config';
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

function Done({ on, label, yes, no }: { on: boolean; label: string; yes: string; no: string }) {
  return (
    <div className={`step ${on ? 'ok' : 'warn'}`}>
      <span className="step-mark">{on ? <Icon.check size={14} /> : <Icon.info size={14} />}</span>
      <div>
        <b>{label}</b>
        <span className="step-detail">{on ? yes : no}</span>
      </div>
    </div>
  );
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
  const folder = local?.folderStatus();
  const trackerName = local?.trackerStatus().fileName;
  const trackerSource = local?.trackerStatus().source;
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
                <span className="k">Version</span><span className="mono">{__BUILD_ID__}</span>
                <span className="k">Mode</span>
                <span>
                  {provider.mode === 'demo'
                    ? 'Demo: made-up data, no sign-in, nothing leaves this browser'
                    : provider.mode === 'local'
                      ? 'On this PC: no sign-in, shared through a folder'
                      : 'Microsoft 365: your own tenant, via Microsoft Graph'}
                </span>
                <span className="k">Signed in as</span><span>{me.name}{me.email ? ` · ${me.email}` : ''}</span>
                <span className="k">Shared with</span>
                <span>
                  {provider.mode === 'demo'
                    ? 'nobody (demo)'
                    : provider.mode === 'local'
                      ? folder?.state === 'watching'
                        ? `everyone pointed at ${folder.name}`
                        : 'nobody yet: no shared folder chosen'
                      : 'everyone in your tenant who can open the SharePoint site'}
                </span>
                <span className="k">Settings from</span>
                <span>
                  {configSource === 'browser'
                    ? 'this browser (set up on this machine)'
                    : configSource === 'published'
                      ? 'config.json published with the app'
                      : provider.mode === 'local'
                        ? folder?.state === 'watching'
                          ? 'the shared folder, so colleagues get the same'
                          : 'this browser'
                        : 'the demo'}
                </span>
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
                ) : local ? null : (
                  <button className="btn" onClick={() => provider.signOut()}>
                    Sign out
                  </button>
                )}
                <button
                  className="btn"
                  title="Go back to the screen that offers the two ways of running it"
                  onClick={() => {
                    clearChosenMode();
                    window.location.reload();
                  }}
                >
                  <Icon.back /> Change how this runs
                </button>
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
              {local ? (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
                  <li>The board is one small file per job in the shared folder, which SharePoint or OneDrive syncs between everyone. Nothing is uploaded anywhere else.</li>
                  <li>Photos and emails come from that same folder, put there by the Power Automate flow, and are read off the disk.</li>
                  <li>The client's code list and rate table are read out of their template and kept in this browser. The template itself is not stored.</li>
                  <li>The office tracker is only ever read. The app never writes to it: changes go back as a script you run in Excel.</li>
                  <li>Matching, searching and pricing run in this browser. No sign-in, no AI service, no third-party server.</li>
                  <li>Without a shared folder, everything stays in this browser on this PC alone.</li>
                </ul>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
                  <li>The shared mailbox stays in Outlook; the app only reads it on your behalf.</li>
                  <li>Each job is a folder in a SharePoint document library: the emails as files, the photos, the report, the finished quote.</li>
                  <li>The board is a SharePoint list. Every colleague sees the same list; a drag on one screen shows on the others within seconds.</li>
                  <li>The SOR code list and rate table are read from the client's template in that library, never copied out.</li>
                  <li>Matching, searching and pricing run in this browser. No AI service, no third-party server, nothing sent outside your tenant.</li>
                  <li>Filing happens while someone has the app open. For overnight and weekend filing, the companion Power Automate flow (see docs) writes to the same lists and folders.</li>
                </ul>
              )}
            </div>
          </div>

          <div className="stack">
            {local && (
              <div className="panel">
                <h3>What is connected</h3>
                <div className="steps">
                  <Done
                    on={folder?.state === 'watching'}
                    label="A shared folder"
                    yes={`Sharing through ${folder?.name}. Colleagues pointed at the same folder see the same board.`}
                    no="Not set yet. Without one the board stays on this PC only, and emails have to be pasted in."
                  />
                  <Done on={!!ls?.templateName} label="The client's template" yes={`${ls?.templateName}: ${sor.length.toLocaleString('en-GB')} codes and ${rates.length} rate row(s).`} no="Not read yet. The quote builder has no codes to search until it is." />
                  <Done on={!!trackerName} label="The office tracker" yes={`${trackerName}, read ${trackerSource === 'folder' ? 'from the shared folder' : 'once on this PC'}.`} no="Optional. Read it to see where every quote is, not only the ones on the board." />
                </div>
              </div>
            )}
            {local && (
              <div className="panel">
                <h3>The shared folder</h3>
                {folder?.state === 'unsupported' ? (
                  <div className="note warn">
                    <Icon.info size={14} />
                    <span>This browser cannot watch a folder. Use Microsoft Edge or Chrome, and emails will arrive on their own. Otherwise paste them in by hand.</span>
                  </div>
                ) : folder?.state === 'watching' ? (
                  <div className="note ok">
                    <Icon.check size={14} />
                    <span>
                      Sharing through <b>{folder.name}</b>, checked every 10 seconds. Everyone pointed at this folder sees the same board, and new emails arrive on their own.
                    </span>
                  </div>
                ) : folder?.state === 'needs-permission' ? (
                  <div className="note warn">
                    <Icon.info size={14} />
                    <span>The browser needs you to allow the folder again. It asks once per session, for safety.</span>
                  </div>
                ) : (
                  <p className="small muted" style={{ marginTop: 0 }}>
                    This is what makes the app shared and live without anyone signing in. Point it at a folder that SharePoint or OneDrive syncs to everyone's PC, and the board lives there: one small file per job, re-read every 10 seconds, so a card you move
                    appears on your colleagues' screens a sync later. A Power Automate flow drops each new email from the shared mailbox into the same folder, so they arrive on their own too. Power Automate uses Microsoft's own connector, so it needs no app
                    registration and nobody's permission: you only need the mailbox access you already have.
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {folder?.state === 'needs-permission' ? (
                    <button
                      className="btn primary"
                      onClick={async () => {
                        if (await local.resumeFolder()) window.location.reload();
                        else setMsg({ ok: false, text: 'The browser did not allow the folder. Choose it again below.' });
                      }}
                    >
                      <Icon.folder /> Allow the folder again
                    </button>
                  ) : null}
                  {folder?.state !== 'unsupported' && (
                    <button
                      className="btn"
                      onClick={async () => {
                        try {
                          const name = await local.connectFolder();
                          setMsg({ ok: true, text: `Watching ${name}.` });
                        } catch (e) {
                          const m = e instanceof Error ? e.message : String(e);
                          if (!/abort/i.test(m)) setMsg({ ok: false, text: m });
                        }
                      }}
                    >
                      <Icon.folder /> {folder?.state === 'watching' ? 'Change folder' : 'Choose the shared folder'}
                    </button>
                  )}
                  {folder?.state === 'watching' && (
                    <>
                      <button
                        className="btn"
                        onClick={async () => {
                          const r = await local.scanNow();
                          setMsg({ ok: true, text: r.added ? `${r.added} new email(s).` : 'Nothing new in the folder.' });
                        }}
                      >
                        <Icon.refresh /> Check now
                      </button>
                      <button className="btn" onClick={async () => { await local.forgetFolder(); window.location.reload(); }}>
                        Stop watching
                      </button>
                    </>
                  )}
                </div>
                <details>
                  <summary className="small muted" style={{ cursor: 'pointer' }}>How to build the flow (about ten minutes, once)</summary>
                  <ol style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
                    <li>Go to make.powerautomate.com and choose <b>Create › Automated cloud flow</b>.</li>
                    <li>Trigger: <b>When a new email arrives in a shared mailbox (V2)</b>. Put the shared mailbox address in, folder Inbox, and set <b>Include Attachments</b> to Yes.</li>
                    <li>Add <b>OneDrive for Business › Create file</b>. Folder: the <span className="mono">emails</span> folder inside the shared folder. File name: <span className="mono">msg-@{'{'}triggerOutputs()?['body/id']{'}'}.json</span> is fussy, so use the expression <span className="mono">concat('msg-', utcNow('yyyyMMddHHmmssfff'), '.json')</span>.</li>
                    <li>
                      File content: a JSON object with <span className="mono">subject</span>, <span className="mono">body</span>, <span className="mono">from</span>, <span className="mono">receivedAt</span> and an <span className="mono">attachments</span> list of
                      file names, filled from the trigger's dynamic content.
                    </li>
                    <li>Then <b>Apply to each</b> attachment, with another <b>Create file</b> into the same folder, named <span className="mono">&lt;the same msg- name&gt;__&lt;attachment name&gt;</span>.</li>
                    <li>Save it, send a test email to the shared mailbox, and press <b>Check now</b> above.</li>
                  </ol>
                  <span className="small muted">The exact expressions are in docs/setup.md, which is easier to copy from than this box.</span>
                </details>
              </div>
            )}
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
                  With a shared folder, the board is already in SharePoint or OneDrive and backed up with everything else there. Without one, it lives only in this browser, so save a copy somewhere safe now and then.
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
