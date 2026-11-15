/*
 * UI smoke test against the browser mock (run: node ui.check.js). Needs Playwright with
 * Chromium available; it is separate from `npm test` so the main checks stay dependency-light.
 */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 380, height: 700 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.join(__dirname, '../extension/index.html'));
  const step = async (name, fn) => { await fn(); console.log('  ok   ' + name); };
  const toast = async () => (await page.locator('.toast .toast-title').last().textContent());

  await step('every page renders', async () => {
    const ids = await page.evaluate(() => window.SP.pages.map((p) => p.id));
    assert.strictEqual(ids.length, 10);
    for (const id of ids) {
      await page.evaluate((i) => window.SP.go(i), id);
      assert.ok(await page.locator(`.page[data-page="${id}"]`).isVisible(), id);
    }
    await page.evaluate(() => window.SP.go('home'));
  });

  await step('clicking a tile runs the action and offers Undo', async () => {
    await page.locator('.tile-main', { hasText: 'Precompose each' }).click();
    await page.waitForSelector('.toast');
    assert.strictEqual(await toast(), '3 precomps created');
    assert.ok(await page.locator('.toast .btn', { hasText: 'Undo' }).isVisible());
  });

  await step('tile options open, persist and reach the host call', async () => {
    await page.evaluate(() => { window.__calls = []; const orig = window.SP.mock; window.SP.mock = (n, a) => { window.__calls.push([n, a]); return orig(n, a); }; });
    await page.locator('.tile', { hasText: 'Un-precompose' }).locator('.tile-more').click();
    await page.locator('.tile', { hasText: 'Un-precompose' }).locator('.switch').click();
    await page.waitForTimeout(1000);
    await page.locator('.tile-main', { hasText: 'Un-precompose' }).click();
    await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'comps.unprecompose'));
    const call = await page.evaluate(() => window.__calls.find((c) => c[0] === 'comps.unprecompose'));
    assert.strictEqual(call[1].keepOriginal, true);
  });

  await step('typing anywhere searches effects; Enter applies the best hit', async () => {
    await page.waitForTimeout(1000);
    await page.locator('.page-title').click();
    await page.keyboard.type('gau');
    await page.waitForSelector('.pal-item');
    assert.strictEqual(await page.locator('.pal-item[aria-selected="true"] .pal-name').textContent(), 'Gaussian Blur');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'fx.apply'));
    const call = await page.evaluate(() => window.__calls.find((c) => c[0] === 'fx.apply'));
    assert.strictEqual(call[1].matchName, 'ADBE Gaussian Blur 2');
    assert.strictEqual(call[1].adjustment, false);
    assert.ok(await page.locator('.palette').isHidden());
  });

  await step('search finds actions by keyword and initials, Escape closes', async () => {
    await page.waitForTimeout(1000);
    await page.keyboard.press('Control+k');
    await page.keyboard.type('decompose');
    assert.strictEqual(await page.locator('.pal-item[aria-selected="true"] .pal-name').textContent(), 'Un-precompose');
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('.palette').isHidden());
    await page.keyboard.press('Control+k');
    await page.keyboard.type('gb');
    assert.strictEqual(await page.locator('.pal-item[aria-selected="true"] .pal-name').textContent(), 'Gaussian Blur');
    await page.keyboard.press('Escape');
  });

  await step('dragging an ease handle updates the curve values 1:1', async () => {
    await page.evaluate(() => window.SP.go('ease'));
    const before = await page.locator('.curve-values input').nth(0).inputValue();
    const hit = page.locator('.curve .handle').first();
    const box = await hit.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 4 });
    await page.mouse.up();
    const after = await page.locator('.curve-values input').nth(0).inputValue();
    assert.ok(Number(after) > Number(before), `${before} -> ${after}`);
    await page.locator('.chip', { hasText: 'Overshoot' }).click();
    assert.strictEqual(await page.locator('.curve-values input').nth(1).inputValue(), '1.56');
    await page.waitForTimeout(900);
    await page.locator('.btn', { hasText: 'Apply to keyframes' }).click();
    await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'ease.apply'));
  });

  await step('captions: an imported SRT is chunked and sent to the host', async () => {
    await page.evaluate(() => window.SP.go('captions'));
    await page.waitForTimeout(900);
    await page.setInputFiles('input[type=file]', { name: 'a.srt', mimeType: 'text/plain', buffer: Buffer.from('1\n00:00:00,000 --> 00:00:03,000\nhello there this is a longer subtitle line\n') });
    await page.waitForFunction(() => !document.querySelector('.btn.primary.block').disabled);
    await page.locator('.btn', { hasText: 'Build captions' }).click();
    await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'captions.build'));
    const call = await page.evaluate(() => window.__calls.find((c) => c[0] === 'captions.build'));
    assert.strictEqual(call[1].cues.length, 2);
    assert.strictEqual(call[1].cues[0].text, 'HELLO THERE\nTHIS IS');   // wrapped into two balanced lines
    assert.strictEqual(call[1].style.anim, 'pop');
  });

  await step('no console or page errors', async () => {
    assert.deepStrictEqual(errors, []);
  });

  await browser.close();
  console.log('\nUI checks passed');
})().catch((e) => { console.error('\nFAIL ' + e.message); process.exit(1); });
