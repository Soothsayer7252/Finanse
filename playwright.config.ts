import { defineConfig } from '@playwright/test';

// Проверки в настоящем браузере: открывают собранный finance.html и проходят сценарии,
// как это делал бы человек. Запуск: npm run e2e (после npm run build).
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    locale: 'ru-RU',
    timezoneId: 'Asia/Yekaterinburg',
    viewport: { width: 1360, height: 900 },
  },
});
