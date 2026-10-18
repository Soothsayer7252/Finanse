import { expect, importLegacy, legacySample, openApp, quickAdd, stored, tab, tempJson, test } from './helpers';

test.describe('Входящие', () => {
  test('назначение категории набором: Enter → следующая операция', async ({ page }) => {
    await openApp(page);
    await importLegacy(page, tempJson(legacySample({ inboxCount: 3 })));
    await tab(page, 'Входящие').click();
    const rows = page.locator('.op-row');
    await expect(rows).toHaveCount(3);

    await rows.first().locator('.op-inbox-lookup input').click();
    await page.keyboard.type('дост');
    await page.keyboard.press('Enter');
    await expect(rows).toHaveCount(2);
    // Курсор сам перешёл к полю следующей операции.
    await expect(page.locator('.op-inbox-lookup input').first()).toBeFocused();
    await page.keyboard.type('такси');
    await page.keyboard.press('Enter');
    await expect(rows).toHaveCount(1);
    await expect(tab(page, 'Входящие').locator('.tab-badge')).toHaveText('1');

    const data = await stored(page);
    expect(data.operations.filter((o: { subcategoryId: string | null }) => !o.subcategoryId)).toHaveLength(1);
  });

  test('массовое назначение: выделить значками → одна категория всем', async ({ page }) => {
    await openApp(page);
    await importLegacy(page, tempJson(legacySample({ inboxCount: 4 })));
    await tab(page, 'Входящие').click();
    const icons = page.locator('.op-icon');
    for (let i = 0; i < 4; i++) await icons.nth(i).click();
    await expect(page.locator('.bulk-bar')).toContainText('Выбрано 4');
    await page.locator('.bulk-lookup input').fill('супер');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Операций без категории нет')).toBeVisible();
    await expect(tab(page, 'Входящие').locator('.tab-badge')).toHaveCount(0);
    // Отмена возвращает всё во «Входящие».
    await page.getByRole('button', { name: 'Отменить' }).click();
    await expect(page.locator('.op-row')).toHaveCount(4);
  });

  test('Escape в поле категории не назначает ничего', async ({ page }) => {
    await openApp(page);
    await importLegacy(page, tempJson(legacySample({ inboxCount: 1 })));
    await tab(page, 'Входящие').click();
    await page.locator('.op-inbox-lookup input').click();
    await page.keyboard.type('дост');
    await page.keyboard.press('Escape');
    await page.locator('h2', { hasText: 'Входящие' }).click();
    await expect(page.locator('.op-row')).toHaveCount(1);
  });

  test('щелчок мимо после набора не назначает категорию', async ({ page }) => {
    await openApp(page);
    await importLegacy(page, tempJson(legacySample({ inboxCount: 2 })));
    await tab(page, 'Входящие').click();
    await page.locator('.op-inbox-lookup input').first().click();
    await page.keyboard.type('дост');
    await page.locator('h2', { hasText: 'Входящие' }).click();
    await expect(page.locator('.op-row')).toHaveCount(2);
    await expect(page.locator('.op-inbox-lookup input').first()).toHaveValue('');
  });

  test('операция из быстрого ввода без категории появляется во «Входящих»', async ({ page }) => {
    await openApp(page);
    await quickAdd(page, '250', '', 'кофе');
    await expect(tab(page, 'Входящие').locator('.tab-badge')).toHaveText('1');
    await tab(page, 'Входящие').click();
    await expect(page.locator('.op-row')).toContainText('кофе');
    await expect(page.locator('.op-row')).toContainText('−250 ₽');
  });

  test('много операций без категории (400) открываются быстро и без ошибок', async ({ page }) => {
    await openApp(page);
    await importLegacy(page, tempJson(legacySample({ inboxCount: 400 })));
    const started = Date.now();
    await tab(page, 'Входящие').click();
    await expect(page.locator('.op-row').first()).toBeVisible();
    expect(Date.now() - started).toBeLessThan(3000);
    await expect(page.getByRole('button', { name: /Показать ещё/ })).toBeVisible();
  });

  test('правка операции во «Входящих»: сменить на доход', async ({ page }) => {
    await openApp(page);
    await importLegacy(page, tempJson(legacySample({ inboxCount: 1 })));
    await tab(page, 'Входящие').click();
    await page.locator('.op-body').first().click();
    await page.locator('.op-edit .seg button', { hasText: 'Доход' }).click();
    await page.locator('.op-edit').getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.locator('.op-row .op-amount')).toHaveText(/^\+/);
    const op = (await stored(page)).operations.find((o: { subcategoryId: string | null }) => !o.subcategoryId);
    expect(op.inboxType).toBe('income');
  });
});
