// The host reloads in the middle of a game and picks it back up: same room, same seats, same
// scores, and the phones find their way back by themselves.
// Uses a local PeerJS signaling server, so it needs the `peer` package:
//   npm i --no-save peer@1 && npm run test:host-reload
import {createRequire} from 'node:module';
import {createServer} from 'vite';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const {PeerServer} = require('peer');

const PEER_PORT = 9073;
const peerServer = PeerServer({port: PEER_PORT, host: '127.0.0.1', path: '/'});
Object.assign(process.env, {
  VITE_PEER_HOST: '127.0.0.1',
  VITE_PEER_PORT: String(PEER_PORT),
  VITE_PEER_PATH: '/',
  VITE_PEER_SECURE: 'false',
});
const server = await createServer({server: {port: 5197, strictPort: true, host: '127.0.0.1'}, logLevel: 'error'});
await server.listen();
const browser = await chromium.launch();
const errors = [];
let failed = false;
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failed = true;
};
const base = 'http://127.0.0.1:5197/';
const room = `TEST-${Math.floor(1000 + Math.random() * 9000)}`;
const open = async (url, viewport) => {
  const ctx = await browser.newContext({viewport});
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(url);
  return page;
};
const visible = async (page, selector) => {
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
// What a phone shows for its seat and bank: "P2 ARENA CONTROLLER" and "$400".
const seatOf = (page) => page.locator('text=/P\\d ARENA CONTROLLER/').innerText();
const bankOf = async (page) => (await page.locator('text=YOUR BANK').locator('xpath=..').innerText()).replace(/\s+/g, ' ');
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('sportsarena_saved_game') || 'null'));

try {
  // A 3x2 board with no Daily Double, so one clue can be played and tiles are left over.
  const host = await open(`${base}?board=3x2&dd=0&room=${room}`, {width: 1280, height: 800});
  await host.click('text=4-Choice');
  await host.locator('label:has-text("This device only hosts") input').check();
  const phones = [];
  for (let i = 0; i < 2; i++) {
    phones.push(await open(`${base}?room=${room}&role=join`, {width: 390, height: 844}));
    await phones[i].waitForSelector('text=/CONNECTED AS PLAYER/', {timeout: 15000});
  }
  await host.click('text=ENTER THE ARENA');
  await phones[0].waitForSelector('text=YOUR BANK', {timeout: 10000});

  // Play until that many clues are done and the board is waiting for a pick.
  const playUntil = async (count) => {
    const deadline = Date.now() + 90000;
    let game = null;
    while (Date.now() < deadline) {
      game = await saved(host);
      if (game && game.answeredClueIds.length >= count) break;
      let acted = false;
      for (const p of phones) {
        if (await tap(p, 'button:has-text("TAP TO BUZZ IN!")')) acted = true;
        else if (await tap(p, 'button.border-2.border-amber-400')) acted = true;
        else if ((await visible(p, 'text=YOU HAVE BOARD CONTROL')) && (await tap(p, 'button.border-amber-500\\/60:not([disabled])'))) acted = true;
        if (acted) break;
      }
      if (!acted) await host.waitForTimeout(250);
    }
    return game;
  };
  const game = await playUntil(2);
  check(Boolean(game && game.answeredClueIds.length >= 2), 'the host saves the game between clues');
  check(JSON.stringify(game || '').length < 400000, `the saved game is small (${JSON.stringify(game || '').length} characters)`);
  const seatsBefore = await Promise.all(phones.map(seatOf));
  const banksBefore = await Promise.all(phones.map(bankOf));
  const scoresBefore = ['player', 'player2', 'analyst'].map((id) => game.contestants[id].score).join(',');

  await host.reload();
  await host.waitForSelector('text=RESUME GAME', {timeout: 15000}).then(
    () => check(true, 'after a reload the host is offered the game in progress'),
    () => check(false, 'after a reload the host is offered the game in progress')
  );
  await host.waitForSelector('text=Phones back: 2 of 2', {timeout: 30000}).then(
    () => check(true, 'both phones found the reopened room by themselves'),
    () => check(false, 'both phones found the reopened room by themselves')
  );
  await host.click('text=RESUME GAME');
  await Promise.all(phones.map((p) => p.waitForSelector('text=YOUR BANK', {timeout: 10000})));
  await host.waitForTimeout(800);
  const seatsAfter = await Promise.all(phones.map(seatOf));
  const banksAfter = await Promise.all(phones.map(bankOf));
  check(seatsAfter.join() === seatsBefore.join(), `each phone has its own seat back (${seatsBefore.join()} -> ${seatsAfter.join()})`);
  check(banksAfter.join() === banksBefore.join(), `each phone has its score back (${banksBefore.join(' | ')} -> ${banksAfter.join(' | ')})`);
  const after = await saved(host);
  check(['player', 'player2', 'analyst'].map((id) => after.contestants[id].score).join(',') === scoresBefore, 'the scores on the host are the same');
  check(after.answeredClueIds.length === game.answeredClueIds.length, 'the tiles already played stay played');

  // The game carries on from there.
  const later = await playUntil(game.answeredClueIds.length + 1);
  check(later.answeredClueIds.length > game.answeredClueIds.length, 'the next clue is played after the restore');
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} catch (e) {
  console.log(`FAIL ${e.message}`);
  failed = true;
} finally {
  await browser.close();
  await server.close();
  peerServer.close?.();
}
process.exit(failed ? 1 : 0);
