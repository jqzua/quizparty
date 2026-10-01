import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
for (const file of readdirSync('js').filter(f => f.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', 'js/' + file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(1);
  // Link the non-entry modules too: catches missing exports without needing a browser.
  if (file !== 'app.js') await import('../js/' + file);
}
const html = readFileSync('index.html', 'utf8');
assert.ok(!/\son[a-z]+\s*=/i.test(html), 'No inline HTML event handlers');
for (const match of html.matchAll(/(?:src|href)="((?:js|css)\/[^"?#]+)"/g)) assert.ok(existsSync(match[1]), match[1]);
console.log('Syntax, module linking and static asset references OK.');
