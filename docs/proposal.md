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

**Layer B** is the app in the drafts: a web app that runs entirely in the browser on the work PC, signs in with the user's Microsoft account, reads the same folders and list, and does its AI work with open models from Hugging Face running locally in the browser. Hugging Face supplies model files and, if IT prefers, hosts the app's code. It never receives an email, a photo or a spreadsheet.

Python on a Hugging Face Space, cloud AI services and off-the-shelf job software are all set aside: each one means a new company holding tenant data on servers outside the UK.

## 3. The data rule, applied

"Local" in this design means two places: the work PC itself (including inside its browser), and the company's own Microsoft 365 tenant, which already holds the mailbox today. Microsoft is the existing processor; nothing new is added to that list. The only outbound connections the app makes are to the company's own Microsoft 365 and, once, to download model files from Hugging Face. Model downloads carry no data outwards. If IT would rather not allow huggingface.co at all, the model files can be copied into SharePoint once and loaded from there.

Outside the line, and why:

- Hugging Face Spaces running Python: the Space would hold the data on Hugging Face's US servers. Since July 2026 a Python Space also needs a paid plan, and free hardware sleeps after 48 hours.
- Cloud AI services (Claude, ChatGPT, Gemini, Copilot pay-as-you-go agents): the text and photos go to the provider.
- Job-management products and email-to-board tools (Joblogic, simPRO, Airtable, Trello and similar): a new processor, and none of them produce Sanctuary's exact template.
- Azure services in the company's own subscription (for example a private AI model in the UK South region): still Microsoft, still under the existing agreement, but a new service. Kept as route C for later, and only if the company and IT judge it in-house.

## 4. Layer A: filing and the board, inside Microsoft 365 (weeks 1 to 2)

1. **One SharePoint site for Sanctuary quotes.** A document library where every job is a folder named by work order and address, for example `SANC004958 – 31 Cathedral Drive SS15 5WF`. Inside: the emails saved as files, the photos, the report, and the finished quote.
2. **A list called Quotes.** One row per job with the work order, PO, address, postcode, job description, total, and a Stage column with the four values. Shown as a Board view, which is Microsoft's own drag-and-drop kanban. Each row links to its folder.
3. **The filing flow.** A Power Automate flow triggered by each new email in the shared mailbox. It looks for a Sanctuary work order number, then a known PO number, then a known address or postcode. If it finds one, it saves the email and every attachment into that job's folder and stamps them with the job details; if the job is new it creates the folder and the row. If it finds nothing, it files the email under "Needs a job" for a person to place. Emails stay in the mailbox untouched; the flow only copies.
4. **Filling the template.** An Office Script (a short script that runs inside Excel on the web) copies the pristine Sanctuary template into the job folder and writes only the header cells, the summary, the SOR codes and quantities, and the non-SOR lines. Because Excel saves the file, its formulas, dropdowns, hidden sheets and the SOR table stay exactly as Sanctuary supplied them.
5. **Marking sent.** Either the person drags the card to Sent, or a second small flow watches the mailbox's sent items for a message carrying the quote's filename and moves the card itself.
6. **AI in this layer.** Copilot Chat is already included in the licence and can summarise a report pasted into it, in Outlook or Teams, without any add-on. The heavy lifting in A is not AI at all: the work order and PO numbers, postcodes and addresses are fixed patterns, and matching on them is more reliable than any model.

## 5. Layer B: the app in the drafts (weeks 3 to 8)

A single web page written in TypeScript. It has no server of its own: the browser signs in to Microsoft (the same sign-in as Outlook on the web), then reads and writes the shared mailbox, the job folders and the Quotes list directly. Everything Layer A created is what it shows, which is why A comes first.

| Screen | What it is |
| --- | --- |
| Quote board | The Quotes list, drawn as four lanes. Dragging a card changes its Stage; the folder follows. Spring animation on lift and drop, cards settle into place, totals count up. |
| Shared inbox | The mailbox as the flow sees it: what was found in each email and where it went. This is also where a person places the ones the rules could not. |
| Job pack | One click on a card. The details the rules found (each with its source), the emails in date order, the engineer's report ready to become the Summary of Works, the photos with tick boxes, and likely SOR codes matched from the report wording. |
| Quote builder | Sanctuary's header fields, the summary, an SOR search over the 3,581 codes from their own template, live totals with the −7.5% adjustment and the under-£20k test, a checklist, and Export, which writes the template and moves the card to Ready to send. |

### The AI, honestly

Small open models can run inside a modern browser (Edge or Chrome) on an ordinary office PC through a library called Transformers.js, which loads model files from Hugging Face once and keeps them in the browser's cache. They do not send anything anywhere.

| Task | How it is done | Confidence |
| --- | --- | --- |
| Find work order, PO, address, postcode, dates | Fixed patterns, no AI. SANC + 6 digits, 10-digit PO, UK postcode shape. | High |
| Suggest SOR codes from the report | A small text-embedding model (about 30 MB) indexes the code descriptions once; the report is searched against them. Good at "rollers and channels" → 345613. | High |
| Turn the engineer's email into the Summary of Works | Mostly copied verbatim with the greeting and sign-off stripped. A small local language model can tidy the wording if wanted. Always shown for editing. | High |
| Spot missing details, guess type of works and urgency | Keyword rules plus a small local model. Shown as "suggested" until confirmed. | Medium |
| Describe or sort photos (before and after, damage type) | Possible with small vision models in the browser, but slow on office hardware and rough in quality. Left to a later phase, or to route C. | Low for now |

Every suggestion in the app shows where it came from, and nothing is filed or priced on a guess. The first time a PC opens the app it downloads the models (tens to a few hundred megabytes, once); after that they load from the browser's cache.

**Hosting and sign-in.** The app is a handful of static files. Simplest is to put them in the SharePoint site; the alternative is a free static page on Hugging Face, which holds code only. Either way the app needs an app registration in the Microsoft tenant so it can sign users in and read the shared mailbox and SharePoint on their behalf. Those are standard delegated permissions; the person must already have access to the shared mailbox.

## 6. Filling Sanctuary's template without breaking it

The template leans on things that ordinary spreadsheet libraries quietly drop when they re-save a file: the dropdowns that use INDIRECT, the structured tables, the hidden filter sheets. Opening the example with a common Python library already warns that it will remove a data-validation extension. So the rule is: never re-save the template through a library. Two safe ways remain, one per layer.

- **Let Excel do the saving.** An Office Script writes cell values inside Excel on the web; Excel saves the workbook, so every feature survives. Used in Layer A.
- **Edit only the cell values inside the file.** An .xlsx is a zip of XML files; the app changes the handful of cells it fills and leaves every other byte alone. Used in Layer B, in the browser.
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
| Power Automate flow, SharePoint, Lists, Office Scripts, Copilot Chat | £0 extra | Included with Microsoft 365 Business Basic, Standard and Premium; the shared-mailbox trigger and SharePoint actions are standard connectors. |
| Power Automate Premium for the flow owner | £11.50 a month | Only if the flow ever hits the included daily limits (6,000 actions a day, 200 MB of content). Unlikely at this scale. |
| Layer B app hosting | £0 | Static files on SharePoint, or a free static Hugging Face page. No server to run. |
| AI models in the browser | £0 | Open models under permissive licences, run on the PC. |
| Microsoft 365 Copilot seat (optional) | about £23 a month | Only if Copilot should work across the job folders on its own. Not required by this design. |
| Route C server (only if needed later) | £20 to 60 a month, or one-off hardware | A small machine the company owns for larger models and photo understanding. |

Microsoft figures are UK list prices excluding VAT, checked against Microsoft's pages on 10 September 2026. Build effort is separate: roughly two to three days for Layer A, four to six weeks of development for Layer B.

## 9. What IT needs to provide

- Full Access to the shared mailbox for the account that will own the filing flow (ideally a dedicated licensed account rather than a named person, so it survives staff changes).
- Confirmation that Power Automate, Office Scripts and Excel on the web are allowed on the work PCs (some Conditional Access settings block them).
- A SharePoint site, or permission to create one.
- For Layer B: an app registration in Entra ID with delegated permissions to read the shared mailbox and read and write the SharePoint site, and admin consent for it.
- Either allow huggingface.co for one-off model downloads, or agree to hold the model files in SharePoint.

## 10. Decisions to make

1. Is Layer A alone enough for now, with B to follow, or should both be planned together from the start?
2. Does the automatic filing copy every email in the shared mailbox, or only ones that look like Sanctuary jobs?
3. Should "Sent" be set by dragging the card, or detected from sent items?
4. Where should the app's code live: SharePoint, or a free Hugging Face static page?
5. Do services in the company's own Azure subscription count as in-house? This only matters if route C is ever wanted.
6. Who checks a quote before it goes out, and should the app insist on a second person?

## 11. Questions about the emails

- How reliably does the SANC number appear in Sanctuary's emails and in engineers' reports, and where (subject, body, attachment name)?
- What is the leading reference in the filename (`123b27db` in the example): the company's, Sanctuary's, or generated?
- Roughly how many job emails and photos arrive a week, and how large are the photos?
- Are replies sent from the shared mailbox, or from personal accounts?
- Are there other clients with their own templates, or is Sanctuary the only one for now?

## 12. What was checked, and what was not

The Microsoft 365 facts (which connectors are included, licence limits, Office Scripts behaviour, shared-mailbox permissions, UK prices) and the Hugging Face facts (paid plans for Python Spaces, sleeping, US hosting) were checked against the official documentation on 10 September 2026. The in-browser AI approach, the template-filling method and the data-protection reading are professional judgement and have not yet been through the same source-checking pass; they should be verified before any build starts.

## 13. Suggested next step

If the drafts match the vision, the natural next piece is a clickable prototype of the board and job pack, running on made-up data, so the drag and drop and the flow between screens can be felt before anything is connected to the mailbox. In parallel, IT can grant the mailbox access and the Layer A flow can be set up against the real inbox, which is useful on its own within a fortnight.
