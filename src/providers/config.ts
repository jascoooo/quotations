// Runtime configuration for Microsoft 365 mode. Nothing secret lives here: the
// app signs users in with their own Microsoft account and acts on their behalf.
//
// Two places it can come from, checked in this order:
//   1. Settings saved in this browser by the setup screen (localStorage). This
//      is how one person can connect the app and try it without touching the
//      repository or waiting for a deployment.
//   2. A config.json published next to the app. Once the setup screen has
//      produced the settings, commit them here so colleagues get them
//      automatically and nobody repeats the setup.

export interface AppConfig {
  tenantId: string;
  clientId: string;
  redirectUri?: string;
  sharedMailbox: string;
  siteId: string;
  quotesListId: string;
  inboxListId: string;
  driveId: string;
  jobsRootFolder: string;
  templateItemId: string;
  contractor: string;
  contractorEmail: string;
  clientName: string;
  clientDomains: string[];
  ownDomains: string[];
  clientQuotesMailbox?: string;
  pollSeconds?: number;
}

export const CONFIG_KEY = 'quote-desk-config-v1';
export const DRAFT_KEY = 'quote-desk-setup-draft-v1';
/** Set once someone chooses the on-this-PC route, so the app reopens into it. */
export const LOCAL_MODE_KEY = 'quote-desk-local-mode';

/** Forget the chosen route, so the app opens on the first screen again. */
export function clearChosenMode(): void {
  try {
    window.localStorage.removeItem(LOCAL_MODE_KEY);
  } catch {
    /* nothing stored */
  }
  // The hash is the other way a route is chosen, so it has to go too.
  if (window.location.hash) window.location.hash = '';
}

const REQUIRED: (keyof AppConfig)[] = ['tenantId', 'clientId', 'sharedMailbox', 'siteId', 'quotesListId', 'inboxListId', 'driveId', 'templateItemId', 'contractor', 'clientName'];

/** The settings that are missing before the app can run against Microsoft 365. */
export function missingKeys(cfg: Partial<AppConfig> | null | undefined): string[] {
  if (!cfg) return REQUIRED as string[];
  return REQUIRED.filter((k) => !cfg[k]);
}

export function withDefaults(cfg: Partial<AppConfig>): AppConfig {
  return {
    jobsRootFolder: 'Jobs',
    contractorEmail: '',
    clientDomains: [],
    ownDomains: [],
    pollSeconds: 30,
    ...cfg,
  } as AppConfig;
}

export function readStoredConfig(): AppConfig | null {
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as Partial<AppConfig>;
    return missingKeys(cfg).length ? null : withDefaults(cfg);
  } catch {
    return null;
  }
}

export function saveStoredConfig(cfg: Partial<AppConfig>): void {
  try {
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg, null, 2));
  } catch {
    /* private browsing, or storage is full: the app still runs this session */
  }
}

export function clearStoredConfig(): void {
  try {
    window.localStorage.removeItem(CONFIG_KEY);
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nothing to do */
  }
}

export async function loadPublishedConfig(): Promise<AppConfig | null> {
  try {
    const res = await fetch('./config.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const cfg = (await res.json()) as Partial<AppConfig>;
    return missingKeys(cfg).length ? null : withDefaults(cfg);
  } catch {
    return null;
  }
}

/** Whichever settings this browser should use, and where they came from. */
export async function loadConfig(): Promise<{ config: AppConfig; source: 'browser' | 'published' } | null> {
  const stored = readStoredConfig();
  if (stored) return { config: stored, source: 'browser' };
  const published = await loadPublishedConfig();
  if (published) return { config: published, source: 'published' };
  return null;
}

/** The text to paste into public/config.json so colleagues skip the setup. */
export function configJson(cfg: AppConfig): string {
  const ordered: Partial<AppConfig> = {
    tenantId: cfg.tenantId,
    clientId: cfg.clientId,
    redirectUri: cfg.redirectUri,
    sharedMailbox: cfg.sharedMailbox,
    siteId: cfg.siteId,
    quotesListId: cfg.quotesListId,
    inboxListId: cfg.inboxListId,
    driveId: cfg.driveId,
    jobsRootFolder: cfg.jobsRootFolder,
    templateItemId: cfg.templateItemId,
    contractor: cfg.contractor,
    contractorEmail: cfg.contractorEmail,
    clientName: cfg.clientName,
    clientDomains: cfg.clientDomains,
    ownDomains: cfg.ownDomains,
    pollSeconds: cfg.pollSeconds ?? 30,
  };
  return JSON.stringify(ordered, null, 2);
}
