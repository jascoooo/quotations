// Made-up data for demo mode. One job (SANC004958) mirrors the filled example
// the client template came with; everything else is invented. The SOR sample
// below is deliberately tiny: the full 3,581-code list is licensed to the
// landlord and is read from their template inside the tenant at run time.

import type { Email, Job, RateAdjustment, SorCode } from '../lib/types';

const REPORT_4958 =
  'Attended on 24/08/2026 to assess garage door. The up and over garage door needs to be removed entirely for repairs to be carried out to the door itself as well as to allow all components to be replaced, including the rollers and channels, cables, lock and repairs to the frame. The door is quite large and heavy, to carry out works safely we would require 2 engineers to attend in order to remove the door to carry out the repairs and then refit and adjust as necessary to allow the door to open and close properly.';

export const DEMO_SOR: SorCode[] = [
  { code: '345613', short: 'GARAGE DOOR:RENEW ROLLERS AND CHANNELS', element: 'Garage Doors and Frames', uom: 'IT', rate: 72.64 },
  { code: '345611', short: 'GARAGE DOOR:RENEW LOCK TO UP AND OVER', element: 'Garage Doors and Frames', uom: 'NO', rate: 26.47 },
  { code: '345605', short: 'GARAGE DOOR:RENEW SPINDLE/ROLLER/CABLE', element: 'Garage Doors and Frames', uom: 'NO', rate: 39.73 },
  { code: '345601', short: 'GARAGE DOOR:REMOVE AND REFIX UP AND OVER', element: 'Garage Doors and Frames', uom: 'IT', rate: 86.31 },
  { code: '345602', short: 'GARAGE DOOR:EASE AND ADJUST UP AND OVER', element: 'Garage Doors and Frames', uom: 'IT', rate: 36.28 },
  { code: '345603', short: 'GARAGE DOOR:REPAIR UP AND OVER METAL', element: 'Garage Doors and Frames', uom: 'IT', rate: 58.81 },
  { code: '1101', short: 'KERB:LAY NEW 127X254MM PCC KERB', element: 'Groundworks', section: 'Kerbs, Channels and Edgings', uom: 'LM', rate: 55.67 },
  { code: '1103', short: 'KERB:RENEW 127X254MM PCC KERB', element: 'Groundworks', section: 'Kerbs, Channels and Edgings', uom: 'LM', rate: 41.72 },
  { code: '1301', short: 'CHANNEL:RENEW NE 250X125MM', element: 'Groundworks', section: 'Kerbs, Channels and Edgings', uom: 'LM', rate: 59.71 },
  { code: '1507', short: 'EDGING:RENEW 25X150MM TIMBER', element: 'Groundworks', section: 'Kerbs, Channels and Edgings', uom: 'LM', rate: 11.16 },
  { code: '3003', short: 'PATH:EXCAVATE LAY NE 100MM CONCRETE BED', element: 'Groundworks', section: 'Paths and Pavings', uom: 'SM', rate: 115.38 },
  { code: '3013', short: 'PATH/BASE:REMOVE', element: 'Groundworks', section: 'Paths and Pavings', uom: 'SM', rate: 42.71 },
  // Demo-only placeholders for the invented jobs, marked as such in the description.
  { code: '990001', short: 'DEMO FENCE:RENEW 1.8M CLOSEBOARD PANEL', element: 'Fencing (demo)', uom: 'NO', rate: 68 },
  { code: '990002', short: 'DEMO FENCE:RENEW CONCRETE POST', element: 'Fencing (demo)', uom: 'NO', rate: 54 },
  { code: '990003', short: 'DEMO EXTRACTOR FAN:RENEW BATHROOM', element: 'Electrical (demo)', uom: 'NO', rate: 92.5 },
];

export const DEMO_RATES: RateAdjustment[] = [{ contractor: 'R Dunham', under20k: -0.075, over20k: -0.075 }];

const CLIENT = 'repairs@sanctuary.example';
const OFFICE = 'quotes@r-dunham.example';
const ENGINEER = 'engineer@r-dunham.example';

const img = (id: string, name: string, emailId: string, at: string, include = true, note?: string) => ({ id, name, emailId, receivedAt: at, include, note });

export function demoJobs(): Job[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'SANC004958',
      workOrder: 'SANC004958',
      purchaseOrder: '4501849778',
      address: '31 Cathedral Drive, Basildon',
      postcode: 'SS15 5WF',
      locationOfWorks: 'Garage door',
      title: 'Garage door',
      client: 'Sanctuary',
      stage: 'review',
      contact: { name: 'Bill Beach', phone: '0208 7091700' },
      dateIssued: '2026-08-11',
      attended: '2026-08-24',
      typeOfWorks: 'Quoted Works',
      priority: 'Routine',
      report: { emailId: 'e-4958-report', text: REPORT_4958 },
      photos: [
        img('p1', 'IMG_2041.jpg', 'e-4958-report', '2026-08-24T16:41:00Z'),
        img('p2', 'IMG_2042.jpg', 'e-4958-report', '2026-08-24T16:41:00Z'),
        img('p3', 'IMG_2043.jpg', 'e-4958-report', '2026-08-24T16:41:00Z'),
        img('p4', 'IMG_2044.jpg', 'e-4958-report', '2026-08-24T16:41:00Z'),
        img('p5', 'IMG_2045.jpg', 'e-4958-report', '2026-08-24T16:41:00Z'),
        img('p6', 'IMG_2046.jpg', 'e-4958-report', '2026-08-24T16:41:00Z', false, 'blurry'),
      ],
      flag: { kind: 'ready-to-build', text: 'Ready to build' },
      sources: {
        workOrder: { emailId: 'e-4958-req', where: 'subject', quote: 'SANC004958' },
        purchaseOrder: { emailId: 'e-4958-req', where: 'subject', quote: 'PO 4501849778' },
        address: { emailId: 'e-4958-req', where: 'body', quote: '31 Cathedral Drive, Basildon, SS15 5WF' },
        postcode: { emailId: 'e-4958-req', where: 'subject', quote: 'SS15 5WF' },
        locationOfWorks: { emailId: 'e-4958-req', where: 'subject', quote: 'garage door' },
        contact: { emailId: 'e-4958-req', where: 'signature', quote: 'Bill Beach · 0208 7091700' },
        dateIssued: { emailId: 'e-4958-req', where: 'body', quote: '11 Aug 2026' },
        attended: { emailId: 'e-4958-report', where: 'body', quote: 'Attended on 24/08/2026' },
      },
      updatedAt: now,
      updatedBy: 'Jake',
    },
    {
      id: 'SANC005102', workOrder: 'SANC005102', purchaseOrder: '4501861204', address: '14 Elm Close, Wickford', postcode: 'SS12 0QT', locationOfWorks: 'Kitchen worktop', title: 'Kitchen worktop', client: 'Sanctuary', stage: 'review', dateIssued: '2026-09-03', typeOfWorks: 'Responsive Repair', priority: 'Routine',
      photos: [img('p7', 'IMG_3301.jpg', 'e-5102-photos', '2026-09-04T09:02:00Z'), img('p8', 'IMG_3302.jpg', 'e-5102-photos', '2026-09-04T09:02:00Z')],
      flag: { kind: 'no-report', text: 'No engineer report yet' }, sources: {}, updatedAt: now, updatedBy: 'Sam',
    },
    {
      id: 'SANC005117', workOrder: 'SANC005117', purchaseOrder: '4501863377', address: 'Flat 3, 22 High Road, Pitsea', postcode: 'SS13 3BJ', locationOfWorks: 'Bathroom extractor fan', title: 'Bathroom extractor fan', client: 'Sanctuary', stage: 'review', dateIssued: '2026-09-05', typeOfWorks: 'Responsive Repair', priority: 'Urgent',
      report: { emailId: 'e-5117-report', text: 'Attended 08/09/2026. Extractor fan in bathroom has failed, motor seized, ducting to soffit intact. Renew fan unit like for like, test on completion.' },
      photos: [img('p9', 'IMG_3410.jpg', 'e-5117-report', '2026-09-08T15:20:00Z'), img('p10', 'IMG_3411.jpg', 'e-5117-report', '2026-09-08T15:20:00Z'), img('p11', 'IMG_3412.jpg', 'e-5117-report', '2026-09-08T15:20:00Z')],
      flag: { kind: 'ready-to-build', text: 'Ready to build' }, sources: {}, updatedAt: now, updatedBy: 'Sam',
    },
    {
      id: 'SANC005121', workOrder: 'SANC005121', purchaseOrder: '4501866910', address: '41 Whitmore Way, Basildon', postcode: 'SS14 2TP', locationOfWorks: 'Front door and frame', title: 'Front door and frame', client: 'Sanctuary', stage: 'review', dateIssued: '2026-09-08', typeOfWorks: 'Responsive Repair', priority: 'Routine',
      photos: [], flag: { kind: 'awaiting-visit', text: 'Awaiting visit' }, sources: {}, updatedAt: now, updatedBy: 'Jake',
    },
    {
      id: 'SANC004990', workOrder: 'SANC004990', purchaseOrder: '4501852290', address: '19 Laindon Link, Basildon', postcode: 'SS15 5RE', locationOfWorks: 'Roof leak, rear bay', title: 'Roof leak, rear bay', client: 'Sanctuary', stage: 'amend', dateIssued: '2026-08-20', typeOfWorks: 'Quoted Works', priority: 'Routine',
      photos: [], total: 2140.66, flag: { kind: 'client-changes', text: 'Sanctuary asked for changes: "Please split the scaffold line and add photos of the flashing."' },
      quote: blankQuote({ workOrder: 'SANC004990', purchaseOrder: '4501852290', propertyAddress: '19 Laindon Link, Basildon, SS15 5RE', locationOfWorks: 'Roof leak, rear bay', version: 2, requestVersion: 2 }),
      sources: {}, updatedAt: now, updatedBy: 'Sam',
    },
    {
      id: 'SANC005044', workOrder: 'SANC005044', purchaseOrder: '4501855812', address: '7 Meadow Rise, Billericay', postcode: 'CM11 1JA', locationOfWorks: 'Fence panels and post', title: 'Fence panels and post', client: 'Sanctuary', stage: 'amend', dateIssued: '2026-08-28', typeOfWorks: 'Responsive Repair', priority: 'Routine',
      photos: [], total: 688.4, flag: { kind: 'internal-check', text: 'Line 3 quantity looks high against the photos.' },
      quote: blankQuote({ workOrder: 'SANC005044', purchaseOrder: '4501855812', propertyAddress: '7 Meadow Rise, Billericay, CM11 1JA', locationOfWorks: 'Rear garden fence', sorLines: [{ code: '990001', qty: 2 }, { code: '990002', qty: 1 }], nonSorLines: [{ works: 'Materials', qty: 1, description: 'Gravel boards and postcrete', uom: 'IT', rate: 46 }] }),
      sources: {}, updatedAt: now, updatedBy: 'Jake',
    },
    {
      id: 'SANC005001', workOrder: 'SANC005001', purchaseOrder: '4501853306', address: '55 Church Road, Benfleet', postcode: 'SS7 4AB', locationOfWorks: 'Boiler flue', title: 'Boiler flue', client: 'Sanctuary', stage: 'ready', dateIssued: '2026-08-22', typeOfWorks: 'Responsive Repair', priority: 'Urgent',
      photos: [], total: 512.9, quoteFileName: '8c1e02af-4501853306_SANC005001_55_Church_Road_Boiler_flue_SS7_4AB.xlsx', flag: { kind: 'checked', text: 'Checked' }, sources: {}, updatedAt: now, updatedBy: 'Sam',
    },
    {
      id: 'SANC005063', workOrder: 'SANC005063', purchaseOrder: '4501857741', address: '2 Beech Avenue, Rayleigh', postcode: 'SS6 8LP', locationOfWorks: 'Gutter and downpipe', title: 'Gutter and downpipe', client: 'Sanctuary', stage: 'ready', dateIssued: '2026-08-29', typeOfWorks: 'Responsive Repair', priority: 'Routine',
      photos: [], total: 221.35, quoteFileName: '3b9d77e1-4501857741_SANC005063_2_Beech_Avenue_Gutter_SS6_8LP.xlsx', flag: { kind: 'checked', text: 'Checked' }, sources: {}, updatedAt: now, updatedBy: 'Jake',
    },
    sent('SANC004871', '4501849001', '8 Orchard Way, Billericay', 'CM12 0AB', 'Fence panels', 1284.1, '2026-09-02', 'awaiting PO'),
    sent('SANC004902', '4501849550', '12 Park Lane, Basildon', 'SS16 4DR', 'Window', 367.8, '2026-08-29', 'approved'),
    sent('SANC004877', '4501849120', '3 Mill Court, Basildon', 'SS15 6EW', 'Bath panel', 148.2, '2026-08-28', 'approved'),
    sent('SANC004850', '4501848730', '27 Nevendon Road, Basildon', 'SS13 1BS', 'Path', 902.15, '2026-08-26', 'rejected, see v2'),
    sent('SANC004833', '4501848402', '60 Long Riding, Basildon', 'SS14 1QD', 'Kitchen', 3410, '2026-08-22', 'approved'),
  ];
}

function sent(wo: string, po: string, address: string, postcode: string, title: string, total: number, sentOn: string, outcome: string): Job {
  return {
    id: wo, workOrder: wo, purchaseOrder: po, address, postcode, locationOfWorks: title, title, client: 'Sanctuary', stage: 'sent', photos: [], total,
    quoteFileName: `${wo.slice(-8).toLowerCase()}-${po}_${wo}_${address.split(',')[0].replace(/\s+/g, '_')}_${title.replace(/\s+/g, '_')}_${postcode.replace(' ', '_')}.xlsx`,
    flag: { kind: 'checked', text: `Sent ${sentOn.slice(8, 10)}/${sentOn.slice(5, 7)} · ${outcome}` },
    sources: {}, updatedAt: `${sentOn}T12:00:00Z`, updatedBy: 'Jake',
  };
}

export function blankQuote(over: Partial<import('../lib/types').Quote> = {}): import('../lib/types').Quote {
  return {
    version: 1,
    contractor: 'R Dunham',
    contactName: '',
    contactPhone: '',
    email: 'admin@r-dunham.example',
    date: new Date().toISOString().slice(0, 10),
    functionalLocation: '',
    propertyAddress: '',
    locationOfWorks: '',
    typeOfWorks: '',
    requestVersion: 1,
    purchaseOrder: '',
    workOrder: '',
    dateIssued: '',
    quoteRef: '',
    priority: 'Routine',
    summary: '',
    sorLines: [],
    nonSorLines: [],
    ...over,
  };
}

export function demoEmails(): Email[] {
  const jpg = (id: string, name: string) => ({ id, name, contentType: 'image/jpeg', size: 1_800_000, isInline: false });
  const pdf = (id: string, name: string) => ({ id, name, contentType: 'application/pdf', size: 120_000, isInline: false });
  return [
    { id: 'e-4958-req', conversationId: 'c-4958', from: { name: 'Sanctuary (Property Service)', address: CLIENT }, to: [OFFICE], receivedAt: '2026-08-11T10:15:00Z',
      subject: 'Extra works request SANC004958 / PO 4501849778 – 31 Cathedral Drive, Basildon SS15 5WF – garage door',
      bodyText: 'Please quote for repairs to the up and over garage door at the above property. Tenant reports the door will not open.\n\nBill Beach\nTel: 0208 7091700\nSanctuary (Property Service)',
      attachments: [pdf('a1', 'Purchase order 4501849778.pdf')], jobId: 'SANC004958', matchedBy: 'work-order' },
    { id: 'e-4958-report', conversationId: 'c-4958-r', from: { name: 'Site engineer', address: ENGINEER }, to: [OFFICE], receivedAt: '2026-08-24T16:41:00Z',
      subject: 'Job report – SANC004958 garage door, 31 Cathedral Drive',
      bodyText: `Hi both,\n\n${REPORT_4958}\n\nPhotos attached.\n\nThanks\nDave`,
      attachments: ['IMG_2041', 'IMG_2042', 'IMG_2043', 'IMG_2044', 'IMG_2045', 'IMG_2046'].map((n, i) => jpg(`a-${i}`, `${n}.jpg`)), jobId: 'SANC004958', matchedBy: 'work-order' },
    { id: 'e-4958-access', conversationId: 'c-4958', from: { name: 'Sanctuary (Property Service)', address: CLIENT }, to: [OFFICE], receivedAt: '2026-08-26T14:02:00Z',
      subject: 'RE: SANC004958 – access arranged for garage door',
      bodyText: 'Tenant confirms access any weekday after 9am. Please quote as discussed.', attachments: [], jobId: 'SANC004958', matchedBy: 'conversation' },
    { id: 'e-5130', conversationId: 'c-5130', from: { name: 'Sanctuary (Property Service)', address: CLIENT }, to: [OFFICE], receivedAt: new Date(Date.now() - 20 * 60000).toISOString(),
      subject: 'Extra works request SANC005130 – 9 Ash Grove, Basildon SS14 3RT – kitchen tap',
      bodyText: 'Please quote to renew the kitchen mixer tap, tenant reports constant drip.\n\nBill Beach\nTel: 0208 7091700', attachments: [pdf('a-5130', 'Purchase order.pdf')] },
    { id: 'e-5044-report', conversationId: 'c-5044-r', from: { name: 'Site engineer', address: ENGINEER }, to: [OFFICE], receivedAt: new Date(Date.now() - 45 * 60000).toISOString(),
      subject: 'Job report – fence, Meadow Rise',
      bodyText: 'Been out to 7 Meadow Rise this morning. Two fence panels down at the rear and the concrete post is cracked at the base. Will need 2 new panels, 1 post, gravel boards and a bag of postcrete. Photos attached. Half a day for two of us.',
      attachments: ['IMG_3501', 'IMG_3502', 'IMG_3503', 'IMG_3504', 'IMG_3505'].map((n, i) => jpg(`a-5044-${i}`, `${n}.jpg`)) },
    { id: 'e-bath', conversationId: 'c-bath', from: { name: 'Forwarded by office', address: OFFICE }, to: [OFFICE], receivedAt: new Date(Date.now() - 26 * 3600000).toISOString(),
      subject: 'FW: photos of bathroom', bodyText: 'Forwarding these from the tenant, not sure which job.', attachments: ['IMG_9001', 'IMG_9002', 'IMG_9003'].map((n, i) => jpg(`a-bath-${i}`, `${n}.jpg`)) },
    { id: 'e-5121-po', conversationId: 'c-5121', from: { name: 'Site engineer', address: ENGINEER }, to: [OFFICE], receivedAt: new Date(Date.now() - 50 * 3600000).toISOString(),
      subject: 'FW: PO 4501866910 front door', bodyText: 'PO for Whitmore Way attached.', attachments: [pdf('a-5121', 'PO 4501866910.pdf')] },
    { id: 'e-inv', conversationId: 'c-inv', from: { name: 'Builders merchant', address: 'accounts@merchant.example' }, to: [OFFICE], receivedAt: new Date(Date.now() - 55 * 3600000).toISOString(),
      subject: 'Invoice 88213', bodyText: 'Please find attached invoice 88213.', attachments: [pdf('a-inv', 'Invoice 88213.pdf')] },
    { id: 'e-4990-changes', conversationId: 'c-4990', from: { name: 'Sanctuary (Property Service)', address: CLIENT }, to: [OFFICE], receivedAt: '2026-09-04T15:48:00Z',
      subject: 'RE: SANC004990 – roof leak quote – changes needed', bodyText: 'Please split the scaffold line and add photos of the flashing.', attachments: [], jobId: 'SANC004990', matchedBy: 'work-order' },
  ];
}
