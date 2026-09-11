// Demo mode: made-up data, in memory (and in this browser's local storage so a
// refresh keeps your changes). No sign-in, no network. A pretend colleague
// makes the odd change so the "live" behaviour can be seen.

import { draftJobFromEmail } from '../lib/match';
import { buildCellMap, buildQuoteFileName, shortRef } from '../lib/template';
import type { Email, Job, MatchRule, Quote, RateAdjustment, SorCode, Stage, User } from '../lib/types';
import { applyEmailToJob, autoFile } from './autofile';
import { DEMO_RATES, DEMO_SOR, blankQuote, demoEmails, demoJobs } from './demoData';
import type { ChangeEvent, DataProvider, ExportResult, LiveStatus, ProviderSettings } from './types';

const KEY = 'quote-desk-demo-v1';

interface State {
  jobs: Job[];
  emails: Email[];
}

const SETTINGS: ProviderSettings = {
  contractor: 'R Dunham',
  contractorEmail: 'admin@r-dunham.example',
  clientName: 'Sanctuary',
  clientDomains: ['sanctuary.example'],
  ownDomains: ['r-dunham.example'],
  clientQuotesMailbox: 'quotes@sanctuary.example',
};

export class DemoProvider implements DataProvider {
  readonly mode = 'demo' as const;
  private state: State = { jobs: [], emails: [] };
  private listeners = new Set<(e: ChangeEvent) => void>();
  private timer: number | undefined;
  private tick = 0;
  private lastSync = new Date().toISOString();

  async init(): Promise<void> {
    this.state = this.load() ?? { jobs: demoJobs(), emails: demoEmails() };
    await autoFile(this, SETTINGS);
    this.save();
    if (typeof window !== 'undefined') {
      this.timer = window.setInterval(() => this.colleague(), 40_000);
    }
  }

  me(): User {
    return { name: 'You (demo)', email: 'you@r-dunham.example' };
  }

  async signOut(): Promise<void> {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    if (this.timer) clearInterval(this.timer);
  }

  settings(): ProviderSettings {
    return SETTINGS;
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
    this.save();
    this.emit({ kind: 'jobs' });
    return structuredClone(next);
  }

  async moveJob(id: string, stage: Stage): Promise<Job> {
    const job = this.state.jobs.find((j) => j.id === id);
    if (!job) throw new Error(`No job ${id}`);
    return this.updateJob({ ...job, stage });
  }

  async createJobFromEmail(emailId: string): Promise<Job> {
    const email = this.state.emails.find((e) => e.id === emailId);
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
      title: d.locationOfWorks ?? email.subject.slice(0, 40),
      client: SETTINGS.clientName,
      stage: 'review',
      contact: d.contact,
      dateIssued: d.dateIssued,
      typeOfWorks: d.typeOfWorks,
      priority: d.priority,
      photos: [],
      flag: { kind: 'no-report', text: 'No engineer report yet' },
      sources: d.sources,
      updatedAt: new Date().toISOString(),
      updatedBy: 'Auto-filing',
    };
    job = applyEmailToJob(job, email, SETTINGS);
    this.state.jobs = [job, ...this.state.jobs];
    email.jobId = job.id;
    email.matchedBy = 'work-order';
    this.save();
    this.emit({ kind: 'jobs', note: `New job ${job.workOrder} created from the inbox` });
    return structuredClone(job);
  }

  // ---- emails -------------------------------------------------------------

  async listEmails(): Promise<Email[]> {
    return this.state.emails.map((e) => structuredClone(e)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }

  async refreshInbox(): Promise<void> {
    this.lastSync = new Date().toISOString();
    const r = await autoFile(this, SETTINGS);
    this.emit({ kind: 'emails', note: r.filed || r.created ? `Filed ${r.filed} email(s), created ${r.created} job(s)` : undefined });
  }

  async fileEmail(emailId: string, jobId: string, rule: MatchRule): Promise<void> {
    const email = this.state.emails.find((e) => e.id === emailId);
    const job = this.state.jobs.find((j) => j.id === jobId);
    if (!email || !job) throw new Error('Email or job not found');
    email.jobId = jobId;
    email.matchedBy = rule;
    email.ignored = false;
    const next = applyEmailToJob(job, email, SETTINGS);
    this.state.jobs = this.state.jobs.map((j) => (j.id === jobId ? next : j));
    this.save();
    this.emit({ kind: 'emails' });
    this.emit({ kind: 'jobs' });
  }

  async ignoreEmail(emailId: string): Promise<void> {
    const email = this.state.emails.find((e) => e.id === emailId);
    if (email) {
      email.ignored = true;
      email.jobId = undefined;
      this.save();
      this.emit({ kind: 'emails' });
    }
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
    await this.updateJob({ ...job, quoteFileName: fileName, stage: job.stage === 'review' || job.stage === 'amend' ? 'ready' : job.stage, flag: { kind: 'checked', text: 'Exported, awaiting a second check' } });
    return { fileName, writes };
  }

  async getSorCodes(): Promise<SorCode[]> {
    return DEMO_SOR;
  }

  async getRates(): Promise<RateAdjustment[]> {
    return DEMO_RATES;
  }

  // ---- live ---------------------------------------------------------------

  subscribe(listener: (e: ChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  liveStatus(): LiveStatus {
    return { lastSync: this.lastSync, polling: true, recentEditors: ['Sam (demo colleague)'] };
  }

  private emit(e: ChangeEvent) {
    for (const l of this.listeners) l(e);
  }

  /** A pretend colleague, so the shared-and-live behaviour is visible in demo mode. */
  private colleague() {
    this.tick++;
    const step = this.tick % 3;
    if (step === 1) {
      const j = this.state.jobs.find((x) => x.id === 'SANC005063');
      if (j && j.stage === 'ready') {
        j.stage = 'sent';
        j.flag = { kind: 'checked', text: 'Sent today · awaiting PO' };
        j.updatedAt = new Date().toISOString();
        j.updatedBy = 'Sam';
        this.save();
        this.emit({ kind: 'jobs', note: 'Sam moved SANC005063 to Sent' });
      }
    } else if (step === 2) {
      const id = `e-live-${this.tick}`;
      if (!this.state.emails.some((e) => e.id === id)) {
        this.state.emails.unshift({
          id,
          conversationId: 'c-4958',
          from: { name: 'Sanctuary (Property Service)', address: 'repairs@sanctuary.example' },
          to: ['quotes@r-dunham.example'],
          receivedAt: new Date().toISOString(),
          subject: 'RE: SANC004958 – access arranged for garage door',
          bodyText: 'Tenant now says any morning this week is fine.',
          attachments: [],
        });
        this.save();
        this.emit({ kind: 'emails', note: 'New email in the shared inbox' });
        void this.refreshInbox();
      }
    } else {
      const j = this.state.jobs.find((x) => x.id === 'SANC005044');
      if (j && j.stage === 'amend') {
        j.flag = { kind: 'internal-check', text: 'Sam: quantities checked against photos, looks right now.' };
        j.updatedAt = new Date().toISOString();
        j.updatedBy = 'Sam';
        this.save();
        this.emit({ kind: 'jobs', note: 'Sam left a note on SANC005044' });
      }
    }
  }

  private load(): State | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as State;
      if (!Array.isArray(parsed.jobs) || !Array.isArray(parsed.emails)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      /* private window or storage blocked: carry on in memory */
    }
  }
}

export { blankQuote };
