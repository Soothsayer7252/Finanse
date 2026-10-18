// Кладёт собранную страницу в корень репозитория как finance.html,
// чтобы её было легко найти и скачать.
import { copyFileSync } from 'node:fs';
copyFileSync('dist/index.html', 'finance.html');
console.log('Готово: finance.html');
