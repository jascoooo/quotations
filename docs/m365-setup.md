# Connecting Quote Desk to Microsoft 365

Everything the app touches lives in your own tenant. This page lists what IT needs to create and what goes into `config.json`. Nothing here is a secret: the app signs each user in with their own Microsoft account and acts on their behalf.

## 1. App registration (Entra ID)

- New registration, **single tenant** ("Accounts in this organizational directory only").
- Platform: **Single-page application**. Redirect URIs: the exact addresses the app runs at. For a Hugging Face static Space that is `https://<owner>-<name>.static.hf.space/` and `https://<owner>-<name>.static.hf.space/index.html` (the host redirects the root to `index.html`). No client secret.
- On the matching Enterprise application, switch on **Assignment required** and assign the quoting team's group, so only named staff can ever sign in to this app.
- API permissions (Microsoft Graph, **delegated**): `User.Read`, `Mail.Read.Shared`, `Sites.ReadWrite.All`, `Files.ReadWrite`. Grant admin consent if the tenant's user-consent policy requires it. `Files.ReadWrite` is the least-privileged scope Microsoft documents for the library and Excel workbook calls; only if a library call is refused, widen it to `Files.ReadWrite.All`. In delegated mode the app can never do more than the signed-in person can do themselves.
- Least privilege, recommended once the app works: replace `Sites.ReadWrite.All` with delegated `Sites.Selected` (admin consent), then grant the app **write** on the one quotes site (`POST /sites/{siteId}/permissions` with the app's client id, or PnP PowerShell `Grant-PnPEntraIDAppSitePermission`). Keep `Files.ReadWrite` alongside it: Microsoft does not document the Excel workbook calls for any `Selected` scope, so a workbook call that fails with "Could not obtain a WAC access token" after the change is a permission or Excel-licence problem, not an app bug.
- Optional, to send finished quotes from the app later: `Mail.Send.Shared`.
- Note the **Application (client) ID** and **Directory (tenant) ID** for `config.json`.

Users sign in about once a day (single-page-app refresh tokens last 24 hours).

## 2. Shared mailbox

Each person who will use the app needs **Full Access** to the shared mailbox in Exchange. The app reads the mailbox's Inbox through Graph as that person; it never signs in as the mailbox and never moves or deletes anything in it.

If quotes are sent *as* the shared mailbox and you want "Sent" detected automatically later, switch on the mailbox's "message copy for Send As" setting (`Set-Mailbox -MessageCopyForSentAsEnabled $true`), otherwise the sent copy only lands in the sender's own Sent Items.

## 3. SharePoint site

One site (for example "Sanctuary Quotes") with:

### A document library (the job folders)

- A top-level folder named as in `jobsRootFolder` (default `Sanctuary jobs`). The app creates one folder per job inside it: `SANC004958 – 31 Cathedral Drive SS15 5WF`.
- A `Templates` folder holding the **pristine** client template `.xlsx`. Note its drive item id for `templateItemId`. Keep it read-only; swap it when the client issues a new version.
- Note the library's **drive id** for `driveId`.

### A list called **Quotes** (one row per job; this is the shared, live board)

| Column (internal name) | Type | Notes |
| --- | --- | --- |
| Title | Text | the work order, e.g. SANC004958 |
| PurchaseOrder | Text | |
| Address | Text | |
| Postcode | Text | |
| LocationOfWorks | Text | |
| JobTitle | Text | short description shown on the card |
| Client | Text | |
| Stage | Choice | exactly: `To review`, `To check and amend`, `Ready to send`, `Sent` |
| ContactName | Text | |
| ContactPhone | Text | |
| DateIssued | Text | ISO date `yyyy-mm-dd` |
| Attended | Text | ISO date |
| TypeOfWorks | Text | |
| Priority | Text | Emergency / Urgent / Routine |
| Total | Number | |
| FolderUrl | Text | web link to the job folder |
| FolderId | Text | |
| QuoteFileName | Text | |
| QuoteJson | Multiple lines of text (plain) | the draft quote |
| ReportJson | Multiple lines of text (plain) | the engineer's report and which email it came from |
| PhotosJson | Multiple lines of text (plain) | which photos are ticked |
| SourcesJson | Multiple lines of text (plain) | where each detail was found |
| FlagJson | Multiple lines of text (plain) | the status line on the card |

A **Board view** on this list grouped by `Stage` gives colleagues who prefer SharePoint the same four lanes.

### A list called **Inbox** (which email went where)

| Column (internal name) | Type |
| --- | --- |
| Title | Text (the Graph message id) |
| ConversationId | Text |
| JobId | Text |
| Rule | Text |
| Ignored | Yes/No |

Note both **list ids** and the **site id** for `config.json`.

## 4. `config.json`

Copy `public/config.example.json` to `config.json` next to the built `index.html` and fill it in. If the file is missing or incomplete the app runs in demo mode.

## 5. Hosting: a Hugging Face static page

The company has no Azure subscription and runs no hosting of its own, so the app is served by a free Hugging Face **static** Space. Only the built files go there; nothing is built on Hugging Face (its build step needs paid credits) and nothing but code ever lives there. To set it up:

1. On huggingface.co create a Space with SDK **Static** and leave it empty. Its address will be `https://<owner>-<name>.static.hf.space/` (lower case, underscores become hyphens). That is the address staff open, and the redirect URI for the app registration (section 1). Staff must open that address directly, not the Space's page on huggingface.co, which wraps it in a frame that Microsoft sign-in refuses.
2. Turn on two-factor sign-in for the Hugging Face account. Create a **fine-grained token with write access to that one Space only** (or set up a Trusted Publisher for GitHub Actions on the Space, so no token is stored).
3. In this GitHub repository, add the secret `HF_TOKEN` and the variable `HF_SPACE_ID` (Settings › Secrets and variables › Actions). The workflow in `.github/workflows/sync-to-space.yml` then, on every push to `main`: installs, runs the tests, builds on Node 22, and uploads the built files (plus a one-line Space README) to the Space, replacing what was there.
4. Commit `public/config.json` (from `public/config.example.json`) on `main`. It holds ids and the shared mailbox address, no secrets, and is copied into the build.

**What is visible.** The Space holds only the built, minified app and `config.json`; the source stays on GitHub. On a **public** Space anyone with the address can fetch those files. The paid **protected** tier hides the Space's repository but, by design, still serves the same files to anyone with the address, so it adds little here. A **private** Space does not work: colleagues without Hugging Face accounts get a 404. Treat the ids in `config.json` as non-secret (they are, by design of Microsoft's single-page-app sign-in) and rely on the app registration for access control: single tenant, assignment required, exact redirect addresses. Static Spaces never sleep and are served from a CDN.

**What protects the sign-in even though a third party serves the code.** Real controls: single-tenant registration with assignment required; exact redirect addresses; least-privilege permissions (section 1); 24-hour sign-in tokens; Microsoft's sign-in logs (30 days on Business Premium) and the Purview audit log (180 days: SharePoint file events on all plans, mailbox-access events documented for E3/E5 plans), which record this app's id against every access. Defence in depth only: the production build's Content-Security-Policy, which limits where the page can send data (a meta tag, because the host cannot set response headers; the host injects one small inline script of its own, which the policy blocks harmlessly with a console note); and the deterministic build, which lets you download what the Space serves and compare it with a build of the same commit. A Conditional Access rule requiring a company-managed device is worth having. It cannot be aimed at this app alone (Microsoft applies such rules to the service being reached, not to the app asking), but it can be kept narrow: target Exchange Online and SharePoint Online, include only the quoting team's group, and limit it to browser sign-ins so Outlook and Teams on the desktop are untouched. It needs Business Premium (Entra ID P1); "compliant device" also needs Intune, whereas "hybrid-joined device" does not. As an extra, the app can ask for an authentication context on its own token requests so a stricter rule fires only for it; that is voluntary on the app's side, so it complements the service-level rule rather than replacing it.

**Residual risk, stated plainly.** If the host or the Hugging Face account were compromised, altered code could act as any signed-in user for the shared mailbox and the one quotes site, for as long as their session lasts (at most 24 hours), and would be attributed to this app in the audit logs. Nothing can be sent anywhere by the app itself, but code that replaces it is not bound by that.

**The in-tenant alternative, if IT objects to Hugging Face.** A SharePoint Framework web part is the one way to serve the app from inside the tenant with no Azure and no extra licence: SharePoint hosts the files, staff open a SharePoint page or a Teams tab, and the SharePoint data needs no extra consent. The screens and logic carry over; the shell is rebuilt on Microsoft's toolchain (React 17 on the current release, React 18 on the preview due in the autumn, Node 22, built in GitHub Actions since PCs cannot run it), roughly one to two developer weeks. Two trade-offs to weigh with IT: a SharePoint administrator uploads each release by hand, and any Graph permission approved for it (the mailbox, the Excel workbook) needs a Global Administrator's approval and is granted tenant-wide to SharePoint's shared client principal, usable by any script on any SharePoint page, rather than to this app alone. Power Apps "code apps" would also host it without Azure but need a Power Apps Premium licence for every user and cannot use the Excel connector, so they are not a fit.

Corporate web filtering must allow `login.microsoftonline.com`, `graph.microsoft.com`, your SharePoint domain and `*.static.hf.space`. If in-browser AI models are added later, `huggingface.co` and its download hosts (`*.hf.co`) are needed for the one-off model download.

## 6. Unattended filing (optional, recommended)

The app files emails while someone has it open. For filing overnight and at weekends, add the Layer A Power Automate flow described in `docs/proposal.md` (standard Outlook connector, shared-mailbox trigger, save to the same job folders and the same **Inbox** list). Both write to the same lists, so nothing is filed twice.

## 7. Before go-live

- After the first real export, open the workbook: the app reads the sheet's own totals back and compares them with its own, and will not move the card to "Ready to send" if they differ.
- Data protection impact assessment (light, in-tenant) and a note to the client about the change in process, per `docs/proposal.md` section 10.
- Retention set on the library.
- Audit logging switched on for the tenant (it is off by default on Business plans) and, once, a search of the audit log for the shared mailbox to see which mailbox-access events your plan records.
- A test job end to end: request email → card → report and photos filed → quote → exported template opened in Excel and checked against a hand-filled copy.
