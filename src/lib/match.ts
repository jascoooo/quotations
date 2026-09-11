// How an email finds its job. Rules run in order; the first that fires wins.
//   1. A Sanctuary work order number in the subject, body or an attachment name.
//   2. A purchase order number that an existing job already carries.
//   3. The property's address or postcode.
//   4. A reply in a conversation that has already been filed.
// Anything else waits for a person. Nothing is filed on a guess.

import type { Email, Job, MatchRule, Priority, TypeOfWorks } from './types';
import { addressFirstLine, findRefs, mentionsAddress, normalisePostcode } from './refs';

export interface MatchResult {
  jobId: string | null;
  rule: MatchRule | null;
  /** 'certain' rules file automatically; 'likely' ones are suggested for a person to confirm. */
  confidence: 'certain' | 'likely' | 'none';
  /** A new work order number was found but no job exists for it yet. */
  newWorkOrder?: string;
  evidence?: string;
}

function emailText(email: Email): string {
  const names = email.attachments.map((a) => a.name).join(' ');
  return `${email.subject}\n${email.bodyText}\n${names}`;
}

export function matchEmail(email: Email, jobs: Job[], filedEmails: Email[]): MatchResult {
  const text = emailText(email);
  const refs = findRefs(text);

  // Rule 1: work order number
  for (const wo of refs.workOrders) {
    const job = jobs.find((j) => j.workOrder === wo);
    if (job) return { jobId: job.id, rule: 'work-order', confidence: 'certain', evidence: wo };
  }
  if (refs.workOrders.length > 0) {
    return { jobId: null, rule: null, confidence: 'none', newWorkOrder: refs.workOrders[0], evidence: refs.workOrders[0] };
  }

  // Rule 2: purchase order already known to a job
  for (const po of refs.purchaseOrders) {
    const job = jobs.find((j) => j.purchaseOrder === po);
    if (job) return { jobId: job.id, rule: 'purchase-order', confidence: 'certain', evidence: po };
  }

  // Rule 4 (checked before address because it is stronger): same conversation as a filed email
  const sibling = filedEmails.find((e) => e.jobId && e.conversationId === email.conversationId && e.id !== email.id);
  if (sibling?.jobId) return { jobId: sibling.jobId, rule: 'conversation', confidence: 'certain', evidence: 'reply in a filed conversation' };

  // Rule 3: address or postcode of an open job — suggested, not filed
  const open = jobs.filter((j) => j.stage !== 'sent');
  for (const job of [...open, ...jobs.filter((j) => j.stage === 'sent')]) {
    const hit = mentionsAddress(text, job.address, job.postcode);
    if (hit) {
      return {
        jobId: job.id,
        rule: 'address',
        confidence: 'likely',
        evidence: hit === 'address' ? addressFirstLine(job.address) : normalisePostcode(job.postcode),
      };
    }
  }

  return { jobId: null, rule: null, confidence: 'none' };
}

/** Words that signal the client wants the quote changed. */
const CHANGE_WORDS = /\b(chang(e|es|ed)|amend(ed|ment|ments)?|revis(e|ed|ion)|resubmit|rejected|reject|not approved|please split|reduce|clarif(y|ication))\b/i;
const APPROVED_WORDS = /\b(approved|authorised|authorized|go ahead|proceed|po attached|purchase order)\b/i;

export type EmailKind = 'request' | 'report' | 'changes' | 'approval' | 'reply' | 'other';

export function classifyEmail(email: Email, opts: { clientDomains: string[]; ownDomains: string[] }): EmailKind {
  const from = email.from.address.toLowerCase();
  const fromClient = opts.clientDomains.some((d) => from.endsWith(d.toLowerCase()));
  const fromUs = opts.ownDomains.some((d) => from.endsWith(d.toLowerCase()));
  const text = `${email.subject}\n${email.bodyText}`;
  const hasPhotos = email.attachments.some((a) => a.contentType.startsWith('image/') && !a.isInline);
  if (fromClient && /extra works request|quote request|please quote/i.test(text)) return 'request';
  if (fromClient && CHANGE_WORDS.test(text)) return 'changes';
  if (fromClient && APPROVED_WORDS.test(text)) return 'approval';
  if ((fromUs || hasPhotos) && /\b(attended|job report|site report|report|visited|inspected|assess(ed|ment)?)\b/i.test(text)) return 'report';
  if (/^(re|fw|fwd):/i.test(email.subject.trim())) return 'reply';
  return 'other';
}

/** Pull what we can from a client request email to seed a new job. Every value is shown with its source. */
export function draftJobFromEmail(email: Email): Partial<Job> & { sources: Job['sources'] } {
  const refs = findRefs(`${email.subject}\n${email.bodyText}`);
  const sources: Job['sources'] = {};
  const out: Partial<Job> & { sources: Job['sources'] } = { sources, photos: [] };

  if (refs.workOrders[0]) {
    out.workOrder = refs.workOrders[0];
    sources.workOrder = { emailId: email.id, where: email.subject.toUpperCase().includes(refs.workOrders[0]) ? 'subject' : 'body', quote: refs.workOrders[0] };
  }
  if (refs.purchaseOrders[0]) {
    out.purchaseOrder = refs.purchaseOrders[0];
    sources.purchaseOrder = { emailId: email.id, where: email.subject.includes(refs.purchaseOrders[0]) ? 'subject' : 'body', quote: refs.purchaseOrders[0] };
  }
  if (refs.postcodes[0]) {
    out.postcode = refs.postcodes[0];
    sources.postcode = { emailId: email.id, where: findRefs(email.subject).postcodes.length ? 'subject' : 'body', quote: refs.postcodes[0] };
  }

  // Subject shapes like: "Extra works request SANC004958 / PO 4501849778 – 31 Cathedral Drive SS15 5WF – garage door"
  const parts = email.subject.split(/\s+[–—-]\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const addressPart = parts.find((p) => findRefs(p).postcodes.length > 0 || /\b\d{1,4}[a-z]?\s+[A-Za-z]/.test(p) && !/SANC|PO\b/i.test(p));
    if (addressPart) {
      const pc = findRefs(addressPart).postcodes[0];
      const address = pc ? addressPart.replace(new RegExp(pc.replace(' ', '\\s?'), 'i'), '').replace(/[,\s]+$/, '').trim() : addressPart;
      out.address = address;
      sources.address = { emailId: email.id, where: 'subject', quote: addressPart };
    }
    const last = parts[parts.length - 1];
    if (last && last !== addressPart && !/SANC|PO\b/i.test(last) && last.length <= 60) {
      out.locationOfWorks = last.charAt(0).toUpperCase() + last.slice(1);
      sources.locationOfWorks = { emailId: email.id, where: 'subject', quote: last };
    }
  }

  // Signature-style contact: "Name\nTel: 0208 ..." or "Name · 0208 ..."
  const phone = email.bodyText.match(/(?:tel|phone|mob|mobile|t)[:.]?\s*(\+?44\s?\d[\d\s]{8,12}|0\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4})/i);
  if (phone) {
    const lines = email.bodyText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const idx = lines.findIndex((l) => l.includes(phone[0]));
    const nameLine = idx > 0 ? lines[idx - 1] : '';
    if (nameLine && nameLine.length < 40 && /^[A-Z][a-z]+(\s[A-Z][a-z'-]+){1,2}$/.test(nameLine)) {
      out.contact = { name: nameLine, phone: phone[1].replace(/\s+/g, ' ').trim() };
      sources.contact = { emailId: email.id, where: 'signature', quote: `${nameLine} · ${phone[1]}` };
    }
  }

  out.dateIssued = email.receivedAt.slice(0, 10);
  sources.dateIssued = { emailId: email.id, where: 'body', quote: 'date the request arrived' };

  const t = `${email.subject}\n${email.bodyText}`.toLowerCase();
  const priority: Priority = /\bemergency\b/.test(t) ? 'Emergency' : /\burgent\b/.test(t) ? 'Urgent' : 'Routine';
  out.priority = priority;
  const type: TypeOfWorks = /\bvoid/.test(t) ? 'Voids' : /\bcapital\b/.test(t) ? 'Capital Replacement' : /\bmajor\b/.test(t) ? 'Major Repair' : /\bquot/.test(t) ? 'Quoted Works' : 'Responsive Repair';
  out.typeOfWorks = type;
  return out;
}

/** "Attended on 24/08/2026" style dates in a report. Returns ISO yyyy-mm-dd. */
export function findAttendedDate(text: string): string | undefined {
  const m = text.match(/\battended\s+(?:site\s+)?(?:on\s+)?(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/i);
  if (!m) return undefined;
  const [, d, mo, y] = m;
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** Strip greeting, sign-off and quoted history so the report reads as a Summary of Works. */
export function reportToSummary(body: string): string {
  const lines = body.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (/^(hi|hello|dear|morning|afternoon|good (morning|afternoon))\b/i.test(line)) continue;
    if (/^(thanks|thank you|regards|kind regards|best|cheers|sent from my)/i.test(line)) break;
    if (/^(on .* wrote:|from:|-----original message-----|>)/i.test(line)) break;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
