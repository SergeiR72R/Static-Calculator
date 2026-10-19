import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('balken.onboarded', '1'));
});

const xlsx = { name: 'acad-sample.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: readFileSync('src/import/__fixtures__/acad-sample.xlsx') };

test('AutoCAD import: beam list, switching, checked status, persistence and project file', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('xlsx-input').setInputFiles(xlsx);
  const dlg = page.getByTestId('import-dialog');
  await expect(dlg).toContainText('6 Träger');
  await expect(page.getByTestId('import-note-endSupport')).toContainText('1 ×');
  await page.getByTestId('import-confirm').click();

  const panel = page.getByTestId('batch-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('batch-progress')).toHaveText('0 von 6 geprüft');
  await expect(page.getByTestId('batch-active')).toContainText('B-001');
  await expect(page.getByTestId('beam-length')).toHaveValue('4,98');
  await expect(page.getByTestId('drawing-card').locator('img')).toBeVisible();
  // RCS with PERI check, three supports
  await expect(page.getByTestId('check-peri-RCS')).toBeVisible();

  // mark as checked, next beam, list click
  await page.getByTestId('batch-check').click();
  await expect(page.getByTestId('batch-progress')).toHaveText('1 von 6 geprüft');
  await page.getByTestId('batch-next').click();
  await expect(page.getByTestId('batch-active')).toContainText('B-002');
  await expect(page.getByTestId('batch-warnings')).toContainText('Untergrund');
  await page.getByTestId('batch-item-B-003').click();
  await expect(page.getByTestId('batch-active')).toContainText('B-003');
  await expect(page.getByTestId('batch-item-B-003')).toContainText('%');
  await expect(page.getByTestId('batch-warnings')).toContainText('1472 mm');

  // editing a checked beam → "changed after check"
  await page.getByTestId('batch-item-B-001').click();
  await page.getByTestId('beam-length').fill('5');
  await page.getByTestId('beam-length').blur();
  await expect(page.getByTestId('batch-item-B-001').getByLabel('nach Prüfung geändert')).toBeVisible();
  await expect(page.getByTestId('batch-progress')).toHaveText('0 von 6 geprüft');
  await expect(page.getByTestId('batch-check')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('batch-check').click(); // confirm again
  await expect(page.getByTestId('batch-progress')).toHaveText('1 von 6 geprüft');

  // filters
  await page.getByTestId('batch-filter-checked').click();
  await expect(page.getByTestId('batch-list').getByRole('option')).toHaveCount(1);
  await page.getByTestId('batch-filter-problems').click();
  await expect(page.getByTestId('batch-item-B-004')).toBeVisible();
  await expect(page.getByTestId('batch-item-B-003')).toHaveCount(0);
  await page.getByTestId('batch-filter-all').click();

  // reload: list, status, active beam and drawing restored
  await page.reload();
  await expect(page.getByTestId('batch-progress')).toHaveText('1 von 6 geprüft');
  await expect(page.getByTestId('batch-active')).toContainText('B-001');
  await expect(page.getByTestId('beam-length')).toHaveValue('5');
  await expect(page.getByTestId('drawing-card').locator('img')).toBeVisible();

  // save the whole list as one project file (button in the list) and open it again
  await expect(page.getByTestId('batch-save')).toContainText('Alle 6 Träger als ein Projekt speichern');
  page.once('dialog', (d) => void d.accept('Baustelle Test'));
  await page.getByTestId('batch-name').click();
  await expect(page.getByTestId('batch-name')).toContainText('Baustelle Test');
  await page.getByTestId('file-menu').click();
  await expect(page.getByTestId('menu-save')).toContainText('Trägerliste speichern (6 Träger');
  await page.keyboard.press('Escape');
  const dl = page.waitForEvent('download');
  await page.getByTestId('batch-save').click();
  const download = await dl;
  expect(download.suggestedFilename()).toBe('Baustelle_Test.json');
  const file = await download.path();
  const json = readFileSync(file!, 'utf8');
  expect(JSON.parse(json).format).toBe('balkenrechner-batch');
  await page.getByTestId('batch-item-B-005').click();
  await page.getByTestId('file-input').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await expect(page.getByTestId('batch-active')).toContainText('B-001');
  await expect(page.getByTestId('batch-progress')).toHaveText('1 von 6 geprüft');
});
