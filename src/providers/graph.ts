// Microsoft 365 mode. The browser signs the user in to their own tenant and
// then talks to Microsoft Graph directly: the shared mailbox, a SharePoint
// list of jobs (the shared, live source of truth), a filing list for emails,
// a document library of job folders, and the client's template workbook
// (filled through the Excel API so Excel itself saves it).
//
// Written against the Graph v1.0 reference; not yet run against a real
// tenant. See docs/m365-setup.md for the list columns and app registration.

import { PublicClientApplication, InteractionRequiredAuthError, type AccountInfo } from '@azure/msal-browser';
import { draftJobFromEmail } from '../lib/match';
import { priceQuote } from '../lib/pricing';
import { buildCellMap, buildQuoteFileName, shortRef, type CellWrite } from '../lib/template';
import type { Email, Job, MatchRule, Photo, Quote, RateAdjustment, SorCode, Stage, User } from '../lib/types';
import { applyEmailToJob, autoFile } from './autofile';
import type { AppConfig } from './config';
import type { ChangeEvent, DataProvider, ExportResult, LiveStatus, ProviderSettings } from './types';

const GRAPH = 'https://graph.microsoft.com/v1.0';
// Delegated scopes. Sites.ReadWrite.All is broad. The least-privilege form is delegated
// Sites.Selected (admin consent + a 'write' grant on the one quotes site via
// POST /sites/{id}/permissions); test the Excel workbook endpoints with it before
// dropping Files.ReadWrite.All, since their docs only list Files.* scopes.
const SCOPES = ['User.Read', 'Mail.Read.Shared', 'Sites.ReadWrite.All', 'Files.ReadWrite.All'];

interface ListItem<F> {
  id: string;
  lastModifiedDateTime: string;
  lastModifiedBy?: { user?: { displayName?: string } };
  fields: F;
}

/** Column internal names on the Quotes list. Title holds the work order. */
interface QuoteFields {
  Title: string;
  PurchaseOrder?: string;
  Address?: string;
  Postcode?: string;
  LocationOfWorks?: string;
  JobTitle?: string;
  Client?: string;
  Stage?: string;
  ContactName?: string;
  ContactPhone?: string;
  DateIssued?: string;
  Attended?: string;
  TypeOfWorks?: string;
  Priority?: string;
  Total?: number;
  FolderUrl?: string;
  FolderId?: string;
  QuoteFileName?: string;
  QuoteJson?: string;
  ReportJson?: string;
  PhotosJson?: string;
  SourcesJson?: string;
  FlagJson?: string;
}

/** Column internal names on the Inbox filing list. Title holds the message id. */
interface InboxFields {
  Title: string;
  ConversationId?: string;
  JobId?: string;
  Rule?: string;
  Ignored?: boolean;
}

interface GraphMessage {
  id: string;
  conversationId: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress?: { address?: string } }[];
  receivedDateTime: string;
  hasAttachments?: boolean;
  body?: { content?: string };
  bodyPreview?: string;
}

interface GraphAttachment {
  id: string;
  name: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
}

interface DriveItem {
  id: string;
  name: string;
  webUrl?: string;
  file?: { mimeType?: string };
  folder?: unknown;
  '@microsoft.graph.downloadUrl'?: string;
  thumbnails?: { large?: { url?: string }; medium?: { url?: string } }[];
}

const STAGE_TO_FIELD: Record<Stage, string> = { review: 'To review', amend: 'To check and amend', ready: 'Ready to send', sent: 'Sent' };
const FIELD_TO_STAGE: Record<string, Stage> = Object.fromEntries(Object.entries(STAGE_TO_FIELD).map(([k, v]) => [v, k as Stage]));

export class GraphProvider implements DataProvider {
  readonly mode = 'm365' as const;
  private msal: PublicClientApplication;
  private account: AccountInfo | null = null;
  private jobs = new Map<string, Job>();
  private jobItemIds = new Map<string, string>(); // job id -> list item id
  private emails = new Map<string, Email>();
  private filing = new Map<string, { itemId: string; fields: InboxFields }>(); // message id -> filing row
  private listeners = new Set<(e: ChangeEvent) => void>();
  private timer: number | undefined;
  private lastSync?: string;
  private lastSignature = '';
  private recentEditors: string[] = [];
  private sorCache?: SorCode[];
  private ratesCache?: RateAdjustment[];

  constructor(private cfg: AppConfig) {
    this.msal = new PublicClientApplication({
      auth: {
        clientId: cfg.clientId,
        authority: `https://login.microsoftonline.com/${cfg.tenantId}`, // single tenant: only your organisation's accounts
        redirectUri: cfg.redirectUri ?? window.location.origin + window.location.pathname,
      },
      cache: { cacheLocation: 'sessionStorage' },
    });
  }

  // ---- sign-in ------------------------------------------------------------

  async init(): Promise<void> {
    await this.msal.initialize();
    const result = await this.msal.handleRedirectPromise();
    this.account = result?.account ?? this.msal.getAllAccounts()[0] ?? null;
    if (!this.account) {
      await this.msal.loginRedirect({ scopes: SCOPES });
      return new Promise(() => undefined); // navigation in progress
    }
    this.msal.setActiveAccount(this.account);
    await this.pollOnce(true);
    const every = Math.max(10, this.cfg.pollSeconds ?? 30) * 1000;
    this.timer = window.setInterval(() => void this.pollOnce(false), every);
  }

  me(): User {
    return { name: this.account?.name ?? 'Signed in', email: this.account?.username ?? '', tenantId: this.account?.tenantId };
  }

  async signOut(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.msal.logoutRedirect();
  }

  settings(): ProviderSettings {
    return {
      contractor: this.cfg.contractor,
      contractorEmail: this.cfg.contractorEmail,
      clientName: this.cfg.clientName,
      clientDomains: this.cfg.clientDomains,
      ownDomains: this.cfg.ownDomains,
      clientQuotesMailbox: this.cfg.clientQuotesMailbox,
    };
  }

  private async token(): Promise<string> {
    try {
      const r = await this.msal.acquireTokenSilent({ scopes: SCOPES, account: this.account ?? undefined });
      return r.accessToken;
    } catch (e) {
      if (e instanceof InteractionRequiredAuthError) {
        await this.msal.acquireTokenRedirect({ scopes: SCOPES });
        return new Promise(() => undefined);
      }
      throw e;
    }
  }

  private async graph<T>(path: string, init: RequestInit = {}, headers: Record<string, string> = {}): Promise<T> {
    const url = path.startsWith('http') ? path : `${GRAPH}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json', ...headers, ...(init.headers as Record<string, string> | undefined) },
    });
    if (res.status === 429 || res.status === 503) {
      const wait = Number(res.headers.get('Retry-After') ?? '3') * 1000;
      await new Promise((r) => setTimeout(r, wait));
      return this.graph<T>(path, init, headers);
    }
    if (!res.ok) throw new Error(`Graph ${init.method ?? 'GET'} ${path} failed: ${res.status} ${await res.text()}`);
    if (res.status === 204) return undefined as T;
    const ct = res.headers.get('content-type') ?? '';
    return (ct.includes('application/json') ? res.json() : res.text()) as Promise<T>;
  }

  private async graphBlob(path: string): Promise<Blob> {
    const res = await fetch(`${GRAPH}${path}`, { headers: { Authorization: `Bearer ${await this.token()}` } });
    if (!res.ok) throw new Error(`Graph GET ${path} failed: ${res.status}`);
    return res.blob();
  }

  // ---- live polling -------------------------------------------------------

  private async pollOnce(first: boolean): Promise<void> {
    try {
      const items = await this.graph<{ value: ListItem<QuoteFields>[] }>(
        `/sites/${this.cfg.siteId}/lists/${this.cfg.quotesListId}/items?$expand=fields&$select=id,lastModifiedDateTime,lastModifiedBy&$top=500`,
      );
      const signature = items.value.map((i) => `${i.id}:${i.lastModifiedDateTime}`).join('|');
      const changed = signature !== this.lastSignature;
      this.lastSignature = signature;
      this.lastSync = new Date().toISOString();
      if (changed) {
        this.jobs.clear();
        this.jobItemIds.clear();
        const me = this.me().name;
        const editors = new Set<string>();
        for (const it of items.value) {
          const job = this.fromFields(it);
          this.jobs.set(job.id, job);
          this.jobItemIds.set(job.id, it.id);
          const who = it.lastModifiedBy?.user?.displayName;
          if (who && who !== me && Date.now() - Date.parse(it.lastModifiedDateTime) < 3600_000) editors.add(who);
        }
        this.recentEditors = Array.from(editors);
        if (!first) this.emit({ kind: 'jobs', note: this.recentEditors[0] ? `${this.recentEditors[0]} updated the board` : undefined });
      }
      if (first || changed) await this.loadInbox();
      if (first) await autoFile(this, this.settings());
    } catch (e) {
      console.error(e);
    }
  }

  // ---- jobs ---------------------------------------------------------------

  private fromFields(it: ListItem<QuoteFields>): Job {
    const f = it.fields;
    const parse = <T,>(s: string | undefined, fallback: T): T => {
      if (!s) return fallback;
      try {
        return JSON.parse(s) as T;
      } catch {
        return fallback;
      }
    };
    return {
      id: f.Title,
      workOrder: f.Title,
      purchaseOrder: f.PurchaseOrder || undefined,
      address: f.Address ?? '',
      postcode: f.Postcode ?? '',
      locationOfWorks: f.LocationOfWorks ?? '',
      title: f.JobTitle ?? f.LocationOfWorks ?? '',
      client: f.Client ?? this.cfg.clientName,
      stage: FIELD_TO_STAGE[f.Stage ?? ''] ?? 'review',
      contact: f.ContactName ? { name: f.ContactName, phone: f.ContactPhone ?? '' } : undefined,
      dateIssued: f.DateIssued?.slice(0, 10),
      attended: f.Attended?.slice(0, 10),
      typeOfWorks: (f.TypeOfWorks as Job['typeOfWorks']) || undefined,
      priority: (f.Priority as Job['priority']) || undefined,
      total: f.Total ?? undefined,
      folderUrl: f.FolderUrl || undefined,
      quoteFileName: f.QuoteFileName || undefined,
      quote: parse<Quote | undefined>(f.QuoteJson, undefined),
      report: parse<Job['report']>(f.ReportJson, undefined),
      photos: parse<Photo[]>(f.PhotosJson, []),
      sources: parse<Job['sources']>(f.SourcesJson, {}),
      flag: parse<Job['flag']>(f.FlagJson, undefined),
      updatedAt: it.lastModifiedDateTime,
      updatedBy: it.lastModifiedBy?.user?.displayName,
    };
  }

  private toFields(job: Job): QuoteFields {
    return {
      Title: job.workOrder,
      PurchaseOrder: job.purchaseOrder ?? '',
      Address: job.address,
      Postcode: job.postcode,
      LocationOfWorks: job.locationOfWorks,
      JobTitle: job.title,
      Client: job.client,
      Stage: STAGE_TO_FIELD[job.stage],
      ContactName: job.contact?.name ?? '',
      ContactPhone: job.contact?.phone ?? '',
      DateIssued: job.dateIssued ?? '',
      Attended: job.attended ?? '',
      TypeOfWorks: job.typeOfWorks ?? '',
      Priority: job.priority ?? '',
      Total: job.total ?? 0,
      FolderUrl: job.folderUrl ?? '',
      QuoteFileName: job.quoteFileName ?? '',
      QuoteJson: job.quote ? JSON.stringify(job.quote) : '',
      ReportJson: job.report ? JSON.stringify(job.report) : '',
      PhotosJson: JSON.stringify(job.photos.map(({ url: _u, ...p }) => p)), // urls are re-resolved from the folder
      SourcesJson: JSON.stringify(job.sources),
      FlagJson: job.flag ? JSON.stringify(job.flag) : '',
    };
  }

  async listJobs(): Promise<Job[]> {
    return Array.from(this.jobs.values());
  }

  async getJob(id: string): Promise<Job | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    // Refresh photo thumbnails from the job folder.
    try {
      const children = await this.graph<{ value: DriveItem[] }>(`/drives/${this.cfg.driveId}/root:/${this.folderPath(job)}:/children?$expand=thumbnails&$top=200`);
      const byName = new Map(children.value.map((c) => [c.name, c]));
      const photos = job.photos.map((p) => {
        const item = byName.get(p.name);
        return { ...p, url: item?.thumbnails?.[0]?.large?.url ?? item?.['@microsoft.graph.downloadUrl'] ?? p.url };
      });
      for (const c of children.value) {
        if (c.file?.mimeType?.startsWith('image/') && !photos.some((p) => p.name === c.name)) {
          photos.push({ id: c.id, name: c.name, url: c.thumbnails?.[0]?.large?.url, receivedAt: '', include: true });
        }
      }
      return { ...job, photos };
    } catch {
      return job;
    }
  }

  async updateJob(job: Job): Promise<Job> {
    const itemId = this.jobItemIds.get(job.id);
    if (!itemId) return this.createJob(job);
    await this.graph(`/sites/${this.cfg.siteId}/lists/${this.cfg.quotesListId}/items/${itemId}/fields`, { method: 'PATCH', body: JSON.stringify(this.toFields(job)) });
    const next = { ...job, updatedAt: new Date().toISOString(), updatedBy: this.me().name };
    this.jobs.set(job.id, next);
    this.emit({ kind: 'jobs' });
    return next;
  }

  private async createJob(job: Job): Promise<Job> {
    const created = await this.graph<ListItem<QuoteFields>>(`/sites/${this.cfg.siteId}/lists/${this.cfg.quotesListId}/items`, {
      method: 'POST',
      body: JSON.stringify({ fields: this.toFields(job) }),
    });
    this.jobItemIds.set(job.id, created.id);
    this.jobs.set(job.id, job);
    this.emit({ kind: 'jobs' });
    return job;
  }

  async moveJob(id: string, stage: Stage): Promise<Job> {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`No job ${id}`);
    return this.updateJob({ ...job, stage });
  }

  async createJobFromEmail(emailId: string): Promise<Job> {
    const email = this.emails.get(emailId);
    if (!email) throw new Error(`No email ${emailId}`);
    const d = draftJobFromEmail(email);
    const wo = d.workOrder ?? `NEW-${Date.now().toString(36).toUpperCase()}`;
    let job: Job = {
      id: wo,
      workOrder: wo,
      purchaseOrder: d.purchaseOrder,
      address: d.address ?? '',
      postcode: d.postcode ?? '',
      locationOfWorks: d.locationOfWorks ?? '',
      title: d.locationOfWorks ?? (email.subject ?? '').slice(0, 40),
      client: this.cfg.clientName,
      stage: 'review',
      contact: d.contact,
      dateIssued: d.dateIssued,
      typeOfWorks: d.typeOfWorks,
      priority: d.priority,
      photos: [],
      flag: { kind: 'no-report', text: 'No engineer report yet' },
      sources: d.sources,
      updatedAt: new Date().toISOString(),
    };
    const folder = await this.ensureFolder(job);
    job = { ...job, folderUrl: folder.webUrl };
    await this.createJob(job);
    await this.fileEmail(emailId, job.id, 'work-order');
    return this.jobs.get(job.id) ?? job;
  }

  // ---- emails -------------------------------------------------------------

  private async loadInbox(): Promise<void> {
    const filing = await this.graph<{ value: ListItem<InboxFields>[] }>(`/sites/${this.cfg.siteId}/lists/${this.cfg.inboxListId}/items?$expand=fields&$top=2000`);
    this.filing.clear();
    for (const it of filing.value) this.filing.set(it.fields.Title, { itemId: it.id, fields: it.fields });

    const msgs = await this.graph<{ value: GraphMessage[] }>(
      `/users/${encodeURIComponent(this.cfg.sharedMailbox)}/mailFolders/inbox/messages?$top=50&$orderby=receivedDateTime desc&$select=id,conversationId,subject,from,toRecipients,receivedDateTime,hasAttachments,body,bodyPreview`,
      {},
      { Prefer: 'outlook.body-content-type="text"' },
    );
    for (const m of msgs.value) {
      const existing = this.emails.get(m.id);
      const f = this.filing.get(m.id)?.fields;
      const attachments = existing?.attachments ?? (m.hasAttachments ? await this.listAttachments(m.id) : []);
      this.emails.set(m.id, {
        id: m.id,
        conversationId: m.conversationId,
        from: { name: m.from?.emailAddress?.name ?? '', address: m.from?.emailAddress?.address ?? '' },
        to: (m.toRecipients ?? []).map((r) => r.emailAddress?.address ?? '').filter(Boolean),
        subject: m.subject ?? '',
        receivedAt: m.receivedDateTime,
        bodyText: m.body?.content ?? m.bodyPreview ?? '',
        attachments,
        jobId: f?.JobId || undefined,
        matchedBy: (f?.Rule as MatchRule) || undefined,
        ignored: f?.Ignored ?? false,
      });
    }
    this.emit({ kind: 'emails' });
  }

  private async listAttachments(messageId: string): Promise<Email['attachments']> {
    const r = await this.graph<{ value: GraphAttachment[] }>(`/users/${encodeURIComponent(this.cfg.sharedMailbox)}/messages/${messageId}/attachments?$select=id,name,contentType,size,isInline`);
    return r.value.map((a) => ({ id: a.id, name: a.name, contentType: a.contentType ?? 'application/octet-stream', size: a.size ?? 0, isInline: a.isInline ?? false }));
  }

  async listEmails(): Promise<Email[]> {
    return Array.from(this.emails.values()).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }

  async refreshInbox(): Promise<void> {
    await this.loadInbox();
    const r = await autoFile(this, this.settings());
    this.lastSync = new Date().toISOString();
    this.emit({ kind: 'emails', note: r.filed || r.created ? `Filed ${r.filed} email(s), created ${r.created} job(s)` : undefined });
  }

  private folderPath(job: Job): string {
    const name = `${job.workOrder} – ${job.address.split(',')[0]} ${job.postcode}`.replace(/[\\/:*?"<>|#%]/g, ' ').trim();
    return `${this.cfg.jobsRootFolder}/${name}`;
  }

  private async ensureFolder(job: Job): Promise<DriveItem> {
    const path = this.folderPath(job);
    try {
      return await this.graph<DriveItem>(`/drives/${this.cfg.driveId}/root:/${path}`);
    } catch {
      const [root, name] = [this.cfg.jobsRootFolder, path.slice(this.cfg.jobsRootFolder.length + 1)];
      const parent = await this.graph<DriveItem>(`/drives/${this.cfg.driveId}/root:/${root}`);
      return this.graph<DriveItem>(`/drives/${this.cfg.driveId}/items/${parent.id}/children`, {
        method: 'POST',
        body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
      });
    }
  }

  private async upload(path: string, blob: Blob): Promise<DriveItem> {
    const res = await fetch(`${GRAPH}/drives/${this.cfg.driveId}/root:/${path}:/content`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': blob.type || 'application/octet-stream' },
      body: blob,
    });
    if (!res.ok) throw new Error(`Upload of ${path} failed: ${res.status}`);
    return res.json() as Promise<DriveItem>;
  }

  /** Copy the email and its attachments into the job folder, record the filing, update the job. */
  async fileEmail(emailId: string, jobId: string, rule: MatchRule): Promise<void> {
    const email = this.emails.get(emailId);
    const job = this.jobs.get(jobId);
    if (!email || !job) throw new Error('Email or job not found');
    const folder = await this.ensureFolder(job);
    const mb = encodeURIComponent(this.cfg.sharedMailbox);
    const path = this.folderPath(job);
    const stamp = email.receivedAt.slice(0, 16).replace(/[:T]/g, '-');
    const safeSubject = (email.subject || 'email').replace(/[\\/:*?"<>|#%]/g, ' ').slice(0, 80).trim();
    const mime = await this.graphBlob(`/users/${mb}/messages/${email.id}/$value`);
    await this.upload(`${path}/${stamp} ${safeSubject}.eml`, mime);
    for (const a of email.attachments) {
      if (a.isInline) continue;
      const blob = await this.graphBlob(`/users/${mb}/messages/${email.id}/attachments/${a.id}/$value`);
      await this.upload(`${path}/${a.name}`, blob);
    }
    const fields: InboxFields = { Title: email.id, ConversationId: email.conversationId, JobId: jobId, Rule: rule, Ignored: false };
    const row = this.filing.get(email.id);
    if (row) await this.graph(`/sites/${this.cfg.siteId}/lists/${this.cfg.inboxListId}/items/${row.itemId}/fields`, { method: 'PATCH', body: JSON.stringify(fields) });
    else {
      const created = await this.graph<ListItem<InboxFields>>(`/sites/${this.cfg.siteId}/lists/${this.cfg.inboxListId}/items`, { method: 'POST', body: JSON.stringify({ fields }) });
      this.filing.set(email.id, { itemId: created.id, fields });
    }
    email.jobId = jobId;
    email.matchedBy = rule;
    email.ignored = false;
    const next = applyEmailToJob({ ...job, folderUrl: job.folderUrl ?? folder.webUrl }, email, this.settings());
    await this.updateJob(next);
    this.emit({ kind: 'emails' });
  }

  async ignoreEmail(emailId: string): Promise<void> {
    const email = this.emails.get(emailId);
    if (!email) return;
    const fields: InboxFields = { Title: email.id, ConversationId: email.conversationId, JobId: '', Rule: '', Ignored: true };
    const row = this.filing.get(email.id);
    if (row) await this.graph(`/sites/${this.cfg.siteId}/lists/${this.cfg.inboxListId}/items/${row.itemId}/fields`, { method: 'PATCH', body: JSON.stringify(fields) });
    else {
      const created = await this.graph<ListItem<InboxFields>>(`/sites/${this.cfg.siteId}/lists/${this.cfg.inboxListId}/items`, { method: 'POST', body: JSON.stringify({ fields }) });
      this.filing.set(email.id, { itemId: created.id, fields });
    }
    email.ignored = true;
    email.jobId = undefined;
    this.emit({ kind: 'emails' });
  }

  // ---- quotes and the template --------------------------------------------

  async saveQuote(jobId: string, quote: Quote): Promise<Job> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`No job ${jobId}`);
    return this.updateJob({ ...job, quote });
  }

  /** Copy the pristine template into the job folder and fill it through the Excel API. */
  async exportQuote(jobId: string): Promise<ExportResult> {
    const job = this.jobs.get(jobId);
    if (!job?.quote) throw new Error('Nothing to export yet');
    const q = job.quote;
    const fileName = buildQuoteFileName({
      ref: shortRef(job.workOrder, q.requestVersion),
      purchaseOrder: q.purchaseOrder || job.purchaseOrder || '0000000000',
      workOrder: job.workOrder,
      address: job.address,
      job: job.title,
      postcode: job.postcode,
    });
    const folder = await this.ensureFolder(job);

    // 1. Copy the template (asynchronous on Graph: poll the monitor URL).
    const copyRes = await fetch(`${GRAPH}/drives/${this.cfg.driveId}/items/${this.cfg.templateItemId}/copy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentReference: { driveId: this.cfg.driveId, id: folder.id }, name: fileName, '@microsoft.graph.conflictBehavior': 'replace' }),
    });
    if (copyRes.status !== 202) throw new Error(`Template copy failed: ${copyRes.status} ${await copyRes.text()}`);
    const monitor = copyRes.headers.get('Location');
    if (monitor) {
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const s = await (await fetch(monitor)).json();
        if (s.status === 'completed') break;
        if (s.status === 'failed') throw new Error('Template copy failed');
      }
    }
    const item = await this.graph<DriveItem>(`/drives/${this.cfg.driveId}/root:/${this.folderPath(job)}/${fileName}`);

    // 2. Write the cells inside one workbook session, in batches of 20.
    const writes = buildCellMap(q);
    const session = await this.graph<{ id: string }>(`/drives/${this.cfg.driveId}/items/${item.id}/workbook/createSession`, { method: 'POST', body: JSON.stringify({ persistChanges: true }) });
    const sid = session.id;
    for (let i = 0; i < writes.length; i += 20) {
      const chunk = writes.slice(i, i + 20);
      const body = {
        requests: chunk.map((w: CellWrite, n: number) => ({
          id: String(n + 1),
          method: 'PATCH',
          url: `/drives/${this.cfg.driveId}/items/${item.id}/workbook/worksheets('${w.sheet}')/range(address='${w.address}')`,
          headers: { 'Content-Type': 'application/json', 'workbook-session-id': sid },
          body: w.numberFormat ? { values: [[w.value]], numberFormat: [[w.numberFormat]] } : { values: [[w.value]] },
        })),
      };
      const r = await this.graph<{ responses: { id: string; status: number; body?: unknown }[] }>('/$batch', { method: 'POST', body: JSON.stringify(body) });
      const failed = r.responses.filter((x) => x.status >= 400);
      if (failed.length) throw new Error(`Some cells could not be written: ${JSON.stringify(failed.slice(0, 3))}`);
    }
    // 3. Read the sheet's own totals back and refuse to call it ready if they disagree with ours.
    const readBack = async (sheet: string, address: string) => {
      const r = await this.graph<{ values: (number | string | null)[][] }>(
        `/drives/${this.cfg.driveId}/items/${item.id}/workbook/worksheets('${sheet}')/range(address='${address}')?$select=values`,
        {},
        { 'workbook-session-id': sid },
      );
      return Number(r.values?.[0]?.[0] ?? NaN);
    };
    const sheetTotals = { main: await readBack('Main Sheet', 'AV65'), continuation: await readBack('Continuation Sheet', 'AV55'), nonSor: await readBack('Non SOR Works', 'AV55'), total: await readBack('Main Sheet', 'BN15') };
    await this.graph(`/drives/${this.cfg.driveId}/items/${item.id}/workbook/closeSession`, { method: 'POST' }, { 'workbook-session-id': sid });
    const ours = priceQuote(q.sorLines, q.nonSorLines, new Map((await this.getSorCodes()).map((c) => [c.code, c])), await this.getRates(), q.contractor);
    const differs = Math.abs(sheetTotals.total - ours.total) > 0.011;
    if (differs) {
      await this.updateJob({ ...job, quoteFileName: fileName, flag: { kind: 'internal-check', text: `Sheet total ${sheetTotals.total.toFixed(2)} differs from the app's ${ours.total.toFixed(2)}. Check the workbook before sending.` } });
      return { fileName, webUrl: item.webUrl, writes, sheetTotals, mismatch: true };
    }

    await this.updateJob({
      ...job,
      folderUrl: job.folderUrl ?? folder.webUrl,
      quoteFileName: fileName,
      stage: job.stage === 'review' || job.stage === 'amend' ? 'ready' : job.stage,
      flag: { kind: 'checked', text: 'Exported, awaiting a second check' },
    });
    return { fileName, webUrl: item.webUrl, writes, sheetTotals, mismatch: false };
  }

  /** The SOR list, read from the client's own template inside the tenant. Never stored outside it. */
  async getSorCodes(): Promise<SorCode[]> {
    if (this.sorCache) return this.sorCache;
    const out: SorCode[] = [];
    for (let skip = 0; ; skip += 1000) {
      const r = await this.graph<{ value: { values: (string | number | null)[][] }[] }>(
        `/drives/${this.cfg.driveId}/items/${this.cfg.templateItemId}/workbook/tables('SORv8DataTbl')/rows?$top=1000&$skip=${skip}`,
      );
      for (const row of r.value) {
        const v = row.values[0] ?? [];
        // Columns: Document Code, New v8, Priority, Right to Repair, Component Accounting, First Time Fix,
        // NHF_Trade_Code, Short Description, Element, Section, Subsection, UOM, SOR Rate, Medium Description, ...
        if (v[0] == null || v[0] === '') continue;
        out.push({
          code: String(v[0]),
          short: String(v[7] ?? ''),
          element: String(v[8] ?? ''),
          section: String(v[9] ?? ''),
          subsection: String(v[10] ?? ''),
          uom: String(v[11] ?? ''),
          rate: Number(v[12] ?? 0),
          medium: String(v[13] ?? ''),
        });
      }
      if (r.value.length < 1000) break;
    }
    this.sorCache = out;
    return out;
  }

  async getRates(): Promise<RateAdjustment[]> {
    if (this.ratesCache) return this.ratesCache;
    const r = await this.graph<{ value: { values: (string | number | null)[][] }[] }>(`/drives/${this.cfg.driveId}/items/${this.cfg.templateItemId}/workbook/tables('RatesTbl')/rows`);
    this.ratesCache = r.value.map((row) => ({ contractor: String(row.values[0][0] ?? ''), under20k: Number(row.values[0][1] ?? 0), over20k: Number(row.values[0][2] ?? 0) }));
    return this.ratesCache;
  }

  // ---- live ---------------------------------------------------------------

  subscribe(listener: (e: ChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  liveStatus(): LiveStatus {
    return { lastSync: this.lastSync, polling: !!this.timer, recentEditors: this.recentEditors };
  }

  private emit(e: ChangeEvent) {
    for (const l of this.listeners) l(e);
  }
}
