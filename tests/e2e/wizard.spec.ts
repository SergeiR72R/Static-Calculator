import { expect, test } from '@playwright/test';

test('first start: wizard guides through settings and creates the project; later the last project opens', async ({ page }) => {
  await page.goto('/');
  const wizard = page.getByTestId('wizard');
  await expect(wizard).toBeVisible();
  await expect(wizard).toContainText('Willkommen');
  await expect(page.getByTestId('wizard-step-prefs')).toBeVisible();
  // first start cannot be dismissed with Escape
  await page.keyboard.press('Escape');
  await expect(wizard).toBeVisible();
  await page.getByTestId('wizard-next').click();

  // project: name is required
  await expect(page.getByTestId('wizard-next')).toBeDisabled();
  await page.getByTestId('wizard-name').fill('Halle 3 – Pfette');
  await page.getByTestId('wizard-author').fill('M. Muster');
  await page.getByTestId('wizard-next').click();

  // system
  await page.getByTestId('wizard-template-twoSpan').click();
  await page.getByTestId('wizard-length').fill('12');
  await page.getByTestId('wizard-next').click();

  // section and material
  await expect(page.getByTestId('wizard-step-section')).toBeVisible();
  await page.getByTestId('wizard-step-section').getByTestId('section-profile').selectOption('IPE 300');
  await page.getByTestId('wizard-next').click();

  // analysis options
  await expect(page.getByTestId('wizard-step-analysis')).toBeVisible();
  await page.getByTestId('wizard-next').click();

  // summary
  await expect(page.getByTestId('wizard-step-summary')).toContainText('Halle 3 – Pfette');
  await expect(page.getByTestId('wizard-step-summary')).toContainText('IPE 300');
  await page.getByTestId('wizard-create').click();
  await expect(wizard).toBeHidden();

  await expect(page.getByTestId('header-project')).toHaveText('Projekt: Halle 3 – Pfette');
  await expect(page.getByTestId('beam-length')).toHaveValue('12');
  await expect(page.getByTestId('kpi-reactions')).toBeVisible();
  // example loads are off by default: the new project starts without loads
  await page.getByTestId('tab-loads').click();
  await expect(page.getByTestId('load-q1')).toHaveCount(0);
  await page.getByTestId('tab-beam').click();

  // next start: no wizard, the last project opens
  await page.reload();
  await expect(page.getByTestId('header-project')).toHaveText('Projekt: Halle 3 – Pfette');
  await expect(page.getByTestId('wizard')).toHaveCount(0);

  // "New project" opens the wizard without the basic settings step, prefilled with the saved defaults
  await page.getByTestId('new-project').click();
  await expect(page.getByTestId('wizard-step-project')).toBeVisible();
  await expect(page.getByTestId('wizard-author')).toHaveValue('M. Muster');
  await page.getByTestId('wizard-name').fill('Träger B');
  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('wizard-length')).toHaveValue('12');
  await page.getByTestId('wizard-template-cantilever').click();
  await page.getByTestId('wizard-length').fill('2,5');
  for (let i = 0; i < 3; i++) await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('wizard-save-current')).toBeVisible();
  await page.getByTestId('wizard-create').click();
  await expect(page.getByTestId('header-project')).toHaveText('Projekt: Träger B');
  await expect(page.getByTestId('beam-length')).toHaveValue('2,5');
});

test('first start in another language and skipping', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('wizard-lang-ru').click();
  await expect(page.getByTestId('wizard')).toContainText('Добро пожаловать');
  await page.getByTestId('wizard-skip').click();
  await expect(page.getByTestId('wizard')).toHaveCount(0);
  await expect(page.getByTestId('tab-supports')).toHaveText('Опоры');
  await page.reload();
  await expect(page.getByTestId('wizard')).toHaveCount(0);
});

test('a new project can be cancelled and keeps the current one', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('balken.onboarded', '1'));
  await page.goto('/');
  await page.getByTestId('file-menu').click();
  await page.getByTestId('menu-new').click();
  await expect(page.getByTestId('wizard-step-project')).toBeVisible();
  await page.getByTestId('wizard-cancel').click();
  await expect(page.getByTestId('wizard')).toHaveCount(0);
  await expect(page.getByTestId('beam-length')).toHaveValue('6');
});
