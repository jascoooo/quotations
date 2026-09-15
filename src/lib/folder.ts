// Watching a folder, so emails arrive on their own without any sign-in.
//
// A Power Automate flow (Microsoft's own connector, no app registration and no
// administrator) drops one small JSON file per email into a OneDrive or
// SharePoint folder, with the photos beside it. That folder syncs to this PC,
// and the app reads it straight off the disk with the browser's folder-access
// permission. Nothing is uploaded and nothing is signed in to: the file never
// leaves the machine.
//
// Layout the flow writes, and this reads:
//   <folder>/msg-000123.json            the email
//   <folder>/msg-000123__front.jpg      an attachment of that email
//   <folder>/msg-000123__damage.jpg     another one
//
// Chromium browsers only (Edge, Chrome). Firefox and Safari have no folder
// permission, so the app falls back to pasting an email in by hand.

import type { Email, Photo } from './types';

// The File System Access API is not in TypeScript's DOM library yet.
interface FsHandle {
  kind: 'file' | 'directory';
  name: string;
  queryPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
}
export interface FsDirectoryHandle extends FsHandle {
  kind: 'directory';
  values: () => AsyncIterableIterator<FsHandle>;
}
export interface FsFileHandle extends FsHandle {
  kind: 'file';
  getFile: () => Promise<File>;
}

export function supportsFolderWatch(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function pickFolder(): Promise<FsDirectoryHandle> {
  const w = window as unknown as { showDirectoryPicker: (o?: { mode?: 'read' | 'readwrite' }) => Promise<FsDirectoryHandle> };
  return w.showDirectoryPicker({ mode: 'read' });
}

/** 'granted' without prompting, 'prompt' if the user must click, 'denied' if not allowed. */
export async function folderPermission(handle: FsDirectoryHandle): Promise<PermissionState> {
  return (await handle.queryPermission?.({ mode: 'read' })) ?? 'prompt';
}

/** Must be called from a click: browsers refuse otherwise. */
export async function askForFolder(handle: FsDirectoryHandle): Promise<PermissionState> {
  return (await handle.requestPermission?.({ mode: 'read' })) ?? 'denied';
}

/** What the flow writes. Everything except the subject is optional. */
export interface EmailDrop {
  id?: string;
  conversationId?: string;
  subject?: string;
  from?: { name?: string; address?: string } | string;
  to?: string[] | string;
  receivedAt?: string;
  /** What Microsoft's own Outlook connector calls it, so the flow can drop the
   *  trigger's whole output in with no expressions to write. */
  receivedDateTime?: string;
  bodyText?: string;
  body?: string;
  bodyPreview?: string;
  attachments?: (string | { name?: string })[];
}

/** Strip HTML down to readable text, for a flow that sends the HTML body. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    // The opening tag left a space where the closing tag put the newline.
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Turn one dropped file into an email the rest of the app understands.
 * Throws with a readable reason rather than half-importing something.
 */
export function parseDrop(json: string, fileName: string): Email {
  let d: EmailDrop;
  try {
    d = JSON.parse(json) as EmailDrop;
  } catch {
    throw new Error(`${fileName} is not valid JSON. Check the flow's "Create file" content.`);
  }
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error(`${fileName} does not contain an email.`);

  const base = fileName.replace(/\.json$/i, '');
  const id = String(d.id ?? base).trim() || base;
  const subject = String(d.subject ?? '').trim();
  const rawBody = d.bodyText ?? d.body ?? d.bodyPreview ?? '';
  const bodyText = /<[a-z][\s\S]*>/i.test(rawBody) ? htmlToText(rawBody) : String(rawBody);
  if (!subject && !bodyText) throw new Error(`${fileName} has neither a subject nor a body.`);

  const from = typeof d.from === 'string' ? { name: d.from, address: d.from } : { name: d.from?.name ?? '', address: d.from?.address ?? '' };
  const to = Array.isArray(d.to) ? d.to : d.to ? [d.to] : [];
  const when = d.receivedAt ?? d.receivedDateTime;
  const received = when && !Number.isNaN(Date.parse(when)) ? new Date(when).toISOString() : new Date().toISOString();

  return {
    id,
    conversationId: String(d.conversationId ?? id),
    from: { name: from.name || from.address || 'Unknown', address: from.address ?? '' },
    to,
    receivedAt: received,
    subject,
    bodyText,
    attachments: (d.attachments ?? [])
      .map((a) => (typeof a === 'string' ? a : (a?.name ?? '')))
      .filter(Boolean)
      .map((name) => ({ id: `${id}__${name}`, name, contentType: '', size: 0, isInline: false })),
  };
}

/** The attachment prefix for an email file, e.g. "msg-1.json" -> "msg-1__". */
export function attachmentPrefix(fileName: string): string {
  return `${fileName.replace(/\.json$/i, '')}__`;
}

export interface ScanResult {
  emails: Email[];
  /** Photos keyed by the id of the email they belong to. */
  photos: Map<string, Photo[]>;
  skipped: string[];
  seen: string[];
}

const IMAGE = /\.(jpe?g|png|gif|webp|heic|bmp)$/i;

/**
 * Read everything new in the folder. Files already imported are identified by
 * name and last-modified time, so a scan can run as often as you like.
 */
export async function scanFolder(dir: FsDirectoryHandle, already: Set<string>): Promise<ScanResult> {
  const files = new Map<string, File>();
  for await (const entry of dir.values()) {
    if (entry.kind !== 'file') continue;
    files.set(entry.name, await (entry as FsFileHandle).getFile());
  }

  const emails: Email[] = [];
  const photos = new Map<string, Photo[]>();
  const skipped: string[] = [];
  const seen: string[] = [];

  for (const [name, file] of files) {
    if (!name.toLowerCase().endsWith('.json')) continue;
    const stamp = `${name}:${file.lastModified}:${file.size}`;
    if (already.has(stamp)) continue;
    seen.push(stamp);
    let email: Email;
    try {
      email = parseDrop(await file.text(), name);
    } catch (e) {
      skipped.push(e instanceof Error ? e.message : String(e));
      continue;
    }
    emails.push(email);

    const prefix = attachmentPrefix(name);
    const mine: Photo[] = [];
    for (const [n, f] of files) {
      if (!n.startsWith(prefix) || !IMAGE.test(n)) continue;
      mine.push({
        id: `${email.id}__${n.slice(prefix.length)}`,
        name: n.slice(prefix.length),
        url: await dataUrl(f),
        emailId: email.id,
        receivedAt: new Date(f.lastModified).toISOString(),
        include: true,
      });
    }
    if (mine.length) photos.set(email.id, mine);
  }

  return { emails, photos, skipped, seen };
}

function dataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error(`Could not read ${file.name}`));
    r.readAsDataURL(file);
  });
}

// ---- reading and writing a shared folder --------------------------------
//
// The board itself lives in the folder too, one small file per job. That is
// what makes it shared and live: the folder is a SharePoint or OneDrive folder
// synced to each person's PC, so a change one person writes appears on the
// others within a sync. One file per job is deliberate. A single board file
// would collide every time two people worked at once; separate files only
// collide if two people edit the same job in the same moment.

interface FsWritable {
  write: (data: string | BufferSource | Blob) => Promise<void>;
  close: () => Promise<void>;
}
interface FsFileHandleRW extends FsFileHandle {
  createWritable: () => Promise<FsWritable>;
}
interface FsDirectoryHandleRW extends FsDirectoryHandle {
  getDirectoryHandle: (name: string, o?: { create?: boolean }) => Promise<FsDirectoryHandleRW>;
  getFileHandle: (name: string, o?: { create?: boolean }) => Promise<FsFileHandleRW>;
  removeEntry: (name: string, o?: { recursive?: boolean }) => Promise<void>;
}

export type SharedDir = FsDirectoryHandleRW;

/** Ask for a folder the app may also write the board into. */
export async function pickSharedFolder(): Promise<SharedDir> {
  const w = window as unknown as { showDirectoryPicker: (o?: { mode?: 'read' | 'readwrite' }) => Promise<SharedDir> };
  return w.showDirectoryPicker({ mode: 'readwrite' });
}

export async function subFolder(dir: SharedDir, name: string): Promise<SharedDir> {
  return dir.getDirectoryHandle(name, { create: true });
}

/** Every .json file in a folder, with the time it last changed. */
export async function listJson(dir: SharedDir): Promise<{ name: string; file: File }[]> {
  const out: { name: string; file: File }[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.json')) continue;
    out.push({ name: entry.name, file: await (entry as FsFileHandle).getFile() });
  }
  return out;
}

/** Every spreadsheet sitting in a folder, newest first. */
export async function listWorkbooks(dir: SharedDir): Promise<{ name: string; file: File }[]> {
  const out: { name: string; file: File }[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind !== 'file') continue;
    if (!/\.xlsx$/i.test(entry.name) || entry.name.startsWith('~$')) continue;
    out.push({ name: entry.name, file: await (entry as FsFileHandle).getFile() });
  }
  return out.sort((a, b) => b.file.lastModified - a.file.lastModified);
}

export async function writeJson(dir: SharedDir, name: string, value: unknown): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const w = await handle.createWritable();
  await w.write(JSON.stringify(value, null, 2));
  await w.close();
}

export async function readJson<T>(dir: SharedDir, name: string): Promise<T | undefined> {
  try {
    const handle = await dir.getFileHandle(name);
    return JSON.parse(await (await handle.getFile()).text()) as T;
  } catch {
    return undefined;
  }
}

export async function removeFile(dir: SharedDir, name: string): Promise<void> {
  try {
    await dir.removeEntry(name);
  } catch {
    /* already gone */
  }
}

/** A file name for a job that is safe on Windows and stable across machines. */
export function jobFileName(id: string): string {
  return `${id.replace(/[\\/:*?"<>|]/g, '-')}.json`;
}
