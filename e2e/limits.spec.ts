import type { Page } from '@playwright/test';
import { expect, openApp, stored, tab, test } from './helpers';

/** Данные в новом формате: обычные месяцы с апреля по сентябрь и октябрь, где кафе заметно чаще. */
function sample() {
  const operations: Record<string, unknown>[] = [];
  let n = 0;
  const add = (subcategoryId: string, date: string, amount: number) =>
    operations.push({ id: `op${n++}`, date, amount, subcategoryId, comment: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' });
  const day = (m: string, d: number) => `2026-${m}-${String(d).padStart(2, '0')}`;
  for (const m of ['04', '05', '06', '07', '08', '09']) {
    for (const d of [2, 9, 16, 23]) add('groc', day(m, d), 1000);
    for (const d of [5, 15, 25]) add('cafe', day(m, d), 500);
    for (const d of [3, 13]) add('taxi', day(m, d), 300);
    add('salary', day(m, 10), 50000);
  }
  for (const d of [2, 9, 16]) add('groc', day('10', d), 1000);
  for (const d of [5, 6, 7, 8, 11, 12, 14, 15]) add('cafe', day('10', d), 500);
  for (const d of [3, 13]) add('taxi', day('10', d), 300);
  add('salary', day('10', 10), 50000);
  operations.push({ id: 'big', date: day('10', 6), amount: 12900, subcategoryId: 'gadgets', comment: 'наушники', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' });
  return {
    schemaVersion: 1,
    categories: [
      { id: 'food', name: 'Еда', type: 'expense', archived: false },
      { id: 'trans', name: 'Транспорт', type: 'expense', archived: false },
      { id: 'tech', name: 'Техника', type: 'expense', archived: false },
      { id: 'inc', name: 'Доходы', type: 'income', archived: false },
    ],
    subcategories: [
      { id: 'groc', categoryId: 'food', name: 'Продукты', archived: false, group: 'daily' },
      { id: 'cafe', categoryId: 'food', name: 'Кафе', archived: false, group: 'daily' },
      { id: 'taxi', categoryId: 'trans', name: 'Такси', archived: false, group: 'daily' },
      { id: 'gadgets', categoryId: 'tech', name: 'Гаджеты', archived: false, group: 'large' },
      { id: 'salary', categoryId: 'inc', name: 'Зарплата', archived: false, incomeKind: 'stable' },
    ],
    operations,
    settings: { lastDate: '2026-10-15', period: { mode: 'all', single: '', from: '', to: '' }, limits: [] },
  };
}

async function openWithSample(page: Page) {
  await openApp(page);
  await page.evaluate((d) => localStorage.setItem('finance-tracker-v2', JSON.stringify(d)), sample());
  await page.reload();
  await expect(page.locator('.hero-title')).toBeVisible();
}

test.describe('Лимиты и цель', () => {
  test('в Настройках: подсказка «обычно», сохранение, удаление с отменой', async ({ page }) => {
    await openWithSample(page);
    await tab(page, 'Настройки').click();
    await expect(page.getByRole('heading', { name: 'Лимиты и цель' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Перенос из старой версии' })).toHaveCount(0);

    // «Обычно» — медиана полных месяцев до этого: повседневные 6 100 ₽ → округлено до 6 000 ₽.
    await page.getByRole('button', { name: 'обычно ~6 000 ₽ — подставить' }).click();
    await expect(page.locator('#limit-daily')).toHaveValue('6 000');
    await page.locator('#limit-daily').fill('9000');
    await page.locator('#limit-income').fill('60000');
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.locator('.toast', { hasText: 'действует с октября 2026' })).toBeVisible();
    await expect(page.locator('#limit-daily')).toHaveValue('9 000');
    expect((await stored(page)).settings.limits).toEqual([{ from: '2026-10', daily: 9000, large: null, income: 60000 }]);

    const row = page.locator('.limits-row', { hasText: 'С октября 2026' });
    await expect(row).toContainText('повседневные 9 000 ₽ · крупные не заданы · доход 60 000 ₽');
    await row.getByRole('button', { name: /Удалить/ }).click();
    expect((await stored(page)).settings.limits).toEqual([]);
    await page.locator('.toast', { hasText: 'удалены' }).getByRole('button', { name: 'Отменить' }).click();
    expect((await stored(page)).settings.limits).toHaveLength(1);
  });

  test('непонятная сумма не сохраняется', async ({ page }) => {
    await openWithSample(page);
    await tab(page, 'Настройки').click();
    await page.locator('#limit-large').fill('много');
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.locator('.toast', { hasText: 'Не понял сумму в поле «Крупные покупки»' })).toBeVisible();
    await expect(page.locator('.money-input.invalid')).toHaveCount(1);
    expect((await stored(page)).settings.limits).toEqual([]);
  });

  test('кнопки резервной копии не прилипают к тексту', async ({ page }) => {
    await openWithSample(page);
    await tab(page, 'Настройки').click();
    const card = page.locator('section', { has: page.getByRole('heading', { name: 'Резервная копия' }) });
    const text = await card.locator('p').first().boundingBox();
    const buttons = await card.getByRole('button', { name: 'Скачать копию' }).boundingBox();
    expect(buttons!.y - (text!.y + text!.height)).toBeGreaterThanOrEqual(10);
  });
});

test.describe('Главная: полоски и что изменилось', () => {
  test('без лимитов — ссылка в Настройки и «обычно» вместо полоски', async ({ page }) => {
    await openWithSample(page);
    const daily = page.locator('.limit-bar', { hasText: 'Повседневные' });
    await expect(daily).toContainText('Лимит не задан · обычно ~6 100 ₽');
    await expect(daily.locator('.bar-fill')).toHaveCount(0);
    await expect(daily.locator('.bar-none')).toBeVisible();
    await page.getByRole('button', { name: 'Задать лимиты и цель по доходу →' }).click();
    await expect(page.getByRole('heading', { name: 'Лимиты и цель' })).toBeVisible();
  });

  test('полоски по лимитам, предупреждение о темпе и причины', async ({ page }) => {
    await openWithSample(page);
    await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('finance-tracker-v2')!);
      d.settings.limits = [{ from: '2026-10', daily: 9000, large: 20000, income: 60000 }];
      localStorage.setItem('finance-tracker-v2', JSON.stringify(d));
    });
    await page.reload();

    // Октябрь по 18-е: продукты 3 000 + кафе 4 000 + такси 600 = 7 600 ₽.
    const daily = page.locator('.limit-bar', { hasText: 'Повседневные' });
    await expect(daily).toContainText('7 600 / 9 000');
    await expect(daily).toContainText('Темп выше лимита — к концу ~13 089 ₽');
    await expect(daily.locator('.bar-marker')).toBeVisible();
    await expect(page.locator('.limit-bar', { hasText: 'Доход' })).toContainText('До цели 10 000 ₽');

    await expect(page.locator('.limit-bar', { hasText: 'Крупные' })).toContainText('Осталось 7 100 ₽');
    await expect(page.locator('.tile', { hasText: 'Ушло' })).toContainText('20 500 ₽');
    const alert = page.locator('.todo-row', { hasText: 'Повседневные идут быстрее лимита' });
    await expect(alert).toContainText('Чтобы уложиться — не больше ~100 ₽ в день');
    await expect(alert).toContainText('Больше обычного: Еда +3 000 ₽');

    // К 18-му числу обычно уходит 4 000 ₽ на еду, сейчас 7 000 ₽.
    await expect(page.getByRole('heading', { name: 'Где траты не как обычно' })).toBeVisible();
    await expect(page.getByText('Сравниваем с тем, сколько вы обычно тратите к 18-му числу')).toBeVisible();
    const food = page.locator('.change-row', { hasText: 'Еда' });
    await expect(food.locator('.pill')).toHaveText('на 3 000 ₽ больше');
    await expect(food).toContainText('Сейчас7 000 ₽');
    await expect(food).toContainText('Обычно~4 000 ₽');
    await expect(food).toContainText('Почему: чаще обычного: 11 раз вместо ~5; в основном Кафе: +3 000 ₽');
    // Крупная покупка в «обычно» не сравнивается: она объясняется у лимита крупных.
    await expect(page.locator('.change-row')).toHaveCount(1);

    // Нажатие на вывод открывает операции этой категории за месяц.
    await food.click();
    await expect(tab(page, 'Операции')).toHaveClass(/active/);
    await expect(page.locator('.filter-select')).toHaveValue('food');
    await expect(page.locator('.period-button')).toContainText('Октябрь 2026');
    await expect(page.getByText('Найдено: 11')).toBeVisible();
    // Обычный переход во вкладку сбрасывает отбор.
    await tab(page, 'Главная').click();
    await tab(page, 'Операции').click();
    await expect(page.locator('.filter-select')).toHaveValue('');
  });

  test('перерасход крупных объясняется самыми дорогими покупками', async ({ page }) => {
    await openWithSample(page);
    await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('finance-tracker-v2')!);
      d.settings.limits = [{ from: '2026-10', daily: null, large: 10000, income: null }];
      localStorage.setItem('finance-tracker-v2', JSON.stringify(d));
    });
    await page.reload();
    await expect(page.locator('.limit-bar', { hasText: 'Крупные' })).toContainText('Перерасход 2 900 ₽');
    const row = page.locator('.todo-row', { hasText: 'Крупные вышли за лимит на 2 900 ₽' });
    await expect(row).toContainText('Крупнее всего: Техника › Гаджеты, наушники — 12 900 ₽');
    await expect(row.locator('.todo-dot-over')).toBeVisible();
  });

  test('прошлый месяц — по лимитам того времени, без пропущенных дней «как обычно»', async ({ page }) => {
    await openWithSample(page);
    await page.getByRole('button', { name: 'Прошлый месяц' }).click();
    await expect(page.locator('.month-name')).toHaveText('Сентябрь 2026');
    await expect(page.locator('.limit-bar', { hasText: 'Повседневные' })).toContainText('Лимит не задан');
    await expect(page.getByRole('heading', { name: 'Где траты в сентябре были не как обычно' })).toBeVisible();
    await expect(page.locator('.todo-row', { hasText: 'Всё как обычно' })).toBeVisible();
  });

  test('мало истории — честно говорим, что сравнивать не с чем', async ({ page }) => {
    await openWithSample(page);
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Прошлый месяц' }).click();
    await expect(page.locator('.month-name')).toHaveText('Июнь 2026');
    await expect(page.locator('.todo-row', { hasText: 'Сравнивать пока не с чем' })).toContainText('сейчас 2');
  });
});
