// Core data model. Everything here lives in the user's Microsoft 365 tenant
// (a SharePoint list for jobs, a document library for job folders, the shared
// mailbox) or, in demo mode, in memory. Nothing is sent anywhere else.

export type Stage = 'review' | 'amend' | 'ready' | 'sent';

export const STAGES: { id: Stage; label: string; short: string }[] = [
  { id: 'review', label: 'Quotes to review', short: 'To review' },
  { id: 'amend', label: 'Quotes to check & amend', short: 'To check & amend' },
  { id: 'ready', label: 'Quotes ready to send', short: 'Ready to send' },
  { id: 'sent', label: 'Quotes sent', short: 'Sent' },
];

export type TypeOfWorks = 'Responsive Repair' | 'Major Repair' | 'Capital Replacement' | 'Quoted Works' | 'Voids';
export const TYPES_OF_WORKS: TypeOfWorks[] = ['Responsive Repair', 'Major Repair', 'Capital Replacement', 'Quoted Works', 'Voids'];

export type Priority = 'Emergency' | 'Urgent' | 'Routine';
export const PRIORITIES: Priority[] = ['Emergency', 'Urgent', 'Routine'];

export type MatchRule = 'work-order' | 'purchase-order' | 'address' | 'conversation' | 'manual';

export interface Attachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
  /** Where the bytes can be fetched from (Graph download URL, blob URL, or data URL in demo mode). */
  url?: string;
}

export interface Email {
  id: string;
  conversationId: string;
  from: { name: string; address: string };
  to: string[];
  subject: string;
  receivedAt: string; // ISO
  bodyText: string;
  attachments: Attachment[];
  /** Set once the email has been filed to a job. */
  jobId?: string;
  matchedBy?: MatchRule;
  ignored?: boolean;
}

export interface Photo {
  id: string;
  name: string;
  url?: string;
  emailId?: string;
  receivedAt: string;
  include: boolean;
  note?: string;
}

export interface FieldSource {
  emailId: string;
  where: 'subject' | 'body' | 'attachment' | 'signature';
  /** The literal text the value was taken from, so the user can see it. */
  quote?: string;
}

export interface SorLine {
  code: string;
  qty: number;
  comment?: string;
}

export interface NonSorLine {
  works: string;
  qty: number;
  description: string;
  uom: string;
  rate: number;
  comment?: string;
}

/** Mirrors the header fields at the top of the client's Main Sheet. */
export interface Quote {
  version: number;
  contractor: string;
  contactName: string;
  contactPhone: string;
  email: string;
  date: string; // ISO date (yyyy-mm-dd)
  functionalLocation: string;
  propertyAddress: string;
  locationOfWorks: string;
  typeOfWorks: TypeOfWorks | '';
  requestVersion: number;
  purchaseOrder: string;
  workOrder: string;
  dateIssued: string; // ISO date
  quoteRef: string;
  priority: Priority;
  summary: string;
  sorLines: SorLine[];
  nonSorLines: NonSorLine[];
}

export interface Job {
  id: string;
  workOrder: string;
  purchaseOrder?: string;
  address: string;
  postcode: string;
  locationOfWorks: string;
  title: string;
  client: string;
  stage: Stage;
  contact?: { name: string; phone: string };
  dateIssued?: string;
  attended?: string;
  typeOfWorks?: TypeOfWorks;
  priority?: Priority;
  report?: { emailId: string; text: string };
  quote?: Quote;
  photos: Photo[];
  folderUrl?: string;
  quoteFileName?: string;
  total?: number;
  /** Short status line shown on the card (e.g. a change request from the client). */
  flag?: { kind: 'client-changes' | 'internal-check' | 'awaiting-visit' | 'no-report' | 'ready-to-build' | 'checked'; text: string };
  sources: Partial<Record<'workOrder' | 'purchaseOrder' | 'address' | 'postcode' | 'locationOfWorks' | 'contact' | 'dateIssued' | 'attended', FieldSource>>;
  updatedAt: string;
  updatedBy?: string;
}

export interface SorCode {
  code: string;
  short: string;
  medium?: string;
  element: string;
  section?: string;
  subsection?: string;
  uom: string;
  rate: number;
}

export interface RateAdjustment {
  contractor: string;
  under20k: number;
  over20k: number;
}

export interface User {
  name: string;
  email: string;
  tenantId?: string;
}
