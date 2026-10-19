import { expect, test as base, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const APP_URL = 'file://' + resolve('finance.html');
export const REAL_BACKUP = resolve('data/finance-backup-2026-10-18.json');
/** «Сегодня» во всех проверках, чтобы результат не зависел от дня запуска. */
export const TODAY = new Date('2026-10-18T12:00:00+05:00');

/** Каждая проверка следит, чтобы в браузере не было ни одной ошибки. */
export const test = base.extend<{ errors: string[] }>({
  errors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    });
    page.on('dialog', (d) => {
      errors.push(`dialog: ${d.message()}`);
      void d.dismiss();
    });
    await use(errors);
    expect(errors, 'ошибки в браузере').toEqual([]);
    await expect(page.locator('.crash'), 'экран ошибки раздела').toHaveCount(0);
  },
});
export { expect };

export async function openApp(page: Page) {
  await page.clock.setFixedTime(TODAY);
  await page.goto(APP_URL);
  await expect(page.locator('.brand')).toContainText('Финансы');
}

export function tab(page: Page, name: string) {
  return page.locator('.tab', { hasText: name });
}

export async function stored(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('finance-tracker-v2') || 'null'));
}

/** Пишет JSON во временный файл и возвращает путь — для загрузки через «Загрузить копию». */
export function tempJson(data: unknown, name = 'backup.json'): string {
  const dir = mkdtempSync(join(tmpdir(), 'fin-'));
  const path = join(dir, name);
  writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data));
  return path;
}

/** Файл копии старой версии (v1.1) с небольшим набором операций. */
export function legacySample(opts: { inboxCount?: number; extraOps?: number } = {}) {
  const categories = [
    { id: 'c_food', name: 'Еда', type: 'expense' },
    { id: 'c_trans', name: 'Транспорт', type: 'expense' },
    { id: 'c_tech', name: 'Техника', type: 'expense' },
    { id: 'c_hobby', name: 'Хобби', type: 'expense' },
    { id: 'c_old', name: 'Старое', type: 'expense', archived: true },
    { id: 'c_inc', name: 'Доходы', type: 'income' },
  ];
  const subcategories = [
    { id: 's_market', name: 'Супермаркеты', categoryId: 'c_food' },
    { id: 's_deliv', name: 'Доставка', categoryId: 'c_food' },
    { id: 's_taxi', name: 'Такси', categoryId: 'c_trans' },
    { id: 's_pc', name: 'PC', categoryId: 'c_tech' },
    { id: 's_crypto', name: 'Crypto', categoryId: 'c_hobby' },
    { id: 's_old', name: 'Фисташки', categoryId: 'c_old' },
    { id: 's_salary', name: 'Зарплата', categoryId: 'c_inc' },
    { id: 's_side', name: 'Подработка', categoryId: 'c_inc' },
  ];
  const operations: Record<string, unknown>[] = [];
  let n = 0;
  const add = (subcategoryId: string, date: string, amount: number, extra: Record<string, unknown> = {}) =>
    operations.push({ id: `o${n++}`, subcategoryId, date, amount, description: '', includeInAnalytics: true, ...extra });
  for (const month of ['08', '09', '10']) {
    for (let d = 1; d <= 15; d += 2) {
      add('s_market', `2026-${month}-${String(d).padStart(2, '0')}`, 500 + d * 10);
      add('s_taxi', `2026-${month}-${String(d + 1).padStart(2, '0')}`, 300);
    }
    add('s_deliv', `2026-${month}-10`, 1200, { description: 'пицца' });
    add('s_salary', `2026-${month}-05`, 100000);
  }
  add('s_pc', '2026-09-20', 45000);
  add('s_crypto', '2026-09-21', 10000);
  add('s_side', '2026-10-03', 15000);
  // «Не в аналитике» — не переносятся.
  add('s_old', '2026-09-01', 500, { includeInAnalytics: false, debtStatus: 'repaid' });
  add('s_old', '2026-09-02', 600, { includeInAnalytics: false, debtStatus: 'repaid' });
  add('s_taxi', '2026-09-03', 700, { includeInAnalytics: false, debtStatus: 'repaid' });
  // Подкатегория удалена — такие операции попадают во «Входящие».
  for (let i = 0; i < (opts.inboxCount ?? 2); i++) add('s_gone', `2026-10-${String((i % 15) + 1).padStart(2, '0')}`, 100 + i, { description: `без категории ${i}` });
  for (let i = 0; i < (opts.extraOps ?? 0); i++) add('s_market', `2026-${String((i % 9) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`, 10 + (i % 900));
  return { version: 5, settings: { lastOperationDate: '2026-10-15', theme: 'vasik' }, period: { mode: 'all' }, categories, subcategories, operations };
}

/** Загружает копию старой версии через «Настройки» и подтверждает перенос. */
export async function importLegacy(page: Page, path: string) {
  await tab(page, 'Настройки').click();
  await page.locator('input[type=file]').setInputFiles(path);
  await expect(page.getByRole('heading', { name: 'Перенос из старой версии' })).toBeVisible();
  await page.getByRole('button', { name: /^Перенести \d+ операций$/ }).click();
  await expect(page.locator('.op-row').first()).toBeVisible();
}

/** Открывает «Операции» и боковую панель «Новая операция». */
export async function openPanel(page: Page) {
  if (!(await tab(page, 'Операции').evaluate((el) => el.classList.contains('active')))) await tab(page, 'Операции').click();
  if (!(await page.locator('#amount-stack').isVisible())) await page.getByRole('button', { name: '+ Новая операция' }).click();
  await expect(page.locator('#amount-stack')).toBeVisible();
}

/** Ввод одной операции через панель с полями, с клавиатуры. */
export async function quickAdd(page: Page, amount: string, category = '', comment = '') {
  await openPanel(page);
  await page.locator('#amount-stack').fill(amount);
  await page.locator('#amount-stack').press('Enter');
  if (category) await page.keyboard.type(category);
  await page.keyboard.press('Enter');
  if (comment) await page.keyboard.type(comment);
  await page.keyboard.press('Enter');
}
