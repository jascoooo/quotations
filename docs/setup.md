# Setting up Quote Desk

There are two ways to run this, and the first one needs nobody's permission.

- **On this PC.** No sign-in, no app registration, no administrator. Start here. Everything below the next heading.
- **Microsoft 365.** The shared, live version. It needs an app registration in your directory, and if that page is closed to you, it cannot be done. That route starts at "Connecting it to Microsoft 365" further down.

---

# The shared version, with no sign-in

Nothing to install and nobody to ask, and still shared and live between everyone. The trick is that the board lives in a folder that SharePoint or OneDrive already syncs to each person's PC. The app reads and writes that folder straight off the disk, and re-reads it every ten seconds, so a card you move appears on your colleagues' screens a sync later. Nobody signs in to the app and there is no server.

The folder holds three things:

```
Quote Desk/                   a folder shared with the quoting team
  emails/                     Power Automate drops each new email here
  jobs/                       the board: one small file per job
  settings.json               the company and client names, shared
```

One file per job is deliberate. A single board file would collide every time two people worked at once. Separate files only collide if two people edit the *same* job in the same moment, and then the later save wins, exactly as it would in a spreadsheet.

## 1. Put the file somewhere you can open it

Upload the single `index.html` to a free Hugging Face static Space, as in `docs/hosting.md`, and open the Space address. There is no sign-in, so there is no redirect address to register and nothing for Microsoft to approve.

## 2. Choose "Start on this PC"

The first screen offers both routes. Take the left-hand one. Despite the name, this is the shared version once you point it at a shared folder in step 4.

## 2a. Make the shared folder

In SharePoint or OneDrive, create a folder called something like **Quote Desk** and share it with everyone who will use the app. Each of them should sync it to their PC, so it appears in File Explorer. You do not need to create anything inside it: the app makes `emails` and `jobs` itself.

## 3. Load the client's template, once

Open **Setup & data** and choose the client's blank template `.xlsx`. The app reads the schedule-of-rates list and the contractor rate table out of it, which takes a few seconds, and keeps them in this browser. The file itself is not stored, not copied and not sent anywhere: only read.

You should see the number of codes it found. For Sanctuary's V1.0 template that is 3,581 codes and 15 contractor rate rows.

## 4. Get the emails arriving on their own

You do not have to paste emails in. Power Automate can pull them out of the shared mailbox for you, and it needs **no app registration and no administrator**: it uses Microsoft's own Outlook connector, which is a standard (non-premium) connector included with the business Microsoft 365 plans. The only requirement is the one you already meet, that your account has full access to the shared mailbox.

The flow drops each new email into a OneDrive folder as a small file, with its photos beside it. That folder syncs to this PC, and the app reads it straight off the disk. Nothing is uploaded and nothing is signed in to.

**Build it once, about ten minutes.** At [make.powerautomate.com](https://make.powerautomate.com), choose **Create › Automated cloud flow**, name it "Quote emails", and pick this trigger:

1. **When a new email arrives in a shared mailbox (V2)**
   - Mailbox address: the shared mailbox
   - Folder: Inbox
   - Include Attachments: **Yes**

2. **Compose**, renamed to `BaseName`, with this expression. It gives the email and its photos a matching name:

   ```
   concat('msg-', formatDateTime(utcNow(), 'yyyyMMddHHmmssfff'))
   ```

3. **OneDrive for Business › Create file**
   - Folder Path: a folder you sync to this PC, for example `/Quote emails`
   - File Name, as an expression: `concat(outputs('BaseName'), '.json')`
   - File Content, as an expression: `triggerOutputs()?['body']`

   That last one writes the whole email record, and the app reads Microsoft's own field names, so there is nothing to map by hand.

4. **Apply to each**, over **Attachments** from the trigger, containing one more **OneDrive for Business › Create file**:
   - Folder Path: the same folder
   - File Name: `concat(outputs('BaseName'), '__', items('Apply_to_each')?['name'])`
   - File Content: `items('Apply_to_each')?['contentBytes']`

   The double underscore is what ties a photo to its email.

Save it, then send a test email to the shared mailbox.

**Point the app at the folder.** In **Setup & data**, under "The shared folder", press **Choose the shared folder** and pick it in File Explorer. Every colleague does the same, once, on their own PC. The browser asks once for permission. From then on the app checks every ten seconds while it is open: it picks up jobs colleagues have changed, adds new emails to the shared inbox, attaches their photos to the right job, and files the certain matches automatically, exactly as the Microsoft 365 version does.

Two things to know. The browser asks for the folder again each session, which is a one-click safety feature and not a fault. And this needs Edge or Chrome: Firefox and Safari have no folder permission, and there the app falls back to pasting emails in.

If Power Automate itself is blocked in your tenant, you will see it as soon as you open the site, and pasting emails in still works.

## 5. Work

- **Add job** on the board starts a job from a work order number.
- The job page takes the address, the report and the photos. Drop photos straight onto it.
- **Build quote** works exactly as in the shared version: search the real codes by number or by words, set quantities, and the totals apply your contractor adjustment, including the separate rate above and below £20,000.
- Emails arrive from the watched folder, or can be pasted in. Either way the app matches them to jobs by work order, purchase order or address.

## 6. The office tracker

The app can read the extra-works tracker the office already keeps, so the board is not the only picture of where quotes are. Put the tracker in the shared folder and it is read automatically, and re-read whenever anyone changes it. Otherwise pick the file on the **Tracker** screen to read it once on this PC.

It is only ever read. The app never writes to the spreadsheet.

What it does with it:

- Reads the **KEY sheet** for what each colour means, so if the office re-words or adds a colour the app follows without a change to the app.
- Treats **Rec'd** as the dividing line. A row with the quote in from whoever attended is ours to act on; a row without it is still with that company, and the app lists who owes what rather than pretending it is on the board.
- Shows the rows that are **in but carry no colour**: quotes that have come back and nobody has picked up.
- Lines the tracker up against the board by work order, then purchase order, then address, and flags where the two disagree.
- **Update the spreadsheet** writes an Office Script that re-colours the rows the board has moved on. You run it in Excel on the web, so Excel does the writing and nothing else in the workbook is touched. Running it twice changes nothing the second time.

Sheets you do not want read, such as a personal one, can be left out.

## 7. Getting the spreadsheet out

**Export** does not write the file here, because without a sign-in the app has no way to reach your SharePoint. Instead it writes an **Office Script**, which is a small piece of Excel automation that needs no administrator and is included with the business Microsoft 365 plans.

1. Make a copy of the client's blank template and rename the copy to the file name the app shows.
2. Open that copy in **Excel on the web**, not the desktop app.
3. **Automate › New Script**, delete what is there, paste the script in, press **Run**.
4. Check the total on the sheet against the total the app showed. They should agree to the penny.

Excel does the writing, which is the whole point: the dropdowns, the structured tables and the hidden sheets survive, exactly as they would if you typed the values in by hand. A library that re-saved the workbook would quietly drop them.

## 8. What this costs you

With the shared folder, the board is in SharePoint or OneDrive and is backed up along with everything else there. **Save a copy** in Setup and data still writes the whole board to one file if you want your own.

Two honest limits compared with the Microsoft 365 version:

- **Sharing is as quick as the sync, not instant.** In practice that is seconds, but it is OneDrive's sync rather than a live connection. If two people edit the same job in the same moment, the later save wins and OneDrive may leave a conflict copy in the folder.
- **Nothing is filed while everyone's app is shut.** The flow keeps collecting emails into the folder overnight regardless; the app takes them in next time somebody opens it.

Neither needs an administrator to fix. If they start to bite, the Microsoft 365 route below removes both, and needs one person with an admin account for about five minutes. If the app proves itself, the Microsoft 365 route below removes both limits, and it needs one person with an administrator account for about five minutes.

---


# Connecting it to Microsoft 365

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
