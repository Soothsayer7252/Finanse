import { existsSync } from 'node:fs';
import { REAL_BACKUP, expect, importLegacy, legacySample, openApp, stored, tab, tempJson, test } from './helpers';

const TABS = ['Главная', 'Операции', 'Входящие', 'Категории', 'Настройки'];

test.describe('Запуск и разделы', () => {
  test('все разделы открываются в пустом приложении', async ({ page, errors }) => {
    await openApp(page);
    await expect(page.getByText('Добро пожаловать!')).toBeVisible();
    for (const name of TABS) {
      await tab(page, name).click();
      await expect(tab(page, name)).toHaveClass(/active/);
    }
    await tab(page, 'Входящие').click();
    await expect(page.getByText('Операций без категории нет')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('быстрое переключение разделов туда-обратно', async ({ page }) => {
    await openApp(page);
    await importLegacy(page, tempJson(legacySample()));
    for (let i = 0; i < 25; i++) await tab(page, TABS[i % TABS.length]).click();
    await tab(page, 'Операции').click();
    await expect(page.locator('.op-row').first()).toBeVisible();
  });

  test('после перехода в другой раздел страница начинается сверху', async ({ page }) => {
    await openApp(page);
    await importLegacy(page, tempJson(legacySample()));
    await page.mouse.wheel(0, 3000);
    await tab(page, 'Входящие').click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByRole('heading', { name: 'Входящие' })).toBeInViewport();
  });
});

test.describe('Перенос из старой версии', () => {
  test('переносит нужное, пропускает «не в аналитике», Crypto — в инвестиции', async ({ page }) => {
    await openApp(page);
    await tab(page, 'Настройки').click();
    await page.locator('input[type=file]').setInputFiles(tempJson(legacySample()));
    await expect(page.getByText('Будет перенесено операций: 59 из 62')).toBeVisible();
    await expect(page.getByText(/«не в аналитике» \/ долги: 3 шт\. на 1 800 ₽/)).toBeVisible();
    await expect(page.getByText(/«Crypto» переносится в «Инвестиции»/)).toBeVisible();
    // Предложенная группа для PC — крупные, её можно поменять до переноса.
    const pcRow = page.locator('.wizard-sub', { hasText: 'PC' });
    await expect(pcRow.locator('.chip.active')).toHaveText('Крупные');
    await page.getByRole('button', { name: 'Перенести 59 операций' }).click();

    const data = await stored(page);
    expect(data.operations).toHaveLength(59);
    expect(data.categories.find((c: { name: string }) => c.name === 'Хобби')).toBeUndefined();
    expect(data.categories.find((c: { type: string }) => c.type === 'investment')).toBeTruthy();
    await expect(tab(page, 'Входящие').locator('.tab-badge')).toHaveText('2');
  });

  test('данные остаются после перезагрузки страницы', async ({ page }) => {
    await openApp(page);
    await importLegacy(page, tempJson(legacySample()));
    await page.reload();
    expect((await stored(page)).operations).toHaveLength(59);
    await tab(page, 'Операции').click();
    await expect(page.locator('.op-row').first()).toBeVisible();
    await expect(page.getByText('Добро пожаловать!')).toHaveCount(0);
  });

  test('повторный перенос заменяет данные и позволяет вернуть прежние', async ({ page }) => {
    await openApp(page);
    await importLegacy(page, tempJson(legacySample()));
    await importLegacy(page, tempJson(legacySample({ inboxCount: 0 })));
    expect((await stored(page)).operations).toHaveLength(57);
    await tab(page, 'Настройки').click();
    await page.getByRole('button', { name: /Вернуть данные, которые были до последней загрузки/ }).click();
    await page.getByRole('button', { name: 'Заменить' }).click();
    expect((await stored(page)).operations).toHaveLength(59);
  });

});

test.describe('Реальные данные владельца', () => {
  test.skip(!existsSync(REAL_BACKUP), 'нет реального файла');
  test('реальный бэкап владельца: 1104 операции, все разделы открываются', async ({ page }) => {
    await openApp(page);
    await importLegacy(page, REAL_BACKUP);
    expect((await stored(page)).operations).toHaveLength(1104);
    for (const name of TABS) await tab(page, name).click();
    await tab(page, 'Входящие').click();
    await expect(page.getByText('Операций без категории нет')).toBeVisible();
  });
});
