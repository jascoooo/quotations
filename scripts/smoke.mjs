// Smoke test: serves nothing itself. Run `npm run build && npx vite preview --port 4173` first, then
// `CHROME_PATH=/path/to/chrome node scripts/smoke.mjs`. Drives the demo through the main flows and saves screenshots.

import { chromium } from 'playwright-core';
const OUT = process.env.SHOTS_DIR ?? 'smoke-shots';
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(process.env.BASE_URL ?? 'http://localhost:4173/#demo', { waitUntil: 'networkidle' });
await page.waitForSelector('.board', { timeout: 15000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/1-board.png` });
const cols = await page.$$eval('.col-head', (els) => els.map((e) => e.textContent.trim()));
console.log('columns:', cols.join(' | '));
// Drag SANC005044 from amend to ready using keyboard (hello-pangea supports space + arrows)
const card = page.locator('[data-rfd-draggable-id="SANC005044"]');
await card.focus();
await page.keyboard.press('Space');
await page.waitForTimeout(250);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(350);
await page.screenshot({ path: `${OUT}/2-board-dragging.png` });
await page.keyboard.press('Space');
await page.waitForTimeout(600);
const readyHas = await page.locator('.col.ready [data-rfd-draggable-id="SANC005044"]').count();
console.log('after drag, SANC005044 in ready column:', readyHas === 1);
await page.screenshot({ path: `${OUT}/3-board-after-drag.png` });
// Reload to prove persistence of the move
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.board');
await page.waitForTimeout(400);
console.log('after reload, still in ready:', (await page.locator('.col.ready [data-rfd-draggable-id="SANC005044"]').count()) === 1);
// Open the job pack for SANC004958
await page.locator('[data-rfd-draggable-id="SANC004958"]').click();
await page.waitForSelector('text=Job details');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/4-jobpack.png`, fullPage: true });
const sug = await page.$$eval('.sug .mono', (els) => els.map((e) => e.textContent.trim()));
console.log('likely SOR codes:', sug.join(', '));
// Build quote
await page.getByRole('button', { name: /Build quote|Open quote/ }).click();
await page.waitForSelector('text=Schedule of works');
await page.waitForTimeout(400);
// add the first three suggested codes via search
for (const q of ['garage door rollers', 'lock up and over', 'remove and refix']) {
  await page.locator('.search input').last().fill(q);
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
}
await page.locator('.search input').last().fill('garage door');
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/5-quote-search.png`, fullPage: true });
await page.keyboard.press('Escape');
// add a non-SOR line
await page.getByRole('button', { name: /Add a line/ }).click();
const rows = page.locator('.panel:has(h3:has-text("Non-SOR works")) tbody tr');
await rows.last().locator('input').nth(1).fill('4');
await rows.last().locator('input.wide').fill('Size of garage door requires 2 engineers');
await rows.last().locator('input[type=number]').last().fill('34');
await page.waitForTimeout(1200); // autosave
const total = await page.locator('.totals .big b').textContent();
console.log('total shown:', total);
await page.screenshot({ path: `${OUT}/6-quote-builder.png`, fullPage: true });
const exportBtn = page.getByRole('button', { name: /Export .* spreadsheet/ });
console.log('export enabled:', await exportBtn.isEnabled());
await exportBtn.click();
await page.waitForSelector('.modal');
await page.waitForTimeout(300);
const writes = await page.$$eval('.kv .mono', (els) => els.length);
console.log('cells to write:', writes, '| file:', await page.locator('.modal .mono.small').textContent());
await page.screenshot({ path: `${OUT}/7-export-modal.png` });
await page.getByRole('button', { name: 'Close' }).click();
// Inbox
await page.getByRole('button', { name: /Shared inbox/ }).click();
await page.waitForSelector('.inbox-row');
await page.waitForTimeout(400);
const needs = await page.$$eval('.inbox-row', (els) => els.length);
console.log('inbox rows needing a job:', needs);
await page.locator('.inbox-row', { hasText: 'Meadow Rise' }).first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/8-inbox.png`, fullPage: true });
await page.getByRole('button', { name: /File to SANC005044/ }).click();
await page.waitForTimeout(600);
console.log('rows after filing:', await page.$$eval('.inbox-row', (els) => els.length));
// SANC005130 arrived as a client request with a new work order, so auto-filing created its job on start-up.
await page.getByRole('button', { name: /Filed/ }).click();
await page.waitForTimeout(200);
await page.locator('.inbox-row', { hasText: 'SANC005130' }).first().click();
await page.waitForTimeout(200);
console.log('auto-created job shown as filed:', await page.locator('.note', { hasText: 'Filed to' }).count() === 1);
await page.locator('.note button', { hasText: 'SANC005130' }).click();
await page.waitForSelector('text=Job details');
await page.waitForTimeout(400);
console.log('new job:', (await page.locator('.topbar .sub').first().textContent()).trim());
await page.screenshot({ path: `${OUT}/9-new-job.png` });
// Setup page
await page.getByRole('button', { name: /Setup/ }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/10-setup.png` });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
