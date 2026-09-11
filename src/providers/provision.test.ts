import { describe, expect, it } from 'vitest';
import { INBOX_COLUMNS, QUOTES_COLUMNS, columnBody, diagnose, parseSiteUrl, siteLookupPath, splitList } from './provision';

describe('parseSiteUrl', () => {
  it('reads a plain site address', () => {
    expect(parseSiteUrl('https://rdunham.sharepoint.com/sites/Quotes')).toEqual({ hostname: 'rdunham.sharepoint.com', path: '/sites/Quotes' });
  });

  it('reads the address of a page inside the site', () => {
    expect(parseSiteUrl('https://rdunham.sharepoint.com/sites/Quotes/Shared%20Documents/Forms/AllItems.aspx?viewid=abc')).toEqual({
      hostname: 'rdunham.sharepoint.com',
      path: '/sites/Quotes',
    });
  });

  it('handles a Teams-created site and a decoded space', () => {
    expect(parseSiteUrl('https://rdunham.sharepoint.com/teams/Sanctuary%20Quotes/SitePages/Home.aspx')).toEqual({
      hostname: 'rdunham.sharepoint.com',
      path: '/teams/Sanctuary Quotes',
    });
  });

  it('accepts an address pasted without the scheme', () => {
    expect(parseSiteUrl('rdunham.sharepoint.com/sites/Quotes')).toEqual({ hostname: 'rdunham.sharepoint.com', path: '/sites/Quotes' });
  });

  it('treats the bare host as the root site', () => {
    expect(parseSiteUrl('https://rdunham.sharepoint.com')).toEqual({ hostname: 'rdunham.sharepoint.com', path: '' });
  });

  it('refuses something that is not an address', () => {
    expect(() => parseSiteUrl('the quotes site')).toThrow();
    expect(() => parseSiteUrl('')).toThrow();
  });
});

describe('siteLookupPath', () => {
  it('builds the Graph address for a named site', () => {
    expect(siteLookupPath({ hostname: 'rdunham.sharepoint.com', path: '/sites/Quotes' })).toBe('/sites/rdunham.sharepoint.com:/sites/Quotes');
  });

  it('escapes a space in the site name', () => {
    expect(siteLookupPath({ hostname: 'rdunham.sharepoint.com', path: '/teams/Sanctuary Quotes' })).toBe('/sites/rdunham.sharepoint.com:/teams/Sanctuary%20Quotes');
  });

  it('uses the host on its own for the root site', () => {
    expect(siteLookupPath({ hostname: 'rdunham.sharepoint.com', path: '' })).toBe('/sites/rdunham.sharepoint.com');
  });
});

describe('column definitions', () => {
  it('covers every field the board stores', () => {
    const names = QUOTES_COLUMNS.map((c) => c.name);
    for (const needed of ['PurchaseOrder', 'Address', 'Postcode', 'Stage', 'Total', 'QuoteJson', 'ReportJson', 'PhotosJson', 'SourcesJson', 'FlagJson', 'FolderId', 'QuoteFileName']) {
      expect(names).toContain(needed);
    }
    expect(names).not.toContain('Title'); // built in to every list
    expect(new Set(names).size).toBe(names.length);
  });

  it('offers exactly the four board columns as choices', () => {
    const stage = QUOTES_COLUMNS.find((c) => c.name === 'Stage');
    expect(stage && 'choices' in stage ? stage.choices : []).toEqual(['To review', 'To check and amend', 'Ready to send', 'Sent']);
  });

  it('stores the long values as multi-line text, which has no 255-character limit', () => {
    for (const name of ['QuoteJson', 'ReportJson', 'PhotosJson', 'SourcesJson', 'FlagJson', 'FolderUrl']) {
      const body = columnBody(QUOTES_COLUMNS.find((c) => c.name === name)!) as { text: { allowMultipleLines: boolean } };
      expect(body.text.allowMultipleLines).toBe(true);
    }
  });

  it('describes each type the way Graph expects', () => {
    expect(columnBody({ name: 'Total', kind: 'number' })).toMatchObject({ name: 'Total', number: { decimalPlaces: 'two' } });
    expect(columnBody({ name: 'Attended', kind: 'date' })).toMatchObject({ dateTime: { format: 'dateOnly' } });
    expect(columnBody({ name: 'Ignored', kind: 'yesno' })).toMatchObject({ boolean: {} });
    expect(columnBody({ name: 'Address', kind: 'text' })).toMatchObject({ text: { allowMultipleLines: false, maxLength: 255 } });
  });

  it('gives the filing list what the matcher needs', () => {
    expect(INBOX_COLUMNS.map((c) => c.name)).toEqual(['ConversationId', 'JobId', 'Rule', 'Ignored']);
  });
});

describe('diagnose', () => {
  it('recognises the consent wall', () => {
    expect(diagnose('AADSTS65001: The user or administrator has not consented')).toMatch(/admin consent/i);
  });

  it('recognises a redirect address that was never registered', () => {
    expect(diagnose("AADSTS50011: The redirect URI specified in the request does not match")).toMatch(/Redirect URIs/);
  });

  it('recognises no access to the mailbox or site', () => {
    expect(diagnose('403 accessDenied Access is denied')).toMatch(/does not have access/);
  });

  it('recognises Excel on the web refusing the workbook', () => {
    expect(diagnose('403 Could not obtain a WAC access token')).toMatch(/Excel for the web/);
  });

  it('says nothing when it has nothing useful to say', () => {
    expect(diagnose('500 something went wrong')).toBeNull();
  });
});

describe('splitList', () => {
  it('takes domains however they are typed', () => {
    expect(splitList('Sanctuary-Housing.co.uk, @example.com;  foo.co.uk')).toEqual(['sanctuary-housing.co.uk', 'example.com', 'foo.co.uk']);
    expect(splitList('')).toEqual([]);
  });
});
