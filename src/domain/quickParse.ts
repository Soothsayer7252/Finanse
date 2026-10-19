// Разбор операции, написанной обычной фразой: «470 доставка вчера пицца».
// Правила описаны в docs/SPEC.md, раздел 5. Нейросетей нет: только числа, даты
// и названия категорий самого пользователя плюс слова из его прошлых комментариев.

import { addDays, isValidISO, parseISO, toISO } from './dates';
import { parseAmount } from './money';
import { normalize, type SubOption } from './ops';
import type { Operation } from './types';

export interface ParsedLine {
  raw: string;
  amount: number | null;
  /** Доход: «+» перед суммой или подкатегория дохода. */
  income: boolean;
  date: string;
  /** Дата была написана в строке (иначе взята от прошлой операции). */
  dateGiven: boolean;
  subcategoryId: string | null;
  /** Как найдена подкатегория: по названию или по прошлым комментариям. */
  matchedBy: 'name' | 'learned' | null;
  /** Варианты, если подходит несколько подкатегорий (выбранная — первая). */
  candidates: string[];
  comment: string;
  /** ok — всё понятно; unsure — нужна проверка (несколько вариантов или без категории); error — нет суммы. */
  status: 'ok' | 'unsure' | 'error';
  error?: string;
}

/** Слово из комментария → сколько раз с ним выбирали каждую подкатегорию. */
export type Learned = Map<string, Map<string, number>>;

export interface ParseContext {
  options: SubOption[];
  today: string;
  /** Дата, если в строке её нет (дата прошлой операции). */
  defaultDate: string;
  learned?: Learned;
}

const MONTHS: [string, number][] = [
  ['янв', 1], ['фев', 2], ['мар', 3], ['апр', 4], ['мая', 5], ['май', 5], ['июн', 6],
  ['июл', 7], ['авг', 8], ['сен', 9], ['окт', 10], ['ноя', 11], ['дек', 12],
];
const WEEKDAYS: [string, number][] = [
  ['понедельник', 1], ['вторник', 2], ['сред', 3], ['четверг', 4], ['пятниц', 5], ['суббот', 6], ['воскресен', 0],
];
const RELATIVE: Record<string, number> = { сегодня: 0, вчера: -1, позавчера: -2 };

/** Слова, которые не бывают категорией и не стоит запоминать. */
const STOP = new Set(['и', 'в', 'во', 'на', 'с', 'со', 'за', 'для', 'по', 'из', 'от', 'до', 'к', 'у', 'о', 'это', 'руб', 'р', 'рублей']);

function splitWords(s: string): string[] {
  return normalize(s).split(/[\s,()+./«»"'-]+/).filter((w) => w.length >= 2);
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** Слова совпадают с точностью до окончания: «доставку» ≈ «доставка», «кафешка» ≈ «кафе». */
function sameStem(a: string, b: string): boolean {
  const p = commonPrefix(a, b);
  return p >= 4 && p >= Math.min(a.length, b.length) - 2;
}

/** Насколько слово из строки похоже на слово названия: 0 — не похоже. */
function wordScore(token: string, word: string): number {
  if (token === word) return 5;
  if (sameStem(token, word)) return 4;
  if (token.length >= 3 && word.startsWith(token)) return 3;
  return 0;
}

/** Ближайшая прошедшая (или сегодняшняя) дата с таким днём и месяцем. */
function dayMonthToISO(day: number, month: number, year: number | null, today: string): string | null {
  const [ty] = parseISO(today);
  let y = year ?? ty;
  let iso = toISO(y, month, day);
  if (!isValidISO(iso)) return null;
  if (year === null && iso > today) {
    y -= 1;
    iso = toISO(y, month, day);
    if (!isValidISO(iso)) return null;
  }
  return iso;
}

function weekdayToISO(wd: number, today: string): string {
  const [y, m, d] = parseISO(today);
  const cur = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(today, -((cur - wd + 7) % 7));
}

export function buildLearned(ops: Operation[]): Learned {
  const learned: Learned = new Map();
  for (const op of ops) {
    if (!op.subcategoryId || !op.comment) continue;
    for (const w of new Set(splitWords(op.comment))) {
      if (w.length < 3 || STOP.has(w) || /\d/.test(w)) continue;
      let m = learned.get(w);
      if (!m) learned.set(w, (m = new Map()));
      m.set(op.subcategoryId, (m.get(op.subcategoryId) ?? 0) + 1);
    }
  }
  return learned;
}

export function parseLine(raw: string, ctx: ParseContext): ParsedLine {
  // «1 500» — одно число, а не два.
  const rawTokens = raw.trim().split(/\s+/).filter(Boolean);
  const tokens: string[] = [];
  for (const t of rawTokens) {
    const prev = tokens[tokens.length - 1];
    if (prev && /^\+?\d{1,3}(\s\d{3})*$/.test(prev) && /^\d{3}([.,]\d+)?(₽|р|руб)?$/.test(t)) tokens[tokens.length - 1] = `${prev} ${t}`;
    else tokens.push(t);
  }
  const norm = tokens.map((t) => normalize(t).replace(/[.,!?;:]+$/, ''));
  const used = new Set<number>();

  // Дата.
  let date: string | null = null;
  for (let i = 0; i < tokens.length && !date; i++) {
    const t = norm[i];
    if (t in RELATIVE) {
      date = addDays(ctx.today, RELATIVE[t]);
      used.add(i);
      continue;
    }
    const dm = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?$/.exec(tokens[i]);
    if (dm) {
      const year = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : null;
      const iso = dayMonthToISO(Number(dm[1]), Number(dm[2]), year, ctx.today);
      if (iso) {
        date = iso;
        used.add(i);
      }
      continue;
    }
    if (/^\d{1,2}$/.test(t) && i + 1 < tokens.length) {
      const month = MONTHS.find(([p]) => norm[i + 1].startsWith(p))?.[1];
      if (month) {
        const iso = dayMonthToISO(Number(t), month, null, ctx.today);
        if (iso) {
          date = iso;
          used.add(i).add(i + 1);
        }
        continue;
      }
    }
    const wd = WEEKDAYS.find(([p]) => t.startsWith(p))?.[1];
    if (wd !== undefined) {
      date = weekdayToISO(wd, ctx.today);
      used.add(i);
      if (i > 0 && (norm[i - 1] === 'в' || norm[i - 1] === 'во')) used.add(i - 1);
    }
  }

  // Сумма: первое число, которое не дата.
  let amount: number | null = null;
  let plus = false;
  for (let i = 0; i < tokens.length; i++) {
    if (used.has(i) || !/\d/.test(tokens[i])) continue;
    const parsed = parseAmount(tokens[i].replace(/(р|руб)\.?$/i, ''));
    if (parsed) {
      amount = parsed.amount;
      plus = parsed.income;
      used.add(i);
      break;
    }
  }

  // Категория: по названиям подкатегорий и категорий, затем по прошлым комментариям.
  const words = tokens.map((_, i) => i).filter((i) => !used.has(i) && /\p{L}/u.test(norm[i]) && !STOP.has(norm[i]));
  type Hit = { opt: SubOption; score: number; by: 'name' | 'learned'; tokens: number[] };
  const hits: Hit[] = [];
  for (const opt of ctx.options) {
    const subWords = splitWords(opt.subName);
    const catWords = splitWords(opt.categoryName);
    let score = 0;
    const tokenIdx: number[] = [];
    const subHit = new Set<number>();
    for (const i of words) {
      const perWord = subWords.map((w) => wordScore(norm[i], w));
      const s = Math.max(...perWord, 0);
      const c = Math.max(...catWords.map((w) => wordScore(norm[i], w)), 0) - 2;
      const best = Math.max(s, c);
      if (best > 0) {
        score += best;
        tokenIdx.push(i);
        if (s >= c) perWord.forEach((v, k) => v > 0 && subHit.add(k));
      }
    }
    // Названы все слова подкатегории («доставка» → Доставка) — это точнее,
    // чем одно слово из длинного названия («BrandShop (доставка)»).
    if (subWords.length && subHit.size === subWords.length) score += 3;
    if (score > 0) hits.push({ opt, score, by: 'name', tokens: tokenIdx });
  }
  if (!hits.length && ctx.learned) {
    for (const i of words) {
      const m = ctx.learned.get(norm[i]);
      if (!m) continue;
      const total = [...m.values()].reduce((a, b) => a + b, 0);
      for (const [subId, n] of m) {
        const opt = ctx.options.find((o) => o.id === subId);
        if (!opt) continue;
        const share = n / total;
        if (share < 0.6) continue;
        const prev = hits.find((h) => h.opt.id === subId);
        const score = 2 + Math.min(n, 5) * 0.3 + share;
        if (prev) prev.score += score;
        else hits.push({ opt, score, by: 'learned', tokens: [] });
      }
    }
  }
  hits.sort((a, b) => b.score - a.score || b.opt.uses - a.opt.uses);

  let subcategoryId: string | null = null;
  let matchedBy: ParsedLine['matchedBy'] = null;
  let candidates: string[] = [];
  let ambiguous = false;
  if (hits.length) {
    const top = hits[0];
    const tied = hits.filter((h) => h.score === top.score);
    subcategoryId = top.opt.id;
    matchedBy = top.by;
    if (tied.length > 1) {
      ambiguous = true;
      candidates = tied.slice(0, 3).map((h) => h.opt.id);
    }
    if (top.by === 'name') top.tokens.forEach((i) => used.add(i));
  }

  const chosen = subcategoryId ? ctx.options.find((o) => o.id === subcategoryId) : undefined;
  const comment = tokens.filter((_, i) => !used.has(i)).join(' ');
  const base = {
    raw,
    amount,
    income: chosen ? chosen.type === 'income' : plus,
    date: date ?? ctx.defaultDate,
    dateGiven: date !== null,
    subcategoryId,
    matchedBy,
    candidates,
    comment,
  };
  if (amount === null) return { ...base, status: 'error', error: 'Не нашёл сумму' };
  return { ...base, status: !subcategoryId || ambiguous ? 'unsure' : 'ok' };
}

/** Несколько строк сразу (например, вставка из заметок). Дата без указания берётся из прошлой строки. */
export function parseMany(text: string, ctx: ParseContext): ParsedLine[] {
  const out: ParsedLine[] = [];
  let defaultDate = ctx.defaultDate;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = parseLine(line, { ...ctx, defaultDate });
    out.push(parsed);
    defaultDate = parsed.date;
  }
  return out;
}
