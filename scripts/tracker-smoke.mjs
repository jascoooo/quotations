// Drives the tracker screen against R Dunham's real spreadsheet.
import { chromium } from 'playwright-core';
const BASE = process.env.BASE_URL ?? 'http://localhost:4240/';
const TRACKER = process.env.TRACKER_XLSX ?? '/tmp/claude-0/tracker-sample.xlsx';
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const p = await b.newPage({ viewport: { width: 1500, height: 1050 } });
const bad = [];
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/ERR_CONNECTION_RESET|404|fonts\.googleapis/.test(t)) bad.push(t); });
p.on('pageerror', (e) => bad.push('pageerror: ' + e.message));

await p.goto(BASE, { waitUntil: 'networkidle' });
await p.locator('button', { hasText: 'Start on this PC' }).click();
await p.waitForTimeout(1200);
await p.locator('button', { hasText: 'Tracker' }).first().click();
await p.waitForTimeout(500);
await p.locator('input[type=file][accept=".xlsx"]').setInputFiles(TRACKER);
await p.waitForSelector('.tile', { timeout: 60000 });
await p.waitForTimeout(600);
console.log('1. subtitle:', (await p.locator('.topbar .sub').first().innerText()).trim());

const tiles = await p.locator('.tile').allInnerTexts();
console.log('2. headline tiles:');
for (const t of tiles) console.log('   ', t.replace(/\n/g, ' | '));

const legend = await p.locator('.legend-row').allInnerTexts();
console.log('3. legend:');
for (const l of legend) console.log('   ', l.replace(/\n/g, ' -> '));

console.log('4. rows listed:', await p.locator('.tracker-row').count());
console.log('5. first row:', (await p.locator('.tracker-row').first().innerText()).replace(/\n/g, ' | ').slice(0, 130));
const owed = await p.locator('.panel').filter({ hasText: 'Who owes us a quote' }).first().innerText();
console.log('6. who owes:', owed.split('\n').slice(1, 6).join(' | '));

await p.locator('.tile', { hasText: 'not picked up' }).click();
await p.waitForTimeout(400);
console.log('7. after filtering to "in, not picked up":', await p.locator('.tracker-row').count(), 'rows');
await p.screenshot({ path: '/tmp/claude-0/tracker.png', fullPage: false });
console.log('errors:', bad.length ? bad.slice(0, 4) : 'none');
await b.close();
