// Сводка по месяцу для Главной.

import { addDays, endOfMonth, startOfMonth } from './dates';
import { totals, type Index, type Totals } from './ops';
import type { Operation } from './types';

export interface MonthSummary {
  /** 'ГГГГ-ММ' */
  month: string;
  totals: Totals;
  /** Дни без единой операции — с начала учёта и до вчерашнего дня (для прошлых месяцев — до конца месяца). */
  emptyDays: string[];
}

export function monthSummary(ops: Operation[], ix: Index, month: string, today: string): MonthSummary {
  const inMonth = ops.filter((op) => op.date.startsWith(month));
  const start = `${month}-01`;
  const firstEver = ops.reduce<string | null>((min, op) => (!min || op.date < min ? op.date : min), null);
  const last = month === today.slice(0, 7) ? addDays(today, -1) : endOfMonth(start);
  const emptyDays: string[] = [];
  if (firstEver && month <= today.slice(0, 7)) {
    const withOps = new Set(inMonth.map((op) => op.date));
    let d = firstEver > start ? firstEver : startOfMonth(start);
    while (d <= last) {
      if (!withOps.has(d)) emptyDays.push(d);
      d = addDays(d, 1);
    }
  }
  return { month, totals: totals(inMonth, ix), emptyDays };
}
