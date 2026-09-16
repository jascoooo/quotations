# Quote Desk

A quote archive and builder for Sanctuary extra-works requests: a shared, live board for everyone in the tenant, a job pack compiled from the shared mailbox, a quote builder that prices with the client's SOR codes, and an export that fills the client's own Excel template without breaking it.

Everything stays in the company's Microsoft 365 tenant and in the user's browser. No server of its own, no outside AI service, nothing sent to a third party.

## Try it

`npm install`, then `npm run dev` and open the address it prints with `#demo` on the end. Demo mode uses made-up data in memory (one job mirrors the supplied example spreadsheet); nothing is signed in to.

## Run it with no permissions at all

Open the app and choose **Start on this PC**. No sign-in, no Entra app registration, no administrator.

- The client's template is read once, locally, for its code list and rate table.
- Emails arrive on their own: a Power Automate flow (Microsoft's own standard connector, no registration and nobody's permission) drops each one into a synced OneDrive folder, and the app reads that folder off the disk.
- The board is shared and live: it lives as one file per job in a SharePoint or OneDrive folder synced to each PC, re-read every ten seconds, so colleagues see each other's changes without anyone signing in.
- The finished quote comes out as an Office Script you run in Excel on the web, so the template's dropdowns and tables survive.
- The office's own extra-works tracker is read from the same folder, colour key and all, so the board is checked against where the quotes really are.

`docs/setup.md` has the whole thing, including the flow.

## Connect it

Open the app with no `config.json` present and it shows a setup screen: register the app once in Entra ID, paste the two IDs and the address of a SharePoint site you own, and it creates the lists, columns and folders itself. `docs/setup.md` has the whole thing, including which single step may need whoever holds the admin account.

## Guides

| Document | For |
| --- | --- |
| `docs/setup.md` | connecting it to Microsoft 365, mostly without an administrator |
| `docs/user-guide.md` | using it day to day |
| `docs/hosting.md` | publishing it so colleagues can open it |
| `docs/proposal.md` | why it is built this way, the alternatives, and the data-protection position |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | local development server |
| `npm run build` | production build into `dist/` |
| `npm run build:demo` | single-file demo build into `dist-demo/` (no sign-in, demo data only) |
| `npm run build:single` | single-file build of the real app into `dist-single/`, for uploading to a static host by hand |
| `node scripts/local-smoke.mjs` | drives the on-this-PC mode end to end against a real client template |
| `node scripts/privacy-check.mjs` | logs every host the running app contacts, and fails on anything but Microsoft |
| `npm test` | unit tests for matching, pricing, SOR search, the template cell map and the setup helpers |
| `npm run typecheck` | TypeScript |
| `node scripts/smoke.mjs` | drives the built demo through the main flows in a headless browser |

## Layout

- `src/lib/` – the logic: reference extraction (`refs.ts`), how an email finds its job (`match.ts`), the client sheet's maths (`pricing.ts`), SOR search (`sor.ts`), where each value goes in the template (`template.ts`), reading the client's workbook and the office tracker (`xlsx.ts`, `tracker.ts`), the watched-folder import (`folder.ts`), and the Office Script the offline mode emits (`officeScript.ts`).
- `src/providers/` – three data providers behind one interface: `demo.ts` (in memory), `local.ts` (this browser, no sign-in) and `graph.ts` (Microsoft 365 via Microsoft Graph). `autofile.ts` is the filing station they share.
- `src/ui/` – the screens: board, shared inbox, job pack, quote builder, setup, and the first-run `Connect.tsx`.
- `docs/` – the guides above, plus the design canvas artboards and screenshots.

## Deploy

`.github/workflows/sync-to-space.yml` builds the app on GitHub (Node 22) and publishes only the built files to a free Hugging Face static Space, which serves them at `https://<owner>-<name>.static.hf.space/`. Hugging Face's own build step is not free, so nothing is built there. Only code goes to Hugging Face. Setup steps are in `docs/hosting.md`. Node 22.12 or newer is required to build locally (`.nvmrc`).
