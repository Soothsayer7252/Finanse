import { expect, importLegacy, legacySample, openApp, stored, tempJson, test } from './helpers';

test.describe('Список операций', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await importLegacy(page, tempJson(legacySample({ inboxCount: 0 })));
  });

  test('правка в строке: сумма и комментарий', async ({ page }) => {
    const first = page.locator('.op-row').first();
    const title = await first.locator('.op-title').innerText();
    await first.locator('.op-body').click();
    const edit = page.locator('.op-edit');
    await edit.locator('#amount-inline').fill('999');
    await edit.locator('#comment-inline').fill('исправлено');
    await edit.locator('#comment-inline').press('Enter');
    await expect(page.locator('.op-edit')).toHaveCount(0);
    const row = page.locator('.op-row', { hasText: 'исправлено' });
    await expect(row).toContainText(title);
    await expect(row.locator('.op-amount')).toHaveText('−999 ₽');
  });

  test('Escape отменяет правку', async ({ page }) => {
    const firstAmount = await page.locator('.op-row .op-amount').first().innerText();
    await page.locator('.op-row .op-body').first().click();
    await page.locator('#amount-inline').fill('1');
    await page.locator('#amount-inline').press('Escape');
    await expect(page.locator('.op-edit')).toHaveCount(0);
    await expect(page.locator('.op-row .op-amount').first()).toHaveText(firstAmount);
  });

  test('смена даты при правке переносит операцию в другой день', async ({ page }) => {
    await page.locator('.op-row .op-body').first().click();
    await page.locator('#date-inline').fill('2026-01-02');
    await page.locator('#comment-inline').fill('январь');
    await page.locator('#comment-inline').press('Enter');
    const op = (await stored(page)).operations.find((o: { comment: string }) => o.comment === 'январь');
    expect(op.date).toBe('2026-01-02');
  });

  test('удаление и отмена', async ({ page }) => {
    const before = (await stored(page)).operations.length;
    await page.locator('.op-row').first().hover();
    await page.locator('.op-row').first().getByRole('button', { name: 'Удалить' }).click();
    expect((await stored(page)).operations.length).toBe(before - 1);
    await page.getByRole('button', { name: 'Отменить' }).click();
    expect((await stored(page)).operations.length).toBe(before);
  });

  test('массово: выделить три → в крупные → отменить', async ({ page }) => {
    const icons = page.locator('.op-icon');
    for (const i of [0, 1, 2]) await icons.nth(i).click();
    await expect(page.locator('.bulk-bar')).toContainText('Выбрано 3');
    await page.locator('.bulk-bar').getByRole('button', { name: 'В крупные' }).click();
    await expect(page.locator('.op-row').nth(0).locator('.tag-large')).toBeVisible();
    await page.getByRole('button', { name: 'Отменить' }).click();
    await expect(page.locator('.op-row').nth(0).locator('.tag-large')).toHaveCount(0);
  });

  test('массовое удаление и «снять выделение»', async ({ page }) => {
    const before = (await stored(page)).operations.length;
    await page.locator('.op-icon').nth(0).click();
    await page.locator('.op-icon').nth(1).click();
    await page.getByRole('button', { name: 'Снять выделение' }).click();
    await expect(page.locator('.bulk-bar')).toHaveCount(0);
    await page.locator('.op-icon').nth(0).click();
    await page.locator('.op-icon').nth(1).click();
    await page.locator('.bulk-bar').getByRole('button', { name: 'Удалить' }).click();
    expect((await stored(page)).operations.length).toBe(before - 2);
  });

  test('фильтры: тип, категория, поиск и сброс', async ({ page }) => {
    await page.locator('.filters .chip', { hasText: 'Доходы' }).click();
    const amounts = await page.locator('.op-amount').allInnerTexts();
    expect(amounts.length).toBeGreaterThan(0);
    expect(amounts.every((a) => a.startsWith('+'))).toBe(true);

    await page.locator('.filters .chip', { hasText: 'Вложения' }).click();
    await expect(page.locator('.op-row')).toHaveCount(1);
    await expect(page.locator('.op-row')).toContainText('Crypto');

    await page.locator('.filters .chip', { hasText: 'Все' }).click();
    await page.locator('.filter-search').fill('пицца');
    await expect(page.locator('.op-row')).toHaveCount(3);
    await page.getByRole('button', { name: 'Сбросить' }).click();
    await expect(page.locator('.filter-search')).toHaveValue('');

    await page.locator('.filter-select').selectOption({ label: 'Транспорт' });
    const titles = await page.locator('.op-title').allInnerTexts();
    expect(new Set(titles)).toEqual(new Set(['Такси']));

    await page.locator('.filter-search').fill('несуществующее');
    await expect(page.getByText('Ничего не найдено.')).toBeVisible();
  });

  test('итоги считают вложения отдельно от расходов', async ({ page }) => {
    const sums = page.locator('.summary');
    await expect(sums).toContainText('Вложено');
    await expect(sums.locator('.sum', { hasText: 'Вложено' })).toContainText('10 000 ₽');
    await expect(sums.locator('.sum', { hasText: 'Доходы' })).toContainText('+315 000 ₽');
  });

  test('период: этот месяц, прошлый месяц, одна дата, ошибка в диапазоне', async ({ page }) => {
    await page.locator('.period-button').click();
    await page.locator('.popover .chip', { hasText: 'Этот месяц' }).click();
    await expect(page.locator('.period-button')).toContainText('Октябрь 2026');
    const octDays = await page.locator('.op-day-head').allInnerTexts();
    expect(octDays.every((d) => /октября|Сегодня|Вчера/.test(d))).toBe(true);

    await page.locator('.period-button').click();
    await page.locator('.popover .chip', { hasText: 'Прошлый месяц' }).click();
    await expect(page.locator('.period-button')).toContainText('Сентябрь 2026');

    await page.locator('.period-button').click();
    await page.locator('.popover .chip', { hasText: 'Одна дата' }).click();
    await page.locator('.popover input[type=date]').fill('2026-09-20');
    await page.locator('.popover').getByRole('button', { name: 'Применить' }).click();
    await expect(page.locator('.op-row')).toHaveCount(1);
    await expect(page.locator('.op-row')).toContainText('PC');

    await page.locator('.period-button').click();
    await page.locator('.popover .chip', { hasText: 'Период' }).click();
    await page.locator('.popover input[type=date]').nth(0).fill('2026-10-10');
    await page.locator('.popover input[type=date]').nth(1).fill('2026-10-01');
    await page.locator('.popover').getByRole('button', { name: 'Применить' }).click();
    await expect(page.locator('.popover')).toContainText('Начало позже конца');
    await page.keyboard.press('Escape');
    await expect(page.locator('.popover')).toHaveCount(0);
  });

  test('«Этот месяц» следует за календарём: в ноябре показывает ноябрь', async ({ page }) => {
    await page.locator('.period-button').click();
    await page.locator('.popover .chip', { hasText: 'Этот месяц' }).click();
    await expect(page.locator('.period-button')).toContainText('Октябрь 2026');
    await page.clock.setFixedTime(new Date('2026-11-03T12:00:00+05:00'));
    await page.reload();
    await expect(page.locator('.period-button')).toContainText('Ноябрь 2026');
    await page.locator('.period-button').click();
    await expect(page.locator('.popover .chip', { hasText: 'Этот месяц' })).toHaveClass(/active/);
  });

  test('«Показать ещё» на длинном списке', async ({ page }) => {
    await importLegacy(page, tempJson(legacySample({ inboxCount: 0, extraOps: 400 })));
    await expect(page.locator('.op-row')).toHaveCount(150);
    await page.getByRole('button', { name: /Показать ещё/ }).click();
    await expect(page.locator('.op-row')).toHaveCount(300);
  });
});
