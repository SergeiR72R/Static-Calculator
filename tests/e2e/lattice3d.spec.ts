import { test, expect } from '@playwright/test';
import { exampleModel } from '../../src/core/examples';
import { serializeProject } from '../../src/state/persist';
import { pointLoad, makeSupport } from '../../src/core/defaults';
import { periMaterial } from '../../src/sections/peri';

test('lattice girder: 3D view stays alive while standards are toggled (one WebGL context)', async ({ page }) => {
  const errs: string[] = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.text()));
  await page.addInitScript(() => localStorage.setItem('balken.onboarded', '1'));
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('/');
  const m = exampleModel('simple');
  m.L = 6.25;
  m.segments = [{ ...m.segments[0], x1: 0, x2: 6.25, section: { kind: 'peri', product: 'ULS50' }, material: periMaterial('ULS50') }];
  m.supports = [makeSupport('roller', 0.625), makeSupport('pinned', 4.625)];
  m.loads = [pointLoad('Q', 5.125, 10)];
  await page.getByTestId('file-input').setInputFiles({ name: 'o.json', mimeType: 'application/json', buffer: Buffer.from(serializeProject(m)) });
  await expect(page.getByTestId('lattice-card')).toBeVisible();
  for (let i = 0; i < 20; i++) {
    await page.getByTestId('lattice-cand-0.625').click();
    await page.waitForTimeout(150);
    await page.getByTestId('lattice-cand-0.625').click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(1500);
  await page.getByTestId('view-3d').screenshot({ path: 'test-results/tmp3d.png' });
  expect(errs.filter((e) => e.includes('Too many active WebGL contexts'))).toEqual([]);
});
