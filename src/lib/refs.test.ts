import { describe, expect, it } from 'vitest';
import { findRefs, mentionsAddress, normalisePostcode } from './refs';

describe('findRefs', () => {
  it('finds work orders, purchase orders and postcodes', () => {
    const r = findRefs('Extra works request SANC004958 / PO 4501849778 – 31 Cathedral Drive SS15 5WF – garage door');
    expect(r.workOrders).toEqual(['SANC004958']);
    expect(r.purchaseOrders).toEqual(['4501849778']);
    expect(r.postcodes).toEqual(['SS15 5WF']);
  });
  it('tolerates spacing and case', () => {
    expect(findRefs('ref sanc 004958, postcode ss155wf').workOrders).toEqual(['SANC004958']);
    expect(findRefs('ref sanc 004958, postcode ss155wf').postcodes).toEqual(['SS15 5WF']);
    expect(normalisePostcode('cm111ja')).toBe('CM11 1JA');
  });
  it('ignores phone numbers and other digit runs', () => {
    expect(findRefs('call 0208 7091700 or 01268 123456').purchaseOrders).toEqual([]);
  });
});

describe('mentionsAddress', () => {
  it('matches on the first line of the address', () => {
    expect(mentionsAddress('Been out to 7 Meadow Rise this morning', '7 Meadow Rise, Billericay', 'CM11 1JA')).toBe('address');
  });
  it('matches on the postcode alone', () => {
    expect(mentionsAddress('job at CM11 1JA needs fencing', '7 Meadow Rise, Billericay', 'CM11 1JA')).toBe('postcode');
  });
  it('does not match unrelated text', () => {
    expect(mentionsAddress('invoice 88213 attached', '7 Meadow Rise, Billericay', 'CM11 1JA')).toBeNull();
  });
});
