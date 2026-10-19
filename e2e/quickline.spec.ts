import type { Page } from '@playwright/test';
import { expect, importLegacy, legacySample, openApp, stored, tab, tempJson, test } from './helpers';

type Op = { amount: number; subcategoryId: string | null; inboxType?: string; comment: string; date: string };
const ops = async (page: Page): Promise<Op[]> => (await stored(page)).operations;
const line = (page: Page) => page.locator('.ql-input');

test.describe('Ввод строкой текста', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await importLegacy(page, tempJson(legacySample({ inboxCount: 0 })));
  });

  test('«470 доставка вчера пицца» → разбор виден заранее, Enter сохраняет', async ({ page }) => {
    await line(page).fill('470 доставка вчера пицца');
    const preview = page.locator('.ql-preview');
    await expect(preview.locator('.pchip-amount')).toHaveText('−470 ₽');
    await expect(preview.locator('.pchip-cat')).toHaveText('Еда › Доставка');
    await expect(preview).toContainText('Вчера');
    await expect(preview).toContainText('«пицца»');
    await line(page).press('Enter');
    expect((await ops(page)).at(-1)).toMatchObject({ amount: 470, subcategoryId: 's_deliv', date: '2026-10-17', comment: 'пицца' });
    await expect(line(page)).toHaveValue('');
    await expect(line(page)).toBeFocused();
    await expect(page.locator('.quick-line .recent-item')).toContainText('Доставка');
  });

  test('доход плюсом и по категории', async ({ page }) => {
    await line(page).fill('+5000 перевод от мамы');
    await expect(page.locator('.pchip-warn')).toHaveText('во «Входящие»');
    await line(page).press('Enter');
    expect((await ops(page)).at(-1)).toMatchObject({ amount: 5000, subcategoryId: null, inboxType: 'income', comment: 'перевод от мамы' });
    await line(page).fill('14400 зарплата 29.09');
    await expect(page.locator('.pchip-amount')).toHaveText('+14 400 ₽');
    await line(page).press('Enter');
    expect((await ops(page)).at(-1)).toMatchObject({ subcategoryId: 's_salary', date: '2026-09-29' });
  });

  test('без суммы не сохраняет', async ({ page }) => {
    const before = (await ops(page)).length;
    await line(page).fill('доставка вчера');
    await expect(page.locator('.pchip-error')).toHaveText('нет суммы');
    await line(page).press('Enter');
    expect((await ops(page)).length).toBe(before);
    await expect(line(page)).toHaveValue('доставка вчера');
  });

  test('только категория — предлагает варианты, можно выбрать другой', async ({ page }) => {
    await line(page).fill('900 еда');
    const alts = page.locator('.pchip-alt');
    await expect(alts.first()).toBeVisible();
    await alts.filter({ hasText: 'Доставка' }).click();
    await expect(page.locator('.pchip-cat')).toHaveText('Еда › Доставка');
    await line(page).press('Enter');
    expect((await ops(page)).at(-1)!.subcategoryId).toBe('s_deliv');
  });

  test('категорию и дату можно поправить нажатием', async ({ page }) => {
    await line(page).fill('300 непонятное');
    await page.locator('.pchip-warn').click();
    await page.keyboard.type('такс');
    await page.keyboard.press('Enter');
    await expect(page.locator('.pchip-cat')).toHaveText('Транспорт › Такси');
    await page.locator('.ql-preview .pchip', { hasText: /,/ }).click();
    await page.locator('.chip-date').fill('2026-10-05');
    await line(page).press('Enter');
    expect((await ops(page)).at(-1)).toMatchObject({ amount: 300, subcategoryId: 's_taxi', date: '2026-10-05', comment: 'непонятное' });
  });

  test('выученное слово: «пицца» сама уходит в Доставку', async ({ page }) => {
    await line(page).fill('600 пицца');
    await expect(page.locator('.pchip-cat')).toHaveText('Еда › Доставка');
  });

  test('много строк сразу: проверка списком и «Добавить все»', async ({ page }) => {
    const before = (await ops(page)).length;
    await line(page).fill('28.09 470 доставка\n350 такси\nкино без суммы\n29.09 1200 супермаркеты\n300 что-то странное');
    const rows = page.locator('.ql-review-row');
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(2)).toHaveClass(/st-error/);
    await expect(rows.nth(4)).toHaveClass(/st-unsure/);
    await rows.nth(4).getByRole('button', { name: 'Убрать строку' }).click();
    await expect(rows).toHaveCount(4);
    await page.getByRole('button', { name: 'Добавить все (3)' }).click();
    await expect(page.locator('.toast', { hasText: 'Добавлено операций' })).toContainText('Добавлено операций: 3, пропущено без суммы: 1');
    const all = await ops(page);
    expect(all.length).toBe(before + 3);
    expect(all.slice(-3).map((o) => [o.date, o.amount, o.subcategoryId])).toEqual([
      ['2026-09-28', 470, 's_deliv'],
      ['2026-09-28', 350, 's_taxi'],
      ['2026-09-29', 1200, 's_market'],
    ]);
  });

  test('Shift+Enter переносит строку, а не сохраняет', async ({ page }) => {
    const before = (await ops(page)).length;
    await line(page).click();
    await page.keyboard.type('100 такси');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('200 доставка');
    await expect(page.locator('.ql-review-row')).toHaveCount(2);
    expect((await ops(page)).length).toBe(before);
    await page.keyboard.press('Enter');
    expect((await ops(page)).length).toBe(before + 2);
  });

  test('клавиша N открывает панель, Esc закрывает', async ({ page }) => {
    await page.locator('.list-card h2, .op-day-head').first().click();
    await page.keyboard.press('n');
    await expect(page.locator('.entry-card')).toBeVisible();
    await page.locator('#amount-stack').press('Escape');
    await expect(page.locator('.entry-card')).toHaveCount(0);
  });
});

test.describe('Главная', () => {
  test('итог месяца, переключение месяцев, пропущенные дни ведут к вводу', async ({ page }) => {
    await openApp(page);
    await importLegacy(page, tempJson(legacySample({ inboxCount: 1 })));
    await tab(page, 'Главная').click();
    await expect(page.locator('.month-name')).toHaveText('Октябрь 2026');
    await expect(page.locator('.hero-title')).toContainText('Месяц в плюсе');
    await expect(page.locator('.insight', { hasText: 'без категории' })).toBeVisible();

    await page.getByRole('button', { name: 'Прошлый месяц' }).click();
    await expect(page.locator('.month-name')).toHaveText('Сентябрь 2026');
    await expect(page.locator('.hero-row', { hasText: 'Крупные покупки' })).toContainText('45 000 ₽');
    // Месяц запоминается при уходе с Главной.
    await tab(page, 'Категории').click();
    await tab(page, 'Главная').click();
    await expect(page.locator('.month-name')).toHaveText('Сентябрь 2026');
    await expect(page.locator('.hero-row')).toHaveCount(4);
    await page.getByRole('button', { name: 'Следующий месяц' }).click();
    await expect(page.getByRole('button', { name: 'Следующий месяц' })).toBeDisabled();

    // В октябре данные есть по 16-е, сегодня 18-е: пропущено только 17-е.
    const missing = page.locator('.insight', { hasText: 'без записей' });
    await expect(missing).toContainText('1 день без записей');
    await missing.getByRole('button', { name: '+ 17.10' }).click();
    await expect(tab(page, 'Операции')).toHaveClass(/active/);
    await expect(page.locator('.ql-input')).toHaveValue('17.10 ');
    await expect(page.locator('.ql-input')).toBeFocused();
    await page.keyboard.type('300 такси');
    await page.keyboard.press('Enter');
    expect((await stored(page)).operations.at(-1)).toMatchObject({ date: '2026-10-17', amount: 300 });
    await tab(page, 'Главная').click();
    await expect(page.locator('.insight', { hasText: 'без записей' })).toHaveCount(0);
  });

  test('без операций в месяце — понятная надпись', async ({ page }) => {
    await openApp(page);
    await importLegacy(page, tempJson(legacySample({ inboxCount: 0 })));
    await tab(page, 'Главная').click();
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Прошлый месяц' }).click();
    await expect(page.locator('.month-name')).toHaveText('Июнь 2026');
    await expect(page.locator('.hero-title')).toHaveText('В этом месяце операций нет');
  });
});
