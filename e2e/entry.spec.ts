import { expect, importLegacy, legacySample, openApp, openPanel, quickAdd, stored, tab, tempJson, test } from './helpers';

type Op = { amount: number; subcategoryId: string | null; inboxType?: string; comment: string; date: string };
const last = async (page: import('@playwright/test').Page): Promise<Op> => (await stored(page)).operations.at(-1);

test.describe('Быстрый ввод', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await importLegacy(page, tempJson(legacySample({ inboxCount: 0 })));
    await openPanel(page);
  });

  test('сумма → категория → комментарий, Enter сохраняет и очищает форму', async ({ page }) => {
    await quickAdd(page, '470', 'дост', 'пицца');
    const op = await last(page);
    expect(op).toMatchObject({ amount: 470, comment: 'пицца', date: '2026-10-15' });
    expect(op.subcategoryId).toBe('s_deliv');
    await expect(page.locator('#amount-stack')).toHaveValue('');
    await expect(page.locator('#amount-stack')).toBeFocused();
    await expect(page.locator('#comment-stack')).toHaveValue('');
    await expect(page.locator('.recent-item').first()).toContainText('Доставка');
  });

  test('калькулятор в сумме', async ({ page }) => {
    await page.locator('#amount-stack').fill('350+120-20');
    await expect(page.locator('.entry-currency')).toHaveText('= 450 ₽');
    await page.locator('#amount-stack').press('Control+Enter');
    expect((await last(page)).amount).toBe(450);
  });

  test('неверная сумма не сохраняется и подсвечивается', async ({ page }) => {
    const before = (await stored(page)).operations.length;
    for (const bad of ['', '0', 'абв', '100-200', '-5']) {
      await page.locator('#amount-stack').fill(bad);
      await page.locator('.entry-stack').getByRole('button', { name: 'Добавить' }).click();
      await expect(page.locator('.entry-stack .entry-error')).toHaveText('Укажите сумму больше нуля');
    }
    expect((await stored(page)).operations.length).toBe(before);
  });

  test('доход без категории — переключателем и плюсом', async ({ page }) => {
    await page.locator('.entry-stack .seg button', { hasText: 'Доход' }).click();
    await quickAdd(page, '5000', '', 'перевод');
    expect(await last(page)).toMatchObject({ amount: 5000, subcategoryId: null, inboxType: 'income' });
    await quickAdd(page, '+300');
    expect(await last(page)).toMatchObject({ amount: 300, inboxType: 'income' });
    // После сохранения переключатель возвращается к расходу.
    await quickAdd(page, '50');
    expect(await last(page)).toMatchObject({ amount: 50, inboxType: 'expense' });
  });

  test('с категорией тип берётся из неё, переключатель заблокирован', async ({ page }) => {
    await page.locator('#amount-stack').fill('100000');
    await page.locator('#amount-stack').press('Enter');
    await page.keyboard.type('зарпл');
    await page.keyboard.press('Enter');
    await expect(page.locator('.entry-stack .seg button', { hasText: 'Доход' })).toHaveClass(/on/);
    await expect(page.locator('.entry-stack .seg button', { hasText: 'Расход' })).toBeDisabled();
    await page.keyboard.press('Enter');
    expect((await last(page)).subcategoryId).toBe('s_salary');
  });

  test('кнопки «Сегодня» и «Вчера», дата остаётся для следующей операции', async ({ page }) => {
    await page.locator('.entry-stack').getByRole('button', { name: 'Вчера' }).click();
    await quickAdd(page, '10');
    expect((await last(page)).date).toBe('2026-10-17');
    await quickAdd(page, '20');
    expect((await last(page)).date).toBe('2026-10-17');
    await page.locator('.entry-stack').getByRole('button', { name: 'Сегодня' }).click();
    await quickAdd(page, '30');
    expect((await last(page)).date).toBe('2026-10-18');
  });

  test('Escape в списке категорий закрывает список и не стирает выбор', async ({ page }) => {
    const cat = page.locator('.entry-stack .lookup input');
    await cat.click();
    await page.keyboard.type('такс');
    await page.keyboard.press('Enter');
    await expect(cat).toHaveValue('Транспорт › Такси');
    await cat.click();
    await expect(page.locator('.lookup-list')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.lookup-list')).toHaveCount(0);
    await expect(cat).toHaveValue('Транспорт › Такси');
  });

  test('стрелки в списке категорий выбирают вариант', async ({ page }) => {
    const cat = page.locator('.entry-stack .lookup input');
    await cat.click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const second = await page.locator('.lookup-option').nth(2).locator('.lookup-sub').innerText();
    await page.keyboard.press('Enter');
    await expect(cat).toHaveValue(new RegExp(`${second}$`));
  });

  test('непонятный текст в категории не назначает случайную', async ({ page }) => {
    const cat = page.locator('.entry-stack .lookup input');
    await cat.click();
    await page.keyboard.type('йцукен');
    await page.keyboard.press('Tab');
    await expect(cat).toHaveValue('');
  });

  test('комментарий с HTML показывается как текст', async ({ page }) => {
    await quickAdd(page, '1', '', '<img src=x onerror=alert(1)><b>жирный</b>');
    await tab(page, 'Входящие').click();
    await expect(page.locator('.op-row')).toContainText('<img src=x onerror=alert(1)><b>жирный</b>');
    await expect(page.locator('.op-row b')).toHaveCount(0);
  });
});
