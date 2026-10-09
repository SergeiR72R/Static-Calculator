import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { exampleModel } from '../../src/core/examples';
import type { TemplateId } from '../../src/core/defaults';
import { serializeProject } from '../../src/state/persist';

// the first-start wizard is covered in wizard.spec.ts; here the app counts as already set up
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('balken.onboarded', '1'));
});

/** Load a template system with sample loads (test fixture) through "Open project" */
async function template(page: Page, id: TemplateId) {
  const json = serializeProject(exampleModel(id));
  await page.getByTestId('file-input').setInputFiles({ name: `${id}.json`, mimeType: 'application/json', buffer: Buffer.from(json) });
  await expect(page.getByTestId('toast')).toBeVisible();
}

test('opens in German by default, independent of the browser language', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en-US' });
  await ctx.addInitScript(() => localStorage.setItem('balken.onboarded', '1'));
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByRole('heading', { name: 'Balkenrechner' })).toBeVisible();
  await expect(page.getByTestId('tab-supports')).toHaveText('Lager');
  await expect(page.getByTestId('lang-select')).toHaveValue('de');
  await ctx.close();
});

test('template → change load → diagrams and KPIs update', async ({ page }) => {
  await page.goto('/');
  await template(page, 'simple');
  // ULS1 = 1.35·5 + 1.5·3 = 11.25 kN/m on 6 m → M = 50.63 kNm
  await expect(page.getByTestId('kpi-M-max')).toHaveText('50,63');
  await expect(page.getByTestId('extreme-M-max')).toHaveText('50,63');
  const pathBefore = await page.getByTestId('diagram-path-M').getAttribute('d');
  await page.getByTestId('tab-loads').click();
  const q1 = page.getByTestId('load-q1').first();
  await q1.fill('10');
  // (1.35·10 + 1.5·3)·36/8 = 81.00 kNm
  await expect(page.getByTestId('kpi-M-max')).toHaveText('81,00');
  await expect(page.getByTestId('extreme-M-max')).toHaveText('81,00');
  // trapezoidal load changes the shape of the diagram
  await page.getByTestId('load-q2').first().fill('20');
  await expect(page.getByTestId('diagram-path-M')).not.toHaveAttribute('d', pathBefore!);
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('kpi-M-max')).toHaveText('81,00');
  // undo restores the previous value
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('kpi-M-max')).toHaveText('50,63');
  await page.keyboard.press('Control+y');
  await expect(page.getByTestId('kpi-M-max')).toHaveText('81,00');
});

test('language switch persists and changes number format and symbols', async ({ page }) => {
  await page.goto('/');
  await template(page, 'simple');
  await page.getByTestId('lang-select').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Beam Calculator' })).toBeVisible();
  await expect(page.getByTestId('kpi-M-max')).toHaveText('50.63');
  await page.getByTestId('lang-select').selectOption('ru');
  await expect(page.getByRole('heading', { name: 'Калькулятор балок' })).toBeVisible();
  await expect(page.getByTestId('extreme-row-V')).toContainText('Q');
  await page.reload();
  await expect(page.getByTestId('lang-select')).toHaveValue('ru');
  await expect(page.getByTestId('tab-supports')).toHaveText('Опоры');
});

test('downloads JSON project and DXF drawing', async ({ page }) => {
  await page.goto('/');
  await template(page, 'gerber');
  await page.getByTestId('file-menu').click();
  const [json] = await Promise.all([page.waitForEvent('download'), page.getByTestId('menu-save').click()]);
  expect(json.suggestedFilename()).toMatch(/\.json$/);
  const project = JSON.parse(readFileSync((await json.path())!, 'utf8'));
  expect(project.format).toBe('balkenrechner-project');
  expect(project.schema).toBe(1);
  expect(project.model.hinges).toHaveLength(1);

  await page.getByTestId('file-menu').click();
  await page.getByTestId('menu-dxf').click();
  const [dxf] = await Promise.all([page.waitForEvent('download'), page.getByTestId('dxf-download').click()]);
  expect(dxf.suggestedFilename()).toMatch(/\.dxf$/);
  const text = readFileSync((await dxf.path())!, 'latin1');
  expect(text.startsWith('0\r\nSECTION\r\n2\r\nHEADER')).toBe(true);
  expect(text).toContain('AC1009');
  expect(text).toContain('ANSI_1252');
  expect(text).toContain('DIAG_M');
  expect(text.trimEnd().endsWith('EOF')).toBe(true);
});

test('restores the model from a share link', async ({ page, browser }) => {
  await page.goto('/');
  await template(page, 'twoSpan');
  await page.getByTestId('beam-length').fill('12,5');
  await page.getByTestId('file-menu').click();
  await page.getByTestId('menu-share').click();
  const link = await page.getByTestId('share-link').inputValue();
  expect(link).toContain('#m=');

  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await other.goto(link);
  await expect(other.getByTestId('beam-length')).toHaveValue('12,5');
  await expect(other.getByTestId('toast')).toBeVisible();
  await ctx.close();
});

test('opening a saved JSON project restores it', async ({ page }) => {
  await page.goto('/');
  await template(page, 'cantilever');
  await page.getByTestId('file-menu').click();
  const [json] = await Promise.all([page.waitForEvent('download'), page.getByTestId('menu-save').click()]);
  const file = (await json.path())!;
  await template(page, 'threeSpan');
  await expect(page.getByTestId('beam-length')).toHaveValue('15');
  await page.getByTestId('file-input').setInputFiles(file);
  await expect(page.getByTestId('beam-length')).toHaveValue('3');
});

test('mechanism gives a clear message instead of NaN', async ({ page }) => {
  await page.goto('/');
  await template(page, 'simple');
  await page.getByTestId('tab-supports').click();
  await page.getByTestId('support-type').first().selectOption('roller');
  await expect(page.getByTestId('analysis-error')).toContainText('Keine Lagerung in x-Richtung');
  await expect(page.locator('body')).not.toContainText('NaN');
});

test('input validation is shown at the field', async ({ page }) => {
  await page.goto('/');
  await template(page, 'simple');
  await page.getByTestId('tab-loads').click();
  await page.getByTestId('load-x2').first().fill('2');
  await page.getByTestId('load-x1').first().fill('4');
  await expect(page.getByText('x₂ muss größer als x₁ sein.').first()).toBeVisible();
});

test('step-by-step report renders formulas', async ({ page }) => {
  await page.goto('/');
  await template(page, 'gerber');
  await page.getByTestId('main-tab-report').click();
  await expect(page.getByTestId('report')).toBeVisible();
  await expect(page.locator('.katex').first()).toBeVisible();
  await expect(page.getByTestId('report')).toContainText('Kontrolle durch Handrechnung');
});

test('dragging a support in the schematic moves it with snapping', async ({ page }) => {
  await page.goto('/');
  await template(page, 'simple');
  const svg = page.getByTestId('schematic');
  const box = (await svg.boundingBox())!;
  const roller = page.locator('[data-testid^="glyph-support-"]').nth(1);
  const rb = (await roller.boundingBox())!;
  await page.mouse.move(rb.x + rb.width / 2, rb.y + 12);
  await page.mouse.down();
  // move to roughly x = 4.5 m of 6 m
  const left = box.x + 56;
  const span = box.width - 56 - 40;
  await page.mouse.move(left + span * 0.75, rb.y + 12, { steps: 8 });
  await page.mouse.up();
  await page.getByTestId('tab-supports').click();
  const xs = await page.getByTestId('support-x').evaluateAll((els) => els.map((e) => (e as unknown as { value: string }).value));
  expect(xs).toContain('4,5');
});

test('3D view renders the beam with a stress heat map and legend', async ({ page }) => {
  await page.goto('/');
  await template(page, 'simple');
  const card = page.getByTestId('view-3d');
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('canvas')).toBeVisible();
  // ULS1: M = 50.63 kNm, IPE 240 W = 324.3 cm³ → σ = 156.1 MPa at the outer fibres
  await expect(page.getByTestId('view3d-legend')).toContainText('156,11');
  await expect(page.getByTestId('view3d-legend')).toContainText('−156,11');
  await page.getByTestId('view3d-field').selectOption('eta');
  await expect(page.getByTestId('view3d-legend')).toContainText('100 %');
  // hovering the beam shows the value and moves the common cursor
  const box = (await page.getByTestId('beam-3d').boundingBox())!;
  for (const fx of [0.5, 0.45, 0.55, 0.4]) {
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * 0.5);
    if (await page.getByTestId('beam-3d-tip').isVisible()) break;
  }
  await expect(page.getByTestId('beam-3d-tip')).toContainText('η =');
});

test('PERI component: product, catalogue length, material and PERI check', async ({ page }) => {
  await page.goto('/');
  await template(page, 'simple');
  await page.getByTestId('tab-beam').click();
  await page.getByTestId('section-kind').selectOption('peri');
  await expect(page.getByTestId('peri-product')).toHaveValue('GT24');
  await expect(page.getByTestId('material-preset')).toHaveValue('C24');
  await expect(page.getByTestId('peri-info')).toContainText('perm M = 7,0 kNm');
  // 6,00 m is a GT 24 catalogue length; choose 2,40 m
  await page.getByTestId('peri-length').selectOption('2.4');
  await expect(page.getByTestId('beam-length')).toHaveValue('2,4');
  // service load 1,0·5 + 1,0·3 = 8 kN/m → M = 8·2,4²/8 = 5,76 kNm ≤ perm M = 7,0 kNm (82,3 %)
  const chk = page.getByTestId('check-peri-GT24');
  await expect(chk).toContainText('82,3 %');
  await expect(page.getByTestId('check-strength')).toHaveCount(0);
  await page.getByTestId('peri-product').selectOption('RCS');
  await expect(page.getByTestId('material-preset')).toHaveValue('S355');
  // 2,40 m is no RCS catalogue length → "free"
  await expect(page.getByTestId('peri-length')).toHaveValue('custom');
  await expect(page.getByTestId('check-peri-RCS')).toContainText('M_Rd');
});

test('Hebrew: right-to-left UI, drawings stay left-to-right, numbers keep their sign in front', async ({ page }) => {
  await page.goto('/');
  await template(page, 'twoSpan');
  await page.getByTestId('lang-select').selectOption('he');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByTestId('tab-supports')).toHaveText('סמכים');
  // Radix tabs follow the document direction (no forced dir="ltr")
  const dir = (testId: string) =>
    page.getByTestId(testId).evaluate((e) => (e.ownerDocument.defaultView as { getComputedStyle: (el: unknown) => { direction: string } }).getComputedStyle(e).direction);
  expect(await dir('tab-supports')).toBe('rtl');
  // engineering drawings keep x to the right
  expect(await dir('diagram-path-M')).toBe('ltr');
  // he-IL: decimal point, real minus sign first (no stray bidi marks inside the number)
  const vmin = (await page.getByTestId('kpi-V-min').textContent())!.replace(/‎/g, '');
  expect(vmin).toMatch(/^−\d+\.\d\d$/);
  // back to German
  await page.getByTestId('lang-select').selectOption('de');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});
