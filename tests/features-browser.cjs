const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const origin = 'http://localhost:8080';
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
const media = (kind, mime, bytes, alt) => ({ kind, src: `data:${mime};base64,${bytes.toString('base64')}`, alt });
const q = (type, answers, extra = {}) => ({ type, text: 'Pregunta ' + type, time: 90, points: 'standard', explanation: 'Explicación de ' + type, answers: answers.map((text, i) => ({ text, correct: i === 0 })), ...extra });
const fixture = {
  title: 'Laboratorio completo',
  questions: [
    q('multi', ['A', 'B', 'C'], { answers: [{ text: 'A', correct: true }, { text: 'B', correct: false }, { text: 'C', correct: true }], media: media('image', 'image/png', pixel, 'Imagen de ejemplo') }),
    q('boolean', ['Verdadero', 'Falso'], { media: media('video', 'video/webm', fs.readFileSync(path.join(__dirname, 'fixtures/clip.webm')), 'Vídeo de ejemplo: fondo morado') }),
    q('order', ['Primero', 'Segundo', 'Tercero']),
    q('written', [], { accepted: ['París'] }),
    q('poll', ['Opción A', 'Opción B'], { points: 'none' }),
  ],
};
fixture.questions[0].answers[0].media = media('audio', 'audio/wav', fs.readFileSync(path.join(__dirname, 'fixtures/tono.wav')), 'Audio de ejemplo: silencio');
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext();
    const errors = []; const failedAssets = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.fulfill({ body: url.pathname.includes('peerjs') ? fs.readFileSync(path.join(__dirname, 'fake-peer.js'), 'utf8') : '', contentType: 'text/javascript' });
      const file = path.join(root, url.pathname === '/' ? 'index.html' : url.pathname);
      if (!fs.existsSync(file)) { failedAssets.push(url.pathname); return route.fulfill({ status: 404, body: '' }); }
      return route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/javascript' });
    });
    async function tab(url = '/') { const p = await context.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.goto(origin + url); return p; }
    const host = await tab();
    assert.equal(await host.title(), 'QuizLab — cuestionarios en directo');
    assert.ok(await host.evaluate(() => getComputedStyle(document.body).backgroundImage.includes('fondoQuiz.png')));
    await host.screenshot({ path: path.join(root, 'test-results/quizlab-home.png') });
    await host.locator('#home-host').click();
    await host.locator('#lib-file').setInputFiles({ name: 'laboratorio.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
    const item = host.locator('.quiz-item').filter({ hasText: 'Laboratorio completo' }); await item.waitFor();
    await item.locator('[data-act=edit]').click(); await host.locator('#view-editor.active').waitFor();
    assert.equal(await host.locator('#ed-type').inputValue(), 'multi');
    assert.equal(await host.locator('#ed-explanation').inputValue(), 'Explicación de multi');
    // Exercise file upload, size rejection, required accessible alternative and export round trip.
    await host.locator('#ed-media summary').click();
    await host.locator('#ed-media input[type=file]').setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(1024 * 1024 + 1) });
    await host.locator('#ed-media-error').filter({ hasText: '1 MB' }).waitFor();
    await host.locator('#ed-media input[type=file]').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: pixel });
    await host.waitForFunction(() => document.querySelector('#ed-media-error').textContent === '');
    await host.locator('#ed-media summary').click();
    await host.locator('[data-media-alt=question]').fill('Imagen accesible cargada');
    const exportedEvent = host.waitForEvent('download'); await host.locator('#ed-export').click();
    const exported = JSON.parse(fs.readFileSync(await (await exportedEvent).path(), 'utf8'));
    assert.equal(exported.questions[0].media.alt, 'Imagen accesible cargada');
    assert.ok(exported.questions[1].media.src.startsWith('data:video/webm'));
    await host.locator('#ed-host').click(); await host.locator('#host-lobby.active').waitFor();
    const pin = await host.locator('#h-pin').textContent();
    await host.locator('#host-controls summary').click(); await host.locator('#hc-approve').check();
    await host.locator('#hc-capacity').fill('2'); await host.locator('#hc-capacity').press('Tab');
    async function join(name) { const p = await tab('/#join/' + pin); await p.locator('#p-name').fill(name); await p.locator('#p-join').click(); return p; }
    const ana = await join('Ana');
    await ana.locator('#play-wait .muted').filter({ hasText: 'apruebe' }).waitFor();
    await host.locator('#hc-requests [data-action=approve]').click();
    await host.waitForFunction(() => document.querySelector('#h-count').textContent === '1');
    const luis = await join('Luis'); await host.locator('#hc-requests [data-action=approve]').click();
    await host.waitForFunction(() => document.querySelector('#h-count').textContent === '2');
    const extra = await join('Extra'); await extra.locator('#pd-msg').filter({ hasText: 'aforo' }).waitFor();
    await host.locator('#hc-lock').check();
    await host.locator('#h-start').click(); await ana.locator('#play-question.active').waitFor();
    assert.equal(await ana.locator('#pq-media img').getAttribute('alt'), 'Imagen accesible cargada');
    assert.equal(await ana.locator('#pq-grid audio[controls]').count(), 1);
    await ana.waitForFunction(() => document.querySelector('#pq-media img').naturalWidth > 0 && document.querySelector('#pq-grid audio').duration > 0);
    // Reconnect is allowed while the room is locked.
    await ana.reload(); await ana.locator('#play-question.active').waitFor();
    assert.equal(await ana.locator('#pq-submit').isDisabled(), true);
    await ana.locator('[data-c="0"]').click(); await ana.locator('[data-c="2"]').click(); await ana.locator('#pq-submit').click();
    await luis.locator('[data-c="0"]').click(); await luis.locator('#pq-submit').click();
    await ana.locator('#play-result.active').waitFor();
    assert.equal(await ana.locator('#pr-verdict').textContent(), '¡Correcto! ✔');
    assert.equal(await luis.locator('#pr-verdict').textContent(), 'Incorrecto ✘');
    assert.equal(await ana.locator('#pr-explanation').textContent(), 'Explicación de multi');
    async function next() { await host.locator('#hr-next').click(); await host.locator('#hb-next').click(); await ana.locator('#play-question.active').waitFor(); }
    await next(); assert.equal(await ana.locator('#pq-media video[controls]').count(), 1);
    await ana.waitForFunction(() => document.querySelector('#pq-media video').duration > 0);
    await ana.locator('[data-c="0"]').click(); await luis.locator('[data-c="1"]').click(); await ana.locator('#play-result.active').waitFor();
    await next();
    async function order(p, desired) {
      for (let target = 0; target < desired.length; target++) {
        const current = (await p.locator('.order-text').allTextContents()).map(text => text.replace(/^\d+\. /, ''));
        let index = current.indexOf(desired[target]);
        while (index > target) { await p.locator(`#pq-order [data-index="${index}"][data-move="-1"]`).click(); index--; }
      }
      await p.locator('#pq-submit').click();
    }
    await order(ana, ['Primero', 'Segundo', 'Tercero']); await order(luis, ['Tercero', 'Segundo', 'Primero']);
    await ana.locator('#play-result.active').waitFor(); assert.equal(await ana.locator('#pr-verdict').textContent(), '¡Correcto! ✔');
    await next();
    assert.equal(await ana.locator('#pq-submit').isDisabled(), true);
    await ana.locator('#pq-input').fill('  PARÍS  '); await ana.locator('#pq-submit').click();
    // Moderate from the question screen; the removed participant remains in the report.
    host.once('dialog', dialog => dialog.accept()); await host.getByRole('button', { name: 'Expulsar a Luis', exact: true }).filter({ visible: true }).click();
    await luis.locator('#play-dropped.active').waitFor(); await ana.locator('#play-result.active').waitFor();
    assert.equal(await ana.locator('#pr-verdict').textContent(), '¡Correcto! ✔');
    const pointsBefore = await ana.locator('#pr-streak').textContent();
    await next(); await ana.locator('[data-c="1"]').click(); await ana.locator('#play-result.active').waitFor();
    assert.equal(await ana.locator('#pr-verdict').textContent(), 'Opinión registrada');
    assert.equal(await ana.locator('#pr-points').textContent(), 'Sin puntos');
    assert.equal(await ana.locator('#pr-streak').textContent(), pointsBefore);
    await host.locator('#hr-next').click(); await host.locator('#hp-report').waitFor({ state: 'visible' });
    assert.ok((await host.locator('#hp-report').textContent()).includes('Luis'));
    const csvEvent = host.waitForEvent('download'); await host.locator('#hp-csv').click();
    const csv = fs.readFileSync(await (await csvEvent).path(), 'utf8');
    assert.ok(csv.includes('Resumen por participante')); assert.ok(csv.includes('Explicación de written')); assert.ok(csv.includes('No evaluable'));
    const history = await tab('/#reports'); await history.locator('#reports-list .report').waitFor();
    assert.ok((await history.locator('#reports-list').textContent()).includes('Laboratorio completo'));
    const historyData = await history.evaluate(() => JSON.parse(localStorage.getItem('quizlab.reports.v1')).reports[0]);
    assert.equal(historyData.questions.length, 5); assert.equal(historyData.complete, true);
    assert.equal(historyData.participants.find(p => p.name === 'Ana').graded, 4);
    for (const width of [390, 320]) { await host.setViewportSize({ width, height: 844 }); assert.ok(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'host report reflow'); }
    await host.screenshot({ path: path.join(root, 'test-results/quizlab-report-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []); assert.deepEqual(failedAssets, []);
    console.log('Features browser OK: original background, typed questions, media upload/alternatives/limits, approval/capacity/lock/resume/kick, reports, CSV and local history. Transport simulated.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
