// First run. Everything the app needs is built here, by the person sitting in
// front of it, using their own Microsoft account. No administrator, and nothing
// created outside the one SharePoint site.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type AppConfig, DRAFT_KEY, configJson, missingKeys, saveStoredConfig, withDefaults } from '../providers/config';
import { Provisioner, type ProvisionInput, type Step, createMsal, diagnose, ensureSignedIn } from '../providers/provision';
import { SETUP_SCOPES } from '../providers/scopes';
import { Icon } from './bits';

type Draft = Omit<ProvisionInput, 'templateFile'>;

const BLANK: Draft = {
  tenantId: '',
  clientId: '',
  siteUrl: '',
  sharedMailbox: '',
  jobsRootFolder: 'Jobs',
  contractor: '',
  contractorEmail: '',
  clientName: '',
  clientDomains: '',
  ownDomains: '',
};

function readDraft(): Draft {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? { ...BLANK, ...(JSON.parse(raw) as Partial<Draft>) } : BLANK;
  } catch {
    return BLANK;
  }
}

const REDIRECT_URI = window.location.origin + window.location.pathname;

export function Connect({ onDemo, onLocal }: { onDemo: () => void; onLocal: () => void }) {
  const [draft, setDraft] = useState<Draft>(readDraft);
  const [account, setAccount] = useState<string | null>(null);
  const [busy, setBusy] = useState<'signin' | 'run' | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [done, setDone] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const msalRef = useRef<ReturnType<typeof createMsal> | null>(null);

  const set = useCallback((k: keyof Draft, v: string) => {
    setDraft((d) => {
      const next = { ...d, [k]: v };
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      } catch {
        /* the form still works, it just will not survive the sign-in hop */
      }
      return next;
    });
  }, []);

  // Coming back from the Microsoft sign-in page: pick the account back up.
  useEffect(() => {
    const d = readDraft();
    if (!d.tenantId || !d.clientId) return;
    (async () => {
      try {
        const msal = createMsal(d.tenantId, d.clientId, REDIRECT_URI);
        msalRef.current = msal;
        const acct = await ensureSignedIn(msal);
        if (acct) setAccount(acct.username);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        setError(diagnose(m) ?? m);
      }
    })();
  }, []);

  const ready = draft.tenantId.trim() && draft.clientId.trim() && draft.siteUrl.trim() && draft.sharedMailbox.trim() && draft.contractor.trim() && draft.clientName.trim();

  const signIn = async () => {
    setError(null);
    setBusy('signin');
    try {
      const msal = createMsal(draft.tenantId.trim(), draft.clientId.trim(), REDIRECT_URI);
      msalRef.current = msal;
      const acct = await ensureSignedIn(msal);
      if (acct) {
        setAccount(acct.username);
        setBusy(null);
        return;
      }
      await msal.loginRedirect({ scopes: SETUP_SCOPES, redirectUri: REDIRECT_URI });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(diagnose(m) ?? m);
      setBusy(null);
    }
  };

  const run = async () => {
    const msal = msalRef.current;
    if (!msal) return;
    setError(null);
    setBusy('run');
    setSteps([]);
    try {
      const p = new Provisioner(msal);
      const partial = await p.run({ ...draft, templateFile }, (s) => {
        setSteps((prev) => {
          const i = prev.findIndex((x) => x.key === s.key);
          if (i === -1) return [...prev, s];
          const next = [...prev];
          next[i] = s;
          return next;
        });
      });
      const missing = missingKeys(partial);
      if (missing.length) {
        setError(`Setup stopped before it finished. Still missing: ${missing.join(', ')}. Fix the failed step above and press Set up again.`);
      } else {
        const cfg = withDefaults(partial);
        saveStoredConfig(cfg);
        setDone(cfg);
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(diagnose(m) ?? m);
    }
    setBusy(null);
  };

  const json = useMemo(() => (done ? configJson(done) : ''), [done]);

  if (done) {
    return (
      <div className="connect">
        <div className="connect-card wide">
          <div className="connect-done">
            <span className="tick">
              <Icon.check size={26} />
            </span>
            <div>
              <h1>Connected</h1>
              <p className="sub">The board, the filing list and the job folders are ready on your SharePoint site. These settings are saved in this browser, so this machine is set up.</p>
            </div>
          </div>
          <div className="panel">
            <h3>To set everyone else up in one go</h3>
            <p className="small muted" style={{ marginTop: 0 }}>
              Save the text below as <span className="mono">public/config.json</span> in the code repository and push it. From then on anyone who opens the app is connected straight away and nobody repeats this setup. Nothing here is secret: it is a set of
              addresses and identifiers, and every person still signs in as themselves.
            </p>
            <pre className="code-block">{json}</pre>
            <div style={{ display: 'flex', gap: 8 }}>
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
              <button className="btn primary" onClick={() => window.location.reload()}>
                Open the quote board <Icon.arrow />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="connect">
      <div className="connect-card">
        <div className="connect-head">
          <div className="logo">
            <Icon.sheet size={20} />
          </div>
          <div>
            <h1>Connect to your Microsoft 365</h1>
            <p className="sub">A few details, one sign-in, and the app builds the rest for itself. It only ever touches the site and mailbox you name here.</p>
          </div>
        </div>

        <div className="note">
          <Icon.info />
          <span>
            Want to look around first? <button className="linkbtn" onClick={onDemo}>Open it with example data</button> — made-up jobs, no sign-in, nothing leaves this browser.
          </span>
        </div>

        <div className="panel choose">
          <h3>Two ways to run it</h3>
          <div className="choice-grid">
            <div className="choice">
              <b>On this PC</b>
              <p>
                No sign-in, no app registration, nobody's permission needed. You load the client's template once, keep jobs in this browser, and the finished quote comes out as a script you run in Excel on the web. Emails and photos are added by hand.
              </p>
              <button className="btn primary" onClick={onLocal}>
                Start on this PC <Icon.arrow />
              </button>
            </div>
            <div className="choice">
              <b>Microsoft 365</b>
              <p>
                The shared version: the board is live for everyone, the shared mailbox files itself, and the app writes the spreadsheet into SharePoint. It needs an app registration in your directory, which is set up below.
              </p>
              <span className="small muted">If the registration page is not open to you, use the left-hand option. Microsoft has no way around that one.</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <h3>1. The app registration</h3>
          <p className="small muted" style={{ marginTop: 0 }}>
            This is the one thing that exists outside the app: a name for it in your own directory, so Microsoft knows what is asking to sign you in. At{' '}
            <a href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade" target="_blank" rel="noreferrer">
              entra.microsoft.com
            </a>{' '}
            choose <b>New registration</b>, name it "Quote Desk", leave it on <b>single tenant</b>, set the platform to <b>Single-page application</b> and paste this page's address as the redirect:
          </p>
          <pre className="code-block small-block">{REDIRECT_URI}</pre>
          <p className="small muted">
            Then open <b>API permissions</b> and add the delegated Microsoft Graph permissions <span className="mono">User.Read</span>, <span className="mono">Mail.Read.Shared</span>, <span className="mono">Sites.ReadWrite.All</span>, <span className="mono">Files.ReadWrite.All</span> and <span className="mono">Sites.Manage.All</span>. Copy the Application (client) ID and Directory (tenant) ID from the Overview page into the boxes below. If the New registration button is missing, or sign-in later says "Need admin approval",
            whoever holds your Microsoft 365 admin account has to do that part once — it is two clicks and nothing else.
          </p>
        </div>

        <div className="panel">
          <h3>2. Where things live</h3>
          <div className="form-grid">
            <label>
              <span>Directory (tenant) ID</span>
              <input className="input mono" value={draft.tenantId} onChange={(e) => set('tenantId', e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" spellCheck={false} />
            </label>
            <label>
              <span>Application (client) ID</span>
              <input className="input mono" value={draft.clientId} onChange={(e) => set('clientId', e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" spellCheck={false} />
            </label>
            <label className="wide">
              <span>SharePoint site address</span>
              <input className="input" value={draft.siteUrl} onChange={(e) => set('siteUrl', e.target.value)} placeholder="https://yourcompany.sharepoint.com/sites/Quotes" spellCheck={false} />
              <em>Any site you own. Open it in SharePoint and copy the address bar. If you have not got one, press Create site on the SharePoint start page first.</em>
            </label>
            <label className="wide">
              <span>Shared mailbox address</span>
              <input className="input" value={draft.sharedMailbox} onChange={(e) => set('sharedMailbox', e.target.value)} placeholder="quotes@yourcompany.co.uk" spellCheck={false} />
              <em>The mailbox the client's requests arrive in. You need to already see it in Outlook; the app reads it as you and never changes anything in it.</em>
            </label>
            <label>
              <span>Your company name</span>
              <input className="input" value={draft.contractor} onChange={(e) => set('contractor', e.target.value)} placeholder="R Dunham" />
            </label>
            <label>
              <span>Client name</span>
              <input className="input" value={draft.clientName} onChange={(e) => set('clientName', e.target.value)} placeholder="Sanctuary" />
            </label>
            <label>
              <span>Client email domains</span>
              <input className="input" value={draft.clientDomains} onChange={(e) => set('clientDomains', e.target.value)} placeholder="sanctuary-housing.co.uk" spellCheck={false} />
              <em>Used to tell the client's emails from your own. Separate several with commas.</em>
            </label>
            <label>
              <span>Your own email domains</span>
              <input className="input" value={draft.ownDomains} onChange={(e) => set('ownDomains', e.target.value)} placeholder="rdunham.co.uk" spellCheck={false} />
            </label>
            <label>
              <span>Folder for job files</span>
              <input className="input" value={draft.jobsRootFolder} onChange={(e) => set('jobsRootFolder', e.target.value)} placeholder="Jobs" />
              <em>Created inside the site's Documents library.</em>
            </label>
            <label>
              <span>Your email (optional)</span>
              <input className="input" value={draft.contractorEmail} onChange={(e) => set('contractorEmail', e.target.value)} placeholder="quotes@rdunham.co.uk" spellCheck={false} />
            </label>
            <label className="wide">
              <span>The client's blank template</span>
              <input className="input file" type="file" accept=".xlsx" onChange={(e) => setTemplateFile(e.target.files?.[0] ?? null)} />
              <em>
                {templateFile ? `${templateFile.name} will be uploaded to a Templates folder on the site.` : 'Optional. Leave empty if the template is already in a Templates folder on that site. The app fills a copy of it and never re-saves the original.'}
              </em>
            </label>
          </div>
        </div>

        <div className="panel">
          <h3>3. Sign in and build it</h3>
          {account ? (
            <div className="note ok">
              <Icon.check />
              <span>
                Signed in as <b>{account}</b>.
              </span>
            </div>
          ) : (
            <p className="small muted" style={{ marginTop: 0 }}>
              You will be sent to Microsoft's sign-in page and back. Nothing is sent anywhere else.
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={signIn} disabled={!ready || busy !== null}>
              {busy === 'signin' ? 'Opening Microsoft…' : account ? 'Sign in as someone else' : 'Sign in with Microsoft'}
            </button>
            <button className="btn primary" onClick={run} disabled={!account || busy !== null}>
              {busy === 'run' ? 'Setting up…' : 'Set up the site'} <Icon.arrow />
            </button>
          </div>
          {!ready && <span className="small muted">Fill in the boxes above first.</span>}

          {steps.length > 0 && (
            <div className="steps">
              {steps.map((s) => (
                <div key={s.key} className={`step ${s.status}`}>
                  <span className="step-mark">
                    {s.status === 'ok' && <Icon.check size={14} />}
                    {s.status === 'warn' && <Icon.info size={14} />}
                    {s.status === 'fail' && <Icon.x size={14} />}
                    {s.status === 'running' && <span className="spin" />}
                  </span>
                  <div>
                    <b>{s.label}</b>
                    {s.detail && <span className="step-detail">{s.detail}</span>}
                    {s.fix && <span className="step-fix">{s.fix}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="note danger">
              <Icon.info />
              <span>{error}</span>
            </div>
          )}
        </div>

        <p className="small muted center">
          Stuck? Every step above can be done by hand instead — the list of columns and folders is in <span className="mono">docs/setup.md</span>.
        </p>
      </div>
    </div>
  );
}
