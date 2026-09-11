# Using Quote Desk

A day in the app, in the order things actually happen. Nothing here needs training: if you can read an email and fill in a spreadsheet, you can use it.

## The four columns

The board has one card per job and four columns, which are the four states a quote is ever in:

| Column | What it means |
| --- | --- |
| **To review** | The client has asked for a quote. Nothing has been priced yet. |
| **To check and amend** | Something needs a second look: the client has come back with changes, or a check failed. |
| **Ready to send** | The spreadsheet is filled and checked. It is waiting to go out. |
| **Sent** | It has gone to the client. Spreadsheets only: the card keeps the file that was actually sent. |

Drag a card to move it. Everyone with the app open sees the move within a few seconds, with a small note saying who did it. If two people drag the same card at once the last move wins, which is the same as two people editing the same spreadsheet, only faster to notice.

## 1. Emails arrive on their own

The app watches the shared mailbox while anyone has it open. For each new email it looks for, in this order:

1. **A work order number** (`SANC004958`) anywhere in the subject, the body, or an attachment's filename. That is a certain match.
2. **A purchase order number** (ten digits starting 45) that one of your jobs already knows.
3. **A reply** in a conversation it has already filed.
4. **An address or postcode** that matches a job. That is a likely match, not a certain one.

Certain matches are filed without asking: the email, its photos and its report land in that job's folder. Anything less certain waits in **Shared inbox** with a badge on the sidebar.

In the Shared inbox, each waiting email shows what the app found and what it proposes. You choose one of four things: file it to the job it suggests, file it to a different job, start a new job from it, or ignore it. Ignoring is for the things that are not jobs at all, and it is remembered so the email never comes back.

When a request email carries a work order the app has never seen, it creates the card for you and puts it in **To review**.

## 2. The job pack

Click a card to open everything the app knows about that job in one place:

- **The details** it read from the emails: work order, purchase order, address, location of works, type of works, urgency, contact name and number, the date issued. Each one shows where it came from, so you can tell what was read from an email and what somebody typed.
- **The emails** filed to the job, oldest first.
- **The engineer's report**, tidied of greetings and sign-offs, plus the date attended if one was mentioned.
- **The photos**, as thumbnails you can open.
- **Suggested SOR codes**, worked out from the words in the report. Suggestions are only ever suggestions: nothing is priced until you say so.

Anything the app got wrong, you type over. Your typing wins and is marked as yours.

## 3. Building the quote

**Build quote** opens the builder, which is the client's form in the same order as the spreadsheet.

- The header fills itself from the job pack. Check the contact details and the date.
- **Summary of works** starts from the report. Rewrite it in your own words; it is what the client reads first.
- Add **SOR lines** by typing into the search box: a code number, or plain words like "garage door panel". Arrow keys move through the results, Enter picks one. Type the quantity, and a comment if the line needs one.
- Add anything without a code under **Non-SOR works**: your own description, unit, rate and quantity.
- The rail on the right keeps a running total. It applies your contractor rate automatically, including the different rate above and below £20,000, and shows the base total and the adjustment separately so you can see how the number was reached.

The **Main Sheet** takes 31 lines; after that the app puts them on the **Continuation Sheet**, exactly as the paper form does, and tells you when it has.

## 4. Before it goes out

The builder lists its own checks: anything empty that the client requires, a total of zero, a line with no quantity, whether anyone has checked it. Fix what it lists.

**Export** takes a fresh copy of the client's blank template, fills the copy through Excel itself, and saves it into the job folder with the filename the client expects. The blank template is never touched.

Two things worth knowing:

- The app fills cells; **Excel does the arithmetic**. After filling, the app reads the spreadsheet's own totals back and compares them with its own. If they differ by more than a penny it says so and refuses to move the card to **Ready to send**. That is the check that catches a template change.
- Open the exported file once before sending it, at least for the first few. It is the client's form: it should look exactly like one you filled by hand.

## 5. Sending

Sending is still done from Outlook: the app does not send email. Attach the file from the job folder, send it, and drag the card to **Sent**.

If the client comes back with changes, the app spots the reply, files it, and moves the card back to **To check and amend** with a flag saying what changed.

## When something looks wrong

- **A card is in the wrong column.** Drag it. There is no approval step.
- **The board has not updated.** The sidebar says when it last checked. It polls every 30 seconds; nothing is lost, it just has not looked yet.
- **An email went to the wrong job.** Open the job, open the email, and re-file it from the Shared inbox.
- **The totals do not match after export.** The template has probably changed. Compare the exported file with a hand-filled one and say what moved; the cell map in the code needs the same change.
- **Something will not load at all.** Open **Setup & data** and press **Check connection**. It tries each thing in turn and says which one failed and what to do about it.

## What the app never does

It never sends your data anywhere outside your Microsoft 365. Matching, searching and pricing all run in the browser on your own PC. There is no AI service, no third-party server, and no copy of the client's data anywhere else. The code list and rate table are read from the client's own template each time, not copied out of it.

It also never files anything overnight on its own. Filing happens while somebody has the app open. If that becomes a problem, the Power Automate flow described in `docs/proposal.md` files around the clock into the same lists and folders.
