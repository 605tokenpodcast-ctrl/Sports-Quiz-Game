// The stream extras in a headless browser: phone emoji reactions floating up on the stream
// screen and the scoreboard strip (&view=strip), which shows the scores and stays quiet, so
// the host keeps reading clues aloud.
// Needs the `peer` package: npm i --no-save peer@1 && npm run test:stream-extras
import {createRequire} from 'node:module';
import {createServer} from 'vite';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const {PeerServer} = require('peer');

const PEER_PORT = 9074;
const peerServer = PeerServer({port: PEER_PORT, host: '127.0.0.1', path: '/'});
Object.assign(process.env, {VITE_PEER_HOST: '127.0.0.1', VITE_PEER_PORT: String(PEER_PORT), VITE_PEER_PATH: '/', VITE_PEER_SECURE: 'false'});
const server = await createServer({server: {port: 5201, strictPort: true, host: '127.0.0.1'}, logLevel: 'error'});
await server.listen();
const browser = await chromium.launch();
const errors = [];
let failed = false;
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failed = true;
};
const base = 'http://127.0.0.1:5201/';
const room = `TEST-${Math.floor(1000 + Math.random() * 9000)}`;
const open = async (url, viewport) => {
  const ctx = await browser.newContext({viewport});
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  return page;
};

try {
  const host = await open(`${base}?board=2x2&room=${room}`, {width: 1280, height: 800});
  await host.click('text=4-Choice');
  const screen = await open(`${base}?room=${room}&role=screen`, {width: 1280, height: 720});
  const strip = await open(`${base}?room=${room}&role=screen&view=strip&bg=transparent`, {width: 1280, height: 720});
  const phone = await open(`${base}?room=${room}&role=join`, {width: 390, height: 844});
  await phone.waitForSelector('text=/CONNECTED AS PLAYER/', {timeout: 15000});
  await host.waitForTimeout(1000);

  // Pre-show check: the phone is listed with its ping, and the strip doesn't count as a stream screen.
  await host.click('text=Pre-show check');
  await host.waitForTimeout(6500); // a heartbeat or two, so the ping is measured
  const level = (title) => host.locator(`[data-check="${title}"]`).first().getAttribute('data-level');
  const checkText = await host.locator('[aria-label="Pre-show check"]').innerText();
  check((await level('Questions')) === 'good', 'pre-show check: the questions are loaded and fresh');
  check(/\d+ ms/.test(checkText), `pre-show check: the phone shows its ping (${checkText.match(/P\d[^\n]*ms/)?.[0] ?? 'none'})`);
  check(/1 connected/.test(checkText), 'pre-show check: one stream screen (the quiet strip is not counted)');
  await host.click('[aria-label="Pre-show check"] >> text=Done');
  await host.locator('button:has-text("ENTER THE ARENA")').click({timeout: 20000});
  await phone.waitForSelector('[aria-label="Reactions"]', {timeout: 20000});
  check(await strip.locator('[data-view="strip"]').isVisible(), 'the strip view shows only the strip');
  check(!(await strip.locator('text=Stream Screen').count()), 'the strip has no click-to-start sound screen');
  const seats = await strip.locator('[data-seat]').count();
  check(seats === 3, `the strip lists every player (${seats})`);
  const stripText = await strip.locator('[data-view="strip"]').innerText();
  check(/\$0/.test(stripText) && /Round 1/i.test(stripText), 'the strip shows the round and the scores');
  const bg = await strip.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent', `the strip page is see-through (${bg})`);

  // A phone reacts: the emoji floats up on the stream screen and the strip, and a burst is limited.
  await screen.click('body');
  for (let i = 0; i < 4; i++) await phone.click('button[aria-label="React 🔥"]');
  await screen.waitForSelector('[data-reaction="🔥"]', {timeout: 5000});
  check(true, 'a phone reaction floats up on the stream screen');
  await strip.waitForSelector('[data-reaction="🔥"]', {timeout: 5000});
  check(true, 'and on the scoreboard strip');
  const burst = await screen.locator('[data-reaction]').count();
  check(burst === 1, `four quick taps send one reaction (${burst})`);
  await screen.waitForTimeout(3000);
  check((await screen.locator('[data-reaction]').count()) === 0, 'the reaction fades away');
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
