import type { Page } from '@playwright/test';
import { expect, importLegacy, legacySample, openApp, openPanel, quickAdd, stored, tab, tempJson, test } from './helpers';

/** Строка подкатегории по её названию (название лежит в поле ввода). */
const subRow = (page: Page, name: string) => page.locator('.sub-row').filter({ has: page.locator(`input[value="${name}"]`) });

test.describe('Категории', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await importLegacy(page, tempJson(legacySample({ inboxCount: 0 })));
    await tab(page, 'Категории').click();
  });

  test('новая категория и подкатегория сразу доступны при вводе', async ({ page }) => {
    await page.getByPlaceholder('Новая категория').fill('Здоровье');
    await page.getByPlaceholder('Новая категория').press('Enter');
    await page.getByPlaceholder('Новая подкатегория — Enter').fill('Аптека');
    await page.getByPlaceholder('Новая подкатегория — Enter').press('Enter');
    await expect(page.locator('.sub-row')).toHaveCount(1);
    await tab(page, 'Операции').click();
    await quickAdd(page, '450', 'апт');
    const data = await stored(page);
    const sub = data.subcategories.find((s: { name: string }) => s.name === 'Аптека');
    expect(data.operations.at(-1).subcategoryId).toBe(sub.id);
    expect(sub.group).toBe('daily');
  });

  test('повтор названия категории — ошибка, без дубля', async ({ page }) => {
    await page.getByPlaceholder('Новая категория').fill('еда');
    await page.getByPlaceholder('Новая категория').press('Enter');
    await expect(page.locator('.toast-error')).toContainText('Такая категория уже есть');
    expect((await stored(page)).categories.filter((c: { name: string }) => c.name.toLowerCase() === 'еда')).toHaveLength(1);
  });

  test('переименование подкатегории сохраняется при уходе с поля', async ({ page }) => {
    await page.locator('.cat-item', { hasText: 'Еда' }).click();
    const name = page.locator('.sub-row input.input-name').first();
    await name.fill('Гипермаркеты');
    await page.locator('.title-input').click();
    expect((await stored(page)).subcategories.some((s: { name: string }) => s.name === 'Гипермаркеты')).toBe(true);
  });

  test('группа подкатегории меняет пометку «крупная» в списке', async ({ page }) => {
    await page.locator('.cat-item', { hasText: 'Транспорт' }).click();
    await subRow(page, 'Такси').getByRole('button', { name: 'Крупные' }).click();
    await tab(page, 'Операции').click();
    await expect(page.locator('.op-row', { hasText: 'Такси' }).first().locator('.tag-large')).toBeVisible();
  });

  test('архивная подкатегория не предлагается при вводе, старые операции на месте', async ({ page }) => {
    await page.locator('.cat-item', { hasText: 'Транспорт' }).click();
    await subRow(page, 'Такси').getByRole('button', { name: 'В архив' }).click();
    await openPanel(page);
    await page.locator('.entry-stack .lookup input').click();
    await page.keyboard.type('такс');
    await expect(page.locator('.lookup-option')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('.op-row', { hasText: 'Такси' }).first()).toBeVisible();
  });

  test('пустую подкатегорию можно удалить, с операциями — нет', async ({ page }) => {
    await page.locator('.cat-item', { hasText: 'Еда' }).click();
    await expect(subRow(page, 'Супермаркеты').getByRole('button', { name: 'Удалить' })).toHaveCount(0);
    await page.getByPlaceholder('Новая подкатегория — Enter').fill('Пустая');
    await page.getByPlaceholder('Новая подкатегория — Enter').press('Enter');
    await page.locator('.sub-row', { hasText: 'нет операций' }).getByRole('button', { name: 'Удалить' }).click();
    await expect(page.locator('.sub-row', { hasText: 'нет операций' })).toHaveCount(0);
  });

  test('перенос подкатегории в другую категорию вместе с операциями', async ({ page }) => {
    await page.locator('.cat-item', { hasText: 'Еда' }).click();
    await subRow(page, 'Доставка').locator('select').selectOption({ label: 'Транспорт' });
    await page.locator('.cat-item', { hasText: 'Транспорт' }).click();
    await expect(subRow(page, 'Доставка')).toBeVisible();
    await tab(page, 'Операции').click();
    await expect(page.locator('.op-row', { hasText: 'Доставка' }).first()).toContainText('Транспорт');
  });

  test('объединение подкатегорий: операции переходят, можно отменить', async ({ page }) => {
    await page.locator('.cat-item', { hasText: 'Еда' }).click();
    const delivIds = (await stored(page)).operations.filter((o: { comment: string }) => o.comment === 'пицца').map((o: { id: string }) => o.id);
    expect(delivIds).toHaveLength(3);
    await subRow(page, 'Доставка').locator('select').selectOption({ label: 'Еда › Супермаркеты' });
    await expect(subRow(page, 'Доставка')).toHaveCount(0);
    await expect(page.locator('.toast', { hasText: '«Доставка» объединена с «Супермаркеты»: перенесено операций 3' })).toBeVisible();
    let data = await stored(page);
    const market = data.subcategories.find((x: { name: string }) => x.name === 'Супермаркеты').id;
    expect(data.operations.filter((o: { id: string }) => delivIds.includes(o.id)).every((o: { subcategoryId: string }) => o.subcategoryId === market)).toBe(true);
    expect(data.subcategories.find((x: { name: string }) => x.name === 'Доставка')).toBeUndefined();

    await page.locator('.toast').getByRole('button', { name: 'Отменить' }).click();
    await expect(subRow(page, 'Доставка')).toBeVisible();
    data = await stored(page);
    expect(data.subcategories.find((x: { name: string }) => x.name === 'Доставка')).toBeTruthy();
  });

  test('тип категории с операциями сменить нельзя, пустой — можно', async ({ page }) => {
    await page.locator('.cat-item', { hasText: 'Еда' }).click();
    await expect(page.locator('.chip', { hasText: 'Доход' })).toBeDisabled();
    await page.getByPlaceholder('Новая категория').fill('Тест');
    await page.getByPlaceholder('Новая категория').press('Enter');
    await page.locator('.chip', { hasText: 'Доход' }).click();
    expect((await stored(page)).categories.find((c: { name: string }) => c.name === 'Тест').type).toBe('income');
    await page.getByRole('button', { name: 'Удалить' }).click();
    expect((await stored(page)).categories.find((c: { name: string }) => c.name === 'Тест')).toBeUndefined();
  });
});
