// End-to-end smoke test in a real (headless) browser.
// Usage: node tests/e2e.mjs            (needs the `playwright` package and a Chromium build)
// Optional: THREE_LOCAL=/path/to/three.module.js to serve Three.js offline instead of from the CDN.
//           SHOTS=/some/dir to save screenshots.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { createServer } from '../tools/serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const server = createServer();
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(`${e.message}\n${e.stack}`));
if (process.env.THREE_LOCAL) {
  const src = readFileSync(process.env.THREE_LOCAL, 'utf8');
  await page.route(THREE_URL, r => r.fulfill({ body: src, contentType: 'text/javascript' }));
}
await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));

const step = async (name, fn) => {
  const t = Date.now();
  await fn();
  console.log(`✓ ${name} (${Date.now() - t} ms)`);
  if (shots) await page.screenshot({ path: `${shots}/${name.replace(/\W+/g, '-')}.png` });
};
let failed = false;

try {
  await step('page loads', async () => {
    await page.goto(base + '/index.html');
    await page.waitForFunction(() => window.__epicenterReady === true, null, { timeout: 60000 });
    await page.waitForSelector('#start-btn:not([disabled])');
  });

  await step('story starts with the intro briefing', async () => {
    await page.click('#start-btn');
    await page.waitForSelector('#modal-choices button', { state: 'visible', timeout: 120000 });
    const title = await page.textContent('#modal-title');
    if (!/Houston/.test(title)) throw new Error(`unexpected intro: ${title}`);
    await page.click('#modal-choices button');
  });

  await step('walk to the lab and start sequencing', async () => {
    await page.evaluate(() => window.__epicenter.goToStation('lab', true));
    await page.waitForSelector('#console:not([hidden]) button[data-arg="sequencing"]', { timeout: 120000 });
    await page.click('button[data-act="research"][data-arg="sequencing"]');
    const active = await page.evaluate(() => window.__epicenter.game.research.active.map(r => r.id));
    if (!active.includes('sequencing')) throw new Error('sequencing did not start');
    await page.keyboard.press('Escape');
  });

  await step('time advances and events resolve', async () => {
    await page.evaluate(() => {
      const a = window.__epicenter, g = a.game;
      for (let i = 0; i < 60; i++) {
        g.advanceDay();
        while (g.pendingEvents.length) g.resolveEvent(g.pendingEvents[0].id, 0);
        a.onDayVisuals();
      }
      a.modal.reset();
    });
    const day = await page.evaluate(() => window.__epicenter.game.day);
    if (day < 60) throw new Error(`day is ${day}`);
  });

  await step('EOC console sets city measures', async () => {
    await page.evaluate(() => window.__epicenter.openStation('eoc'));
    await page.waitForSelector('#console:not([hidden])');
    await page.click('#console-body tr.clickable');
    await page.click('button[data-act="npi"][data-arg="3"]');
    const rec = await page.evaluate(() => { const a = window.__epicenter; return a.game.cities[a.consoles.city].rec; });
    if (rec !== 3) throw new Error('recommendation not applied');
    await page.click('#console-tabs button[data-tab="national"]');
    await page.click('button[data-act="eocLevel"][data-arg="1"]');
    await page.keyboard.press('Escape');
  });

  for (const st of ['lab', 'vaccine', 'press', 'director', 'office']) {
    await step(`${st} console renders every tab`, async () => {
      await page.evaluate(id => window.__epicenter.openStation(id), st);
      await page.waitForSelector('#console:not([hidden])');
      const tabs = await page.$$eval('#console-tabs button', bs => bs.map(b => b.dataset.tab));
      for (const t of tabs) await page.click(`#console-tabs button[data-tab="${t}"]`);
      await page.keyboard.press('Escape');
    });
  }

  await step('end screen shows a graded report', async () => {
    await page.evaluate(() => window.__epicenter.game.finish('timeout'));
    await page.waitForSelector('#end:not([hidden])', { timeout: 10000 });
    const grade = await page.textContent('#end-grade');
    if (!/^[A-F]\+?$/.test(grade.trim())) throw new Error(`bad grade ${grade}`);
  });

  await step('can start a new outbreak from the end screen', async () => {
    await page.click('#again-btn');
    await page.waitForSelector('#title:not([hidden])');
  });
} catch (e) {
  failed = true;
  console.error('✗', e.message);
}

if (errors.length) {
  failed = true;
  console.error('Console errors:\n' + errors.join('\n'));
}
await browser.close();
server.close();
console.log(failed ? 'E2E FAILED' : 'E2E PASSED');
process.exit(failed ? 1 : 0);
