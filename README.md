# Quote Desk

A quote archive and builder for Sanctuary extra-works requests: a shared, live board for everyone in the tenant, a job pack compiled from the shared mailbox, a quote builder that prices with the client's SOR codes, and an export that fills the client's own Excel template without breaking it.

Everything stays in the company's Microsoft 365 tenant and in the user's browser. No server of its own, no outside AI service, nothing sent to a third party.

## Try it

`npm install`, then `npm run dev` and open the address it prints with `#demo` on the end. Demo mode uses made-up data in memory (one job mirrors the supplied example spreadsheet); nothing is signed in to.

## Connect it

See `docs/m365-setup.md`: an Entra app registration, a SharePoint site with two lists and a library, Full Access to the shared mailbox, and a `config.json` next to the built app.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | local development server |
| `npm run build` | production build into `dist/` |
| `npm run build:demo` | single-file demo build into `dist-demo/` (no sign-in, demo data only) |
| `npm test` | unit tests for matching, pricing, SOR search and the template cell map |
| `npm run typecheck` | TypeScript |
| `node scripts/smoke.mjs` | drives the built demo through the main flows in a headless browser |

## Layout

- `src/lib/` – the logic: reference extraction (`refs.ts`), how an email finds its job (`match.ts`), the client sheet's maths (`pricing.ts`), SOR search (`sor.ts`), where each value goes in the template (`template.ts`).
- `src/providers/` – two data providers behind one interface: `demo.ts` (in memory) and `graph.ts` (Microsoft 365 via Microsoft Graph). `autofile.ts` is the filing station shared by both.
- `src/ui/` – the screens: board, shared inbox, job pack, quote builder, setup.
- `docs/` – the proposal, the design canvas artboards and screenshots, and the Microsoft 365 setup guide.

## Deploy

`.github/workflows/sync-to-space.yml` builds the app on GitHub (Node 22) and publishes only the built files to a free Hugging Face static Space, which serves them at `https://<owner>-<name>.static.hf.space/`. Hugging Face's own build step is not free, so nothing is built there. Only code goes to Hugging Face. Setup steps are in `docs/m365-setup.md` section 5. Node 22.12 or newer is required to build locally (`.nvmrc`).
