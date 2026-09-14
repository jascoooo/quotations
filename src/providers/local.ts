// On-this-PC mode: the whole app with no sign-in, no app registration and no
// administrator anywhere.
//
// Jobs, photos and the client's code list live in this browser's own storage.
// The quote is produced as an Office Script you run against your copy of the
// client's template in Excel on the web, so Excel does the writing and the
// template's dropdowns and tables survive.
//
// What this mode cannot do: read the shared mailbox by itself. Emails and
// photos are added by hand. Everything else — matching an email to a job,
// searching the codes, the pricing, the cell map — is the same code that the
// Microsoft 365 mode uses.

import { draftJobFromEmail } from '../lib/match';
import { idb } from '../lib/store';
import { buildCellMap, buildQuoteFileName, shortRef } from '../lib/template';
import type { Email, Job, MatchRule, Photo, Quote, RateAdjustment, SorCode, Stage, User } from '../lib/types';
import { readWorkbook } from '../lib/xlsx';
import { applyEmailToJob, autoFile } from './autofile';
import type { ChangeEvent, DataProvider, ExportResult, LiveStatus, ProviderSettings } from './types';

const KEY_STATE = 'local-state-v1';
const KEY_CODES = 'local-codes-v1';
const KEY_SETTINGS = 'local-settings-v1';

export interface LocalSettings extends ProviderSettings {
  /** Shown on the setup screen so you know which template the codes came from. */
  templateName?: string;
  templateLoadedAt?: string;
  userName?: string;
}

interface State {
  jobs: Job[];
  emails: Email[];
}

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  contractor: 'R Dunham',
  contractorEmail: '',
  clientName: 'Sanctuary',
  clientDomains: [],
  ownDomains: [],
};

export class LocalProvider implements DataProvider {
  readonly mode = 'local' as const;
  private state: State = { jobs: [], emails: [] };
  private codes: SorCode[] = [];
  private rates: RateAdjustment[] = [];
  private cfg: LocalSettings = DEFAULT_LOCAL_SETTINGS;
  private listeners = new Set<(e: ChangeEvent) => void>();
  private lastSync = new Date().toISOString();

  async init(): Promise<void> {
    this.cfg = (await idb.get<LocalSettings>(KEY_SETTINGS)) ?? DEFAULT_LOCAL_SETTINGS;
    this.state = (await idb.get<State>(KEY_STATE)) ?? { jobs: [], emails: [] };
    const codes = await idb.get<{ codes: SorCode[]; rates: RateAdjustment[] }>(KEY_CODES);
    this.codes = codes?.codes ?? [];
    this.rates = codes?.rates ?? [];
  }

  me(): User {
    return { name: this.cfg.userName?.trim() || 'You', email: this.cfg.contractorEmail ?? '' };
  }

  async signOut(): Promise<void> {
    /* nothing to sign out of */
  }

  settings(): ProviderSettings {
    return this.cfg;
  }

  localSettings(): LocalSettings {
    return this.cfg;
  }

  async saveSettings(next: LocalSettings): Promise<void> {
    this.cfg = next;
    await idb.set(KEY_SETTINGS, next);
    this.emit({ kind: 'jobs' });
  }

  /** True once the client's template has been read on this machine. */
  hasCodes(): boolean {
    return this.codes.length > 0;
  }

  /**
   * Read the client's blank template. Only reads: the file itself is untouched
   * and is not stored, just the code list and the rate table out of it.
   */
  async loadTemplate(file: File): Promise<{ codes: number; rates: number; tables: string[] }> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { codes, rates, tableNames } = readWorkbook(bytes);
    if (!codes.length) {
      throw new Error(`No schedule-of-rates table found in ${file.name}. Tables in the file: ${tableNames.join(', ') || 'none'}. Check this is the client's template.`);
    }
    this.codes = codes;
    this.rates = rates;
    await idb.set(KEY_CODES, { codes, rates });
    this.cfg = { ...this.cfg, templateName: file.name, templateLoadedAt: new Date().toISOString() };
    await idb.set(KEY_SETTINGS, this.cfg);
    this.emit({ kind: 'jobs', note: `Read ${codes.length.toLocaleString('en-GB')} codes from ${file.name}` });
    return { codes: codes.length, rates: rates.length, tables: tableNames };
  }

  // ---- jobs ---------------------------------------------------------------

  async listJobs(): Promise<Job[]> {
    return this.state.jobs.map((j) => structuredClone(j));
  }

  async getJob(id: string): Promise<Job | undefined> {
    const j = this.state.jobs.find((x) => x.id === id);
    return j ? structuredClone(j) : undefined;
  }

  async updateJob(job: Job): Promise<Job> {
    const next = { ...job, updatedAt: new Date().toISOString(), updatedBy: this.me().name };
    this.state.jobs = this.state.jobs.map((j) => (j.id === job.id ? next : j));
    await this.save();
    this.emit({ kind: 'jobs' });
    return structuredClone(next);
  }

  async moveJob(id: string, stage: Stage): Promise<Job> {
    const job = this.state.jobs.find((j) => j.id === id);
    if (!job) throw new Error(`No job ${id}`);
    return this.updateJob({ ...job, stage });
  }

  /** Start a job by hand, which is how most jobs begin in this mode. */
  async createJob(seed: { workOrder: string; address?: string; postcode?: string; title?: string; purchaseOrder?: string }): Promise<Job> {
    const wo = seed.workOrder.trim().toUpperCase();
    if (!wo) throw new Error('A job needs a work order number.');
    if (this.state.jobs.some((j) => j.id === wo)) throw new Error(`${wo} is already on the board.`);
    const job: Job = {
      id: wo,
      workOrder: wo,
      purchaseOrder: seed.purchaseOrder?.trim() || undefined,
      address: seed.address?.trim() ?? '',
      postcode: seed.postcode?.trim().toUpperCase() ?? '',
      locationOfWorks: '',
      title: seed.title?.trim() || 'New job',
      client: this.cfg.clientName,
      stage: 'review',
      photos: [],
      flag: { kind: 'no-report', text: 'Started by hand' },
      sources: {},
      updatedAt: new Date().toISOString(),
      updatedBy: this.me().name,
    };
    this.state.jobs = [job, ...this.state.jobs];
    await this.save();
    this.emit({ kind: 'jobs', note: `${wo} added to the board` });
    return structuredClone(job);
  }

  async deleteJob(id: string): Promise<void> {
    this.state.jobs = this.state.jobs.filter((j) => j.id !== id);
    this.state.emails = this.state.emails.map((e) => (e.jobId === id ? { ...e, jobId: undefined } : e));
    await this.save();
    this.emit({ kind: 'jobs' });
  }

  async createJobFromEmail(emailId: string): Promise<Job> {
    const email = this.state.emails.find((e) => e.id === emailId);
    if (!email) throw new Error(`No email ${emailId}`);
    const d = draftJobFromEmail(email);
    const wo = d.workOrder ?? `JOB-${Date.now().toString(36).toUpperCase()}`;
    let job: Job = {
      id: wo,
      workOrder: wo,
      purchaseOrder: d.purchaseOrder,
      address: d.address ?? '',
      postcode: d.postcode ?? '',
      locationOfWorks: d.locationOfWorks ?? '',
      title: d.locationOfWorks ?? email.subject.slice(0, 40),
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
      updatedBy: this.me().name,
    };
    job = applyEmailToJob(job, email, this.cfg);
    this.state.jobs = [job, ...this.state.jobs];
    email.jobId = job.id;
    email.matchedBy = 'work-order';
    await this.save();
    this.emit({ kind: 'jobs', note: `New job ${job.workOrder} created` });
    return structuredClone(job);
  }

  /** Attach photos dropped onto a job. Held in this browser, not uploaded. */
  async addPhotos(jobId: string, files: File[]): Promise<number> {
    const job = this.state.jobs.find((j) => j.id === jobId);
    if (!job) throw new Error(`No job ${jobId}`);
    const added: Photo[] = [];
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error ?? new Error(`Could not read ${f.name}`));
        r.readAsDataURL(f);
      });
      added.push({ id: `p-${f.name}-${f.size}`, name: f.name, url: dataUrl, receivedAt: new Date(f.lastModified || Date.now()).toISOString(), include: true });
    }
    if (!added.length) return 0;
    const photos = [...(job.photos ?? [])];
    for (const p of added) if (!photos.some((x) => x.id === p.id)) photos.push(p);
    await this.updateJob({ ...job, photos });
    return added.length;
  }

  // ---- emails -------------------------------------------------------------

  async listEmails(): Promise<Email[]> {
    return this.state.emails.map((e) => structuredClone(e)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }

  /** Paste an email in by hand: the text is all the matching needs. */
  async addEmail(input: { subject: string; body: string; fromName?: string; fromAddress?: string; receivedAt?: string }): Promise<Email> {
    const id = `m-${Date.now().toString(36)}-${this.state.emails.length}`;
    const email: Email = {
      id,
      conversationId: id,
      from: { name: input.fromName?.trim() || 'Pasted in', address: input.fromAddress?.trim() || '' },
      to: [],
      receivedAt: input.receivedAt ?? new Date().toISOString(),
      subject: input.subject.trim(),
      bodyText: input.body,
      attachments: [],
    };
    this.state.emails = [email, ...this.state.emails];
    await this.save();
    this.emit({ kind: 'emails', note: 'Email added' });
    await this.refreshInbox();
    return structuredClone(email);
  }

  async refreshInbox(): Promise<void> {
    this.lastSync = new Date().toISOString();
    const r = await autoFile(this, this.cfg);
    await this.save();
    this.emit({ kind: 'emails', note: r.filed || r.created ? `Filed ${r.filed} email(s), started ${r.created} job(s)` : undefined });
  }

  async fileEmail(emailId: string, jobId: string, rule: MatchRule): Promise<void> {
    const email = this.state.emails.find((e) => e.id === emailId);
    const job = this.state.jobs.find((j) => j.id === jobId);
    if (!email || !job) throw new Error('Email or job not found');
    email.jobId = jobId;
    email.matchedBy = rule;
    email.ignored = false;
    const next = applyEmailToJob(job, email, this.cfg);
    this.state.jobs = this.state.jobs.map((j) => (j.id === jobId ? next : j));
    await this.save();
    this.emit({ kind: 'emails' });
    this.emit({ kind: 'jobs' });
  }

  async ignoreEmail(emailId: string): Promise<void> {
    const email = this.state.emails.find((e) => e.id === emailId);
    if (!email) return;
    email.ignored = true;
    email.jobId = undefined;
    await this.save();
    this.emit({ kind: 'emails' });
  }

  // ---- quotes -------------------------------------------------------------

  async saveQuote(jobId: string, quote: Quote): Promise<Job> {
    const job = this.state.jobs.find((j) => j.id === jobId);
    if (!job) throw new Error(`No job ${jobId}`);
    return this.updateJob({ ...job, quote });
  }

  async exportQuote(jobId: string): Promise<ExportResult> {
    const job = this.state.jobs.find((j) => j.id === jobId);
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
    const writes = buildCellMap(q);
    await this.updateJob({
      ...job,
      quoteFileName: fileName,
      stage: job.stage === 'review' || job.stage === 'amend' ? 'ready' : job.stage,
      flag: { kind: 'checked', text: 'Script generated, not yet run in Excel' },
    });
    return { fileName, writes };
  }

  async getSorCodes(): Promise<SorCode[]> {
    return this.codes;
  }

  async getRates(): Promise<RateAdjustment[]> {
    return this.rates;
  }

  // ---- housekeeping -------------------------------------------------------

  subscribe(listener: (e: ChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  liveStatus(): LiveStatus {
    return { lastSync: this.lastSync, polling: false, recentEditors: [] };
  }

  /** Everything on this machine, as one file you can keep or move. */
  async exportAll(): Promise<string> {
    return JSON.stringify({ version: 1, savedAt: new Date().toISOString(), settings: this.cfg, jobs: this.state.jobs, emails: this.state.emails }, null, 2);
  }

  async importAll(json: string): Promise<{ jobs: number }> {
    const parsed = JSON.parse(json) as { jobs?: Job[]; emails?: Email[]; settings?: LocalSettings };
    if (!Array.isArray(parsed.jobs)) throw new Error('That file does not look like a Quote Desk backup.');
    this.state = { jobs: parsed.jobs, emails: Array.isArray(parsed.emails) ? parsed.emails : [] };
    if (parsed.settings) {
      this.cfg = { ...this.cfg, ...parsed.settings };
      await idb.set(KEY_SETTINGS, this.cfg);
    }
    await this.save();
    this.emit({ kind: 'jobs', note: `Loaded ${this.state.jobs.length} job(s)` });
    return { jobs: this.state.jobs.length };
  }

  async clearAll(): Promise<void> {
    this.state = { jobs: [], emails: [] };
    await idb.set(KEY_STATE, this.state);
    this.emit({ kind: 'jobs' });
  }

  private emit(e: ChangeEvent) {
    for (const l of this.listeners) l(e);
  }

  private async save(): Promise<void> {
    try {
      await idb.set(KEY_STATE, this.state);
    } catch {
      /* storage blocked: carry on in memory for this session */
    }
  }
}
