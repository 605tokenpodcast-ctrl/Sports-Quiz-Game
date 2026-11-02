// Plays a whole solo game with Read Clues Aloud on, on a tiny 2x2 board, with a stand-in for the
// browser's voice that records what it says. Checks the category reveal, the Final reveal one
// player at a time, and that the game still reaches the results.
// Usage: npm run test:read-aloud   (needs Chromium for Playwright)
import {createRequire} from 'node:module';
import {createServer} from 'vite';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');

const server = await createServer({server: {port: 5198, strictPort: true, host: '127.0.0.1'}, logLevel: 'error'});
await server.listen();
const browser = await chromium.launch();
const errors = [];
const seen = new Set();
let failed = false;

try {
  const page = await browser.newPage({viewport: {width: 1000, height: 800}});
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(() => {
    localStorage.setItem('read_aloud', 'on');
    window.__spoken = [];
    const synth = {
      speaking: false,
      pending: false,
      paused: false,
      getVoices: () => [{name: 'Google US English', lang: 'en-US', localService: false, default: true, voiceURI: 'g'}],
      addEventListener: () => {},
      cancel: () => {},
      pause: () => {},
      resume: () => {},
      speak: (u) => {
        window.__spoken.push(u.text);
        setTimeout(() => u.onend && u.onend(new Event('end')), 30);
      },
    };
    Object.defineProperty(window, 'speechSynthesis', {value: synth, configurable: true});
    window.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
      }
    };
  });
  await page.goto('http://127.0.0.1:5198/?board=2x2');
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
    if (body.includes('Revealing the categories')) seen.add('category reveal');
    if (body.includes('Revealing the answers')) seen.add('final reveal');
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
  const spoken = (await page.evaluate(() => window.__spoken)).join(' | ');
  const said = (text, step) => {
    if (spoken.includes(text)) seen.add(step);
  };
  said("Here are today's categories", 'round 1 categories read');
  said('where the values double', 'round 2 categories read');
  said(' wrote ', 'final answers read one by one');
  const want = ['category reveal', 'round 1 categories read', 'round 2 categories read', 'final reveal', 'final answers read one by one'];
  console.log(`     steps seen: ${[...seen].join(', ')}`);
  for (const step of want) if (!seen.has(step)) console.log(`FAIL never saw: ${step}`);
  if (!finished || !want.every((s) => seen.has(s))) {
    failed = true;
    console.log('     spoken: ' + spoken.slice(0, 1500));
  }
  if (errors.length) {
    failed = true;
    console.log('FAIL page errors:\n  ' + errors.join('\n  '));
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
