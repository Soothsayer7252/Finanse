import { APP_URL, TODAY, expect, importLegacy, legacySample, openApp, quickAdd, stored, tab, tempJson, test } from './helpers';

test.describe('Резервная копия', () => {
  test('скачать → очистить браузер → загрузить: всё на месте', async ({ page }) => {
    await openApp(page);
    await importLegacy(page, tempJson(legacySample()));
    await quickAdd(page, '123', 'дост', 'проверка копии');
    const before = await stored(page);
    await tab(page, 'Настройки').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Скачать копию' }).click()]);
    expect(download.suggestedFilename()).toBe('finance-backup-2026-10-18.json');
    const path = await download.path();

    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByText('Добро пожаловать!')).toBeVisible();
    await tab(page, 'Настройки').click();
    await page.locator('input[type=file]').setInputFiles(path);
    await expect(page.getByText(`операций ${before.operations.length}`)).toBeVisible();
    await page.getByRole('button', { name: 'Заменить' }).click();
    const after = await stored(page);
    expect(after.operations).toEqual(before.operations);
    expect(after.subcategories).toEqual(before.subcategories);
  });

  test('неправильный файл не ломает данные', async ({ page }) => {
    await openApp(page);
    await importLegacy(page, tempJson(legacySample()));
    const before = await stored(page);
    await tab(page, 'Настройки').click();
    await page.locator('input[type=file]').setInputFiles(tempJson('это не json'));
    await expect(page.locator('.toast-error')).toContainText('Не удалось прочитать файл');
    await page.locator('input[type=file]').setInputFiles(tempJson({ hello: 'world' }));
    await expect(page.locator('.toast-error').last()).toContainText('Не похоже на файл резервной копии');
    expect(await stored(page)).toEqual(before);
  });

  test('копия с ошибками: битые операции перечислены, остальное загружается', async ({ page }) => {
    await openApp(page);
    const file = {
      schemaVersion: 1,
      categories: [{ id: 'c', name: 'Еда', type: 'expense' }],
      subcategories: [{ id: 's', categoryId: 'c', name: 'Кафе', group: 'daily' }],
      operations: [
        { id: 'ok', date: '2026-10-01', amount: 100, subcategoryId: 's', comment: '' },
        { id: 'bad-date', date: '01.10.2026', amount: 100, subcategoryId: 's' },
        { id: 'bad-amount', date: '2026-10-01', amount: -5, subcategoryId: 's' },
        { id: 'orphan', date: '2026-10-02', amount: 50, subcategoryId: 'нет такой' },
      ],
      settings: {},
    };
    await tab(page, 'Настройки').click();
    await page.locator('input[type=file]').setInputFiles(tempJson(file));
    await expect(page.getByText('Пропущено операций с неверной датой или суммой: 2.')).toBeVisible();
    await expect(page.getByText(/с удалённой подкатегорией: 1/)).toBeVisible();
    await page.getByRole('button', { name: 'Заменить' }).click();
    expect((await stored(page)).operations).toHaveLength(2);
    await expect(tab(page, 'Входящие').locator('.tab-badge')).toHaveText('1');
  });
});

test.describe('Устойчивость', () => {
  test('испорченные данные в браузере: приложение запускается', async ({ page }) => {
    await page.clock.setFixedTime(TODAY);
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('finance-tracker-v2', '{не json');
        sessionStorage.setItem('seeded', '1');
      }
    });
    await page.goto(APP_URL);
    await expect(page.getByText('Добро пожаловать!')).toBeVisible();
  });

  test('данные странной формы: приложение запускается и показывает то, что можно', async ({ page }) => {
    await page.clock.setFixedTime(TODAY);
    await page.addInitScript(() => {
      localStorage.setItem(
        'finance-tracker-v2',
        JSON.stringify({ schemaVersion: 1, categories: 'не массив', subcategories: null, operations: [{ date: '2026-10-01', amount: '250' }, 42, null], settings: 5 }),
      );
    });
    await page.goto(APP_URL);
    await expect(page.locator('.op-row')).toHaveCount(1);
    for (const name of ['Входящие', 'Категории', 'Настройки', 'Операции']) await tab(page, name).click();
  });

  test('браузер запрещает сохранять: работает и предупреждает', async ({ page }) => {
    await page.clock.setFixedTime(TODAY);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
    });
    await page.goto(APP_URL);
    await quickAdd(page, '100');
    await expect(page.locator('.warn-card')).toContainText('Не удалось сохранить данные');
    await tab(page, 'Входящие').click();
    await expect(page.locator('.op-row')).toHaveCount(1);
    await tab(page, 'Настройки').click();
    await tab(page, 'Операции').click();
  });

  test('большая база (6000 операций) открывается и листается', async ({ page }) => {
    await openApp(page);
    const started = Date.now();
    await importLegacy(page, tempJson(legacySample({ inboxCount: 50, extraOps: 6000 })));
    expect(Date.now() - started).toBeLessThan(15000);
    await quickAdd(page, '1', 'супер');
    for (const name of ['Входящие', 'Категории', 'Операции']) await tab(page, name).click();
    await page.locator('.filter-search').fill('супер');
    await expect(page.locator('.op-row').first()).toBeVisible();
  });
});

test.describe('Телефон и тёмная тема', () => {
  test('на ширине телефона ничего не вылезает за край ни в одном разделе', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openApp(page);
    await importLegacy(page, tempJson(legacySample({ inboxCount: 3 })));
    for (const name of ['Операции', 'Входящие', 'Категории', 'Настройки']) {
      await tab(page, name).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `горизонтальная прокрутка в разделе «${name}»`).toBeLessThanOrEqual(0);
    }
  });

  test('тёмная тема: все разделы без ошибок', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'dark', locale: 'ru-RU', timezoneId: 'Asia/Yekaterinburg' });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openApp(page);
    await importLegacy(page, tempJson(legacySample()));
    for (const name of ['Входящие', 'Категории', 'Настройки', 'Операции']) await tab(page, name).click();
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(28, 22, 18)');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});
