// Opens the host's board (short and full game) at phone sizes, upright and sideways, and checks
// that nothing spills off screen, the podiums don't cover any tile, and tiles aren't towers.
// Usage: npm run test:phone-fit   (needs Chromium for Playwright; pass a folder to save screenshots)
import {createRequire} from 'node:module';
import {createServer} from 'vite';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const outDir = process.argv[2];

const server = await createServer({server: {port: 5198, strictPort: true, host: '127.0.0.1'}, logLevel: 'error'});
await server.listen();
const browser = await chromium.launch();
let failed = false;
const sizes = [
  {name: 'iphone-se', width: 375, height: 667},
  {name: 'iphone-15', width: 393, height: 852},
  {name: 'android-small', width: 360, height: 740},
  {name: 'iphone-landscape', width: 852, height: 393},
  {name: 'android-landscape', width: 740, height: 360},
];
try {
  for (const size of sizes) {
    for (const mode of ['SHORT', 'FULL']) {
      const page = await browser.newPage({viewport: {width: size.width, height: size.height}, isMobile: size.width < size.height, hasTouch: true});
      page.on('dialog', (d) => d.accept());
      await page.goto('http://127.0.0.1:5198/');
      await page.click('text=4-Choice');
      if (mode === 'SHORT') await page.click('text=Short Game');
      if (outDir) await page.screenshot({path: `${outDir}/${size.name}-menu.png`});
      await page.click('text=ENTER THE ARENA', {timeout: 15000});
      await page.waitForSelector('text=Board Control', {timeout: 15000});
      await page.waitForTimeout(6500); // category reveal
      if (outDir) await page.screenshot({path: `${outDir}/${size.name}-${mode.toLowerCase()}.png`});
      // Every tile and header must be fully on screen, and no text may be cut off.
      const problems = await page.evaluate(() => {
        const out = [];
        const vw = innerWidth, vh = innerHeight;
        document.querySelectorAll('header button, main button, main span').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) return;
          if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) out.push(`off screen: "${el.textContent.trim().slice(0, 30)}"`);
          if (el.tagName === 'SPAN' && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible' && getComputedStyle(el).textOverflow !== 'ellipsis') out.push(`clipped: "${el.textContent.trim().slice(0, 30)}"`);
        });
        // Board tiles must not be covered (by the podiums) and must not be towers on an upright phone.
        document.querySelectorAll('main button').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (!el.textContent.includes('$')) return;
          const hit = document.elementFromPoint(r.left + r.width / 2, r.bottom - 3);
          if (hit && !el.contains(hit)) out.push(`covered: "${el.textContent.trim()}"`);
          if (r.height > 130) out.push(`tile too tall (${Math.round(r.height)}px)`);
          if (r.height < 24) out.push(`tile too short (${Math.round(r.height)}px)`);
        });
        return [...new Set(out)];
      });
      console.log(`${problems.length ? 'FAIL' : 'ok  '} ${size.name} ${mode}${problems.length ? '\n     ' + problems.slice(0, 8).join('\n     ') : ''}`);
      if (problems.length) failed = true;
      await page.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
