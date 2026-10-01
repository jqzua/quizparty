const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const origin = 'http://localhost:8080';
fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
(async () => {
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    headless: true, args: ['--no-sandbox'],
  });
  try {
    const context = await browser.newContext();
    const errors = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.fulfill({ body: url.pathname.includes('peerjs') ? fs.readFileSync(path.join(__dirname, 'fake-peer.js'), 'utf8') : '', contentType: 'text/javascript' });
      const file = path.join(root, url.pathname === '/' ? 'index.html' : url.pathname);
      return route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript' });
    });
    async function page(url = '/') {
      const tab = await context.newPage(); tab.on('pageerror', e => errors.push(e.message));
      await tab.goto(origin + url); return tab;
    }
    const host = await page('/#%E0%A4%A');
    await host.locator('#view-home.active').waitFor();
    assert.equal(await host.locator('footer').count(), 0);
    assert.ok(!(await host.locator('meta[name=viewport]').getAttribute('content')).includes('user-scalable=no'));
    await host.locator('#home-host').click();
    await host.locator('[data-act=edit]').click();
    await host.locator('#ed-title').fill('Partida de prueba');
    await host.reload();
    assert.equal(await host.locator('#ed-title').inputValue(), 'Partida de prueba');
    await host.locator('#ed-host').click();
    await host.locator('#host-lobby.active').waitFor();
    const pin = await host.locator('#h-pin').textContent();
    const ana = await page('/#join/' + pin), luis = await page('/#join/' + pin);
    for (const [tab, name] of [[ana, 'Ana'], [luis, 'Luis']]) {
      await tab.locator('#p-name').fill(name); await tab.locator('#p-join').click();
      await tab.locator('#play-wait.active').waitFor();
    }
    await host.waitForFunction(() => document.querySelector('#h-count').textContent === '2');
    await host.locator('#h-start').click();
    await ana.locator('#play-question.active').waitFor();
    await host.evaluate(() => { const p = testPeers.find(p => !p.destroyed); p.disconnected = true; p.emit('disconnected'); });
    await host.waitForFunction(() => document.querySelector('#host-network').textContent === '');
    assert.equal(await host.locator('#host-question.active').count(), 1);
    await ana.locator('#pq-grid button').first().click();
    await ana.locator('#play-answered.active').waitFor();
    // Reload uses the tab-scoped session token and resynchronizes an already submitted answer.
    await ana.reload();
    await ana.locator('#play-answered.active').waitFor();
    assert.equal(await host.locator('#h-count').textContent(), '2');
    await luis.locator('#pq-grid button').first().click();
    await ana.locator('#play-result.active').waitFor();
    assert.equal(await ana.locator('#pr-verdict').textContent(), '¡Correcto! ✔');
    await host.locator('#hr-next').click(); await host.locator('#hb-next').click();
    await ana.locator('#play-question.active').waitFor();
    // Actual close callback and automatic retry while the question remains active.
    await ana.evaluate(() => { const p = testPeers.find(p => !p.destroyed); [...p.connections.values()][0].close(); });
    await ana.locator('#play-dropped.active').waitFor();
    await ana.locator('#play-question.active').waitFor();
    assert.ok((await ana.locator('#pq-text').textContent()).includes('color primario'));
    // Finish the remaining questions, then replay with the same phones.
    for (let i = 1; i < 5; i++) {
      await host.locator('#hq-skip').click(); await host.locator('#hr-next').click();
      if (i < 4) await host.locator('#hb-next').click();
    }
    await ana.locator('#play-end.active').waitFor();
    await host.locator('#hp-again').click();
    await ana.locator('#play-wait.active').waitFor();
    await host.locator('#h-start').click(); await ana.locator('#play-question.active').waitFor();
    await ana.evaluate(() => { const p = testPeers.find(p => !p.destroyed); [...p.connections.values()][0].close(); });
    await ana.locator('#play-dropped.active').waitFor(); await ana.locator('#play-question.active').waitFor();
    // Declining internal navigation keeps the active host room alive.
    host.once('dialog', dialog => dialog.dismiss());
    await host.evaluate(() => { location.hash = ''; });
    await host.waitForFunction(() => location.hash.startsWith('#host/'));
    assert.equal(await host.locator('#host-question.active').count(), 1);
    // Accessible labels on all visible editor fields; mobile and zoom-equivalent narrow reflow.
    const editor = await page('/#library');
    await editor.locator('[data-act=edit]').click();
    await editor.locator('#view-editor.active').waitFor();
    assert.equal(await editor.getByRole('textbox', { name: 'Título del cuestionario' }).count(), 1);
    assert.equal(await editor.getByRole('checkbox', { name: 'Marcar la respuesta 1 como correcta' }).count(), 1);
    for (const width of [390, 320]) {
      await editor.setViewportSize({ width, height: 844 });
      await editor.screenshot({ path: path.join(root, 'test-results', 'editor-' + width + '.png'), fullPage: true });
      const overflow = await editor.evaluate(() => [...document.querySelectorAll('#view-editor *')].filter(e => e.getBoundingClientRect().right > innerWidth).map(e => [e.tagName, e.className, e.getBoundingClientRect().right]));
      assert.ok(await editor.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `editor reflow ${width}: ${JSON.stringify(overflow)}`);
    }
    await editor.locator('.q-tab').nth(1).focus();
    await editor.keyboard.press('Enter');
    await editor.waitForFunction(() => document.querySelector('#ed-qlabel').textContent === 'Pregunta 2 de 5');
    assert.equal(await editor.evaluate(() => document.activeElement.dataset.i), '1');
    await editor.locator('#ed-title').focus(); await editor.keyboard.press('Tab');
    assert.notEqual(await editor.evaluate(() => document.activeElement.tagName), 'BODY');
    // Import validates before touching the library and reports errors in the UI.
    await editor.locator('#view-editor [data-route=library]').click();
    const quiz = { title: 'Importado', questions: [{ text: 'Pregunta', answers: [{ text: 'Sí', correct: true }, { text: 'No', correct: false }], time: 20, points: 'standard' }] };
    await editor.locator('#lib-file').setInputFiles({ name: 'quiz.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(quiz)) });
    await editor.getByText('Importado', { exact: true }).waitFor();
    const importHandled = new Promise(resolve => editor.once('dialog', async dialog => { const message = dialog.message(); await dialog.accept(); resolve(message); }));
    await editor.locator('#lib-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"title":"x","questions":[null]}') });
    assert.ok((await importHandled).includes('No se ha podido importar'));
    assert.equal(await editor.locator('.quiz-item').count(), 2);
    // Corrupt data remains untouched; the original and the in-memory backup are downloadable.
    const corrupt = await page();
    await corrupt.evaluate(() => localStorage.setItem('quizparty.quizzes.v1', '{broken'));
    await corrupt.reload(); await corrupt.locator('#home-host').click();
    await corrupt.locator('#storage-warning').waitFor({ state: 'visible' });
    await corrupt.locator('#lib-new').click(); await corrupt.locator('#ed-title').fill('Rescate');
    assert.equal(await corrupt.evaluate(() => localStorage.getItem('quizparty.quizzes.v1')), '{broken');
    const download = corrupt.waitForEvent('download'); await corrupt.locator('#storage-backup').click();
    assert.equal((await download).suggestedFilename(), 'quizparty-biblioteca.json');
    assert.deepEqual(errors, []);
    console.log('Browser OK: multi-player game, signaling reconnect, reload/resume, replay, navigation guard, storage recovery, labels, keyboard and mobile reflow. Transport simulated.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
