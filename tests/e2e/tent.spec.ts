import { expect, test } from '@playwright/test';
import { periDxf, towerParts } from '../../src/scaffold/testDxf';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('balken.onboarded', '1');
    localStorage.setItem('balken.lang', 'ru');
  });
});

test('enclosure mode: drawing → wind, snow, girders, sliding and overturning as in the PERI report', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-tent').click();
  await expect(page.getByTestId('tent-empty')).toBeVisible();
  await page.getByTestId('tent-file').setInputFiles({ name: 'tower.dxf', mimeType: 'application/dxf', buffer: Buffer.from(periDxf(towerParts())) });
  await expect(page.getByTestId('tent-loaded')).toContainText('tower.dxf');
  await expect(page.getByTestId('tent-summary')).toBeVisible();
  for (const k of ['chord', 'diagonal', 'sliding', 'overturning']) await expect(page.getByTestId(`tent-sum-${k}`)).toBeVisible();
  await expect(page.getByTestId('tent-girder-T1')).toBeVisible();

  // wind: zone 1, 24 months without measures → k(T) 0.7; q_p by hand
  await expect(page.getByTestId('tent-qp-value')).toContainText('0,');
  const eta = async () => Number(await page.getByTestId('tent-sum-sliding').locator('td').last().getAttribute('data-eta'));
  const e0 = await eta();
  expect(e0).toBeGreaterThan(0);
  // more wind → more sliding
  await page.getByTestId('tent-qp').fill('1');
  await page.getByTestId('tent-qp').press('Enter');
  await expect.poll(eta).toBeGreaterThan(e0);
  // heavier (ballast) → less
  const e1 = await eta();
  await page.getByTestId('tent-extraG').fill('50');
  await page.getByTestId('tent-extraG').press('Enter');
  await expect.poll(eta).toBeLessThan(e1);
  await expect(page.getByTestId('tent-verdict')).toBeVisible();

  // a girder opens in the beam calculator
  await page.getByTestId('tent-open-T2').click();
  await expect(page.getByTestId('lattice-card')).toBeVisible();
});
