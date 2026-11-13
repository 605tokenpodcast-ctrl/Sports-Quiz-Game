// A phone that loses its connection mid-game gets back in by itself, in the same seat, with
// the same name and score. Uses a local PeerJS signaling server, so it needs the `peer` package:
//   npm i --no-save peer@1 && npm run test:reconnect
import {createRequire} from 'node:module';
import {createServer} from 'vite';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const {PeerServer} = require('peer');

const PEER_PORT = 9072;
const peerServer = PeerServer({port: PEER_PORT, host: '127.0.0.1', path: '/'});
Object.assign(process.env, {
  VITE_PEER_HOST: '127.0.0.1',
  VITE_PEER_PORT: String(PEER_PORT),
  VITE_PEER_PATH: '/',
  VITE_PEER_SECURE: 'false',
});
const server = await createServer({server: {port: 5199, strictPort: true, host: '127.0.0.1'}, logLevel: 'error'});
await server.listen();
const browser = await chromium.launch();
const errors = [];
let failed = false;
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failed = true;
};
const base = 'http://127.0.0.1:5199/';
const room = `TEST-${Math.floor(1000 + Math.random() * 9000)}`;
const open = async (url, viewport) => {
  const ctx = await browser.newContext({viewport});
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(url);
  return page;
};

try {
  const host = await open(`${base}?board=2x2&room=${room}`, {width: 1280, height: 800});
  await host.click('text=4-Choice');
  await host.locator('label:has-text("This device only hosts") input').check();
  const phones = [];
  for (let i = 0; i < 2; i++) {
    phones.push(await open(`${base}?room=${room}&role=join`, {width: 390, height: 844}));
    await phones[i].waitForSelector('text=/CONNECTED AS PLAYER/', {timeout: 15000});
  }
  await host.click('text=ENTER THE ARENA');
  await phones[1].waitForSelector('text=YOUR BANK', {timeout: 10000});
  const seatBefore = await phones[1].locator('text=/P\\d ARENA CONTROLLER/').innerText();
  // The scoreboard shows each seat's name in capitals ("FRIEND", "FRIEND 2").
  const hostNames = async () => [...new Set((await host.locator('body').innerText()).match(/^FRIEND( \d)?$/gm))].sort().join('|');
  const namesBefore = await hostNames();

  // Cut the phone's link to the host, as a Wi-Fi blip or a locked screen would.
  await phones[1].evaluate(() => {
    for (const c of window.__p2p.connections.values()) c.close();
  });
  await phones[1].waitForSelector('text=Reconnecting to the host', {timeout: 5000}).then(
    () => check(true, 'the phone says it is reconnecting'),
    () => check(false, 'the phone says it is reconnecting')
  );
  await phones[1].waitForSelector('text=Synced with Host', {timeout: 20000}).then(
    () => check(true, 'the phone got back in by itself'),
    () => check(false, 'the phone got back in by itself')
  );
  const seatAfter = await phones[1].locator('text=/P\\d ARENA CONTROLLER/').innerText();
  check(seatAfter === seatBefore, `same seat after reconnecting (${seatBefore} -> ${seatAfter})`);
  await host.waitForTimeout(500);
  const namesAfter = await hostNames();
  check(namesAfter === namesBefore, `same names on the host (${namesBefore} -> ${namesAfter})`);
  check(!(await phones[1].locator('text=Reconnecting to the host').isVisible()), 'the reconnecting banner is gone');

  // A phone that reloads also comes back to its own seat and name.
  await phones[0].reload();
  await phones[0].waitForSelector('text=Synced with Host', {timeout: 20000});
  await host.waitForTimeout(800);
  check((await hostNames()) === namesBefore, 'a reloaded phone keeps its name');

  // The room locked when the game started: a phone the host hasn't seen has to be let in.
  const late = await open(`${base}?room=${room}&role=join`, {width: 390, height: 844});
  await late.waitForSelector('text=ASKING THE HOST', {timeout: 15000}).then(
    () => check(true, 'a new phone waits for the host once the game is on'),
    () => check(false, 'a new phone waits for the host once the game is on')
  );
  check(!(await late.locator('text=YOUR BANK').isVisible()) || (await late.locator('text=ASKING THE HOST').isVisible()), 'the waiting phone is not in the game');
  await host.waitForSelector('text=wants to join', {timeout: 5000});
  check((await hostNames()) === namesBefore, 'the waiting phone took no seat');
  await host.click('text=Turn away');
  await late.waitForSelector('text=COULD NOT JOIN', {timeout: 8000}).then(
    () => check(true, 'a phone the host turns away is told so'),
    () => check(false, 'a phone the host turns away is told so')
  );
  const friend = await open(`${base}?room=${room}&role=join`, {width: 390, height: 844});
  await host.waitForSelector('text=wants to join', {timeout: 15000});
  await host.click('text=Let in');
  await friend.waitForSelector('text=P3 ARENA CONTROLLER', {timeout: 8000}).then(
    () => check(true, 'a phone the host lets in takes the open seat'),
    () => check(false, 'a phone the host lets in takes the open seat')
  );
  check(!(await host.locator('text=wants to join').isVisible()), 'the join request is gone from the host');
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
