// Dev helper: screenshot the panel in a browser (mock host). Usage: node shot.js <page> [width] [height] [out]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [page = 'home', width = '380', height = '680', out] = process.argv.slice(2);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: +width, height: +height }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await p.goto('file://' + path.join(__dirname, '../extension/index.html'));
  await p.evaluate((id) => window.SP.go(id), page);
  await p.waitForTimeout(700);
  const file = out || path.join(__dirname, '.out', `${page}-${width}.png`);
  require('fs').mkdirSync(path.dirname(file), { recursive: true });
  await p.screenshot({ path: file });
  console.log(file, errors.length ? '\n' + errors.join('\n') : '(no errors)');
  await browser.close();
})();
