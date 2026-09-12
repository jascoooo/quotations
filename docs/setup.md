# Setting up Quote Desk

Written for the person who will use the app, not for an IT department. Almost all of it you can do yourself in about twenty minutes. There is exactly one step that may need whoever holds your Microsoft 365 admin account, and it is a single button press.

Everything the app touches stays inside your own Microsoft 365. Nothing here is secret: the app has no password of its own, and every person signs in as themselves and sees only what they could already open.

## Before anything else: try it with example data

Open the app and choose **Open it with example data**. You get a full board of made-up jobs, a shared inbox to file, and a working quote builder. No sign-in, nothing saved anywhere but your own browser. If the app is not right for you, you find out here and stop.

## The two-minute test: are you blocked?

Two settings decide whether you can do this alone. Both are usually left at Microsoft's default, and both take a minute to test.

**1. Can you register an app?** Go to [entra.microsoft.com](https://entra.microsoft.com) and find **App registrations**, then **New registration**. If the form opens, you are fine. Microsoft's default is that any user can do this: *"By default in Microsoft Entra ID, all users can register applications and manage all aspects of applications they create."* If your organisation has turned that off you get a clear refusal: *"You don't have permission to register applications in the … directory. To request access, contact your administrator."*

**2. Can you agree to the permissions?** You find this out at your first sign-in, and here honesty matters more than optimism: **you will probably see "Need admin approval"**. Microsoft's current recommended default for new tenants lets people consent to most things, but it specifically holds back the ones this app needs, including `Sites.ReadWrite.All`, `Files.ReadWrite.All` and `Mail.Read.Shared`. Older tenants, and any where an admin chose the permissive setting, will let you straight through.

So plan on one admin press, and be pleasantly surprised if you do not need it.

## Who is "the admin", really?

Not necessarily an IT company. In a business this size it is usually the person who first bought Microsoft 365, which is often the owner or whoever set up the email. You can look it up yourself: at [entra.microsoft.com](https://entra.microsoft.com) open **Roles and administrators** and look at **Global Administrator**. Reading who holds a role is something ordinary users are allowed to do by default.

If it turns out to be you, there is no third party in this at all.

## Step 1. Register the app (about five minutes, you)

At [entra.microsoft.com](https://entra.microsoft.com): **App registrations › New registration**.

- **Name**: Quote Desk.
- **Supported account types**: Accounts in this organizational directory only (single tenant).
- **Redirect URI**: choose platform **Single-page application** and paste the exact address the app runs at. The setup screen shows you this address; copy it from there. On a Hugging Face Space, add both `https://<owner>-<name>.static.hf.space/` and `https://<owner>-<name>.static.hf.space/index.html`, because the root redirects to the second one.
- No client secret. Ever. A single-page app cannot keep one.

Then open **API permissions › Add a permission › Microsoft Graph › Delegated permissions** and add:

| Permission | What it is for |
| --- | --- |
| `User.Read` | your name, so the board can say who moved a card |
| `Mail.Read.Shared` | read the shared mailbox you already open in Outlook |
| `Sites.ReadWrite.All` | the board list, the filing list and the job folders |
| `Files.ReadWrite.All` | the document library and filling the Excel template |
| `Sites.Manage.All` | creating the two lists and their columns, during setup only |

All five are **delegated**, which is the important word: the app acts as you and can never reach anything you could not open yourself. None of them is flagged "admin consent required" in Microsoft's permissions reference. Do not add the application-only versions of these permissions; those are the ones that would let something run without a person, and the app never uses them.

Copy the **Application (client) ID** and **Directory (tenant) ID** from the Overview page.

## Step 2. Have a SharePoint site (two minutes, you)

Any site you own will do. If you have not got one, open the SharePoint start page and press **Create site**, or create a Team in Microsoft Teams, which makes a site with you as owner. Microsoft's default allows both, and creating a Team is not affected by the SharePoint site-creation setting at all.

You do not need to create any lists, columns or folders. The app does that in the next step.

## Step 3. Let the app build the rest (five minutes, you)

Open the app. It shows the setup screen. Fill in:

- the two IDs from step 1
- the address of your SharePoint site, copied from the browser bar
- the shared mailbox address, exactly as it appears in Outlook
- your company name, the client's name, and the email domains that tell one from the other
- optionally, the client's blank template `.xlsx`, which it will upload for you

Press **Sign in with Microsoft**, then **Set up the site**. It works through the list in front of you and says what happened at each step:

1. signs you in
2. finds the site from the address you pasted
3. creates the **Quotes** list with all its columns, or adds any that are missing
4. creates the **Quote inbox** filing list
5. finds the document library and makes the job and `Templates` folders
6. uploads or finds the client's template
7. reads the code list and rate table out of that template
8. reads one message from the shared mailbox to prove it can

Anything that fails says so in plain words with what to do about it. The settings it produces are saved in your browser, so this machine is now set up.

### If sign-in says "Need admin approval"

Expected, and not a dead end. Send whoever holds the admin account this:

> Please open entra.microsoft.com › App registrations › Quote Desk › API permissions and press **Grant admin consent for &lt;our organisation&gt;**, then confirm. It is one button. It agrees, for our organisation, to the five delegated Microsoft Graph permissions already listed there. Delegated means the app acts only as the person signed in and can never reach anything they could not already open themselves. There is no password or client secret involved, and no application-only permission that could run unattended.

That press is tenant-wide for this one app and nothing else. It does not give the app access to anybody's data beyond what each signed-in person already has.

**It does not have to be a Global Administrator.** Because the app asks only for delegated permissions, the consent can be given by someone holding Cloud Application Administrator, Application Administrator or AI Administrator, or a custom role carrying just the permission to grant consent to applications. Global Administrator and Privileged Role Administrator are only needed for application-only permissions, which this app never uses. That matters if your organisation would rather not hand the Global Administrator account around.

If the admin consent request workflow is switched on in your tenant, you get a **Request approval** button on the consent screen instead, and they approve by email. Switching that workflow on is itself a Global Administrator job and takes up to an hour to take effect, so for a one-off it is quicker to ask for the single press.

## Step 4. Set your colleagues up in one go (two minutes, you)

Once the app is connected, open **Setup & data** and copy the `config.json` it offers. Save it as `public/config.json` in the code repository and push. Everyone else then opens the app and is connected immediately with no setup of their own. They still sign in as themselves; they just skip the form.

It holds addresses and identifiers, not secrets, which is why it is safe to publish with the app.

## Step 5. Put the app somewhere everyone can open it

Covered in full in `docs/hosting.md`: a free Hugging Face static page, built on GitHub. For your own first test you can also run it locally with `npm run dev` and register `http://localhost:5173` as a second redirect address.

## What needs an admin, and what does not

| Step | Who |
| --- | --- |
| Register the app | You, unless your organisation has turned that off |
| Create the SharePoint site | You |
| Create the lists, columns, folders | The app, as you |
| Upload the client's template | You |
| **Agree to the permissions** | **Probably one press. Cloud Application Administrator is enough; it need not be a Global Administrator** |
| Full Access to the shared mailbox | Already in place if you can open it in Outlook; otherwise an admin, and you cannot grant it to yourself |
| "Assignment required" on the app | Optional. Skip it for testing: turning it on *forces* admin consent even where a user could otherwise consent alone |
| Conditional Access, retention, audit logging | Optional hardening, later, admin |

One caveat on the mailbox: seeing it in Outlook usually means you have Full Access, but not always, since it can also appear through folder sharing. The reliable test is the app's own mailbox step. If it fails with a refusal, that is the one other thing only an admin can fix.

## Doing it by hand instead

If the app's setup step fails and you would rather build the lists yourself, this is exactly what it would have created on the site.

**A document library** (the default **Documents** is fine) containing a folder for job files (default name `Jobs`) and a `Templates` folder holding the pristine client template. Keep the template read-only and swap it when the client issues a new version.

**A list called `Quotes`** — one row per job, and the shared live board:

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
| DateIssued | Text | ISO date `yyyy-mm-dd`; text, because it can be empty |
| Attended | Text | ISO date |
| TypeOfWorks | Text | |
| Priority | Text | Emergency / Urgent / Routine |
| Total | Number | |
| FolderUrl | Multiple lines of text (plain) | web link to the job folder |
| FolderId | Text | |
| QuoteFileName | Multiple lines of text (plain) | |
| QuoteJson | Multiple lines of text (plain) | the draft quote |
| ReportJson | Multiple lines of text (plain) | the engineer's report and which email it came from |
| PhotosJson | Multiple lines of text (plain) | which photos are ticked |
| SourcesJson | Multiple lines of text (plain) | where each detail was found |
| FlagJson | Multiple lines of text (plain) | the status line on the card |

The five `…Json` columns and `FolderUrl` must be multi-line text: single-line text in SharePoint stops at 255 characters and a quote is longer than that.

**A list called `Quote inbox`** — which email went where, so nothing is filed twice:

| Column (internal name) | Type |
| --- | --- |
| Title | Text (the message id) |
| ConversationId | Multiple lines of text (plain) |
| JobId | Text |
| Rule | Text |
| Ignored | Yes/No |

Then fill in `config.json` from `public/config.example.json` with the site id, the two list ids, the drive id and the template's item id. The quickest way to find those is Graph Explorer signed in as yourself.

SharePoint's own **Board view** on the Quotes list, organised by `Stage`, gives colleagues who prefer SharePoint something close to the same four lanes. Microsoft documents the board layout but not which column types it can be organised by, so treat this as worth trying rather than guaranteed.

## When it goes wrong

| What you see | What it means |
| --- | --- |
| "Need admin approval" | The consent gate. See step 3. |
| "You don't have permission to register applications" | Your organisation has turned off self-service app registration. The admin either registers it for you and adds you as owner, or gives you the Application Developer role. |
| The redirect address is rejected (AADSTS50011) | The address you opened the app at is not on the registration. Copy it from the browser bar and add it under Authentication › Single-page application. |
| "Your account is not assigned to this app" (AADSTS50105) | Someone turned on Assignment required. Either add yourself under the enterprise application's Users and groups, or turn it off. |
| The site step fails with a refusal | You are not an owner of that site, or the address points somewhere else. Open the site in SharePoint and copy the address bar again. |
| The list step fails with a refusal | Usually the `Sites.Manage.All` permission is missing from the registration, or consent has not been given for it. |
| The mailbox step fails with a refusal | Your account does not have Full Access to that mailbox. Only an admin can grant it. |
| "Could not obtain a WAC access token" | Excel on the web could not open the template. The account needs an Office licence including Excel for the web, and the file must be a real `.xlsx` in SharePoint. |
| Everything worked, but colleagues see the setup screen | `config.json` has not been published yet. Step 4. |

Once set up, **Setup & data › Check connection** runs the same probes read-only and tells you which part is unhappy.

## Later, when it is more than a trial

None of this is needed to test, and each one costs something:

- **Assignment required** on the enterprise application, with the quoting team's group assigned, so only named staff can ever sign in. Note it forces admin consent.
- **Conditional Access** requiring a company-managed device. It cannot be aimed at this app alone, because Microsoft applies such rules to the service being reached rather than the app asking, but it can be narrowed to the quoting team, to browser sign-ins, and to Exchange and SharePoint. Needs Business Premium; "compliant device" also needs Intune.
- **Audit logging**, which is off by default on Business plans and must be switched on. Mailbox-access events are documented for E3 and E5 plans, so check once what your plan actually records.
- **Retention** on the library.
- **Least privilege on the site**: swap `Sites.ReadWrite.All` for `Sites.Selected` and grant the app write on the one quotes site. Keep `Files.ReadWrite.All` alongside it, because Microsoft does not document the Excel workbook calls for any `Selected` scope. This needs admin consent and is worth doing once the app is proven.
- **Unattended filing**: the app files while someone has it open. For overnight and weekends, add the Power Automate flow in `docs/proposal.md`, which writes to the same lists and folders.

## Before you trust it with a real quote

1. Run one job end to end: request email, card, report and photos filed, quote built, exported.
2. Open the exported file in Excel and compare it with one you filled by hand. It is the client's form, so it should be indistinguishable.
3. Check the app's own totals check passed. It reads the spreadsheet's totals back after filling and refuses to move the card to Ready to send if they disagree with its own arithmetic by more than a penny.
