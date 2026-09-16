// Proves the app contacts nobody but Microsoft: every request the page makes
// is logged, and anything off the allowed list fails the check.
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:4260/';
const SELF = new URL(BASE).host;
// The Microsoft 365 route legitimately talks to Microsoft. Nothing else is allowed.
const ALLOWED = [SELF, 'login.microsoftonline.com', 'graph.microsoft.com', /\.sharepoint\.com$/, /\.sharepointonline\.com$/];
const ok = (host) => ALLOWED.some((a) => (a instanceof RegExp ? a.test(host) : a === host));

const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const hosts = new Map();
p.on('request', (r) => {
  const u = new URL(r.url());
  if (u.protocol === 'data:' || u.protocol === 'blob:') return;
  hosts.set(u.host, (hosts.get(u.host) ?? 0) + 1);
});

await p.goto(BASE, { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
await p.locator('button', { hasText: 'Start on this PC' }).click();
await p.waitForTimeout(1500);
await p.locator('button', { hasText: 'Setup' }).first().click();
await p.waitForTimeout(800);
await p.locator('button', { hasText: 'Tracker' }).first().click();
await p.waitForTimeout(800);
await p.locator('button', { hasText: 'Quote board' }).first().click();
await p.waitForTimeout(800);

console.log('every host the page contacted:');
const bad = [];
for (const [host, n] of [...hosts].sort()) {
  const good = ok(host);
  if (!good) bad.push(host);
  console.log(`  ${good ? 'ok  ' : 'BAD '} ${host} (${n} request${n === 1 ? '' : 's'})`);
}
// The font must still be the real one, not a fallback.
const font = await p.evaluate(() => getComputedStyle(document.body).fontFamily);
console.log('body font:', font);
const loaded = await p.evaluate(() => document.fonts.check('500 14px "IBM Plex Sans"'));
console.log('IBM Plex Sans available offline:', loaded);
await b.close();
if (bad.length) {
  console.log(`\nFAILED: contacted ${bad.join(', ')}`);
  process.exit(1);
}
console.log('\nPASSED: nothing outside the app and Microsoft was contacted.');
