// Runtime configuration for Microsoft 365 mode, loaded from ./config.json next
// to the built app. Nothing secret lives here: the app signs users in with
// their own Microsoft account and acts on their behalf.

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

export async function loadConfig(): Promise<AppConfig | null> {
  try {
    const res = await fetch('./config.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const cfg = (await res.json()) as Partial<AppConfig>;
    const required: (keyof AppConfig)[] = ['tenantId', 'clientId', 'sharedMailbox', 'siteId', 'quotesListId', 'inboxListId', 'driveId', 'templateItemId', 'contractor', 'clientName'];
    for (const k of required) if (!cfg[k]) return null;
    return {
      jobsRootFolder: 'Sanctuary jobs',
      contractorEmail: '',
      clientDomains: [],
      ownDomains: [],
      pollSeconds: 30,
      ...cfg,
    } as AppConfig;
  } catch {
    return null;
  }
}
