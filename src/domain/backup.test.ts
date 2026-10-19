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

  it('лимиты сохраняются в копии, испорченные записи отбрасываются', () => {
    const limits = [
      { from: '2026-10', daily: 60000, large: null, income: 90000 },
      { from: '2026-04', daily: '50000', large: -5, income: 0 },
      { from: '2026-13', daily: 1, large: 1, income: 1 },
      { from: 'когда-то', daily: 1, large: 1, income: 1 },
      { from: '2026-10', daily: 1, large: 1, income: 1 },
      null,
    ];
    const { data } = normalizeData({ schemaVersion: 1, categories: [], subcategories: [], operations: [], settings: { limits } });
    expect(data.settings.limits).toEqual([
      { from: '2026-04', daily: null, large: null, income: null },
      { from: '2026-10', daily: 60000, large: null, income: 90000 },
    ]);
  });

  it('старая копия без лимитов открывается с пустым списком', () => {
    expect(normalizeData({ schemaVersion: 1, categories: [], subcategories: [], operations: [], settings: { lastDate: '2026-10-01' } }).data.settings.limits).toEqual([]);
  });
});
