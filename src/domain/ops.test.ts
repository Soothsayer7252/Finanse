import { describe, expect, it } from 'vitest';
import { buildIndex, opGroup, opType, searchSubOptions, subOptions, totals } from './ops';
import type { Category, Operation, Subcategory } from './types';

const categories: Category[] = [
  { id: 'food', name: 'Еда', type: 'expense', archived: false },
  { id: 'tech', name: 'Техника', type: 'expense', archived: false },
  { id: 'inc', name: 'Доходы', type: 'income', archived: false },
  { id: 'inv', name: 'Инвестиции', type: 'investment', archived: false },
];
const subcategories: Subcategory[] = [
  { id: 'deliv', categoryId: 'food', name: 'Доставка', archived: false, group: 'daily' },
  { id: 'market', categoryId: 'food', name: 'Супермаркеты', archived: false, group: 'daily' },
  { id: 'pc', categoryId: 'tech', name: 'PC', archived: false, group: 'large' },
  { id: 'salary', categoryId: 'inc', name: 'Зарплата', archived: false, incomeKind: 'stable' },
  { id: 'crypto', categoryId: 'inv', name: 'Crypto', archived: false },
  { id: 'old', categoryId: 'food', name: 'Доширак', archived: true, group: 'daily' },
];
const ix = buildIndex({ categories, subcategories });

const op = (amount: number, subcategoryId: string | null, extra: Partial<Operation> = {}): Operation => ({
  id: Math.random().toString(),
  date: '2026-10-01',
  amount,
  subcategoryId,
  comment: '',
  createdAt: '',
  updatedAt: '',
  ...extra,
});

describe('тип операции определяется сам', () => {
  it('по категории', () => {
    expect(opType(op(100, 'deliv'), ix)).toBe('expense');
    expect(opType(op(100, 'salary'), ix)).toBe('income');
    expect(opType(op(100, 'crypto'), ix)).toBe('investment');
  });

  it('без категории — расход, если не отмечен как доход', () => {
    expect(opType(op(100, null), ix)).toBe('expense');
    expect(opType(op(100, null, { inboxType: 'income' }), ix)).toBe('income');
  });

  it('категория важнее отметки «доход» из входящих', () => {
    expect(opType(op(100, 'deliv', { inboxType: 'income' }), ix)).toBe('expense');
  });
});

describe('группа расхода', () => {
  it('берётся из подкатегории, а ручная отметка у операции важнее', () => {
    expect(opGroup(op(100, 'pc'), ix)).toBe('large');
    expect(opGroup(op(100, 'deliv'), ix)).toBe('daily');
    expect(opGroup(op(15000, 'deliv', { groupOverride: 'large' }), ix)).toBe('large');
    expect(opGroup(op(100, null), ix)).toBe('daily');
  });
});

describe('итоги', () => {
  it('вложения не считаются тратой', () => {
    const t = totals([op(1000, 'deliv'), op(40000, 'pc'), op(100000, 'salary'), op(10000, 'crypto'), op(500, null)], ix);
    expect(t).toEqual({
      count: 5,
      income: 100000,
      expense: 41500,
      expenseDaily: 1500,
      expenseLarge: 40000,
      investment: 10000,
      result: 58500,
    });
  });
});

describe('поиск подкатегории', () => {
  const uses = new Map([['market', 50], ['deliv', 10]]);
  const options = subOptions({ categories, subcategories }, uses);

  it('архивные не предлагаются', () => {
    expect(options.map((o) => o.id)).not.toContain('old');
  });

  it('по первым буквам подкатегории', () => {
    expect(searchSubOptions(options, 'дос')[0].id).toBe('deliv');
  });

  it('по названию категории — сначала часто используемые', () => {
    expect(searchSubOptions(options, 'еда').map((o) => o.id)).toEqual(['market', 'deliv']);
  });

  it('по нескольким словам и без учёта регистра', () => {
    expect(searchSubOptions(options, 'ЕДА дост').map((o) => o.id)).toEqual(['deliv']);
    expect(searchSubOptions(options, 'pc')[0].id).toBe('pc');
  });

  it('пустой запрос — все варианты, частые сверху', () => {
    expect(searchSubOptions(options, '')[0].id).toBe('market');
  });
});
