// No sign-in, no app registration, no administrator, and still shared and live.
//
// Everything shared lives in one folder that SharePoint or OneDrive syncs to
// each person's PC:
//
//   <folder>/emails/   a Power Automate flow drops each new email here
//   <folder>/jobs/     the board, one small file per job, written by the app
//   <folder>/settings.json
//
// The app reads and writes that folder straight off the disk through the
// browser's folder permission, and re-reads it every few seconds. So a card
// someone moves appears on everyone else's board a sync later, without anyone
// signing in to anything and without a server.
//
// One file per job is deliberate: a single board file would collide every time
// two people worked at once, whereas separate files only collide if two people
// edit the same job in the same moment.
//
// Without a folder the app still works, keeping everything in this browser
// alone. The client's code list always stays local: it is large and identical
// for everyone.

import {
  type SharedDir,
  askForFolder,
  folderPermission,
  jobFileName,
  listJson,
  pickSharedFolder,
  readJson,
  removeFile,
  scanFolder,
  subFolder,
  supportsFolderWatch,
  writeJson,
} from '../lib/folder';
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
const KEY_FOLDER = 'local-folder-v1';
const KEY_SEEN = 'local-seen-v1';

export interface LocalSettings extends ProviderSettings {
  /** Shown on the setup screen so you know which template the codes came from. */
  templateName?: string;
  templateLoadedAt?: string;
  userName?: string;
}

type FolderState = 'off' | 'watching' | 'needs-permission' | 'unsupported';

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
  private folder: SharedDir | null = null;
  private jobsDir: SharedDir | null = null;
  private emailsDir: SharedDir | null = null;
  /** job id -> the lastModified we last read, so a poll only re-reads changes. */
  private jobStamps = new Map<string, number>();
  private seen = new Set<string>();
  private timer: number | undefined;
  private folderState: FolderState = 'off';

  async init(): Promise<void> {
    this.cfg = (await idb.get<LocalSettings>(KEY_SETTINGS)) ?? DEFAULT_LOCAL_SETTINGS;
    this.state = (await idb.get<State>(KEY_STATE)) ?? { jobs: [], emails: [] };
    const codes = await idb.get<{ codes: SorCode[]; rates: RateAdjustment[] }>(KEY_CODES);
    this.codes = codes?.codes ?? [];
    this.rates = codes?.rates ?? [];
    this.seen = new Set((await idb.get<string[]>(KEY_SEEN)) ?? []);

    if (!supportsFolderWatch()) {
      this.folderState = 'unsupported';
      return;
    }
    const saved = await idb.get<SharedDir>(KEY_FOLDER);
    if (!saved) return;
    this.folder = saved;
    const perm = await folderPermission(saved);
    if (perm === 'granted') {
      await this.openFolder(saved);
    } else {
      // The browser needs a click before it will hand the folder back.
      this.folderState = 'needs-permission';
    }
  }

  /** Open the shared folder's parts and pull the board in. */
  private async openFolder(dir: SharedDir): Promise<void> {
    this.folder = dir;
    this.emailsDir = await subFolder(dir, 'emails');
    this.jobsDir = await subFolder(dir, 'jobs');
    this.ignored = new Set((await readJson<string[]>(dir, 'ignored.json')) ?? []);
    const shared = await readJson<LocalSettings>(dir, 'settings.json');
    if (shared) this.cfg = { ...this.cfg, ...shared, templateName: this.cfg.templateName, templateLoadedAt: this.cfg.templateLoadedAt };
    this.folderState = 'watching';
    await this.pull();
    await this.scanNow();
    if (this.timer) clearInterval(this.timer);
    this.timer = window.setInterval(() => void this.tick(), 10_000);
  }

  private async tick(): Promise<void> {
    await this.pull();
    await this.scanNow();
  }

  /**
   * Re-read the jobs other people have written. Only files whose timestamp
   * changed are parsed, so this is cheap enough to run every few seconds.
   */
  private async pull(): Promise<void> {
    if (!this.jobsDir) return;
    let files;
    try {
      files = await listJson(this.jobsDir);
    } catch {
      this.folderState = 'needs-permission';
      return;
    }
    const present = new Set<string>();
    let changed = false;
    const editors = new Set<string>();
    for (const { name, file } of files) {
      const existing = this.state.jobs.find((j) => jobFileName(j.id) === name);
      present.add(name);
      if (existing && this.jobStamps.get(existing.id) === file.lastModified) continue;
      let job: Job;
      try {
        job = JSON.parse(await file.text()) as Job;
      } catch {
        continue; // a half-written file mid-sync: it will be read next time
      }
      if (!job?.id) continue;
      this.jobStamps.set(job.id, file.lastModified);
      const mine = this.me().name;
      if (job.updatedBy && job.updatedBy !== mine && Date.now() - Date.parse(job.updatedAt ?? '') < 10 * 60_000) editors.add(job.updatedBy);
      const i = this.state.jobs.findIndex((j) => j.id === job.id);
      if (i === -1) this.state.jobs = [job, ...this.state.jobs];
      else if ((job.updatedAt ?? '') >= (this.state.jobs[i].updatedAt ?? '')) this.state.jobs[i] = job;
      else continue;
      changed = true;
    }
    // A job someone deleted, or one that never made it to the folder.
    const gone = this.state.jobs.filter((j) => !present.has(jobFileName(j.id)));
    if (gone.length) {
      this.state.jobs = this.state.jobs.filter((j) => present.has(jobFileName(j.id)));
      changed = true;
    }
    this.recentEditors = [...editors];
    if (changed) {
      this.linkFiledEmails();
      this.emit({ kind: 'jobs' });
    }
  }

  /** Emails are read-only files, so who they belong to is read off the jobs. */
  private linkFiledEmails(): void {
    const byEmail = new Map<string, string>();
    for (const j of this.state.jobs) for (const id of j.filedEmailIds ?? []) byEmail.set(id, j.id);
    for (const e of this.state.emails) {
      const jobId = byEmail.get(e.id);
      if (jobId) {
        e.jobId = jobId;
        e.matchedBy ??= 'work-order';
      } else if (!this.ignored.has(e.id)) {
        e.jobId = undefined;
      }
      e.ignored = this.ignored.has(e.id);
    }
  }

  private recentEditors: string[] = [];
  private ignored = new Set<string>();

  // ---- the watched folder -------------------------------------------------

  folderStatus(): { state: FolderState; name?: string; lastScan?: string } {
    return { state: this.folderState, name: this.folder?.name, lastScan: this.lastSync };
  }

  /** Choose the shared folder. Must be called from a click. */
  async connectFolder(): Promise<string> {
    return this.useFolder(await pickSharedFolder());
  }

  /** Start sharing through a folder that has already been chosen. */
  async useFolder(dir: SharedDir): Promise<string> {
    await idb.set(KEY_FOLDER, dir);
    await this.pushAllJobs(dir);
    await this.openFolder(dir);
    return dir.name;
  }

  /** Moving in: put anything already on this PC into the shared folder. */
  private async pushAllJobs(dir: SharedDir): Promise<void> {
    if (!this.state.jobs.length) return;
    const jobs = await subFolder(dir, 'jobs');
    for (const job of this.state.jobs) await writeJson(jobs, jobFileName(job.id), job);
  }

  /** Re-ask for a folder chosen in an earlier session. Must be from a click. */
  async resumeFolder(): Promise<boolean> {
    if (!this.folder) return false;
    const perm = await askForFolder(this.folder);
    if (perm !== 'granted') return false;
    await this.openFolder(this.folder);
    return true;
  }

  async forgetFolder(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.folder = null;
    this.jobsDir = null;
    this.emailsDir = null;
    this.folderState = supportsFolderWatch() ? 'off' : 'unsupported';
    await idb.del(KEY_FOLDER);
    this.emit({ kind: 'emails' });
  }

  /**
   * Read anything new in the folder, add it to the inbox, attach its photos and
   * run the usual filing. Safe to call as often as you like: each file is
   * imported once.
   */
  async scanNow(): Promise<{ added: number; skipped: string[] }> {
    if (!this.emailsDir) return { added: 0, skipped: [] };
    let result;
    try {
      result = await scanFolder(this.emailsDir, this.seen);
    } catch {
      // Usually the permission lapsed, or the folder was moved or unsynced.
      this.folderState = 'needs-permission';
      this.emit({ kind: 'emails' });
      return { added: 0, skipped: [] };
    }
    this.lastSync = new Date().toISOString();
    for (const stamp of result.seen) this.seen.add(stamp);
    await idb.set(KEY_SEEN, [...this.seen].slice(-5000));

    if (!result.emails.length) {
      this.emit({ kind: 'emails' });
      return { added: 0, skipped: result.skipped };
    }

    const known = new Set(this.state.emails.map((e) => e.id));
    const fresh = result.emails.filter((e) => !known.has(e.id));
    this.state.emails = [...fresh, ...this.state.emails];
    this.pendingPhotos = result.photos;
    await this.save();
    await this.refreshInbox();
    this.emit({ kind: 'emails', note: fresh.length ? `${fresh.length} new email${fresh.length === 1 ? '' : 's'} from the watched folder` : undefined });
    return { added: fresh.length, skipped: result.skipped };
  }

  /** Photos read from the folder, waiting to be attached as their email is filed. */
  private pendingPhotos = new Map<string, Photo[]>();

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
    if (this.folder) {
      // Shared, so a colleague opening the folder is configured already. The
      // template is per-PC, so it is left out.
      const { templateName, templateLoadedAt, ...shared } = next;
      void templateName;
      void templateLoadedAt;
      await writeJson(this.folder, 'settings.json', shared);
    }
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
    await this.push(next);
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
    await this.push(job);
    this.emit({ kind: 'jobs', note: `${wo} added to the board` });
    return structuredClone(job);
  }

  async deleteJob(id: string): Promise<void> {
    if (this.jobsDir) await removeFile(this.jobsDir, jobFileName(id));
    this.jobStamps.delete(id);
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
    job = this.withFolderPhotos(job, email.id);
    job = { ...job, filedEmailIds: [email.id] };
    this.state.jobs = [job, ...this.state.jobs];
    email.jobId = job.id;
    email.matchedBy = 'work-order';
    await this.save();
    await this.push(job);
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
    let next = applyEmailToJob(job, email, this.cfg);
    next = this.withFolderPhotos(next, email.id);
    next = { ...next, filedEmailIds: [...new Set([...(next.filedEmailIds ?? []), email.id])] };
    this.state.jobs = this.state.jobs.map((j) => (j.id === jobId ? next : j));
    await this.save();
    await this.push(next);
    this.emit({ kind: 'emails' });
    this.emit({ kind: 'jobs' });
  }

  async ignoreEmail(emailId: string): Promise<void> {
    const email = this.state.emails.find((e) => e.id === emailId);
    if (!email) return;
    email.ignored = true;
    email.jobId = undefined;
    this.ignored.add(emailId);
    await this.save();
    if (this.folder) await writeJson(this.folder, 'ignored.json', [...this.ignored]);
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
    return { lastSync: this.lastSync, polling: this.folderState === 'watching', recentEditors: this.recentEditors };
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

  /** Move any photos that came in beside this email onto the job. */
  private withFolderPhotos(job: Job, emailId: string): Job {
    const found = this.pendingPhotos.get(emailId);
    if (!found?.length) return job;
    const photos = [...(job.photos ?? [])];
    for (const p of found) if (!photos.some((x) => x.id === p.id)) photos.push(p);
    this.pendingPhotos.delete(emailId);
    return { ...job, photos };
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

  /** Write one job to the shared folder, so colleagues see it. */
  private async push(job: Job): Promise<void> {
    if (!this.jobsDir) return;
    try {
      await writeJson(this.jobsDir, jobFileName(job.id), job);
      // Skip the echo of our own write on the next poll.
      const files = await listJson(this.jobsDir);
      const mine = files.find((f) => f.name === jobFileName(job.id));
      if (mine) this.jobStamps.set(job.id, mine.file.lastModified);
    } catch {
      this.folderState = 'needs-permission';
      this.emit({ kind: 'jobs' });
    }
  }
}
