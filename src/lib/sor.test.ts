import { describe, expect, it } from 'vitest';
import { buildIndex, searchSor, suggestFromReport, tokenize } from './sor';
import type { SorCode } from './types';

const codes: SorCode[] = [
  { code: '345613', short: 'GARAGE DOOR:RENEW ROLLERS AND CHANNELS', element: 'Garage Doors and Frames', uom: 'IT', rate: 72.64 },
  { code: '345611', short: 'GARAGE DOOR:RENEW LOCK TO UP AND OVER', element: 'Garage Doors and Frames', uom: 'NO', rate: 26.47 },
  { code: '345605', short: 'GARAGE DOOR:RENEW SPINDLE/ROLLER/CABLE', element: 'Garage Doors and Frames', uom: 'NO', rate: 39.73 },
  { code: '345601', short: 'GARAGE DOOR:REMOVE AND REFIX UP AND OVER', element: 'Garage Doors and Frames', uom: 'IT', rate: 86.31 },
  { code: '345602', short: 'GARAGE DOOR:EASE AND ADJUST UP AND OVER', element: 'Garage Doors and Frames', uom: 'IT', rate: 36.28 },
  { code: '345603', short: 'GARAGE DOOR:REPAIR UP AND OVER METAL', element: 'Garage Doors and Frames', uom: 'IT', rate: 58.81 },
  { code: '1101', short: 'KERB:LAY NEW 127X254MM PCC KERB', element: 'Groundworks', section: 'Kerbs, Channels and Edgings', uom: 'LM', rate: 55.67 },
  { code: '1301', short: 'CHANNEL:RENEW NE 250X125MM', element: 'Groundworks', section: 'Kerbs, Channels and Edgings', uom: 'LM', rate: 59.71 },
];

describe('tokenize', () => {
  it('stems and drops stop words', () => {
    expect(tokenize('The rollers and channels need renewing')).toEqual(['roller', 'channel', 'renew']);
  });
});

describe('searchSor', () => {
  const idx = buildIndex(codes);
  it('finds a code by number prefix', () => {
    expect(searchSor(idx, '3456').map((h) => h.code.code)).toContain('345611');
  });
  it('ranks the lock code first for "garage door lock"', () => {
    expect(searchSor(idx, 'garage door lock')[0].code.code).toBe('345611');
  });
  it('keeps garage door results ahead of groundworks for "renew channel"', () => {
    const hits = searchSor(idx, 'garage door renew rollers channels');
    expect(hits[0].code.code).toBe('345613');
  });
});

describe('suggestFromReport', () => {
  const idx = buildIndex(codes);
  const report =
    'Attended on 24/08/2026 to assess garage door. The up and over garage door needs to be removed entirely for repairs to be carried out to the door itself as well as to allow all components to be replaced, including the rollers and channels, cables, lock and repairs to the frame.';
  it('suggests the codes actually used on the real quote', () => {
    const got = suggestFromReport(idx, report, 6).map((h) => h.code.code);
    expect(got).toContain('345613');
    expect(got).toContain('345611');
    expect(got).toContain('345601');
    expect(got).not.toContain('1101');
  });
});
