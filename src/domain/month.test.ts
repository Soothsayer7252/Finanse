import { describe, expect, it } from 'vitest';
import { monthSummary } from './month';
import { buildIndex } from './ops';
import type { Operation } from './types';

const ix = buildIndex({ categories: [{ id: 'c', name: 'Еда', type: 'expense', archived: false }], subcategories: [{ id: 's', categoryId: 'c', name: 'Кафе', archived: false }] });
const op = (date: string, amount = 100): Operation => ({ id: date + amount, date, amount, subcategoryId: 's', comment: '', createdAt: '', updatedAt: '' });

describe('сводка месяца', () => {
  const ops = [op('2026-09-03'), op('2026-09-04'), op('2026-09-06', 50), op('2026-10-01'), op('2026-10-17')];

  it('пустые дни прошлого месяца — с начала учёта до конца месяца', () => {
    const s = monthSummary(ops, ix, '2026-09', '2026-10-18');
    expect(s.totals.expense).toBe(250);
    expect(s.emptyDays[0]).toBe('2026-09-05');
    expect(s.emptyDays).not.toContain('2026-09-01'); // до начала учёта не считается
    expect(s.emptyDays.at(-1)).toBe('2026-09-30');
    expect(s.emptyDays).toHaveLength(1 + 24);
  });

  it('текущий месяц — до вчерашнего дня, сегодня ещё не пропуск', () => {
    const s = monthSummary(ops, ix, '2026-10', '2026-10-18');
    expect(s.emptyDays.at(-1)).toBe('2026-10-16');
    expect(s.emptyDays).not.toContain('2026-10-18');
    expect(s.emptyDays).toHaveLength(15);
  });

  it('без операций вообще — пропусков нет', () => {
    expect(monthSummary([], ix, '2026-10', '2026-10-18').emptyDays).toEqual([]);
  });
});
