import type { Email, Job, RateAdjustment, SorCode } from '../lib/types';
import type { DataProvider } from '../providers/types';
import { Icon, fmtDateTime } from './bits';

interface Props {
  provider: DataProvider;
  jobs: Job[];
  emails: Email[];
  sor: SorCode[];
  rates: RateAdjustment[];
  onReset: () => void;
}

export function Setup({ provider, jobs, emails, sor, rates, onReset }: Props) {
  const me = provider.me();
  const live = provider.liveStatus();
  const s = provider.settings();
  return (
    <>
      <div className="topbar">
        <div>
          <h1>Setup &amp; data</h1>
          <div className="sub">Where things live, who can see them, and how the app is connected.</div>
        </div>
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
                <span className="k">Last checked</span><span>{live.lastSync ? fmtDateTime(live.lastSync) : '—'}{live.polling ? ' · refreshing automatically' : ''}</span>
                <span className="k">Recently editing</span><span>{live.recentEditors.length ? live.recentEditors.join(', ') : 'just you'}</span>
                <span className="k">On the board</span><span>{jobs.length} jobs · {emails.length} emails seen · {sor.length.toLocaleString('en-GB')} SOR codes · {rates.length} contractor rate{rates.length === 1 ? '' : 's'}</span>
                <span className="k">Contractor</span><span>{s.contractor}{s.contractorEmail ? ` · ${s.contractorEmail}` : ''}</span>
                <span className="k">Client</span><span>{s.clientName}{s.clientDomains.length ? ` · ${s.clientDomains.join(', ')}` : ''}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {provider.mode === 'demo' ? (
                  <button className="btn" onClick={async () => { await provider.signOut(); onReset(); }}>
                    <Icon.refresh /> Reset demo data
                  </button>
                ) : (
                  <button className="btn" onClick={() => provider.signOut()}>
                    Sign out
                  </button>
                )}
              </div>
            </div>
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
            <div className="panel">
              <h3>Connecting to Microsoft 365</h3>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
                <li>IT registers the app in Entra ID (single tenant, single-page app, redirect set to this page's exact address). The page itself is served as a free static page on Hugging Face, mirrored from the GitHub repository; only code goes there.</li>
                <li>A SharePoint site with a Quotes list, an Inbox filing list, and a library holding job folders and the pristine template.</li>
                <li>Full Access to the shared mailbox for the people who will use the app.</li>
                <li>A <span className="mono">config.json</span> next to the app with the ids above.</li>
              </ol>
              <span className="small muted">The full column list and permissions are in docs/m365-setup.md in the repository.</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
