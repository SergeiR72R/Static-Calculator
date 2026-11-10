import { expect, test } from '@playwright/test';
import { periDxf, towerParts } from '../../src/scaffold/testDxf';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('balken.onboarded', '1');
    localStorage.setItem('balken.lang', 'ru');
  });
});

test('scaffold mode: PERI CAD DXF → 3D, girders, parts list → girder in the beam calculator and back', async ({ page }) => {
  await page.goto('/');
  // separate mode, reachable from the header
  await page.getByTestId('mode-scaffold').click();
  await expect(page.getByTestId('scaffold-welcome')).toBeVisible();
  await expect(page.getByTestId('new-project')).toHaveCount(0);

  // a shifted ledger is snapped into place
  const parts = towerParts();
  const uh = parts.find((p) => p.art === 'UH')!;
  uh.t = [uh.t[0] + 0.02, uh.t[1], uh.t[2] - 0.015];
  await page.getByTestId('scaffold-file').setInputFiles({ name: 'tower.dxf', mimeType: 'application/dxf', buffer: Buffer.from(periDxf(parts)) });
  await expect(page.getByTestId('scaffold-app')).toBeVisible();
  await expect(page.getByTestId('scaffold-summary')).toContainText(`${parts.length} деталей`);
  await expect(page.getByTestId('scaffold-3d').locator('canvas')).toBeVisible();
  await expect(page.getByTestId('scaffold-issue-healed')).toContainText('1 деталей');
  await expect(page.getByTestId('scaffold-issue-noDiagonals')).toBeVisible();
  // the parts list is only in the report, not on the page
  await expect(page.getByTestId('scaffold-bom')).toHaveCount(0);
  // a note highlights its parts (the others grey); the highlighting is cleared again
  await expect(page.getByTestId('scaffold-clear-selection')).toHaveCount(0);
  await page.getByTestId('scaffold-issue-healed').click();
  await expect(page.getByTestId('scaffold-issue-healed')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('scaffold-clear-selection').first()).toContainText('(1)');
  await page.getByTestId('scaffold-clear-selection').first().click();
  await expect(page.getByTestId('scaffold-clear-selection')).toHaveCount(0);
  await expect(page.getByTestId('scaffold-issue-healed')).toHaveAttribute('aria-pressed', 'false');

  // girders with result
  await expect(page.getByTestId('scaffold-girder-T1')).toContainText('ULS Flex 50 + 150 + 150 + 50');
  await expect(page.getByTestId('scaffold-girder-T2')).toContainText('4,00 m');
  const eta = Number((await page.getByTestId('scaffold-girder-eta-T1').innerText()).replace(/[^\d]/g, ''));
  expect(eta).toBeGreaterThan(30);
  expect(eta).toBeLessThan(80);
  // higher load class → higher utilisation
  await page.getByTestId('scaffold-load-class').selectOption('6');
  await expect
    .poll(async () => Number((await page.getByTestId('scaffold-girder-eta-T1').innerText()).replace(/[^\d]/g, '')))
    .toBeGreaterThan(eta);
  await page.getByTestId('scaffold-load-class').selectOption('3');

  // open in the beam calculator: beam list with both girders
  page.on('dialog', (d) => d.accept());
  await page.getByTestId('scaffold-girder-open-T2').click();
  await expect(page.getByTestId('batch-panel')).toBeVisible();
  await expect(page.getByTestId('batch-active')).toContainText('T2');
  await expect(page.getByTestId('batch-item-T1')).toBeVisible();
  await expect(page.getByTestId('lattice-card')).toBeVisible();

  // and back to the scaffold; the drawing is still there after a reload
  await page.getByTestId('batch-back-scaffold').click();
  await expect(page.getByTestId('scaffold-app')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('scaffold-girder-T1')).toBeVisible();
  // same drawing and options: the beam list is reused without asking
  await page.getByTestId('scaffold-girder-open-T1').click();
  await expect(page.getByTestId('batch-active')).toContainText('T1');
});

test('scaffold mode: a DWG is rejected with the hint to save as DXF', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-scaffold').click();
  await page.getByTestId('scaffold-file').setInputFiles({ name: 'plan.dwg', mimeType: 'application/acad', buffer: Buffer.from('AC1032....') });
  await expect(page.getByTestId('toast')).toContainText('DXF');
  await expect(page.getByTestId('scaffold-welcome')).toBeVisible();
});

test('scaffold mode: site found by name, confirmed on the map; indoors without wind, snow and ice', async ({ page }) => {
  await page.route('**/nominatim.openstreetmap.org/search**', (r) =>
    r.fulfill({
      json: [
        { display_name: 'Weißenhorn, Landkreis Neu-Ulm, Bayern, Deutschland', lat: '48.3044', lon: '10.1601', address: { country_code: 'de' } },
        { display_name: 'Weißenhorn, Ortsteil, Deutschland', lat: '48.30', lon: '10.10', address: { country_code: 'de' } },
      ],
    }),
  );
  // administrative units in German for the wind zone table
  await page.route('**/nominatim.openstreetmap.org/reverse**', (r) =>
    r.fulfill({ json: { display_name: 'Weißenhorn, Landkreis Neu-Ulm, Bayern, Deutschland', address: { country_code: 'de', state: 'Bayern', county: 'Landkreis Neu-Ulm', town: 'Weißenhorn' } } }),
  );
  await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: { elevation: [504] } }));
  await page.route('**/tile.openstreetmap.org/**', (r) => r.abort());
  await page.goto('/');
  await page.getByTestId('mode-scaffold').click();
  await page.getByTestId('scaffold-file').setInputFiles({ name: 'tower.dxf', mimeType: 'application/dxf', buffer: Buffer.from(periDxf(towerParts())) });
  await expect(page.getByTestId('scaffold-site')).toContainText('Место не задано');
  await page.getByTestId('site-open').click();
  await page.getByTestId('site-query').fill('Weißenhorn');
  await page.getByTestId('site-search').click();
  await expect(page.getByTestId('site-pick')).toContainText('Landkreis Neu-Ulm');
  await expect(page.getByTestId('site-map')).toBeVisible();
  await expect(page.getByTestId('site-results')).toBeVisible();
  await expect(page.getByTestId('site-elevation')).toHaveValue('504');
  await page.getByTestId('site-confirm').click();
  await expect(page.getByTestId('site-summary')).toContainText('Weißenhorn');
  await expect(page.getByTestId('site-summary')).toContainText('Место подтверждено');
  await expect(page.getByTestId('site-summary')).toContainText('504 m');
  // wind zone from the table of the administrative districts, peak velocity pressure for the height of the scaffold
  await expect(page.getByTestId('wind-zone')).toContainText('зона 2');
  await expect(page.getByTestId('site-wind')).toContainText('Neu-Ulm');
  await expect(page.getByTestId('wind-check')).toHaveCount(0);
  await expect(page.getByTestId('wind-result')).toContainText('0,65');
  await page.getByTestId('wind-zone').selectOption('4');
  await expect(page.getByTestId('wind-result')).toContainText('0,95');
  await page.getByTestId('wind-zone').selectOption('0');
  await page.getByTestId('site-snow').check();
  // kept after a reload
  await page.reload();
  await expect(page.getByTestId('site-summary')).toContainText('Weißenhorn');
  await expect(page.getByTestId('site-snow')).toBeChecked();
  await page.getByTestId('site-indoor').click();
  await expect(page.getByTestId('scaffold-site')).toContainText('ветер, снег и обледенение не учитываются');
  await expect(page.getByTestId('site-snow')).toHaveCount(0);
});

test('scaffold mode: without internet the site can be entered by coordinates', async ({ page }) => {
  await page.route('**/nominatim.openstreetmap.org/**', (r) => r.abort());
  await page.route('**/api.open-meteo.com/**', (r) => r.abort());
  await page.route('**/tile.openstreetmap.org/**', (r) => r.abort());
  await page.goto('/');
  await page.getByTestId('mode-scaffold').click();
  await page.getByTestId('scaffold-file').setInputFiles({ name: 'tower.dxf', mimeType: 'application/dxf', buffer: Buffer.from(periDxf(towerParts())) });
  await page.getByTestId('site-open').click();
  await page.getByTestId('site-query').fill('Ulm');
  await page.getByTestId('site-search').click();
  await page.getByTestId('site-manual').click();
  await page.getByTestId('site-lat').fill('48,4');
  await page.getByTestId('site-lon').fill('9,99');
  await page.getByTestId('site-elevation').fill('480');
  await page.getByTestId('site-confirm').click();
  await expect(page.getByTestId('site-summary')).toContainText('48,4000°, 9,9900°');
});

test('scaffold mode: space frame analysis with results in tables and in 3D', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-scaffold').click();
  await page.getByTestId('scaffold-file').setInputFiles({ name: 'tower.dxf', mimeType: 'application/dxf', buffer: Buffer.from(periDxf(towerParts())) });
  await expect(page.getByTestId('scaffold-calc')).toBeVisible();
  await page.getByTestId('scaffold-calc-run').click();
  await expect(page.getByTestId('scaffold-calc-result')).toBeVisible({ timeout: 20_000 });
  // the progress bars of opening and of the analysis are gone when done
  await expect(page.getByTestId('scaffold-calc-progress')).toHaveCount(0);
  await expect(page.getByTestId('scaffold-load-progress')).toHaveCount(0);
  const eta = Number((await page.getByTestId('scaffold-calc-max').innerText()).replace(/[^\d]/g, ''));
  expect(eta).toBeGreaterThan(10);
  // four working combinations, checks of nodes and standards, bases
  await expect(page.getByTestId('scaffold-calc-result')).toContainText('A +x');
  await expect(page.getByTestId('scaffold-calc-result')).toContainText('A −y');
  await expect(page.getByTestId('scaffold-calc-filter-conn')).toBeVisible();
  await expect(page.getByTestId('scaffold-calc-filter-buckling')).toBeVisible();
  await expect(page.getByTestId('scaffold-calc-bases')).toContainText('Опоры стоек: 6');
  await expect(page.getByTestId('scaffold-color-eta')).toBeVisible();
  // a row selects its part
  await page.getByTestId('scaffold-calc-row').click();
  await expect(page.getByTestId('scaffold-selected')).toBeVisible();
  // changed input marks the results as out of date; maximum wind adds the out-of-service combinations
  await page.getByTestId('wind-manual').check();
  await page.getByTestId('wind-qmax').fill('0,8');
  await expect(page.getByTestId('scaffold-calc-result')).toContainText('результаты устарели');
  await page.getByTestId('scaffold-calc-run').click();
  await expect(page.getByTestId('scaffold-calc-result')).toContainText('R +x', { timeout: 20_000 });
  await expect(page.getByTestId('scaffold-calc-result')).not.toContainText('результаты устарели');
  // print report: conditions, results and the specification with weights
  await page.emulateMedia({ media: 'print' });
  await page.evaluate("window.dispatchEvent(new Event('beforeprint'))");
  const report = page.getByTestId('scaffold-report');
  await expect(report).toBeVisible();
  await expect(report).toContainText('Расчёт лесов PERI UP Flex');
  await expect(report).toContainText('max η');
  await expect(report).toContainText('R +x');
  await expect(page.getByTestId('scaffold-report-bom')).toContainText('Vertikalstiel UVR 200');
  await expect(page.getByTestId('scaffold-report-bom')).toContainText('Итого');
  await page.evaluate("window.dispatchEvent(new Event('afterprint'))");
  await expect(report).toHaveCount(0);
});
