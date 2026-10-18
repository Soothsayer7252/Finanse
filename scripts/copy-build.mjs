// После сборки:
// 1) кладёт страницу в корень репозитория как finance.html — её можно скачать и открыть двойным кликом;
// 2) готовит dist/artifact.html — ту же страницу без обёртки <html>/<head>/<body>,
//    в виде, в котором её публикуют по ссылке на claude.ai (обёртку там добавляют сами).
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

copyFileSync('dist/index.html', 'finance.html');

const html = readFileSync('dist/index.html', 'utf-8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const title = head.match(/<title>[\s\S]*?<\/title>/)[0];
const links = head.match(/<link [^>]*>/g) ?? [];
const styles = head.match(/<style[\s\S]*?<\/style>/g) ?? [];
const scripts = head.match(/<script[\s\S]*?<\/script>/g) ?? [];
writeFileSync('dist/artifact.html', [title, ...links, ...styles, body.trim(), ...scripts].join('\n'));

console.log('Готово: finance.html и dist/artifact.html');
