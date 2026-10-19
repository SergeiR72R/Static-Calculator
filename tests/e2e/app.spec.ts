import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { exampleModel } from '../../src/core/examples';
import type { TemplateId } from '../../src/core/defaults';
import { serializeProject } from '../../src/state/persist';
import { pointLoad } from '../../src/core/defaults';

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
  // ULS1 = 1.5·5 + 1.5·3 = 12 kN/m on 6 m → M = 54.00 kNm
  await expect(page.getByTestId('kpi-M-max')).toHaveText('54,00');
  await expect(page.getByTestId('extreme-M-max')).toHaveText('54,00');
  const pathBefore = await page.getByTestId('diagram-path-M').getAttribute('d');
  await page.getByTestId('tab-loads').click();
  const q1 = page.getByTestId('load-q1').first();
  await q1.fill('10');
  // (1.5·10 + 1.5·3)·36/8 = 87.75 kNm
  await expect(page.getByTestId('kpi-M-max')).toHaveText('87,75');
  await expect(page.getByTestId('extreme-M-max')).toHaveText('87,75');
  // trapezoidal load changes the shape of the diagram
  await page.getByTestId('load-q2').first().fill('20');
  await expect(page.getByTestId('diagram-path-M')).not.toHaveAttribute('d', pathBefore!);
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('kpi-M-max')).toHaveText('87,75');
  // undo restores the previous value
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('kpi-M-max')).toHaveText('54,00');
  await page.keyboard.press('Control+y');
  await expect(page.getByTestId('kpi-M-max')).toHaveText('87,75');
});

test('language switch persists and changes number format and symbols', async ({ page }) => {
  await page.goto('/');
  await template(page, 'simple');
  await page.getByTestId('lang-select').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Beam Calculator' })).toBeVisible();
  await expect(page.getByTestId('kpi-M-max')).toHaveText('54.00');
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
  // ULS1: M = 54.00 kNm, IPE 240 W = 324.3 cm³ → σ = 166.5 MPa at the outer fibres
  await expect(page.getByTestId('view3d-legend')).toContainText('166,51');
  await expect(page.getByTestId('view3d-legend')).toContainText('−166,51');
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
  await expect(page.getByTestId('peri-info')).toContainText('M_Rd = 10,5 kNm');
  // 6,00 m is a GT 24 catalogue length; choose 2,40 m
  await page.getByTestId('peri-length').selectOption('2.4');
  await expect(page.getByTestId('beam-length')).toHaveValue('2,4');
  // ULS 1,5·5 + 1,5·3 = 12 kN/m → M = 12·2,4²/8 = 8,64 kNm ≤ M_Rd = 10,5 kNm (82,3 %, = 5,76 / 7,0 with perm values)
  const chk = page.getByTestId('check-peri-GT24');
  await expect(chk.getByTestId('peri-item-M')).toContainText('82,3 %');
  // supports at the girder ends: minimum edge distance 16 cm not kept
  await expect(chk.getByTestId('peri-item-edge').first()).toContainText('a_min = 0,16 m');
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

test('support reactions on the diagram; a lifting pinned/roller support fails', async ({ page }) => {
  await page.goto('/');
  const m = exampleModel('twoSpan');
  // overhang 10 → 12 m with 200 kN at the tip: the middle roller (x = 5 m) lifts off
  m.L = 12;
  for (const s of m.segments) s.x2 = 12;
  m.supports[2].x = 10;
  m.loads.push(pointLoad('Q', 12, 200));
  await page.getByTestId('file-input').setInputFiles({ name: 'o.json', mimeType: 'application/json', buffer: Buffer.from(serializeProject(m)) });
  await expect(page.getByTestId('toast')).toBeVisible();
  for (const s of m.supports) await expect(page.getByTestId(`reaction-label-${s.id}`)).toContainText('R_z =');
  // option off (default): values only, no failure
  // global axes (z down): the support carrying the tip load pushes up → R_z < 0
  await expect(page.getByTestId(`reaction-label-${m.supports[2].id}`)).toContainText('−');
  await expect(page.getByTestId(`reaction-label-${m.supports[1].id}`)).not.toContainText('hebt ab');
  await expect(page.getByTestId('check-uplift')).toHaveCount(0);
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('uplift-check').click();
  await expect(page.getByTestId(`reaction-label-${m.supports[1].id}`)).toContainText('hebt ab');
  await expect(page.getByTestId(`reaction-label-${m.supports[0].id}`)).not.toContainText('hebt ab');
  const up = page.getByTestId('check-uplift');
  await expect(up).toContainText('nicht erfüllt');
  await expect(page.getByTestId(`uplift-${m.supports[1].id}`)).toContainText('> 0');
});

test('autosaved project with the old default 1,35·G + 1,5·Q opens with 1,5·G + 1,5·Q', async ({ page }) => {
  const m = exampleModel('simple');
  m.combinations[0].factors = { G: 1.35, Q: 1.5 };
  await page.addInitScript((json) => localStorage.setItem('balken.model', json), JSON.stringify(m));
  await page.goto('/');
  // (1.5·5 + 1.5·3)·6²/8 = 54.00 kNm
  await expect(page.getByTestId('kpi-M-max')).toHaveText('54,00');
  await expect(page.locator('select option').filter({ hasText: '1,35' })).toHaveCount(0);
});
