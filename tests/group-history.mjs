// Question freshness across devices: a phone that joins hands its question history to the host,
// gets the group's history back, and remembers the clues it is shown during the game.
// Uses a local PeerJS signaling server, so it needs the `peer` package:
//   npm i --no-save peer@1 && npm run test:group-history
import {createRequire} from 'node:module';
import {createServer} from 'vite';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const {PeerServer} = require('peer');

const PEER_PORT = 9073;
const peerServer = PeerServer({port: PEER_PORT, host: '127.0.0.1', path: '/'});
Object.assign(process.env, {VITE_PEER_HOST: '127.0.0.1', VITE_PEER_PORT: String(PEER_PORT), VITE_PEER_PATH: '/', VITE_PEER_SECURE: 'false'});
const server = await createServer({server: {port: 5197, strictPort: true, host: '127.0.0.1'}, logLevel: 'error'});
await server.listen();
const browser = await chromium.launch();
const errors = [];
let failed = false;
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failed = true;
};
const KEY = 'sports_arena_question_history_v1';
const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
const base = 'http://127.0.0.1:5197/';
const room = `TEST-${Math.floor(1000 + Math.random() * 9000)}`;
const open = async (url, history) => {
  const ctx = await browser.newContext({viewport: {width: 390, height: 844}});
  if (history) await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(history)]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(url);
  return page;
};
const ids = async (page) => Object.values(JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY)) || '{}')).flat();

try {
  const host = await open(`${base}?board=2x2&room=${room}`, {[day - 2]: ['host_only_q']});
  await host.click('text=4-Choice');
  const phone = await open(`${base}?room=${room}&role=join`, {[day - 5]: ['phone_q1', 'phone_q2']});
  await phone.waitForSelector('text=/CONNECTED AS PLAYER/', {timeout: 15000});
  await host.waitForTimeout(1000);

  const hostIds = await ids(host);
  check(hostIds.includes('phone_q1') && hostIds.includes('phone_q2'), "the host saved the phone's history");
  const phoneIds = await ids(phone);
  check(phoneIds.includes('host_only_q'), "the phone got the group's history back");

  await host.click('text=ENTER THE ARENA');
  // Host plays P1: open the first tile and check both devices remember that clue.
  await host.locator('button:has-text("$")').first().click({timeout: 20000});
  await host.waitForTimeout(1500);
  const shownHost = (await ids(host)).filter((id) => !['host_only_q', 'phone_q1', 'phone_q2'].includes(id));
  const shownPhone = (await ids(phone)).filter((id) => !['host_only_q', 'phone_q1', 'phone_q2'].includes(id));
  check(shownHost.length === 1, `the host remembers the clue it showed (${shownHost.join(', ')})`);
  check(shownPhone.length === 1 && shownPhone[0] === shownHost[0], `the phone remembers the same clue (${shownPhone.join(', ')})`);
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} catch (e) {
  console.log('FAIL', e.message);
  failed = true;
} finally {
  await browser.close();
  await server.close();
  peerServer.close?.();
}
process.exit(failed ? 1 : 0);
