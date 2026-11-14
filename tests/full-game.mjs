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
  // A slow question bank: the game must not start until it's in, or Round 2 has no board.
  // It also gets results for the pick'em games (every home team wins), to test the payout.
  await page.route('**/questions/nfl.json', async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    const res = await route.fetch();
    const bank = await res.json();
    for (const g of bank.pickem?.games ?? []) bank.pickem.results[g.id] = g.home;
    await route.fulfill({response: res, json: bank});
  });
  await page.goto('http://127.0.0.1:5199/?board=2x2');
  await page.click('text=4-Choice');
  const startButton = page.locator('button:has-text("LOADING QUESTIONS")');
  await startButton.waitFor({timeout: 5000});
  if (!(await startButton.isDisabled())) {
    failed = true;
    console.log('FAIL start button works before the question bank loads');
  } else console.log('ok   start waits for the question bank');
  await page.click('text=ENTER THE ARENA', {timeout: 15000});

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
    if (body.includes('PICK-SIX')) seen.add('pick-six');
    if (body.includes('GOING FOR TWO')) seen.add('go for two follow-up');
    if (await tap('[data-go-for-two] button:has-text("Go for two")', 'go for two')) continue;
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
  if (finished) {
    const [download] = await Promise.all([page.waitForEvent('download', {timeout: 5000}).catch(() => null), page.click('[data-show-notes]')]);
    const notes = download ? await (await import('node:fs/promises')).readFile(await download.path(), 'utf8') : '';
    const ok = /^# Sports Arena Showdown/.test(notes) && notes.includes('## Final scores') && notes.includes('## Round 2') && notes.includes('## Final Showdown');
    if (process.env.DUMP_NOTES) console.log(notes);
    console.log(ok ? `ok   show notes download (${notes.split('\n- ').length - 1} clues listed)` : 'FAIL show notes did not download');
    if (!ok) failed = true;

    // Pick'em: pick every home team, lock, and the next game starts with $500 a right pick.
    await page.click('[data-open-pickem]');
    const games = await page.locator('[data-pickem] button:has-text("(home)")').count();
    for (let i = 0; i < games; i++) await page.locator('[data-pickem] button:has-text("(home)")').nth(i).click();
    await page.click('[data-pickem] button:has-text("Lock my picks")');
    const saved = await page.evaluate(() => localStorage.getItem('sports_arena_pickem_v1'));
    const pickOk = games === 3 && saved && (await page.locator('[data-pickem]').count()) === 0;
    console.log(pickOk ? 'ok   pick\'em: 3 games picked and saved' : `FAIL pick'em did not save (${games} games)`);
    await page.click('text=PLAY AGAIN');
    const banner = await page.waitForSelector('[data-pickem-payout]', {timeout: 8000}).then((el) => el.innerText()).catch(() => '');
    const paidOk = /3 of 3 right\s*\+\$1,500/.test(banner);
    console.log(paidOk ? 'ok   the next game pays the right picks (+$1,500)' : `FAIL pick'em payout: ${banner.replace(/\n/g, ' ')}`);
    if (!pickOk || !paidOk) failed = true;
  }
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
