# Connecting Quote Desk to Microsoft 365

Everything the app touches lives in your own tenant. This page lists what IT needs to create and what goes into `config.json`. Nothing here is a secret: the app signs each user in with their own Microsoft account and acts on their behalf.

## 1. App registration (Entra ID)

- New registration, **single tenant** ("Accounts in this organizational directory only").
- Platform: **Single-page application**. Redirect URI: the https address where the app is hosted (for example `https://<name>.hf.space/` or your Cloudflare Pages URL). No client secret.
- API permissions (Microsoft Graph, **delegated**): `User.Read`, `Mail.Read.Shared`, `Sites.ReadWrite.All`, `Files.ReadWrite.All`. Grant admin consent if the tenant's user-consent policy requires it. If the tenant supports it, ask for `Sites.Selected` scoped to the quotes site instead of `Sites.ReadWrite.All`.
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

The company has no Azure subscription and runs no hosting of its own, so the app's code is served by a free Hugging Face **static** Space. Only code goes there. To set it up:

1. On huggingface.co create a Space with SDK **Static**. Note its owner and name. Its address is the redirect URI for the app registration (section 1).
2. Turn on two-factor sign-in for the Hugging Face account. Create a **fine-grained token with write access to that one Space only**.
3. In this GitHub repository, add the secret `HF_TOKEN` and the variables `HF_SPACE_OWNER` and `HF_SPACE_NAME` (Settings › Secrets and variables › Actions). The workflow in `.github/workflows/sync-to-space.yml` then mirrors every push to `main` into the Space, and the Space builds it with `npm ci && npm run build` (the header at the top of `README.md` tells it how).
4. Add `config.json` (from `public/config.example.json`) to the Space, or commit it to `main`. It holds ids and the shared mailbox address, no secrets.

Visibility: **Public** shows the source code and the built files (there are no secrets in either). **Protected** (paid plan, about £7 a month) hides the source while keeping the page reachable; note that anything the page fetches, including `config.json`, is still reachable by address. **Private** does not work here: colleagues without Hugging Face accounts get a 404.

What protects the sign-in even though a third party serves the code: the code is public and mirrored from GitHub; the token that can change it is limited to the one Space and the account has two-factor; the app registration is single-tenant with the page's exact address as its only redirect; the production build carries a Content-Security-Policy that only lets the page talk to Microsoft; and IT can add a Conditional Access rule requiring a company-managed device for this app.

Corporate web filtering must allow `login.microsoftonline.com`, `graph.microsoft.com`, your SharePoint domain and `*.hf.space`. If in-browser AI models are added later, `huggingface.co` and its download hosts (`*.hf.co`) are needed for the one-off model download.

## 6. Unattended filing (optional, recommended)

The app files emails while someone has it open. For filing overnight and at weekends, add the Layer A Power Automate flow described in `docs/proposal.md` (standard Outlook connector, shared-mailbox trigger, save to the same job folders and the same **Inbox** list). Both write to the same lists, so nothing is filed twice.

## 7. Before go-live

- After the first real export, open the workbook: the app reads the sheet's own totals back and compares them with its own, and will not move the card to "Ready to send" if they differ.
- Data protection impact assessment (light, in-tenant) and a note to the client about the change in process, per `docs/proposal.md` section 10.
- Retention set on the library.
- Audit logging on the site.
- A test job end to end: request email → card → report and photos filed → quote → exported template opened in Excel and checked against a hand-filled copy.
