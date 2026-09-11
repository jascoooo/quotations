// The "auto-filing" station. Files what the rules are certain about; leaves
// the rest for a person. Shared by both providers so demo and Microsoft 365
// behave the same way.

import { classifyEmail, draftJobFromEmail, findAttendedDate, matchEmail } from '../lib/match';
import type { Email, Job } from '../lib/types';
import type { DataProvider, ProviderSettings } from './types';

export interface AutoFileOutcome {
  filed: number;
  created: number;
  waiting: number;
}

export async function autoFile(provider: DataProvider, settings: ProviderSettings): Promise<AutoFileOutcome> {
  const out: AutoFileOutcome = { filed: 0, created: 0, waiting: 0 };
  let jobs = await provider.listJobs();
  const emails = await provider.listEmails();
  const filed = emails.filter((e) => e.jobId);
  const pending = emails.filter((e) => !e.jobId && !e.ignored).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  for (const email of pending) {
    const r = matchEmail(email, jobs, filed);
    if (r.confidence === 'certain' && r.jobId && r.rule) {
      await provider.fileEmail(email.id, r.jobId, r.rule);
      filed.push({ ...email, jobId: r.jobId, matchedBy: r.rule });
      out.filed++;
      continue;
    }
    if (r.newWorkOrder && classifyEmail(email, settings) === 'request') {
      const job = await provider.createJobFromEmail(email.id);
      jobs = [...jobs, job];
      filed.push({ ...email, jobId: job.id, matchedBy: 'work-order' });
      out.created++;
      continue;
    }
    out.waiting++;
  }
  return out;
}

/** What filing an email into a job changes on the job itself. */
export function applyEmailToJob(job: Job, email: Email, settings: ProviderSettings): Job {
  const kind = classifyEmail(email, settings);
  const next: Job = { ...job, photos: [...job.photos], sources: { ...job.sources } };
  const images = email.attachments.filter((a) => a.contentType.startsWith('image/') && !a.isInline);
  for (const a of images) {
    if (!next.photos.some((p) => p.emailId === email.id && p.name === a.name)) {
      next.photos.push({ id: `${email.id}:${a.id}`, name: a.name, url: a.url, emailId: email.id, receivedAt: email.receivedAt, include: true });
    }
  }
  if (kind === 'report' && !next.report) {
    next.report = { emailId: email.id, text: email.bodyText };
    const attended = findAttendedDate(email.bodyText);
    if (attended) {
      next.attended = attended;
      next.sources.attended = { emailId: email.id, where: 'body', quote: email.bodyText.match(/attended[^.]*\d{2,4}/i)?.[0] };
    }
    if (next.stage === 'review') next.flag = { kind: 'ready-to-build', text: 'Ready to build' };
  }
  if (kind === 'changes') {
    const text = email.bodyText.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? email.subject;
    next.flag = { kind: 'client-changes', text: `${settings.clientName} asked for changes: "${text.slice(0, 140)}"` };
    if (next.stage === 'ready' || next.stage === 'sent') next.stage = 'amend';
  }
  if (!next.purchaseOrder) {
    const d = draftJobFromEmail(email);
    if (d.purchaseOrder) {
      next.purchaseOrder = d.purchaseOrder;
      next.sources.purchaseOrder = d.sources.purchaseOrder;
    }
  }
  if (!next.contact) {
    const d = draftJobFromEmail(email);
    if (d.contact) {
      next.contact = d.contact;
      next.sources.contact = d.sources.contact;
    }
  }
  next.updatedAt = new Date().toISOString();
  return next;
}
