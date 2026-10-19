// «Обычно», лимиты и выводы для Главной. Правила — docs/SPEC.md, разделы 3 и 4.
//
// «Обычно» — медиана последних (до 6) полных месяцев до выбранного, только повседневные
// траты, без аномально крупных чеков. Для текущего месяца сравниваем честно по времени:
// сколько обычно было потрачено к этому же числу месяца.

import { addMonths, daysInMonth, parseISO } from './dates';
import { formatMoney, round2 } from './money';
import { plural } from './text';
import { opGroup, opType, type Index } from './ops';
import type { LimitSet, Operation } from './types';

const BASELINE_MONTHS = 6;
const MIN_BASELINE = 3;

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const monthOf = (iso: string) => iso.slice(0, 7);
const monthStart = (m: string) => `${m}-01`;

// ——— Лимиты ———

/** Лимиты, действующие в месяце: последняя запись, начавшаяся не позже него. */
export function limitsFor(month: string, limits: LimitSet[]): LimitSet | null {
  let found: LimitSet | null = null;
  for (const l of limits) if (l.from <= month && (!found || l.from > found.from)) found = l;
  return found;
}

/** Добавляет или заменяет запись с тем же месяцем начала. */
export function upsertLimits(limits: LimitSet[], next: LimitSet): LimitSet[] {
  return [...limits.filter((l) => l.from !== next.from), next].sort((a, b) => a.from.localeCompare(b.from));
}

/** Сколько месяца прошло: для прошлых месяцев — весь, для текущего — по сегодняшнее число. */
export function monthProgress(month: string, today: string): { day: number; days: number; share: number } {
  const [y, m] = parseISO(monthStart(month));
  const days = daysInMonth(y, m);
  if (month < monthOf(today)) return { day: days, days, share: 1 };
  if (month > monthOf(today)) return { day: 0, days, share: 0 };
  const day = parseISO(today)[2];
  return { day, days, share: day / days };
}

// ——— Базовые месяцы и «обычно» ———

/**
 * Полные месяцы до выбранного, по которым считается «обычно» (не больше 6).
 * Первый месяц учёта не берётся, если записи в нём начались не с начала месяца.
 */
export function baselineMonths(ops: Operation[], month: string): string[] {
  const first = ops.reduce<string | null>((min, op) => (!min || op.date < min ? op.date : min), null);
  if (!first) return [];
  const firstFull = parseISO(first)[2] <= 3 ? monthOf(first) : monthOf(addMonths(monthStart(monthOf(first)), 1));
  const out: string[] = [];
  for (let i = 1; i <= BASELINE_MONTHS; i++) {
    const m = monthOf(addMonths(monthStart(month), -i));
    if (m < firstFull) break;
    out.unshift(m);
  }
  return out;
}

export interface MonthTotals {
  daily: number;
  large: number;
  /** Стабильный + дополнительный доход (инвестиционный не входит). */
  income: number;
}

function totalsOf(ops: Operation[], ix: Index): MonthTotals {
  const t = { daily: 0, large: 0, income: 0 };
  for (const op of ops) {
    const type = opType(op, ix);
    if (type === 'expense') t[opGroup(op, ix) === 'large' ? 'large' : 'daily'] += op.amount;
    else if (type === 'income') {
      const kind = op.subcategoryId ? ix.sub.get(op.subcategoryId)?.incomeKind : undefined;
      if (kind !== 'investment') t.income += op.amount;
    }
  }
  return { daily: round2(t.daily), large: round2(t.large), income: round2(t.income) };
}

export function monthTotals(ops: Operation[], ix: Index, month: string): MonthTotals {
  return totalsOf(ops.filter((op) => op.date.startsWith(month)), ix);
}

/** Сколько обычно уходит и приходит за полный месяц — подсказка при выборе лимитов. */
export function usualMonth(ops: Operation[], ix: Index, month: string): (MonthTotals & { months: number }) | null {
  const base = baselineMonths(ops, month);
  if (base.length < MIN_BASELINE) return null;
  const per = base.map((m) => monthTotals(ops, ix, m));
  return {
    daily: round2(median(per.map((t) => t.daily))),
    large: round2(median(per.map((t) => t.large))),
    income: round2(median(per.map((t) => t.income))),
    months: base.length,
  };
}

// ——— Сравнение категорий с обычным ———

export interface CategoryChange {
  categoryId: string;
  name: string;
  /** Сколько в этом месяце (для текущего — по сегодня). */
  current: number;
  /** Сколько обычно к этому же числу. */
  usual: number;
  delta: number;
  direction: 'up' | 'down';
  /** Готовый вывод: «Еда на 19% больше обычного». */
  title: string;
  /** Почему: «чаще обычного: 14 раз вместо ~8», «одна трата 7 500 ₽ — PC». */
  reason: string;
}

/** Порог «аномально крупного чека» в категории: в 4 раза больше типичного, но не меньше 3 000 ₽. */
function outlierThreshold(amounts: number[]): number {
  return Math.max(3000, 4 * median(amounts));
}

export function categoryChanges(ops: Operation[], ix: Index, month: string, today: string): CategoryChange[] {
  const base = baselineMonths(ops, month);
  if (base.length < MIN_BASELINE) return [];
  const progress = monthProgress(month, today);
  if (progress.day === 0) return [];

  const daily = (op: Operation) => opType(op, ix) === 'expense' && opGroup(op, ix) === 'daily' && !!op.subcategoryId;
  const catOf = (op: Operation) => ix.sub.get(op.subcategoryId!)!.categoryId;
  const dayOf = (op: Operation) => parseISO(op.date)[2];

  // Типичный чек по категории — по базовым месяцам.
  const baseSet = new Set(base);
  const amountsByCat = new Map<string, number[]>();
  for (const op of ops) {
    if (!baseSet.has(monthOf(op.date)) || !daily(op)) continue;
    const c = catOf(op);
    (amountsByCat.get(c) ?? amountsByCat.set(c, []).get(c)!).push(op.amount);
  }
  const thresholds = new Map([...amountsByCat].map(([c, a]) => [c, outlierThreshold(a)]));

  // Базовые месяцы: суммы к тому же числу месяца, без аномальных чеков.
  const baseSums = new Map<string, { sums: number[]; counts: number[]; subs: Map<string, number[]> }>();
  base.forEach((m, idx) => {
    const [y, mm] = parseISO(monthStart(m));
    const cutoff = Math.round(progress.share * daysInMonth(y, mm));
    for (const op of ops) {
      if (!op.date.startsWith(m) || !daily(op) || dayOf(op) > cutoff) continue;
      const c = catOf(op);
      if (op.amount > (thresholds.get(c) ?? Infinity)) continue;
      let b = baseSums.get(c);
      if (!b) baseSums.set(c, (b = { sums: Array(base.length).fill(0), counts: Array(base.length).fill(0), subs: new Map() }));
      b.sums[idx] += op.amount;
      b.counts[idx]++;
      const subArr = b.subs.get(op.subcategoryId!) ?? Array(base.length).fill(0);
      subArr[idx] += op.amount;
      b.subs.set(op.subcategoryId!, subArr);
    }
  });

  // Этот месяц.
  const cur = new Map<string, { ops: Operation[]; sum: number }>();
  for (const op of ops) {
    if (!op.date.startsWith(month) || !daily(op) || op.date > today) continue;
    const c = catOf(op);
    const e = cur.get(c) ?? { ops: [], sum: 0 };
    e.ops.push(op);
    e.sum += op.amount;
    cur.set(c, e);
  }

  const out: CategoryChange[] = [];
  for (const catId of new Set([...cur.keys(), ...baseSums.keys()])) {
    const cat = ix.cat.get(catId);
    if (!cat) continue;
    const current = round2(cur.get(catId)?.sum ?? 0);
    const b = baseSums.get(catId);
    const usual = round2(b ? median(b.sums) : 0);
    const delta = round2(current - usual);
    const ratio = usual > 0 ? current / usual : Infinity;
    const up = delta >= 1000 && ratio >= 1.2;
    // В первые дни месяца «меньше обычного» почти ничего не значит.
    const down = delta <= -1000 && ratio <= 0.7 && progress.day >= 7;
    if (!up && !down) continue;

    const pct = Math.round((ratio - 1) * 100);
    const count = cur.get(catId)?.ops.length ?? 0;
    const title = up
      ? usual === 0
        ? `${cat.name} — непривычн${count === 1 ? 'ая трата' : 'ые траты'}`
        : ratio >= 5
          ? `${cat.name} намного больше обычного`
          : ratio >= 1.9
            ? `${cat.name} в ${formatRatio(ratio)} больше обычного`
            : `${cat.name} на ${pct}% больше обычного`
      : ratio <= 0.55
        ? `${cat.name} ${ratio <= 0.35 ? 'намного' : 'вдвое'} меньше обычного`
        : `${cat.name} на ${Math.abs(pct)}% меньше обычного`;

    out.push({
      categoryId: catId,
      name: cat.name,
      current,
      usual,
      delta,
      direction: up ? 'up' : 'down',
      title,
      reason: explain(up, cur.get(catId)?.ops ?? [], b, delta, thresholds.get(catId) ?? Infinity, ix),
    });
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function formatRatio(r: number): string {
  const rounded = Math.round(r * 10) / 10;
  if (rounded < 2.5) return '2 раза';
  return `${String(rounded).replace('.', ',')} раза`;
}

const money = (n: number) => formatMoney(n, { whole: true });
/** Число без знака рубля: «41 200». */
const num = (n: number) => money(n).replace(' ₽', '');

/** Почему категория отличается от обычного: разовая трата, чаще, дороже или какая подкатегория. */
function explain(
  up: boolean,
  curOps: Operation[],
  base: { sums: number[]; counts: number[]; subs: Map<string, number[]> } | undefined,
  delta: number,
  threshold: number,
  ix: Index,
): string {
  const subName = (id: string) => ix.sub.get(id)?.name ?? '';
  const signed = (n: number) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`;
  // Какие подкатегории дали разницу: одна главная или две заметные.
  const subDelta = new Map<string, number>();
  for (const op of curOps) subDelta.set(op.subcategoryId!, (subDelta.get(op.subcategoryId!) ?? 0) + op.amount);
  for (const [id, arr] of base?.subs ?? []) subDelta.set(id, (subDelta.get(id) ?? 0) - median(arr));
  const drivers = [...subDelta].filter(([, d]) => (up ? d > 0 : d < 0)).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  let driverText = '';
  if (subDelta.size > 1 && drivers.length) {
    const [[id1, d1], second] = drivers;
    if (Math.abs(d1) >= Math.abs(delta) * 0.65) driverText = `в основном ${subName(id1)}: ${signed(d1)}`;
    else if (second && Math.abs(second[1]) >= Math.abs(delta) * 0.2) driverText = `в основном ${subName(id1)} ${signed(d1)} и ${subName(second[0])} ${signed(second[1])}`;
  }

  const count = curOps.length;
  const usualSum = median(base?.sums ?? []);
  const usualCount = Math.round(median(base?.counts ?? []));
  const avg = count ? curOps.reduce((s, o) => s + o.amount, 0) / count : 0;
  const usualAvg = usualCount ? usualSum / usualCount : 0;
  const times = (n: number) => `${n} ${plural(n, 'раз', 'раза', 'раз')}`;
  const join = (...parts: string[]) => parts.filter(Boolean).join('; ');

  if (!up) {
    if (count === 0) return join(`ни одной траты, обычно ~${times(usualCount)}`, driverText);
    if (usualCount - count >= 2 && count <= usualCount * 0.7) return join(`реже обычного: ${times(count)} вместо ~${usualCount}`, driverText);
    if (usualAvg > 0 && avg <= usualAvg * 0.75) return join(`траты мельче: в среднем ${money(avg)} вместо ~${money(usualAvg)}`, driverText);
    return driverText;
  }

  const biggest = curOps.reduce<Operation | null>((m, op) => (!m || op.amount > m.amount ? op : m), null);
  const what = (op: Operation) => [subName(op.subcategoryId!), op.comment].filter(Boolean).join(', ');
  if (usualSum === 0) {
    if (count === 1 && biggest) return `одна трата ${money(biggest.amount)} — ${what(biggest)}`;
    const subs = new Set(curOps.map((op) => op.subcategoryId!));
    const n = `${count} ${plural(count, 'трата', 'траты', 'трат')}`;
    return subs.size === 1 ? `${n} — ${subName([...subs][0])}` : join(n, driverText);
  }
  if (biggest && biggest.amount > threshold && biggest.amount >= delta * 0.5) return `разовая трата ${money(biggest.amount)} — ${what(biggest)}`;
  if (count >= usualCount * 1.3 && count - usualCount >= 2) return join(`чаще обычного: ${times(count)} вместо ~${usualCount}`, driverText);
  if (usualAvg > 0 && avg >= usualAvg * 1.25) return join(`траты крупнее: в среднем ${money(avg)} вместо ~${money(usualAvg)}`, driverText);
  return driverText || 'понемногу больше во всём';
}

// ——— Темп по лимиту ———

export interface Pace {
  spent: number;
  limit: number;
  /** Прогноз на конец месяца при нынешнем темпе (только для текущего месяца). */
  projected: number | null;
}

export function dailyPace(ops: Operation[], ix: Index, month: string, today: string, limit: number): Pace {
  const spent = monthTotals(
    ops.filter((op) => op.date <= today),
    ix,
    month,
  ).daily;
  const p = monthProgress(month, today);
  const projected = p.share > 0 && p.share < 1 && p.day >= 5 ? round2((spent / p.day) * p.days) : null;
  return { spent, limit, projected };
}

// ——— Полоска «сколько из скольких» ———

export interface LimitStatus {
  /** Заполнение полоски 0…1; null — лимит не задан, полоски нет. */
  fill: number | null;
  /** «55 333 / 60 000» или, без лимита, «55 333 ₽». */
  value: string;
  /** Пояснение под полоской. */
  note: string;
  tone: 'ok' | 'warn' | 'over' | 'neutral';
}

/**
 * Подпись к полоске лимита (kind 'expense') или цели по доходу (kind 'income').
 * projected — прогноз на конец месяца, только для повседневных трат текущего месяца.
 */
export function limitStatus(
  kind: 'expense' | 'income',
  spent: number,
  limit: number | null,
  usual: number | null,
  progress: { day: number; days: number; share: number },
  projected: number | null = null,
): LimitStatus {
  if (limit == null || limit <= 0) {
    const what = kind === 'income' ? 'Цель не задана' : 'Лимит не задан';
    return { fill: null, value: money(spent), note: usual ? `${what} · обычно ~${money(usual)}` : what, tone: 'neutral' };
  }
  const value = `${num(spent)} / ${num(limit)}`;
  const fill = Math.min(spent / limit, 1);
  const past = progress.share >= 1;

  if (kind === 'income') {
    if (spent >= limit) return { fill, value, note: spent > limit ? `Цель выполнена, +${money(spent - limit)}` : 'Цель выполнена', tone: 'ok' };
    return past ? { fill, value, note: `До цели не хватило ${money(limit - spent)}`, tone: 'warn' } : { fill, value, note: `До цели ${money(limit - spent)}`, tone: 'neutral' };
  }

  const left = limit - spent;
  if (left < 0) return { fill, value, note: `Перерасход ${money(-left)}`, tone: 'over' };
  if (past) return { fill, value, note: `Уложились, осталось ${money(left)}`, tone: 'ok' };
  if (projected != null && projected > limit) return { fill, value, note: `Темп выше лимита — к концу ~${money(projected)}`, tone: 'warn' };
  const daysLeft = progress.days - progress.day + 1;
  if (projected != null && daysLeft > 1) return { fill, value, note: `Осталось ${money(left)} · ~${money(left / daysLeft)} в день`, tone: 'ok' };
  return { fill, value, note: `Осталось ${money(left)}`, tone: 'ok' };
}

// ——— Крупные покупки месяца ———

/** Самые крупные покупки месяца из группы «крупные» — чтобы объяснить перерасход этого лимита. */
export function topLarge(ops: Operation[], ix: Index, month: string, n = 2): Operation[] {
  return ops
    .filter((op) => op.date.startsWith(month) && opType(op, ix) === 'expense' && opGroup(op, ix) === 'large')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
}
