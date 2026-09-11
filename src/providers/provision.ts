// First-run setup. The app builds its own SharePoint lists, job folder and
// filing list, then checks that it can read the shared mailbox and the client's
// template. Everything here runs as the signed-in person through Microsoft
// Graph, so it needs no administrator and creates nothing outside the one site.
//
// None of these calls has been run against a real tenant yet. Each step reports
// its own outcome and a plain-English fix, and any step can be done by hand
// instead: the column list is in docs/setup.md.

import { PublicClientApplication, InteractionRequiredAuthError, type AccountInfo } from '@azure/msal-browser';
import type { AppConfig } from './config';
import { SETUP_SCOPES } from './scopes';

const GRAPH = 'https://graph.microsoft.com/v1.0';

export type StepStatus = 'waiting' | 'running' | 'ok' | 'warn' | 'fail';

export interface Step {
  key: string;
  label: string;
  status: StepStatus;
  /** What happened, in a sentence. */
  detail?: string;
  /** What to do about it, when something went wrong. */
  fix?: string;
}

export interface ProvisionInput {
  tenantId: string;
  clientId: string;
  siteUrl: string;
  sharedMailbox: string;
  jobsRootFolder: string;
  contractor: string;
  contractorEmail: string;
  clientName: string;
  clientDomains: string;
  ownDomains: string;
  /** Optional: the client's pristine template, uploaded during setup. */
  templateFile?: File | null;
}

// ---- column definitions -------------------------------------------------

type ColumnSpec =
  | { name: string; kind: 'text' }
  | { name: string; kind: 'note' }
  | { name: string; kind: 'number' }
  | { name: string; kind: 'date' }
  | { name: string; kind: 'yesno' }
  | { name: string; kind: 'choice'; choices: string[] };

/** The board. One row per job; Title holds the work order number. */
export const QUOTES_COLUMNS: ColumnSpec[] = [
  { name: 'PurchaseOrder', kind: 'text' },
  { name: 'Address', kind: 'text' },
  { name: 'Postcode', kind: 'text' },
  { name: 'LocationOfWorks', kind: 'text' },
  { name: 'JobTitle', kind: 'text' },
  { name: 'Client', kind: 'text' },
  { name: 'Stage', kind: 'choice', choices: ['To review', 'To check and amend', 'Ready to send', 'Sent'] },
  { name: 'ContactName', kind: 'text' },
  { name: 'ContactPhone', kind: 'text' },
  // Text, not a date column: the provider writes an empty string when a job has
  // no date yet, which a SharePoint date column refuses. Values are ISO yyyy-mm-dd.
  { name: 'DateIssued', kind: 'text' },
  { name: 'Attended', kind: 'text' },
  { name: 'TypeOfWorks', kind: 'text' },
  { name: 'Priority', kind: 'text' },
  { name: 'Total', kind: 'number' },
  { name: 'FolderUrl', kind: 'note' },
  { name: 'FolderId', kind: 'text' },
  { name: 'QuoteFileName', kind: 'note' },
  { name: 'QuoteJson', kind: 'note' },
  { name: 'ReportJson', kind: 'note' },
  { name: 'PhotosJson', kind: 'note' },
  { name: 'SourcesJson', kind: 'note' },
  { name: 'FlagJson', kind: 'note' },
];

/** One row per email the app has dealt with, so nothing is filed twice. */
export const INBOX_COLUMNS: ColumnSpec[] = [
  { name: 'ConversationId', kind: 'note' },
  { name: 'JobId', kind: 'text' },
  { name: 'Rule', kind: 'text' },
  { name: 'Ignored', kind: 'yesno' },
];

/** Turn a column spec into the body Microsoft Graph expects. */
export function columnBody(c: ColumnSpec): Record<string, unknown> {
  switch (c.kind) {
    case 'text':
      return { name: c.name, text: { allowMultipleLines: false, appendChangesToExistingText: false, linesForEditing: 0, maxLength: 255 } };
    case 'note':
      return { name: c.name, text: { allowMultipleLines: true, appendChangesToExistingText: false, linesForEditing: 6, textType: 'plain' } };
    case 'number':
      return { name: c.name, number: { decimalPlaces: 'two', displayAs: 'number' } };
    case 'date':
      return { name: c.name, dateTime: { displayAs: 'default', format: 'dateOnly' } };
    case 'yesno':
      return { name: c.name, boolean: {} };
    case 'choice':
      return { name: c.name, choice: { allowTextEntry: false, choices: c.choices, displayAs: 'dropDownMenu' } };
  }
}

// ---- pure helpers -------------------------------------------------------

export interface SiteRef {
  hostname: string;
  /** Server-relative path, e.g. /sites/Quotes. Empty for the root site. */
  path: string;
}

/**
 * Pull the site out of whatever the user pasted: the site's home page, a
 * document library view, a link with a query string, or the bare host.
 */
export function parseSiteUrl(raw: string): SiteRef {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Paste the address of the SharePoint site.');
  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error(`"${raw}" is not a web address. Open the site in SharePoint and copy the address bar.`);
  }
  if (!url.hostname.includes('.')) throw new Error(`"${url.hostname}" is not a SharePoint address.`);
  const parts = url.pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p));
  const lead = parts[0]?.toLowerCase();
  if ((lead === 'sites' || lead === 'teams') && parts[1]) return { hostname: url.hostname, path: `/${parts[0]}/${parts[1]}` };
  return { hostname: url.hostname, path: '' };
}

/** The Graph address for a site, ready to drop into a request path. */
export function siteLookupPath(ref: SiteRef): string {
  return ref.path ? `/sites/${ref.hostname}:${ref.path.split('/').map(encodeURIComponent).join('/')}` : `/sites/${ref.hostname}`;
}

/** A folder name for a job, matching what the provider creates. */
export function slugFolder(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Turn a failed Graph call into something a builder can act on. Returns null
 * when nothing specific is recognised, so the caller can show the raw message.
 */
export function diagnose(message: string): string | null {
  const m = message.toLowerCase();
  if (m.includes('aadsts65001') || m.includes('consent_required') || m.includes('interaction_required')) {
    return 'Your organisation has not agreed to these permissions yet. Sign in again and accept the prompt, or ask whoever holds the Microsoft 365 admin account to press "Grant admin consent" once on the app registration.';
  }
  if (m.includes('aadsts50011') || m.includes('redirect_uri')) {
    return 'The address of this page is not listed on the app registration. Copy the address from your browser bar and add it under Authentication › Single-page application › Redirect URIs.';
  }
  if (m.includes('aadsts700016') || m.includes('unauthorized_client')) {
    return 'That Application (client) ID was not found in this directory. Check you copied it from the app registration Overview page, and that the Directory (tenant) ID matches.';
  }
  if (m.includes('aadsts50105')) {
    return 'Your account is not assigned to this app. Either switch off "Assignment required" on the enterprise application, or add yourself under Users and groups.';
  }
  if (m.includes('accessdenied') || m.includes(' 403')) {
    return 'Microsoft refused the request. Usually this means the signed-in account does not have access to that mailbox or site, rather than a problem with the app.';
  }
  if (m.includes('itemnotfound') || m.includes('resourcenotfound') || m.includes(' 404')) {
    return 'Microsoft could not find that. Check the address you pasted, and that the site or file still exists.';
  }
  if (m.includes('mailboxnotenabledforrestapi') || m.includes('mailboxinactive')) {
    return 'That address is not a mailbox Graph can read. Use the shared mailbox address exactly as it appears in Outlook.';
  }
  if (m.includes('wac access token')) {
    return 'Excel on the web could not open the workbook. The account needs an Office licence that includes Excel for the web, and the file must be a real .xlsx in SharePoint.';
  }
  if (m.includes('failed to fetch') || m.includes('networkerror')) {
    return 'The browser could not reach Microsoft. Check the network, and that login.microsoftonline.com and graph.microsoft.com are not blocked.';
  }
  return null;
}

// ---- sign-in ------------------------------------------------------------

export function createMsal(tenantId: string, clientId: string, redirectUri?: string): PublicClientApplication {
  return new PublicClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri: redirectUri ?? window.location.origin + window.location.pathname,
    },
    cache: { cacheLocation: 'sessionStorage' },
  });
}

/** Sign in if needed. Uses a redirect, so the caller must save its state first. */
export async function ensureSignedIn(msal: PublicClientApplication): Promise<AccountInfo | null> {
  await msal.initialize();
  const result = await msal.handleRedirectPromise();
  const account = result?.account ?? msal.getAllAccounts()[0] ?? null;
  if (account) {
    msal.setActiveAccount(account);
    return account;
  }
  return null;
}

// ---- the provisioner ----------------------------------------------------

export class Provisioner {
  /**
   * @param scopes SETUP_SCOPES while building the site, because creating lists
   * and columns needs Sites.Manage.All. The read-only check uses the everyday
   * scopes, so it proves what a colleague's session will actually be able to do.
   */
  constructor(
    private msal: PublicClientApplication,
    private scopes: string[] = SETUP_SCOPES,
  ) {}

  private async token(): Promise<string> {
    const account = this.msal.getActiveAccount() ?? this.msal.getAllAccounts()[0];
    try {
      const r = await this.msal.acquireTokenSilent({ scopes: this.scopes, account: account ?? undefined });
      return r.accessToken;
    } catch (e) {
      if (e instanceof InteractionRequiredAuthError) {
        await this.msal.acquireTokenRedirect({ scopes: this.scopes });
        return new Promise(() => undefined);
      }
      throw e;
    }
  }

  private async graph<T>(path: string, init: RequestInit = {}, headers: Record<string, string> = {}): Promise<T> {
    const res = await fetch(path.startsWith('http') ? path : `${GRAPH}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json', ...headers, ...(init.headers as Record<string, string> | undefined) },
    });
    if (!res.ok) {
      const body = await res.text();
      let detail = body;
      try {
        const parsed = JSON.parse(body) as { error?: { code?: string; message?: string } };
        if (parsed.error) detail = `${parsed.error.code ?? ''} ${parsed.error.message ?? ''}`.trim();
      } catch {
        /* keep the raw body */
      }
      throw new Error(`${res.status} ${detail}`.slice(0, 400));
    }
    if (res.status === 204) return undefined as T;
    const ct = res.headers.get('content-type') ?? '';
    return (ct.includes('application/json') ? res.json() : res.text()) as Promise<T>;
  }

  /** Every list on the site, so we can match ours by name. */
  private async lists(siteId: string): Promise<{ id: string; displayName: string; name?: string }[]> {
    const r = await this.graph<{ value: { id: string; displayName: string; name?: string }[] }>(`/sites/${siteId}/lists?$select=id,displayName,name&$top=200`);
    return r.value;
  }

  private async ensureList(siteId: string, displayName: string, columns: ColumnSpec[]): Promise<{ id: string; created: boolean; addedColumns: string[]; skipped: string[] }> {
    const existing = (await this.lists(siteId)).find((l) => l.displayName === displayName || l.name === displayName);
    if (!existing) {
      const made = await this.graph<{ id: string }>(`/sites/${siteId}/lists`, {
        method: 'POST',
        body: JSON.stringify({ displayName, list: { template: 'genericList' }, columns: columns.map(columnBody) }),
      });
      return { id: made.id, created: true, addedColumns: columns.map((c) => c.name), skipped: [] };
    }
    const have = new Set((await this.graph<{ value: { name: string }[] }>(`/sites/${siteId}/lists/${existing.id}/columns?$select=name&$top=200`)).value.map((c) => c.name));
    const added: string[] = [];
    const skipped: string[] = [];
    for (const c of columns.filter((c) => !have.has(c.name))) {
      try {
        await this.graph(`/sites/${siteId}/lists/${existing.id}/columns`, { method: 'POST', body: JSON.stringify(columnBody(c)) });
        added.push(c.name);
      } catch (e) {
        skipped.push(`${c.name} (${e instanceof Error ? e.message : e})`);
      }
    }
    return { id: existing.id, created: false, addedColumns: added, skipped };
  }

  private async ensureFolder(driveId: string, path: string): Promise<{ id: string; webUrl?: string }> {
    const encoded = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    try {
      return await this.graph<{ id: string; webUrl?: string }>(`/drives/${driveId}/root:/${encoded}`);
    } catch {
      const parts = path.split('/').filter(Boolean);
      const name = parts.pop() as string;
      const parent = parts.map(encodeURIComponent).join('/');
      const target = parent ? `/drives/${driveId}/root:/${parent}:/children` : `/drives/${driveId}/root/children`;
      return this.graph<{ id: string; webUrl?: string }>(target, {
        method: 'POST',
        body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
      });
    }
  }

  /**
   * Work through every setup step, reporting each one as it goes. Never throws:
   * a failed step is reported and the run continues where it sensibly can.
   */
  async run(input: ProvisionInput, onStep: (s: Step) => void): Promise<Partial<AppConfig>> {
    const cfg: Partial<AppConfig> = {
      tenantId: input.tenantId.trim(),
      clientId: input.clientId.trim(),
      redirectUri: window.location.origin + window.location.pathname,
      sharedMailbox: input.sharedMailbox.trim(),
      jobsRootFolder: input.jobsRootFolder.trim() || 'Jobs',
      contractor: input.contractor.trim(),
      contractorEmail: input.contractorEmail.trim(),
      clientName: input.clientName.trim(),
      clientDomains: splitList(input.clientDomains),
      ownDomains: splitList(input.ownDomains),
      pollSeconds: 30,
    };

    const step = async <T>(key: string, label: string, fn: () => Promise<{ value: T; detail: string; warn?: string }>): Promise<T | null> => {
      onStep({ key, label, status: 'running' });
      try {
        const r = await fn();
        onStep({ key, label, status: r.warn ? 'warn' : 'ok', detail: r.detail, fix: r.warn });
        return r.value;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        onStep({ key, label, status: 'fail', detail: message, fix: diagnose(message) ?? undefined });
        return null;
      }
    };

    // 1. Who am I?
    await step('me', 'Signing in', async () => {
      const me = await this.graph<{ displayName?: string; userPrincipalName?: string }>('/me?$select=displayName,userPrincipalName');
      return { value: me, detail: `Signed in as ${me.displayName ?? me.userPrincipalName ?? 'you'}.` };
    });

    // 2. The site.
    const site = await step('site', 'Finding the SharePoint site', async () => {
      const ref = parseSiteUrl(input.siteUrl);
      const s = await this.graph<{ id: string; displayName?: string; webUrl?: string }>(`${siteLookupPath(ref)}?$select=id,displayName,webUrl`);
      return { value: s, detail: `${s.displayName ?? 'Site'} — ${s.webUrl ?? ''}` };
    });
    if (!site) return cfg;
    cfg.siteId = site.id;

    // 3. The two lists.
    const quotes = await step('quotesList', 'Setting up the quote board list', async () => {
      const r = await this.ensureList(site.id, 'Quotes', QUOTES_COLUMNS);
      return {
        value: r,
        detail: r.created ? 'Created the Quotes list with all of its columns.' : r.addedColumns.length ? `Used the existing Quotes list and added ${r.addedColumns.length} missing column${r.addedColumns.length === 1 ? '' : 's'}.` : 'Used the existing Quotes list; every column was already there.',
        warn: r.skipped.length ? `These columns could not be added and need making by hand: ${r.skipped.join('; ')}` : undefined,
      };
    });
    if (quotes) cfg.quotesListId = quotes.id;

    const inbox = await step('inboxList', 'Setting up the email filing list', async () => {
      const r = await this.ensureList(site.id, 'Quote inbox', INBOX_COLUMNS);
      return {
        value: r,
        detail: r.created ? 'Created the Quote inbox list.' : 'Used the existing Quote inbox list.',
        warn: r.skipped.length ? `These columns could not be added and need making by hand: ${r.skipped.join('; ')}` : undefined,
      };
    });
    if (inbox) cfg.inboxListId = inbox.id;

    // 4. The document library and the job folder.
    const drive = await step('drive', 'Finding the document library', async () => {
      const d = await this.graph<{ id: string; name?: string; webUrl?: string }>(`/sites/${site.id}/drive?$select=id,name,webUrl`);
      return { value: d, detail: `${d.name ?? 'Documents'} — job folders will be created inside it.` };
    });
    if (!drive) return cfg;
    cfg.driveId = drive.id;

    await step('folders', 'Creating the job and template folders', async () => {
      const jobs = await this.ensureFolder(drive.id, cfg.jobsRootFolder as string);
      await this.ensureFolder(drive.id, 'Templates');
      return { value: jobs, detail: `"${cfg.jobsRootFolder}" and "Templates" are ready.` };
    });

    // 5. The client's template.
    const template = await step('template', "Storing the client's template", async () => {
      if (input.templateFile) {
        const name = input.templateFile.name;
        const item = await this.graph<{ id: string; name: string; webUrl?: string }>(`/drives/${drive.id}/root:/Templates/${encodeURIComponent(name)}:/content`, {
          method: 'PUT',
          body: input.templateFile,
          headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        });
        return { value: item, detail: `Uploaded ${item.name} to the Templates folder.` };
      }
      const children = await this.graph<{ value: { id: string; name: string }[] }>(`/drives/${drive.id}/root:/Templates:/children?$select=id,name`);
      const xlsx = children.value.filter((c) => c.name.toLowerCase().endsWith('.xlsx'));
      if (!xlsx.length) throw new Error("No .xlsx in the Templates folder. Upload the client's blank template there, or choose the file above.");
      return {
        value: xlsx[0],
        detail: `Using ${xlsx[0].name}.`,
        warn: xlsx.length > 1 ? `There are ${xlsx.length} spreadsheets in Templates; the app will use ${xlsx[0].name}. Keep only the current one there.` : undefined,
      };
    });
    if (template) cfg.templateItemId = template.id;

    // 6. Can we read the template's own code and rate tables?
    if (template) {
      await step('workbook', 'Reading the code and rate tables from the template', async () => {
        const tables = await this.graph<{ value: { name: string }[] }>(`/drives/${drive.id}/items/${template.id}/workbook/tables?$select=name`);
        const names = tables.value.map((t) => t.name);
        const hasSor = names.some((n) => /^SOR/i.test(n));
        const hasRates = names.some((n) => /rates/i.test(n));
        return {
          value: names,
          detail: hasSor && hasRates ? `Found ${names.length} tables including the code list and the rate table.` : `Found ${names.length} tables: ${names.join(', ') || 'none'}.`,
          warn: hasSor && hasRates ? undefined : 'The app expects a table whose name starts with SOR for the code list and one containing "Rates" for the contractor discount. Check this is the client\'s current template.',
        };
      });
    }

    // 7. The shared mailbox.
    await step('mailbox', 'Reading the shared mailbox', async () => {
      const r = await this.graph<{ value: { subject?: string; receivedDateTime?: string }[] }>(
        `/users/${encodeURIComponent(cfg.sharedMailbox as string)}/mailFolders/inbox/messages?$top=1&$select=subject,receivedDateTime`,
      );
      if (!r.value.length) return { value: r.value, detail: 'The mailbox opened, but its inbox is empty.' };
      return { value: r.value, detail: `Newest message: "${(r.value[0].subject ?? '(no subject)').slice(0, 60)}".` };
    });

    return cfg;
  }

  /** Read-only version, for the "check connection" button once set up. */
  async check(cfg: AppConfig, onStep: (s: Step) => void): Promise<void> {
    const probe = async (key: string, label: string, fn: () => Promise<string>) => {
      onStep({ key, label, status: 'running' });
      try {
        onStep({ key, label, status: 'ok', detail: await fn() });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        onStep({ key, label, status: 'fail', detail: message, fix: diagnose(message) ?? undefined });
      }
    };
    await probe('me', 'Signed in', async () => {
      const me = await this.graph<{ displayName?: string }>('/me?$select=displayName');
      return me.displayName ?? 'you';
    });
    await probe('site', 'The quotes site', async () => {
      const s = await this.graph<{ displayName?: string; webUrl?: string }>(`/sites/${cfg.siteId}?$select=displayName,webUrl`);
      return `${s.displayName ?? ''} ${s.webUrl ?? ''}`.trim();
    });
    await probe('quotesList', 'The board list', async () => {
      const l = await this.graph<{ displayName: string }>(`/sites/${cfg.siteId}/lists/${cfg.quotesListId}?$select=displayName`);
      const n = await this.graph<{ value: unknown[] }>(`/sites/${cfg.siteId}/lists/${cfg.quotesListId}/items?$top=200&$select=id`);
      return `${l.displayName}: ${n.value.length} job${n.value.length === 1 ? '' : 's'}`;
    });
    await probe('inboxList', 'The filing list', async () => {
      const l = await this.graph<{ displayName: string }>(`/sites/${cfg.siteId}/lists/${cfg.inboxListId}?$select=displayName`);
      return l.displayName;
    });
    await probe('drive', 'The document library', async () => {
      const d = await this.graph<{ name?: string }>(`/drives/${cfg.driveId}?$select=name`);
      return d.name ?? 'Documents';
    });
    await probe('template', "The client's template", async () => {
      const t = await this.graph<{ name: string }>(`/drives/${cfg.driveId}/items/${cfg.templateItemId}?$select=name`);
      return t.name;
    });
    await probe('workbook', 'Excel on the web can open the template', async () => {
      const tables = await this.graph<{ value: { name: string }[] }>(`/drives/${cfg.driveId}/items/${cfg.templateItemId}/workbook/tables?$select=name`);
      return `${tables.value.length} tables: ${tables.value.map((t) => t.name).join(', ')}`;
    });
    await probe('mailbox', 'The shared mailbox', async () => {
      const r = await this.graph<{ value: { subject?: string }[] }>(`/users/${encodeURIComponent(cfg.sharedMailbox)}/mailFolders/inbox/messages?$top=1&$select=subject`);
      return r.value.length ? `newest: "${(r.value[0].subject ?? '(no subject)').slice(0, 50)}"` : 'inbox is empty';
    });
  }
}

export function splitList(s: string): string[] {
  return s
    .split(/[,;\s]+/)
    .map((x) => x.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}
