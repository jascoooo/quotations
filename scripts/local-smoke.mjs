// Drives the on-this-PC mode end to end against the real client template.
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:4200/';
const TPL = process.env.TEMPLATE_XLSX ?? '/tmp/claude-0/template-sample.xlsx';
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const bad = [];
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/ERR_CONNECTION_RESET|404|fonts\.googleapis/.test(t)) bad.push(t); });
p.on('pageerror', (e) => bad.push('pageerror: ' + e.message));

await p.goto(BASE, { waitUntil: 'networkidle' });
await p.locator('button', { hasText: 'Start on this PC' }).click();
await p.waitForTimeout(1500);
console.log('1. after choosing local mode:', await p.locator('h1').first().textContent());

// load the client's template
await p.locator('button', { hasText: 'Setup' }).click();
await p.waitForTimeout(400);
await p.locator('input[type=file][accept=".xlsx"]').setInputFiles(TPL);
await p.waitForFunction(() => document.body.innerText.includes('Read ') && document.body.innerText.includes('codes'), null, { timeout: 60000 });
const readMsg = await p.locator('.note.ok, .note.danger').last().innerText();
console.log('2. template:', readMsg.replace(/\s+/g, ' ').slice(0, 90));
await p.locator('button', { hasText: 'Reload' }).click();
await p.waitForTimeout(1800);

// add a job
await p.locator('button', { hasText: 'Add job' }).click();
await p.waitForTimeout(300);
await p.locator('input[placeholder="SANC004958"]').fill('SANC004958');
await p.locator('input[placeholder="31 Cathedral Drive, Basildon"]').fill('31 Cathedral Drive, Basildon');
await p.locator('input[placeholder="SS15 5WF"]').fill('SS15 5WF');
await p.locator('input[placeholder="Garage door"]').fill('Garage door');
await p.locator('button', { hasText: 'Add it' }).click();
await p.waitForTimeout(1200);
await p.waitForFunction(() => document.body.innerText.includes('SANC004958'), null, { timeout: 30000 });
console.log('3. job page shows:', (await p.locator('.topbar').first().innerText()).replace(/\s+/g, ' ').slice(0, 90));

// build a quote with a real SOR code
await p.locator('button', { hasText: 'Build quote' }).first().click();
await p.waitForTimeout(900);
const search = p.locator('input[placeholder*="code"], input[placeholder*="Search"], input[placeholder*="search"]').last();
await search.fill('345613');
await p.waitForTimeout(700);
const opt = p.locator('.sor-option, [role=option], li').filter({ hasText: '345613' }).first();
if (await opt.count()) { await opt.click(); } else { await search.press('Enter'); }
await p.waitForTimeout(700);
const qty = p.locator('input[type=number]').first();
if (await qty.count()) { await qty.fill('2'); await qty.blur(); }
await p.waitForTimeout(700);
const bodyText = await p.locator('body').innerText();
const totalMatch = bodyText.match(/£[\d,]+\.\d{2}/g);
console.log('4. money shown on the builder:', totalMatch ? totalMatch.slice(0, 6).join(' ') : 'none');

// fill the header fields the client's form requires, as a user would
const byLabel = async (label, value) => {
  const el = p.locator('.f', { has: p.locator(`label:text-is("${label}")`) }).locator('input').first();
  if (!(await el.count())) { console.log('     (no field named ' + label + ')'); return; }
  await el.fill(value);
  await el.blur();
};
await byLabel('Original purchase order', '4501849778');
await byLabel('Property address', '31 Cathedral Drive, Basildon SS15 5WF');
await byLabel('Contact name', 'J Scott');
await byLabel('Contact no.', '01268 000000');
const summary = p.locator('textarea').first();
if (await summary.count()) { await summary.fill('Renew garage door to front elevation, including removal of the damaged leaf and making good.'); await summary.blur(); }
await p.waitForTimeout(900);
const failing = await p.locator('.check, .checks li, .panel').filter({ hasText: 'missing' }).count();
console.log('5a. checks still failing:', failing);
const checkPanel = await p.locator('.panel').filter({ hasText: 'Before it goes out' }).first().innerText().catch(() => 'not found');
console.log('5b. checks panel:\n' + checkPanel.split('\n').map((l) => '     ' + l).join('\n'));

// export -> office script
const exportBtn = p.locator('button', { hasText: 'Export' }).first();
console.log('5. export enabled:', await exportBtn.isEnabled());
await exportBtn.click();
await p.waitForTimeout(1500);
const modal = await p.locator('.modal').innerText();
console.log('6. modal title:', modal.split('\n')[0]);
const hasScript = modal.includes('function main(workbook: ExcelScript.Workbook)');
console.log('7. office script present:', hasScript);
const cells = modal.match(/Excel writes the (\d+) cells/);
console.log('8. cells to write:', cells ? cells[1] : 'not stated');
await p.screenshot({ path: '/tmp/claude-0/local-export.png', fullPage: false });
// You must be able to get back out of this mode again.
await p.locator('button', { hasText: 'Setup' }).first().click();
await p.waitForTimeout(600);
const deadSignOut = await p.locator('button', { hasText: 'Sign out' }).count();
console.log('9. dead sign-out button present:', deadSignOut, deadSignOut === 0 ? '(good)' : '(BAD)');
await p.locator('button', { hasText: 'Change how this runs' }).click();
await p.waitForTimeout(1500);
const routes = await p.locator('.choice').count();
console.log('10. back at the start screen with both routes:', routes === 2 ? 'yes' : `no (${routes})`);

console.log('errors:', bad.length ? bad.slice(0, 5) : 'none');
await b.close();
if (deadSignOut !== 0 || routes !== 2) process.exit(1);
