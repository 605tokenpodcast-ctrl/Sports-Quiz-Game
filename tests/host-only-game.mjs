// Plays a whole game where the host device only hosts (a laptop on the stream) and all three
// players are on phones, in a headless browser on a tiny 2x2 board. Also checks that a 4th
// phone is turned away and that a stream screen doesn't take a seat.
// Uses a local PeerJS signaling server, so it needs the `peer` package:
//   npm i --no-save peer@1 && npm run test:host-only
import {createRequire} from 'node:module';
import {createServer} from 'vite';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const {PeerServer} = require('peer');

const PEER_PORT = 9071;
const peerServer = PeerServer({port: PEER_PORT, host: '127.0.0.1', path: '/'});
Object.assign(process.env, {
  VITE_PEER_HOST: '127.0.0.1',
  VITE_PEER_PORT: String(PEER_PORT),
  VITE_PEER_PATH: '/',
  VITE_PEER_SECURE: 'false',
});
const server = await createServer({server: {port: 5198, strictPort: true, host: '127.0.0.1'}, logLevel: 'error'});
await server.listen();
const browser = await chromium.launch();
const errors = [];
let failed = false;
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failed = true;
};

const base = 'http://127.0.0.1:5198/';
const room = `TEST-${Math.floor(1000 + Math.random() * 9000)}`;
const open = async (url, viewport) => {
  // Each device gets its own context, so each has its own storage and device id.
  const ctx = await browser.newContext({viewport});
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

try {
  const host = await open(`${base}?board=2x2&room=${room}`, {width: 1280, height: 800});
  await host.click('text=4-Choice');
  await host.locator('label:has-text("This device only hosts") input').check();
  check(await host.locator('text=WAITING FOR PHONES (0/2+)').isVisible(), 'start waits for phones when the host only hosts');

  const screen = await open(`${base}?room=${room}&role=screen`, {width: 1280, height: 720});
  const phones = [];
  for (let i = 0; i < 3; i++) {
    phones.push(await open(`${base}?room=${room}&role=join`, {width: 390, height: 844}));
    await phones[i].waitForSelector('text=/CONNECTED AS PLAYER/', {timeout: 15000});
  }
  const labels = await Promise.all(phones.map((p) => p.locator('text=/CONNECTED AS PLAYER \\d/').innerText()));
  check(
    labels.join(',') === 'CONNECTED AS PLAYER 1,CONNECTED AS PLAYER 2,CONNECTED AS PLAYER 3',
    `phones take P1, P2, P3 (${labels.join(', ')})`
  );
  check(await screen.locator('text=Waiting for the host to start the game').isVisible(), 'stream screen is watching, not seated');

  const extra = await open(`${base}?room=${room}&role=join`, {width: 390, height: 844});
  await extra.waitForSelector('text=COULD NOT JOIN', {timeout: 15000});
  check(true, 'a 4th phone is turned away from the full room');

  await host.click('text=ENTER THE ARENA');
  await host.waitForTimeout(500);
  check(!(await visible(host, 'button:has-text("BUZZ IN NOW")')), 'host shows no buzz button of its own');

  const seen = new Set();
  const deadline = Date.now() + 4 * 60 * 1000;
  let turn = 0;
  while (Date.now() < deadline) {
    if (await visible(host, 'text=PLAY AGAIN')) break;
    const hostBody = await host.locator('body').innerText();
    if (hostBody.includes('BUZZ IN NOW')) seen.add('host buzz button');
    if (hostBody.includes('Your turn! Select any clue tile.')) seen.add('host told to pick');
    // The host only presses the Final's reveal once every phone locked its wager.
    if (await tap(host, 'button:has-text("LOCK IN WAGER & REVEAL CLUE")')) {
      seen.add('final revealed');
      continue;
    }
    // Looked up fresh: the page can reach this screen after the text above was read.
    if (hostBody.includes('nobody can play the Final Showdown') || (await visible(host, 'text=nobody can play the Final Showdown'))) seen.add('nobody plays the final');
    if (await tap(host, 'button:has-text("SEE FINAL RESULTS")')) continue;
    let acted = false;
    // Phones take turns acting, so different players buzz in.
    for (let k = 0; k < phones.length && !acted; k++) {
      const p = phones[(turn + k) % phones.length];
      const label = `P${((turn + k) % phones.length) + 1}`;
      if (await tap(p, '[data-go-for-two] button:has-text("Go for two")')) acted = seen.add(`${label} go for two`);
      else if (await tap(p, 'button:has-text("CONFIRM $")')) acted = seen.add(`${label} daily double`);
      else if (await tap(p, 'button:has-text("TAP TO BUZZ IN!")')) acted = seen.add(`${label} buzz`);
      else if (await tap(p, 'button.border-2.border-amber-400')) acted = seen.add(`${label} answer`);
      else if (
        (await visible(p, 'text=YOU HAVE BOARD CONTROL')) &&
        (await tap(p, 'button.border-amber-500\\/60:not([disabled])'))
      )
        acted = seen.add(`${label} pick`);
      else if (await tap(p, 'button:has-text("LOCK WAGER")')) acted = seen.add(`${label} final wager`);
      else if (!seen.has(`${label} final wager`) && (await visible(p, 'text=you sit out the Final Showdown')))
        seen.add(`${label} final wager`) && seen.add(`${label} sits out`);
      else if (await visible(p, 'button:has-text("LOCK IN ANSWER")')) {
        await tap(p, 'button:has(span:text-matches("^[A-H]$"))');
        await tap(p, 'button:has-text("LOCK IN ANSWER")');
        acted = seen.add(`${label} final answer`);
      }
    }
    turn++;
    if (!acted) await host.waitForTimeout(250);
  }

  check(await visible(host, 'text=PLAY AGAIN'), 'game reached the results screen');
  console.log(`     steps seen: ${[...seen].sort().join(', ')}`);
  check(!seen.has('host buzz button') && !seen.has('host told to pick'), 'host never offered P1 controls');
  check(seen.has('P1 pick') && seen.has('P1 answer'), 'the phone playing P1 picked tiles and answered');
  // With a random board everybody can end up broke, and then there is no Final to play.
  if (!seen.has('nobody plays the final')) {
    check(['P1', 'P2', 'P3'].every((p) => seen.has(`${p} final wager`)), 'every phone locked a Final wager or sat out');
    check(seen.has('final revealed'), 'the Final clue was revealed');
  }
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
