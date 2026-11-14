// Category draft: each round deals extra columns and the players (host, a phone and an AI) take
// turns striking them until the normal board is left, in Round 1 and again in Round 2.
// Uses a local PeerJS signaling server, so it needs the `peer` package:
//   npm i --no-save peer@1 && npm run test:draft
import {createRequire} from 'node:module';
import {createServer} from 'vite';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const {PeerServer} = require('peer');

const PEER_PORT = 9074;
const peerServer = PeerServer({port: PEER_PORT, host: '127.0.0.1', path: '/'});
Object.assign(process.env, {
  VITE_PEER_HOST: '127.0.0.1',
  VITE_PEER_PORT: String(PEER_PORT),
  VITE_PEER_PATH: '/',
  VITE_PEER_SECURE: 'false',
});
const server = await createServer({server: {port: 5196, strictPort: true, host: '127.0.0.1'}, logLevel: 'error'});
await server.listen();
const browser = await chromium.launch();
const errors = [];
let failed = false;
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failed = true;
};

const base = 'http://127.0.0.1:5196/';
const room = `TEST-${Math.floor(1000 + Math.random() * 9000)}`;
const open = async (url, viewport) => {
  // Each device gets its own context, so each has its own storage and device id.
  const ctx = await browser.newContext({viewport});
  await ctx.addInitScript(() => localStorage.setItem('category_draft', 'on'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(url);
  return page;
};
const visible = async (page, selector) => {
  // Phones re-render several times a second, so an element can vanish between checks.
  const el = page.locator(selector).first();
  try {
    return (await el.count()) > 0 && (await el.isVisible()) && (await el.isEnabled({timeout: 500}));
  } catch {
    return false;
  }
};
const tap = async (page, selector) => {
  if (!(await visible(page, selector))) return false;
  await page.locator(selector).first().click({timeout: 2000}).catch(() => {});
  return true;
};


const strikeRound = async (host, phone, round) => {
  await host.waitForSelector(`[data-draft="${round}"]`, {timeout: 20000});
  const columns = await host.locator('[data-draft-column]').count();
  const onPhone = await phone.locator(`[data-draft="${round}"]`).count();
  const struckBy = new Set();
  const turns = new Set();
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && (await host.locator('[data-draft]').count())) {
    for (const t of await host.locator('[data-draft-turn]').evaluateAll((els) => els.map((e) => e.dataset.draftTurn))) turns.add(t);
    for (const t of await host.locator('[data-draft-column="struck"]').allInnerTexts()) struckBy.add(t.split('struck by ')[1]);
    if (!(await tap(host, '[data-draft-column="open"]:not([disabled])'))) await tap(phone, '[data-draft-column="open"]:not([disabled])');
    await host.waitForTimeout(200);
  }
  return {columns, onPhone, struckBy: [...struckBy].filter(Boolean), turns: [...turns].sort().join(',')};
};

try {
  const host = await open(`${base}?board=2x2&room=${room}`, {width: 1280, height: 800});
  await host.click('text=4-Choice');
  const phone = await open(`${base}?room=${room}&role=join`, {width: 390, height: 844});
  await phone.waitForSelector('text=/CONNECTED AS PLAYER/', {timeout: 15000});
  check((await host.locator('[data-category-draft="on"]').count()) === 1, 'the start screen shows the draft is on');
  await host.click('text=ENTER THE ARENA');

  const r1 = await strikeRound(host, phone, 'ROUND_1');
  check(r1.columns === 5, `Round 1 deals 5 columns for a 2-column board (${r1.columns})`);
  check(r1.onPhone === 1, 'the phone shows the draft too');
  check(r1.turns === 'analyst,player,player2' && r1.struckBy.length >= 2, `host, phone and AI each had a turn (${r1.turns}; struck by ${r1.struckBy.join(', ')})`);
  check(!(await host.locator('[data-draft]').count()), 'the draft closes once 3 are struck');

  // Play Round 1 until Round 2's draft opens.
  const deadline = Date.now() + 3 * 60 * 1000;
  while (Date.now() < deadline && !(await host.locator('[data-draft="CHAMPIONSHIP"]').count())) {
    if (await visible(host, 'text=PLAY AGAIN')) break;
    for (const p of [host, phone]) {
      await tap(p, '[data-go-for-two] button:has-text("Take the points")');
      await tap(p, 'button:has-text("LOCK IN WAGER & REVEAL CLUE")');
      await tap(p, 'button:has-text("CONFIRM $")');
      await tap(p, 'button:has-text("BUZZ IN NOW")');
      await tap(p, 'button:has-text("TAP TO BUZZ IN!")');
      await tap(p, 'button:has(span:text-matches("^[A-H]$"))');
      await tap(p, 'button.border-2.border-amber-400');
      if (await visible(host, 'text=Your turn! Select any clue tile.')) await tap(host, 'button:has-text("$"):not([disabled])');
      if (await visible(phone, 'text=YOU HAVE BOARD CONTROL')) await tap(phone, 'button.border-amber-500\\/60:not([disabled])');
    }
    await host.waitForTimeout(200);
  }
  if (!(await host.locator('[data-draft="CHAMPIONSHIP"]').count())) console.log('     host shows: ' + (await host.locator('body').innerText()).slice(0, 600).replace(/\n+/g, ' | '));
  const r2 = await strikeRound(host, phone, 'CHAMPIONSHIP');
  check(r2.columns === 5 && r2.turns === 'analyst,player,player2', `Round 2 has its own draft (${r2.columns} columns, turns ${r2.turns})`);
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} catch (e) {
  console.log(`FAIL ${e.message}`);
  failed = true;
} finally {
  await browser.close();
  await server.close();
  peerServer.close?.();
  process.exit(failed ? 1 : 0);
}
