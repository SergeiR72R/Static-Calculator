// Smoke test of the portable single-file build opened from disk (file://):
// wizard → project, results, 3D view, report formulas, persistence after reload, no network requests.
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';

const file = 'file://' + resolve('dist-standalone/Balkenrechner.html');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
const requests = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('request', (r) => !/^(file|data|blob):/.test(r.url()) && requests.push(r.url()));
await page.goto(file);
await page.getByTestId('wizard-next').click();
await page.getByTestId('wizard-name').fill('Standalone');
for (let i = 0; i < 4; i++) await page.getByTestId('wizard-next').click();
await page.getByTestId('wizard-create').click();
await page.getByTestId('view-3d').scrollIntoViewIfNeeded();
await page.getByTestId('beam-3d').locator('canvas').waitFor();
await page.getByTestId('main-tab-report').click();
await page.locator('.katex').first().waitFor();
await page.reload();
const name = await page.getByTestId('project-name').inputValue();
// AutoCAD Excel import works offline as well
await page.getByTestId('xlsx-input').setInputFiles(resolve('src/import/__fixtures__/acad-sample.xlsx'));
await page.getByTestId('import-confirm').click();
const active = await page.getByTestId('batch-active').textContent();
if (!active?.includes('B-001')) errors.push('import failed: ' + active);
await browser.close();
const ok = !errors.length && !requests.length && name === 'Standalone';
console.log(ok ? 'standalone OK' : 'standalone FAILED', JSON.stringify({ errors, requests, name }));
process.exit(ok ? 0 : 1);
