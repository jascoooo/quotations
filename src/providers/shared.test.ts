// @vitest-environment happy-dom
//
// The claim under test: two people, two PCs, one synced folder, and the board
// is the same on both. The fake folder below stands in for what SharePoint or
// OneDrive syncs between them, so the whole path is exercised: writing a job,
// another copy of the app picking it up, filing an email, and the photos that
// came with it landing on the right job.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SharedDir } from '../lib/folder';
import { LocalProvider } from './local';

// ---- a folder that behaves like one on disk ------------------------------

let clock = 1_700_000_000_000;
const tick = () => (clock += 1000);

class FakeFile {
  constructor(
    readonly name: string,
    public body: string,
    public lastModified: number,
  ) {}
  get size() {
    return this.body.length;
  }
  async text() {
    return this.body;
  }
}

class FakeDir {
  files = new Map<string, FakeFile>();
  dirs = new Map<string, FakeDir>();
  constructor(readonly name: string) {}

  async getDirectoryHandle(name: string, o?: { create?: boolean }) {
    let d = this.dirs.get(name);
    if (!d) {
      if (!o?.create) throw new Error(`no dir ${name}`);
      d = new FakeDir(name);
      this.dirs.set(name, d);
    }
    return d as unknown as SharedDir;
  }

  async getFileHandle(name: string, o?: { create?: boolean }) {
    const self = this;
    if (!this.files.has(name)) {
      if (!o?.create) throw new Error(`no file ${name}`);
      this.files.set(name, new FakeFile(name, '', tick()));
    }
    return {
      kind: 'file' as const,
      name,
      async getFile() {
        return self.files.get(name) as unknown as File;
      },
      async createWritable() {
        return {
          async write(data: string) {
            self.files.set(name, new FakeFile(name, String(data), tick()));
          },
          async close() {},
        };
      },
    };
  }

  async removeEntry(name: string) {
    this.files.delete(name);
  }

  async *values() {
    for (const f of this.files.values()) yield { kind: 'file' as const, name: f.name, getFile: async () => f as unknown as File };
    for (const d of this.dirs.values()) yield { kind: 'directory' as const, name: d.name };
  }

  /** What a Power Automate flow would drop in. */
  dropEmail(base: string, email: Record<string, unknown>, photos: string[] = []) {
    const emails = this.dirs.get('emails') ?? new FakeDir('emails');
    this.dirs.set('emails', emails);
    emails.files.set(`${base}.json`, new FakeFile(`${base}.json`, JSON.stringify(email), tick()));
    for (const p of photos) emails.files.set(`${base}__${p}`, new FakeFile(`${base}__${p}`, 'not-really-an-image', tick()));
  }

  jobFiles() {
    return [...(this.dirs.get('jobs')?.files.keys() ?? [])];
  }
}

const asShared = (d: FakeDir) => d as unknown as SharedDir;

// happy-dom has no FileReader that reads our fake, and the photo path uses one.
class StubReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  error = null;
  readAsDataURL() {
    this.result = 'data:image/jpeg;base64,AAAA';
    queueMicrotask(() => this.onload?.());
  }
}

describe('two people sharing one folder', () => {
  let folder: FakeDir;
  let jake: LocalProvider;
  let sam: LocalProvider;

  beforeEach(async () => {
    (globalThis as unknown as { FileReader: unknown }).FileReader = StubReader;
    // Each provider gets its own browser storage, as two PCs would.
    indexedDB.deleteDatabase('quote-desk');
    folder = new FakeDir('Quote Desk');
    jake = new LocalProvider();
    sam = new LocalProvider();
    await jake.init();
    await jake.saveSettings({ ...jake.localSettings(), userName: 'Jake' });
    await jake.useFolder(asShared(folder));
    await sam.init();
    await sam.saveSettings({ ...sam.localSettings(), userName: 'Sam' });
    await sam.useFolder(asShared(folder));
  });

  it('puts a job one person adds onto the other person’s board', async () => {
    await jake.createJob({ workOrder: 'SANC004958', address: '31 Cathedral Drive', postcode: 'SS15 5WF', title: 'Garage door' });
    expect(folder.jobFiles()).toEqual(['SANC004958.json']);

    expect(await sam.listJobs()).toHaveLength(0); // not until it looks
    await sam.scanNow();
    await (sam as unknown as { pull: () => Promise<void> }).pull();

    const seen = await sam.listJobs();
    expect(seen).toHaveLength(1);
    expect(seen[0].address).toBe('31 Cathedral Drive');
    expect(seen[0].updatedBy).toBe('Jake');
  });

  it('shows a card moved on one screen as moved on the other', async () => {
    await jake.createJob({ workOrder: 'SANC005044', title: 'Fence' });
    await (sam as unknown as { pull: () => Promise<void> }).pull();
    expect((await sam.listJobs())[0].stage).toBe('review');

    await jake.moveJob('SANC005044', 'ready');
    await (sam as unknown as { pull: () => Promise<void> }).pull();

    expect((await sam.listJobs())[0].stage).toBe('ready');
    expect(sam.liveStatus().recentEditors).toContain('Jake');
  });

  it('keeps one person’s edit from wiping the other’s, by writing separate files', async () => {
    await jake.createJob({ workOrder: 'SANC001', title: 'One' });
    await jake.createJob({ workOrder: 'SANC002', title: 'Two' });
    await (sam as unknown as { pull: () => Promise<void> }).pull();

    await jake.moveJob('SANC001', 'ready');
    await sam.moveJob('SANC002', 'sent');
    await (jake as unknown as { pull: () => Promise<void> }).pull();
    await (sam as unknown as { pull: () => Promise<void> }).pull();

    for (const who of [jake, sam]) {
      const jobs = await who.listJobs();
      expect(jobs.find((j) => j.id === 'SANC001')?.stage).toBe('ready');
      expect(jobs.find((j) => j.id === 'SANC002')?.stage).toBe('sent');
    }
    expect(folder.jobFiles().sort()).toEqual(['SANC001.json', 'SANC002.json']);
  });

  it('takes an email the flow drops in, and files it to the job on both screens', async () => {
    await jake.createJob({ workOrder: 'SANC004958', address: '31 Cathedral Drive', postcode: 'SS15 5WF', title: 'Garage door' });
    folder.dropEmail(
      'msg-0001',
      { subject: 'RE: SANC004958 garage door', body: '<p>Attended today, panel is bent.</p>', from: 'engineer@example.com', receivedDateTime: '2026-09-14T09:00:00Z' },
      ['front.jpg'],
    );

    const r = await jake.scanNow();
    expect(r.added).toBe(1);

    // The work order in the subject is a certain match, so it files itself.
    const emails = await jake.listEmails();
    expect(emails[0].jobId).toBe('SANC004958');

    const job = await jake.getJob('SANC004958');
    expect(job?.filedEmailIds).toContain(emails[0].id);
    expect(job?.photos.map((p) => p.name)).toContain('front.jpg');

    await (sam as unknown as { pull: () => Promise<void> }).pull();
    await sam.scanNow();
    const samJob = await sam.getJob('SANC004958');
    expect(samJob?.filedEmailIds).toContain(emails[0].id);
    expect((await sam.listEmails())[0].jobId).toBe('SANC004958');
  });

  it('imports each dropped email once, however often it looks', async () => {
    folder.dropEmail('msg-0002', { subject: 'Quote please SANC009', body: 'text' });
    expect((await jake.scanNow()).added).toBe(1);
    expect((await jake.scanNow()).added).toBe(0);
    expect((await jake.scanNow()).added).toBe(0);
    expect(await jake.listEmails()).toHaveLength(1);
  });

  it('shares the settings, so the second person is configured already', async () => {
    await jake.saveSettings({ ...jake.localSettings(), contractor: 'R Dunham', clientName: 'Sanctuary', clientDomains: ['sanctuary.example'], userName: 'Jake' });
    const fresh = new LocalProvider();
    await fresh.init();
    await fresh.useFolder(asShared(folder));
    expect(fresh.settings().clientDomains).toEqual(['sanctuary.example']);
  });

  it('survives a half-written file mid-sync rather than losing the board', async () => {
    await jake.createJob({ workOrder: 'SANC777', title: 'Good' });
    const jobs = folder.dirs.get('jobs') as FakeDir;
    jobs.files.set('SANC888.json', new FakeFile('SANC888.json', '{"id":"SANC888","stage"', tick()));

    await (sam as unknown as { pull: () => Promise<void> }).pull();
    const seen = await sam.listJobs();
    expect(seen.map((j) => j.id)).toContain('SANC777');
    expect(seen.map((j) => j.id)).not.toContain('SANC888');
  });
});
