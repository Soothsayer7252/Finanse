import { describe, expect, it } from 'vitest';
import { normalizeData } from './backup';
import { convertLegacy } from './legacy';

const op = (id: string, amount = 100) => ({ id, date: '2026-10-01', amount, subcategoryId: null, comment: '' });

describe('проверка данных', () => {
  it('повторяющиеся номера операций получают новые номера, ничего не теряется', () => {
    const { data, problems } = normalizeData({ schemaVersion: 1, categories: [], subcategories: [], operations: [op('a', 1), op('a', 2), op('a', 3)] });
    expect(data.operations).toHaveLength(3);
    expect(new Set(data.operations.map((o) => o.id)).size).toBe(3);
    expect(data.operations.map((o) => o.amount)).toEqual([1, 2, 3]);
    expect(problems).toContain('Операций с повторяющимся номером: 2 — им выданы новые номера.');
  });

  it('то же при переносе из старой версии', () => {
    const legacy = {
      version: 5,
      categories: [{ id: 'c', name: 'Еда', type: 'expense' }],
      subcategories: [{ id: 's', name: 'Кафе', categoryId: 'c' }],
      operations: [
        { id: 'x', subcategoryId: 's', date: '2026-10-01', amount: 1, includeInAnalytics: true },
        { id: 'x', subcategoryId: 's', date: '2026-10-02', amount: 2, includeInAnalytics: true },
      ],
    };
    const { data } = convertLegacy(legacy);
    expect(new Set(data.operations.map((o) => o.id)).size).toBe(2);
  });

  it('быстрый период сохраняется в настройках', () => {
    const { data } = normalizeData({ categories: [], subcategories: [], operations: [], settings: { period: { mode: 'range', from: '2026-10-01', to: '2026-10-31', quick: 'month' } } });
    expect(data.settings.period.quick).toBe('month');
  });
});
