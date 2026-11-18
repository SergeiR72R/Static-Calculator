import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('balken.onboarded', '1');
    localStorage.setItem('balken.lang', 'ru');
  });
});

const bbox = async (page: Page, id: string) => (await page.getByTestId(`designer-part-${id}`).boundingBox())!;
const at = async (page: Page, x: number, y: number) => {
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
};

test('designer: a frame built from catalogue parts snaps together, is loaded, anchored and calculated', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await page.getByTestId('mode-designer').click();
  await expect(page.getByTestId('designer-app')).toBeVisible();
  // catalogue with the parts of PERI UP: name, article, weight
  await expect(page.getByTestId('designer-cat-100009')).toContainText('Vertikalstiel UVR 200');
  await expect(page.getByTestId('designer-cat-100009')).toContainText('100009 · 10,00 kg');
  await page.getByTestId('designer-search').fill('UH 75');
  await expect(page.getByTestId('designer-cat-114629')).toBeVisible();
  await page.getByTestId('designer-search').fill('');
  // first generation by default; the second when chosen in the settings
  await expect(page.getByTestId('designer-cat-132234')).toHaveCount(0);
  await page.getByTestId('designer-families-toggle').click();
  await page.getByTestId('designer-family-UVR-2').check();
  await expect(page.getByTestId('designer-cat-132234')).toContainText('Vertikalstiel UVR-2 200');
  await page.getByTestId('designer-families-reset').click();
  await expect(page.getByTestId('designer-cat-132234')).toHaveCount(0);
  await expect(page.getByTestId('designer-issue-noStandards')).toBeVisible();
  await expect(page.getByTestId('designer-run')).toBeDisabled();

  // a base jack on the ground
  await page.getByTestId('designer-kind-jack').click();
  await page.getByTestId('designer-cat-100411').click();
  await page.getByTestId('designer-canvas').scrollIntoViewIfNeeded();
  const canvas = (await page.getByTestId('designer-canvas').boundingBox())!;
  await at(page, canvas.x + canvas.width / 2, canvas.y + canvas.height * 0.75);
  await expect(page.getByTestId('designer-part-D1')).toHaveAttribute('data-article', '100411');
  // the base standard snaps onto the jack, the standard onto the base standard
  await page.getByTestId('designer-kind-base').click();
  await page.getByTestId('designer-cat-100014').click();
  await page.getByTestId('designer-canvas').scrollIntoViewIfNeeded();
  let b = await bbox(page, 'D1');
  await at(page, b.x + b.width / 2, b.y - 5);
  await expect(page.getByTestId('designer-part-D2')).toHaveAttribute('data-z', '0.2');
  await page.getByTestId('designer-cat-100009').click();
  await page.getByTestId('designer-canvas').scrollIntoViewIfNeeded();
  b = await bbox(page, 'D2');
  await at(page, b.x + b.width / 2, b.y - 20);
  await expect(page.getByTestId('designer-part-D3')).toHaveAttribute('data-z', '0.44');
  // second column 0.75 m beside it: the scale from the drawn standard (2.16 m with its spigot)
  await page.getByTestId('designer-cat-100411').click();
  await page.getByTestId('designer-canvas').scrollIntoViewIfNeeded();
  b = await bbox(page, 'D3');
  const s = b.height / 2.16;
  const j = await bbox(page, 'D1');
  await at(page, j.x + j.width / 2 + 0.75 * s, j.y + j.height / 2);
  await expect(page.getByTestId('designer-part-D4')).toHaveAttribute('data-article', '100411');
  const x1 = Number(await page.getByTestId('designer-part-D1').getAttribute('data-x'));
  const x4 = Number(await page.getByTestId('designer-part-D4').getAttribute('data-x'));
  expect(Math.abs(x4 - x1 - 0.75)).toBeLessThan(0.051);
  await page.getByTestId('designer-cat-100014').click();
  await page.getByTestId('designer-canvas').scrollIntoViewIfNeeded();
  b = await bbox(page, 'D4');
  await at(page, b.x + b.width / 2, b.y - 5);
  await page.getByTestId('designer-cat-100009').click();
  await page.getByTestId('designer-canvas').scrollIntoViewIfNeeded();
  b = await bbox(page, 'D5');
  await at(page, b.x + b.width / 2, b.y - 20);
  await expect(page.getByTestId('designer-part-D6')).toHaveAttribute('data-z', '0.44');
  // a ledger UH 75 between the rosettes of equal height
  await page.getByTestId('designer-kind-ledger').click();
  await page.getByTestId('designer-cat-114629').click();
  await page.getByTestId('designer-canvas').scrollIntoViewIfNeeded();
  const l = await bbox(page, 'D3');
  const r = await bbox(page, 'D6');
  await at(page, (l.x + l.width / 2 + r.x + r.width / 2) / 2, l.y + 0.28 * (l.height / 2.16));
  await expect(page.getByTestId('designer-part-D7')).toHaveAttribute('data-article', '114629');
  // its deck: field width and the working load
  await page.getByTestId('designer-tool-select').click();
  await expect(page.getByTestId('designer-props')).toContainText('Horizontalriegel UH 75 Plus');
  await expect(page.getByTestId('designer-deck')).toBeChecked();
  await page.getByTestId('designer-width').fill('3');
  await page.getByTestId('designer-work').check();
  await expect(page.getByTestId('designer-deck-D7')).toContainText('b = 3,00 m');
  // an anchor on the standard at a rosette
  await page.getByTestId('designer-tool-anchor').click();
  b = await bbox(page, 'D3');
  // the point on the standard, then the side of the wall (left of the standard)
  await at(page, b.x + b.width / 2, b.y + 0.28 * (b.height / 2.16));
  await page.mouse.move(b.x + b.width / 2 - 60, b.y + 0.28 * (b.height / 2.16) - 4);
  await expect(page.getByTestId('designer-anchor-ghost')).toHaveAttribute('data-angle', '180');
  await at(page, b.x + b.width / 2 - 60, b.y + 0.28 * (b.height / 2.16) - 4);
  await expect(page.getByTestId('designer-anchor-A1')).toHaveAttribute('data-angle', '180');
  await expect(page.getByTestId('designer-issue-noBracing')).toHaveCount(0);
  // undo / redo
  await page.getByTestId('designer-undo').click();
  await expect(page.getByTestId('designer-anchor-A1')).toHaveCount(0);
  await page.getByTestId('designer-redo').click();
  await expect(page.getByTestId('designer-anchor-A1')).toBeVisible();
  // its direction in the properties of the standard
  await page.getByTestId('designer-tool-select').click();
  b = await bbox(page, 'D3');
  await page.mouse.click(b.x + b.width / 2, b.y + b.height * 0.6);
  await expect(page.getByTestId('designer-anchor-dir-A1')).toHaveValue('180');
  await page.getByTestId('designer-anchor-dir-A1').selectOption('0');
  await expect(page.getByTestId('designer-anchor-A1')).toHaveAttribute('data-angle', '0');
  // an anchor is selected on the drawing and deleted (and back with undo)
  await page.getByTestId('designer-anchor-A1').locator('line').first().click({ force: true });
  await expect(page.getByTestId('designer-props')).toContainText('A1');
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('designer-anchor-A1')).toHaveCount(0);
  await page.getByTestId('designer-undo').click();
  await expect(page.getByTestId('designer-anchor-A1')).toBeVisible();
  // a double diagonal: the second UBK of the bay on the other side of the rosettes
  await page.getByTestId('designer-kind-diagonal').click();
  await page.getByTestId('designer-cat-424170').click();
  await page.getByTestId('designer-canvas').scrollIntoViewIfNeeded();
  const dl = await bbox(page, 'D3');
  const dr = await bbox(page, 'D6');
  const mid = { x: (dl.x + dl.width / 2 + dr.x + dr.width / 2) / 2, y: dl.y + dl.height * 0.55 };
  await at(page, mid.x, mid.y);
  await expect(page.getByTestId('designer-part-D8')).toHaveAttribute('data-side', '1');
  await at(page, mid.x, mid.y);
  await expect(page.getByTestId('designer-part-D9')).toHaveAttribute('data-side', '-1');
  await expect(page.getByTestId('designer-part-D9')).toHaveAttribute('data-x', (await page.getByTestId('designer-part-D8').getAttribute('data-x'))!);
  await page.getByTestId('designer-tool-select').click();
  // calculated with the analysis of the scaffold mode
  await page.getByTestId('designer-run').click();
  await expect(page.getByTestId('scaffold-verdict')).toHaveAttribute('data-verdict', /^(ok|check|fail)$/, { timeout: 30_000 });
  await expect(page.getByTestId('designer-eta-D7')).toBeVisible();
  await page.getByTestId('designer-checks').locator('summary').click();
  await expect(page.getByTestId('designer-checks')).toContainText('Сечение ригеля');
  // parts list
  await page.getByTestId('designer-bom-toggle').click();
  await expect(page.getByTestId('designer-bom-table')).toContainText('Horizontalriegel UH 75 Plus');
  // kept after a reload, the result out of date after a change
  await page.reload();
  await expect(page.getByTestId('designer-part-D7')).toBeVisible();
  await expect(page.getByTestId('designer-anchor-A1')).toBeVisible();
  // deleting a part
  await page.getByTestId('designer-part-D7').click({ force: true });
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('designer-part-D7')).toHaveCount(0);
});

test('designer: the example section works and every setting explains itself', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await page.getByTestId('mode-designer').click();
  await page.getByTestId('designer-example').click();
  await expect(page.locator('[data-testid^="designer-part-"]')).toHaveCount(13);
  await page.getByTestId('designer-run').click();
  await expect(page.getByTestId('scaffold-verdict')).toHaveAttribute('data-verdict', 'ok', { timeout: 30_000 });
  // load class 6: the nodes of the rosettes are shown at their place
  await page.getByTestId('designer-class').selectOption('6');
  await page.getByTestId('designer-run').click();
  await expect(page.getByTestId('scaffold-verdict')).not.toContainText('устарели', { timeout: 30_000 });
  await expect(page.getByTestId('scaffold-verdict')).toHaveAttribute('data-verdict', /^(ok|check|fail)$/);
  await expect(page.locator('[data-testid^="designer-point-node-"]').first()).toBeVisible();
  await page.getByTestId('help-designer-field').click();
  await expect(page.getByTestId('help-text-designer-field')).toContainText('Что меняет');
  await page.keyboard.press('Escape');
  // a group: selected by a band, copied and pasted beside it
  await page.getByTestId('designer-tool-select').click();
  await page.getByTestId('designer-canvas').scrollIntoViewIfNeeded();
  const c = (await page.getByTestId('designer-canvas').boundingBox())!;
  await page.mouse.move(c.x + 5, c.y + 5);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 4 });
  await page.mouse.move(c.x + c.width - 5, c.y + c.height - 40, { steps: 4 });
  await expect(page.getByTestId('designer-band')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId('designer-props')).toContainText('13');
  await page.keyboard.press('Control+c');
  await expect(page.getByTestId('designer-paste')).toContainText('13');
  await page.keyboard.press('Control+v');
  const s1 = (await page.getByTestId('designer-part-D1').boundingBox())!;
  const s3 = (await page.getByTestId('designer-part-D3').boundingBox())!;
  // three metres to the right: the scale from the drawn standard UVR 200 (2.16 m with its spigot)
  const px = s3.height / 2.16;
  await page.mouse.move(s1.x + 3 * px, s1.y + s1.height);
  await page.mouse.click(s1.x + 3 * px, s1.y + s1.height);
  await expect(page.locator('[data-testid^="designer-part-"]')).toHaveCount(26);
  await expect(page.getByTestId('designer-anchor-A4')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('designer-undo').click();
  await expect(page.locator('[data-testid^="designer-part-"]')).toHaveCount(13);
});
