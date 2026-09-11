# A quote archive and builder for Sanctuary extra-works requests

Proposal, 10 September 2026. Draft for discussion.

How to file every job from the shared inbox, build the quote in one place, and hand Sanctuary their own spreadsheet, without any data leaving R Dunham's own systems.

## 1. What was asked for

- One place that is both the archive and the builder for Sanctuary quotes, with four sections: quotes to review, quotes to check and amend, quotes ready to send, and quotes sent (which only need to hold the finished spreadsheets).
- When a job is clicked, everything about it is already gathered: the request, the engineer's report, the photos, the replies, the numbers.
- That gathering should happen automatically from the shared Outlook mailbox, using AI if that is what it takes.
- The output is Sanctuary's own Extra Works Request template (V1.0, 2025), filled in, priced with SOR codes and the contractor's rate adjustment, named the way they expect.
- The work PC cannot run Python; Hugging Face is the one sanctioned route for that kind of thing. Nothing may be sent to a third company; extraction has to happen locally. Drag and drop between the sections, smooth and quick.

## 2. The short answer

Build it in two layers, both inside what the company already has.

**Layer A** uses Microsoft 365 alone. A small automated flow files every email and photo into a job folder in SharePoint, a list in Board view gives the four stages with drag and drop, and a script fills Sanctuary's template so that Excel itself saves it. That is a fortnight of setting up, no code to run anywhere, and no new approvals beyond mailbox access.

**Layer B** is the app in the drafts: a web app that runs entirely in the browser on the work PC, signs in with the user's Microsoft account, reads the same folders and list, and does its AI work with open models from Hugging Face running locally in the browser. Hugging Face supplies model files and hosts the app's code. It never receives an email, a photo, a spreadsheet or the SOR list.

Python on a Hugging Face Space, cloud AI services and off-the-shelf job software are all set aside: each one means a new company holding tenant data on servers outside the UK, and Sanctuary's own supplier terms require their prior written consent for any such company.

## 3. The data rule, applied

"Local" in this design means two places: the work PC itself (including inside its browser), and the company's own Microsoft 365 tenant, which already holds the mailbox today. Microsoft is the existing processor; nothing new is added to that list. The only outbound connections the app makes are to the company's own Microsoft 365 and, once, to download model files from Hugging Face. Model downloads carry no data outwards. If IT would rather not allow huggingface.co at all, the model files can be copied into SharePoint once and loaded from there.

Two things in Sanctuary's own paperwork make this more than a preference. Their standard purchase terms treat R Dunham as a processor of Sanctuary's personal data, so any other company that can see that data is a sub-processor and needs Sanctuary's prior written consent, with equivalent terms flowed down and a 48-hour breach-notice clause. And their 2026 Supplier Code of Conduct bans putting Sanctuary data into publicly accessible AI tools, naming OpenAI and other generative AI platforms. Keeping everything on the PC and inside the tenant is the one route that needs neither a consent request nor an international transfer agreement. A short data protection impact assessment is still worth writing, because AI combined with tenant data is on the ICO's mandatory list; inside the tenant it is a light one.

One more licence to respect: the SOR schedule in the template is copyright M3 Housing, licensed to Sanctuary and sub-licensed to the contractor (M3 has a free registration form through which the landlord authorises a contractor's electronic use), and its terms say electronic SOR data must not be passed to unauthorised service providers. So the app reads the code list from the template in the company's own SharePoint at run time and never embeds it or uploads it anywhere.

Outside the line, and why:

- Hugging Face Spaces running Python: the Space would hold the data on Hugging Face's US servers (only their Team and Enterprise plans can pick an EU region). Since July 2026 a Python Space also needs a paid plan, and free hardware sleeps after 48 hours.
- Cloud AI services (Claude, ChatGPT, Gemini, Copilot pay-as-you-go agents): the text and photos go to the provider, and Sanctuary's code of conduct forbids it.
- Job-management products and email-to-board tools (Joblogic, simPRO, Airtable, Trello, Zapier and similar): a new processor, and none of them produce Sanctuary's exact template. Joblogic is the only mainstream one with SOR support, and only on its enterprise tier.
- Azure services in the company's own subscription (for example a private AI model in the UK South region): still Microsoft, still under the existing agreement, but a new processing activity that Sanctuary's terms ask the supplier to notify. Kept as route C for later, and only if the company and IT judge it in-house.

## 4. Layer A: filing and the board, inside Microsoft 365 (weeks 1 to 2)

1. **One SharePoint site for Sanctuary quotes.** A document library where every job is a folder named by work order and address, for example `SANC004958 – 31 Cathedral Drive SS15 5WF`. Inside: the emails saved as files, the photos, the report, and the finished quote.
2. **A list called Quotes.** One row per job with the work order, PO, address, postcode, job description, total, and a Stage column with the four values. Shown as a Board view, which is Microsoft's own drag-and-drop kanban. Each row links to its folder. If the board is too bare, a Power Apps form (also included in the licence) can sit over the same list.
3. **The filing flow.** A Power Automate flow triggered by each new email in the shared mailbox. It looks for a Sanctuary work order number, then a known PO number, then a known address or postcode. If it finds one, it saves the email and every attachment into that job's folder and stamps them with the job details; if the job is new it creates the folder and the row. If it finds nothing, it files the email under "Needs a job" for a person to place. Emails stay in the mailbox untouched; the flow only copies.
4. **Filling the template.** An Office Script (a short script that runs inside Excel on the web) copies the pristine Sanctuary template into the job folder and writes only the header cells, the summary, the SOR codes and quantities, and the non-SOR lines, in one call. Because Excel saves the file, its formulas, dropdowns, hidden sheets and the SOR table stay exactly as Sanctuary supplied them.
5. **Marking sent.** Sanctuary's own procedure says extra works over £100 go on the template to their quotes mailbox. So either the person drags the card to Sent, or a second small flow watches for emails from the shared mailbox to that address carrying the quote's filename, and moves the card itself. One IT setting matters here: when someone sends *as* the shared mailbox, Exchange keeps the sent copy in that person's own Sent Items unless the mailbox has the "message copy for Send As" option switched on.
6. **AI in this layer.** Copilot Chat is already included in the licence and can summarise a report pasted into it, in Outlook or Teams, without any add-on. Note that for a UK tenant Microsoft may process Copilot prompts outside the UK, so check that against Sanctuary's code of conduct before making it routine. The heavy lifting in A is not AI at all: the work order and PO numbers, postcodes and addresses are fixed patterns, and matching on them is more reliable than any model. If AI inside the flow itself is wanted later, Microsoft's AI Builder prompts run in-region for UK tenants, but they make the flow premium and meter per use; not needed to start.

## 5. Layer B: the app in the drafts (weeks 3 to 8)

A single web page written in TypeScript. It has no server of its own: the browser signs in to Microsoft (the same sign-in as Outlook on the web), then reads and writes the shared mailbox, the job folders and the Quotes list directly. Everything Layer A created is what it shows, which is why A comes first.

| Screen | What it is |
| --- | --- |
| Quote board | The Quotes list, drawn as four lanes. Dragging a card changes its Stage; the folder follows. Spring animation on lift and drop, cards settle into place, totals count up. |
| Shared inbox | The mailbox as the flow sees it: what was found in each email and where it went. This is also where a person places the ones the rules could not. |
| Job pack | One click on a card. The details the rules found (each with its source), the emails in date order, the engineer's report ready to become the Summary of Works, the photos with tick boxes, and likely SOR codes matched from the report wording. |
| Quote builder | Sanctuary's header fields, the summary, an SOR search over the 3,581 codes read from their own template, live totals with the −7.5% adjustment and the under-£20k test, a checklist, and Export, which writes the template and moves the card to Ready to send. |

### The AI, honestly

Small open models can run inside a modern browser (Edge or Chrome) on an ordinary office PC through a library called Transformers.js, which loads model files from Hugging Face once and keeps them in the browser's cache. They do not send anything anywhere.

| Task | How it is done | Confidence |
| --- | --- | --- |
| Find work order, PO, address, postcode, dates | Fixed patterns, no AI. SANC + 6 digits, 10-digit PO, UK postcode shape. Every value must appear word for word in an email before it is accepted. | High |
| Suggest SOR codes from the report | Plain word matching over the code descriptions first (exact terms like "up and over"), then a small text-embedding model (about 30 MB) for paraphrases. Top few shown with the words that matched. | High |
| Turn the engineer's email into the Summary of Works | Mostly copied verbatim with the greeting and sign-off stripped. A small local language model can tidy the wording if wanted. Always shown for editing. | High |
| Spot missing details, guess type of works and urgency | Keyword rules plus a small local model. Shown as "suggested" until confirmed. | Medium |
| Describe or sort photos (before and after, damage type) | Possible with small vision models in the browser, but slow on office hardware and rough in quality. Interior photos can show people, post or medication, so photo AI stays on the PC or does not happen. Left to a later phase, or to route C. | Low for now |

Every suggestion in the app shows where it came from, and nothing is filed or priced on a guess. The first time a PC opens the app it downloads the models (tens to a few hundred megabytes, once); after that they load from the browser's cache. How well they run on the company's particular PCs is the one part of Layer B that needs a hands-on trial before committing.

**Hosting and sign-in.** The app is a handful of static files, but SharePoint cannot host them directly: custom scripts are blocked on modern sites, and the supported route needs an admin-approved package. The company has no Azure subscription and will not run hosting of its own, so the app's code is served as a **free static page on Hugging Face**, which IT already permits, mirrored automatically from the GitHub repository. Only code goes there; emails, photos, quotes and the SOR list never do. The independent review (section 13) pointed out that whoever serves the code could in principle alter it while it holds the user's sign-in. The protections against that are: the code is public and mirrored from GitHub, so what runs can be compared with what was committed; the Hugging Face account uses two-factor sign-in and a token limited to that one page; the app registration is single-tenant with the exact page address as its only redirect; the build carries a browser security policy that only lets the page talk to Microsoft, whatever else the code might try; and IT can require company-managed devices for Exchange and SharePoint access (a tenant-wide rule on Business Premium with Intune, not one aimed at this app alone). Ask IT to scope the SharePoint permission to the one quotes site. The honest residual risk: if the host were compromised, altered code could act as a signed-in user for the shared mailbox and that one site for up to a day, attributed to this app in the audit logs. The one way to remove that without Azure is to host the app inside SharePoint itself as a SharePoint Framework web part, a rebuild of the shell that keeps the screens and logic; it stays on the list as the fallback if IT objects to Hugging Face. The person must already have access to the shared mailbox. Expect to sign in about once a day.

**What B does not do on its own.** Filing happens while someone has the app open. Overnight, at weekends and when nobody is in, nothing is filed until the next person opens it. That is why Layer A's flow is not optional in the long run: it files around the clock into the same lists and folders, and B simply shows the result.

## 6. Filling Sanctuary's template without breaking it

The template leans on things that ordinary spreadsheet libraries quietly drop when they re-save a file: the dropdowns that use INDIRECT, the structured tables, the hidden filter sheets. Opening the example with a common Python library already warns that it will remove a data-validation extension, and the two usual browser libraries (SheetJS community edition and ExcelJS) are documented to lose data validations or tables on a round trip. So the rule is: never re-save the template through a library.

- **Let Excel do the saving, in both layers.** In Layer A an Office Script writes the cell values inside Excel on the web. In Layer B the app copies the template into the job folder and writes the cells through Microsoft's Excel API, which Excel Online then recalculates and saves. Nothing re-serialises the file, so every feature survives by construction.
- **Fallback: edit only the cell values inside the file.** An .xlsx is a zip of XML files; the app can change the handful of cells it fills and leave every other byte alone, with one drawback: totals show stale until Excel recalculates on opening.
- Either way the master template is kept read-only and versioned, so when Sanctuary issue V1.1 it is swapped once.
- The filename follows the pattern in the example: `{ref}-{PO}_{work order}_{address}_{job}_{postcode}.xlsx`. What the leading reference is (the company's or Sanctuary's) is one of the questions below.

## 7. How an email finds its job

1. A Sanctuary work order number (SANC followed by six digits) anywhere in the subject, body or attachment names.
2. A 10-digit purchase order number that an existing job already carries.
3. The property's address or postcode, matched against open jobs.
4. A reply in a conversation that has already been filed.

Anything else waits in "Needs a job" for a person. A reply from Sanctuary that mentions changes, rejection or resubmission moves the card to "check and amend" and shows the request on the card.

## 8. Costs and licences

| Item | Cost | Note |
| --- | --- | --- |
| Power Automate flow, SharePoint, Lists, Power Apps, Office Scripts, Copilot Chat | £0 extra | Included with Microsoft 365 Business Basic, Standard and Premium; the shared-mailbox trigger and SharePoint actions are standard connectors. |
| Power Automate Premium for the flow owner | £11.50 a month | Only if the flow ever hits the included daily limits (6,000 actions a day, 200 MB of content), or if AI Builder prompts are added to it. Unlikely at this scale. |
| Layer B app hosting | £0, or about £7 a month | Free static page on Hugging Face or Cloudflare Pages. The paid Hugging Face plan (US$9) only if the source code must be hidden. No server to run. |
| AI models in the browser | £0 | Open models under permissive licences, run on the PC. |
| Microsoft 365 Copilot seat (optional) | about £23 a month | Only if Copilot should work across the job folders on its own. Not required by this design. |
| Route C server (only if needed later) | £20 to 60 a month, or one-off hardware | A small machine the company owns for larger models and photo understanding. |

Microsoft figures are UK list prices excluding VAT, checked against Microsoft's pages on 10 September 2026. Build effort is separate: roughly two to three days for Layer A, four to six weeks of development for Layer B.

## 9. What IT needs to provide

- Full Access to the shared mailbox for the account that will own the filing flow (ideally a dedicated licensed account rather than a named person, so it survives staff changes).
- Confirmation that Power Automate, Office Scripts and Excel on the web are allowed on the work PCs (some Conditional Access settings block them).
- A SharePoint site, or permission to create one, with audit logging on.
- For Layer B: an app registration in Entra ID with delegated permissions to read the shared mailbox and read and write the SharePoint site, and consent for it under the tenant's policy.
- Either allow huggingface.co for one-off model downloads, or agree to hold the model files in SharePoint.
- Evidence of Cyber Essentials, which Sanctuary's terms expect of suppliers that process their data.

## 10. Paperwork before any build

1. Check which contract actually governs the Sanctuary work (their standard terms or a framework) and whether a Data Processing Particulars Form exists; Microsoft should be listed on it as the processor.
2. Write a short data protection impact assessment covering the archive and the AI step, using the ICO template. Inside the tenant it is a light one.
3. Tell Sanctuary about the change in process. Their terms ask suppliers to notify technology changes that may affect security, and this one improves it.
4. Agree a retention period for the job folders with Sanctuary, and set it on the library.
5. If route C (Azure) is ever chosen, that becomes a formal sign-off request to Sanctuary's data protection office rather than a notice.

## 11. Decisions to make

1. Is Layer A alone enough for now, with B to follow, or should both be planned together from the start?
2. Does the automatic filing copy every email in the shared mailbox, or only ones that look like Sanctuary jobs?
3. Should "Sent" be set by dragging the card, or detected from emails to Sanctuary's quotes mailbox?
4. Settled: no Azure subscription and no hosting of the company's own, so the app's code lives on a free Hugging Face static page mirrored from GitHub. Remaining choice: public visibility (code visible, no secrets in it) or the paid "protected" visibility (about £7 a month) if the company prefers its code hidden.
5. Do services in the company's own Azure subscription count as in-house? This only matters if route C is ever wanted.
6. Who checks a quote before it goes out, and should the app insist on a second person?

## 12. Questions about the emails and set-up

- How reliably does the SANC number appear in Sanctuary's emails and in engineers' reports, and where (subject, body, attachment name)?
- What is the leading reference in the filename (`123b27db` in the example): the company's, Sanctuary's, or generated?
- Roughly how many job emails and photos arrive a week, and how large are the photos?
- Are replies sent from the shared mailbox, or from personal accounts?
- Are there other clients with their own templates, or is Sanctuary the only one for now?
- Does the company already hold Cyber Essentials?

## 13. Independent review of the routes

Three reviewers with different briefs (an IT and data-protection lead, the person who would use it daily, and a solutions architect) scored the four routes against the no-third-party rule. All three ranked the Microsoft-only route first (57 to 60 out of 70) and the browser-only route lowest (43 to 44), with the own-server hybrid and a Hugging Face-hosted variant in between. Their reasons, and what changed because of them:

- **No background process in the browser app.** Emails are only filed while someone has it open. Accepted: Layer A's flow is the 24-hour filer and the app shows its results; both write to the same lists, so nothing is filed twice.
- **Code served from a third party while it holds the user's sign-in.** If the host or its account were compromised, swapped code could read the mailbox. The company has no Azure subscription, so the Hugging Face page stays, with the protections and the plainly stated residual risk in section 5; SharePoint Framework hosting is the in-tenant fallback.
- **Never send a broken spreadsheet.** Their best single safeguard: after the template is filled, read the sheet's own totals back and refuse to move the card to "ready to send" if they disagree with the app's. Built in: the export now does exactly this.
- **Reports that arrive before the client's work order.** Suggested: a provisional job keyed on the address, merged when the SANC email lands. Not built yet; on the list.
- **The SOR list's licence.** Confirm with Sanctuary or M3 before copying the 3,581 codes into any list or index outside the template. The app reads them from the template at run time, which is the conservative position.
- **"Sent" detection.** Depends on the Send As copy setting above.

Of the fifteen factual claims the review set out to verify, four were checked before the account's usage limit stopped it: the shared-mailbox trigger is a standard connector (confirmed); filling the template inside Excel keeps its features (confirmed, with the note that Excel does the preserving, not the script); the priority flags are ordinary true/false cells, so no special handling is needed (confirmed); and Office Scripts on a Business Basic licence should be checked with IT rather than assumed.

## 14. What was checked, and what was not

Checked against official sources on 10 September 2026: the Microsoft 365 facts (connectors, licence limits, Office Scripts, shared-mailbox permissions, UK prices); Hugging Face plans, regions and hosting; the browser-app route (sign-in, mailbox and file access, the Excel API, which libraries break the template); Sanctuary's published purchase terms, supplier code of conduct and extra-works procedure, the M3 SOR licence terms, and ICO guidance on transfers and AI; and the off-the-shelf tools named in section 3. Not yet checked hands-on: how well small models run in the browser on the company's particular PCs, and the practicalities of route C. The ranking of the four routes is professional judgement; the independent review intended to run on it was cut short by the account's usage limit.

## 15. Suggested next step

If the drafts match the vision, the natural next piece is a clickable prototype of the board and job pack, running on made-up data, so the drag and drop and the flow between screens can be felt before anything is connected to the mailbox. In parallel, IT can grant the mailbox access and the Layer A flow can be set up against the real inbox, which is useful on its own within a fortnight.
