// Работа с датами 'ГГГГ-ММ-ДД' без часовых поясов.
// В старой версии даты сдвигались на день из-за toISOString() (UTC):
// здесь вся арифметика идёт через Date.UTC, поэтому результат не зависит от пояса.

import type { Period } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseISO(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m, d];
}

export function isValidISO(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = parseISO(iso);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/** Сегодняшняя дата по местному времени пользователя. */
export function todayISO(now: Date = new Date()): string {
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = parseISO(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Прибавляет месяцы; 31 января + 1 месяц = 28/29 февраля. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = parseISO(iso);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return toISO(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
  const [y, m] = parseISO(iso);
  return toISO(y, m, daysInMonth(y, m));
}

/** Диапазон дат периода (включительно) или null, если период — «всё время». */
export function periodRange(p: Period): { from: string; to: string } | null {
  if (p.mode === 'single' && p.single) return { from: p.single, to: p.single };
  if (p.mode === 'range' && p.from && p.to) return { from: p.from, to: p.to };
  return null;
}

export function inPeriod(date: string, p: Period): boolean {
  const r = periodRange(p);
  return !r || (date >= r.from && date <= r.to);
}

export type QuickPeriod = 'today' | 'month' | 'prevMonth' | 'all';

export function quickPeriod(kind: QuickPeriod, today: string): Period {
  if (kind === 'today') return { mode: 'single', single: today, from: '', to: '', quick: 'today' };
  if (kind === 'month') return { mode: 'range', single: '', from: startOfMonth(today), to: endOfMonth(today), quick: 'month' };
  if (kind === 'prevMonth') {
    const prev = addMonths(startOfMonth(today), -1);
    return { mode: 'range', single: '', from: prev, to: endOfMonth(prev), quick: 'prevMonth' };
  }
  return { mode: 'all', single: '', from: '', to: '' };
}

/** Период с актуальными датами: «Этот месяц», выбранный в октябре, в ноябре означает ноябрь. */
export function resolvePeriod(p: Period, today: string): Period {
  return p.quick ? quickPeriod(p.quick, today) : p;
}

/** 05.10.2026 */
export function formatDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** Заголовок дня в списке: «Сегодня», «Вчера», «29 сентября, вторник» (год — только если не текущий). */
export function formatDayTitle(iso: string, today: string): string {
  if (iso === today) return 'Сегодня';
  if (iso === addDays(today, -1)) return 'Вчера';
  const [y, m, d] = parseISO(iso);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const year = iso.slice(0, 4) === today.slice(0, 4) ? '' : ` ${y}`;
  return `${d} ${MONTHS_GEN[m - 1]}${year}, ${WEEKDAYS[wd]}`;
}

export function periodLabel(p: Period): string {
  if (p.mode === 'single' && p.single) return formatDate(p.single);
  if (p.mode === 'range' && p.from && p.to) {
    // Целый месяц показываем названием месяца.
    if (p.from === startOfMonth(p.from) && p.to === endOfMonth(p.from)) {
      const [y, m] = parseISO(p.from);
      const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      return name.charAt(0).toUpperCase() + name.slice(1).replace(' г.', '');
    }
    return `${formatDate(p.from)} — ${formatDate(p.to)}`;
  }
  return 'Всё время';
}
