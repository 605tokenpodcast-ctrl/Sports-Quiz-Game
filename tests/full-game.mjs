// Plays a whole solo game against the AI in a headless browser, on a tiny 2x2 board:
// both rounds, a Daily Double, the Final Showdown and the results screen.
// Usage: npm run test:game   (needs Chromium for Playwright)
import {createRequire} from 'node:module';
import {createServer} from 'vite';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');

const server = await createServer({server: {port: 5199, strictPort: true, host: '127.0.0.1'}, logLevel: 'error'});
await server.listen();
const browser = await chromium.launch();
const errors = [];
const seen = new Set();
let failed = false;

try {
  const page = await browser.newPage({viewport: {width: 1000, height: 800}});
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto('http://127.0.0.1:5199/?board=2x2');
  await page.click('text=4-Choice');
  await page.click('text=ENTER THE ARENA');

  const visible = async (selector) => {
    const el = page.locator(selector).first();
    return (await el.count()) > 0 && (await el.isVisible()) && (await el.isEnabled());
  };
  const tap = async (selector, step) => {
    if (!(await visible(selector))) return false;
    await page.locator(selector).first().click({timeout: 2000}).catch(() => {});
    seen.add(step);
    return true;
  };

  const deadline = Date.now() + 4 * 60 * 1000;
  while (Date.now() < deadline) {
    if (await visible('text=PLAY AGAIN')) break;
    const body = await page.locator('body').innerText();
    for (const label of ['ROUND 1', 'ROUND 2', 'FINAL SHOWDOWN', 'DAILY DOUBLE']) if (body.includes(label)) seen.add(label.toLowerCase());
    if (await tap('button:has-text("LOCK IN WAGER & REVEAL CLUE")', body.includes('DAILY DOUBLE') ? 'daily double wager' : 'final wager')) continue;
    if (await tap('button:has-text("BUZZ IN NOW")', 'buzz')) continue;
    // Answer buttons, in clues and in the Final, start with a letter badge.
    const choice = 'button:has(span:text-matches("^[A-H]$"))';
    if (await visible('button:has-text("SUBMIT FINAL ANSWER")')) {
      await tap(choice, 'final choice');
      await tap('button:has-text("SUBMIT FINAL ANSWER")', 'final submit');
      continue;
    }
    // Players at $0 or below sit the Final out, so the host may just end it.
    if (await tap('button:has-text("SHOW RESULTS"), button:has-text("SEE FINAL RESULTS")', 'final submit')) continue;
    if (await tap(choice, 'answer')) continue;
    if (body.includes('Your turn! Select any clue tile.') && (await tap('button:has-text("$"):not([disabled])', 'pick tile'))) continue;
    await page.waitForTimeout(250);
  }

  const finished = await visible('text=PLAY AGAIN');
  console.log(finished ? 'ok   game reached the results screen' : 'FAIL game did not finish in 4 minutes');
  console.log(`     steps seen: ${[...seen].join(', ')}`);
  for (const step of ['round 2', 'daily double', 'buzz', 'answer', 'final wager', 'final submit']) {
    if (!seen.has(step)) console.log(`FAIL never saw: ${step}`);
  }
  if (!finished || !['round 2', 'daily double', 'buzz', 'answer', 'final wager', 'final submit'].every((s) => seen.has(s))) failed = true;
  if (errors.length) {
    failed = true;
    console.log('FAIL page errors:\n  ' + errors.join('\n  '));
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
