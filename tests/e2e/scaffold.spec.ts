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
  await expect(page.getByTestId('scaffold-bom')).toContainText('Stahlbelag UDG 25 x 200');

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
  await page.route('**/nominatim.openstreetmap.org/**', (r) =>
    r.fulfill({
      json: [
        { display_name: 'Weißenhorn, Landkreis Neu-Ulm, Bayern, Deutschland', lat: '48.3044', lon: '10.1601', address: { country_code: 'de' } },
        { display_name: 'Weißenhorn, Ortsteil, Deutschland', lat: '48.30', lon: '10.10', address: { country_code: 'de' } },
      ],
    }),
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
