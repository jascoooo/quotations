import { describe, expect, it } from 'vitest';
import { classifyEmail, draftJobFromEmail, findAttendedDate, matchEmail, reportToSummary } from './match';
import type { Email, Job } from './types';

const job = (over: Partial<Job>): Job => ({
  id: 'SANC004958',
  workOrder: 'SANC004958',
  purchaseOrder: '4501849778',
  address: '31 Cathedral Drive, Basildon',
  postcode: 'SS15 5WF',
  locationOfWorks: 'Garage door',
  title: 'Garage door',
  client: 'Sanctuary',
  stage: 'review',
  photos: [],
  sources: {},
  updatedAt: '2026-08-11T10:15:00Z',
  ...over,
});

const email = (over: Partial<Email>): Email => ({
  id: 'e1',
  conversationId: 'c1',
  from: { name: 'Sanctuary', address: 'repairs@sanctuary.example' },
  to: ['quotes@r-dunham.example'],
  subject: '',
  receivedAt: '2026-08-24T16:41:00Z',
  bodyText: '',
  attachments: [],
  ...over,
});

describe('matchEmail', () => {
  const jobs = [job({}), job({ id: 'SANC005044', workOrder: 'SANC005044', purchaseOrder: '4501855812', address: '7 Meadow Rise, Billericay', postcode: 'CM11 1JA', title: 'Fence panels' })];

  it('rule 1: work order in subject files with certainty', () => {
    const r = matchEmail(email({ subject: 'Job report – SANC004958 garage door' }), jobs, []);
    expect(r).toMatchObject({ jobId: 'SANC004958', rule: 'work-order', confidence: 'certain' });
  });
  it('rule 1: work order in an attachment name counts', () => {
    const r = matchEmail(email({ subject: 'photos', attachments: [{ id: 'a', name: 'SANC005044_fence.jpg', contentType: 'image/jpeg', size: 1, isInline: false }] }), jobs, []);
    expect(r.jobId).toBe('SANC005044');
  });
  it('a new work order with no job yet is reported, not filed', () => {
    const r = matchEmail(email({ subject: 'Extra works request SANC005130 – 9 Ash Grove' }), jobs, []);
    expect(r.jobId).toBeNull();
    expect(r.newWorkOrder).toBe('SANC005130');
  });
  it('rule 2: purchase order known to a job', () => {
    const r = matchEmail(email({ subject: 'FW: PO 4501855812 front door', bodyText: 'see attached' }), jobs, []);
    expect(r).toMatchObject({ jobId: 'SANC005044', rule: 'purchase-order', confidence: 'certain' });
  });
  it('rule 4: reply in a filed conversation', () => {
    const filed = email({ id: 'e0', conversationId: 'c9', jobId: 'SANC004958' });
    const r = matchEmail(email({ id: 'e2', conversationId: 'c9', subject: 'RE: access' }), jobs, [filed]);
    expect(r).toMatchObject({ jobId: 'SANC004958', rule: 'conversation', confidence: 'certain' });
  });
  it('rule 3: address is only a suggestion', () => {
    const r = matchEmail(email({ subject: 'Job report – fence, Meadow Rise', bodyText: 'Been out to 7 Meadow Rise this morning.' }), jobs, []);
    expect(r).toMatchObject({ jobId: 'SANC005044', rule: 'address', confidence: 'likely' });
  });
  it('nothing recognised waits for a person', () => {
    const r = matchEmail(email({ subject: 'FW: photos of bathroom' }), jobs, []);
    expect(r).toMatchObject({ jobId: null, confidence: 'none' });
  });
});

describe('classifyEmail', () => {
  const opts = { clientDomains: ['sanctuary.example'], ownDomains: ['r-dunham.example'] };
  it('spots a change request from the client', () => {
    expect(classifyEmail(email({ subject: 'RE: SANC004990 – roof leak quote – changes needed', bodyText: 'Please split the scaffold line.' }), opts)).toBe('changes');
  });
  it('spots an engineer report with photos', () => {
    const e = email({ from: { name: 'Dave', address: 'dave@r-dunham.example' }, subject: 'Job report – garage door', bodyText: 'Attended on 24/08/2026 to assess garage door.', attachments: [{ id: 'a', name: 'IMG_1.jpg', contentType: 'image/jpeg', size: 1, isInline: false }] });
    expect(classifyEmail(e, opts)).toBe('report');
  });
  it('spots a client request', () => {
    expect(classifyEmail(email({ subject: 'Extra works request SANC004958' }), opts)).toBe('request');
  });
});

describe('draftJobFromEmail', () => {
  it('reads the work order, PO, address, postcode and job from a request subject', () => {
    const d = draftJobFromEmail(email({ subject: 'Extra works request SANC004958 / PO 4501849778 – 31 Cathedral Drive, Basildon SS15 5WF – garage door', bodyText: 'Please quote for the above.\n\nBill Beach\nTel: 0208 7091700' }));
    expect(d.workOrder).toBe('SANC004958');
    expect(d.purchaseOrder).toBe('4501849778');
    expect(d.postcode).toBe('SS15 5WF');
    expect(d.address).toBe('31 Cathedral Drive, Basildon');
    expect(d.locationOfWorks).toBe('Garage door');
    expect(d.contact).toEqual({ name: 'Bill Beach', phone: '0208 7091700' });
    expect(d.sources.workOrder?.where).toBe('subject');
    expect(d.priority).toBe('Routine');
  });
});

describe('report helpers', () => {
  const body = 'Hi both,\n\nAttended on 24/08/2026 to assess garage door. The up and over garage door needs to be removed entirely.\n\nThanks\nDave\n\nSent from my phone';
  it('finds the attended date', () => {
    expect(findAttendedDate(body)).toBe('2026-08-24');
  });
  it('turns the email into a summary without greeting or sign-off', () => {
    expect(reportToSummary(body)).toBe('Attended on 24/08/2026 to assess garage door. The up and over garage door needs to be removed entirely.');
  });
});
