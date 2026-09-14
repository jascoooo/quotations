import type { CellWrite } from '../lib/template';
import type { Email, Job, MatchRule, Quote, RateAdjustment, SorCode, Stage, User } from '../lib/types';

export interface LiveStatus {
  lastSync?: string;
  polling: boolean;
  /** Colleagues seen editing recently (from the list's Modified By values). */
  recentEditors: string[];
}

export interface ExportResult {
  fileName: string;
  /** Web link to the saved workbook in the job folder (Microsoft 365 mode). */
  webUrl?: string;
  writes: CellWrite[];
  /** Totals read back from the saved workbook (Microsoft 365 mode), so the sheet's own maths is checked against the app's. */
  sheetTotals?: { main: number; continuation: number; nonSor: number; total: number };
  mismatch?: boolean;
}

/**
 * Everything the screens need. Two implementations:
 *  - DemoProvider: in-memory made-up data, no sign-in, for trying the app.
 *  - GraphProvider: the user's own Microsoft 365 tenant via Microsoft Graph.
 * The screens never know which one they are talking to.
 */
export interface DataProvider {
  readonly mode: 'demo' | 'local' | 'm365';
  init(): Promise<void>;
  me(): User;
  signOut(): Promise<void>;

  listJobs(): Promise<Job[]>;
  getJob(id: string): Promise<Job | undefined>;
  updateJob(job: Job): Promise<Job>;
  moveJob(id: string, stage: Stage): Promise<Job>;
  createJobFromEmail(emailId: string): Promise<Job>;

  listEmails(): Promise<Email[]>;
  refreshInbox(): Promise<void>;
  fileEmail(emailId: string, jobId: string, rule: MatchRule): Promise<void>;
  ignoreEmail(emailId: string): Promise<void>;

  saveQuote(jobId: string, quote: Quote): Promise<Job>;
  exportQuote(jobId: string): Promise<ExportResult>;

  getSorCodes(): Promise<SorCode[]>;
  getRates(): Promise<RateAdjustment[]>;

  /** Called whenever shared data may have changed (another user, the inbox, a poll). */
  subscribe(listener: (event: ChangeEvent) => void): () => void;
  liveStatus(): LiveStatus;

  settings(): ProviderSettings;
}

export interface ChangeEvent {
  kind: 'jobs' | 'emails' | 'note';
  /** Something worth a small toast, e.g. "Sam moved SANC005063 to Ready to send". */
  note?: string;
}

export interface ProviderSettings {
  contractor: string;
  contractorEmail: string;
  clientName: string;
  clientDomains: string[];
  ownDomains: string[];
  /** Where finished quotes are emailed (Sanctuary's quotes mailbox). */
  clientQuotesMailbox?: string;
}
