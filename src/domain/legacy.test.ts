import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectFormat, normalizeData } from './backup';
import { convertLegacy, proposeGroup, proposeIncomeKind } from './legacy';
import { buildIndex, totals } from './ops';

const legacySample = {
  version: 5,
  settings: { lastOperationDate: '2026-09-22', theme: 'vasik' },
  categories: [
    { id: 'c_food', name: 'Еда', type: 'expense' },
    { id: 'c_hobby', name: 'Хобби', type: 'expense' },
    { id: 'c_dreams', name: 'Мечты', type: 'expense', archived: true },
    { id: 'c_subs', name: 'Подписки', type: 'expense', systemKey: 'subscriptions' },
    { id: 'c_inc', name: 'Доходы', type: 'income' },
  ],
  subcategories: [
    { id: 's_deliv', name: 'Доставка', categoryId: 'c_food' },
    { id: 's_crypto', name: 'Crypto', categoryId: 'c_hobby' },
    { id: 's_taxi', name: 'Такси', categoryId: 'c_dreams' },
    { id: 's_vpn', name: 'VPN', categoryId: 'c_subs', subscriptionValidUntil: '2026-11-01' },
    { id: 's_salary', name: 'Зарплата', categoryId: 'c_inc' },
    { id: 's_save', name: 'Накопительный счет', categoryId: 'c_inc' },
  ],
  operations: [
    { id: 'o1', subcategoryId: 's_deliv', date: '2026-09-01', amount: 700, description: ' пицца ', includeInAnalytics: true },
    { id: 'o2', subcategoryId: 's_crypto', date: '2026-09-02', amount: 9952, includeInAnalytics: true },
    { id: 'o3', subcategoryId: 's_taxi', date: '2026-09-03', amount: 380, includeInAnalytics: false, debtStatus: 'repaid' },
    { id: 'o4', subcategoryId: 's_vpn', date: '2026-09-04', amount: 300, includeInAnalytics: true },
    { id: 'o5', subcategoryId: 's_salary', date: '2026-09-05', amount: 70000, includeInAnalytics: true },
    { id: 'o6', subcategoryId: 's_deliv', date: 'плохая дата', amount: 100, includeInAnalytics: true },
  ],
};

describe('перенос из старой версии', () => {
  const { data, report } = convertLegacy(legacySample);
  const ix = buildIndex(data);

  it('распознаётся как старая версия', () => {
    expect(detectFormat(legacySample)).toBe('legacy');
  });

  it('операции «не в аналитике» не переносятся, остальные — да', () => {
    expect(report.skipped).toEqual({ count: 1, sum: 380 });
    expect(report.broken).toBe(1);
    expect(report.imported).toBe(4);
    expect(data.operations.map((o) => o.id)).toEqual(['o1', 'o2', 'o4', 'o5']);
  });

  it('комментарий переносится из описания', () => {
    expect(data.operations[0].comment).toBe('пицца');
  });

  it('Crypto уезжает в инвестиции, пустая категория «Хобби» исчезает', () => {
    const crypto = data.subcategories.find((s) => s.id === 's_crypto')!;
    expect(ix.cat.get(crypto.categoryId)!.type).toBe('investment');
    expect(data.categories.find((c) => c.id === 'c_hobby')).toBeUndefined();
    expect(report.movedToInvestments).toEqual({ names: ['Crypto'], count: 1, sum: 9952 });
  });

  it('«Подписки» становятся обычной категорией расходов, архив остаётся архивом', () => {
    expect(data.categories.find((c) => c.id === 'c_subs')).toEqual({ id: 'c_subs', name: 'Подписки', type: 'expense', archived: false });
    expect(data.categories.find((c) => c.id === 'c_dreams')!.archived).toBe(true);
  });

  it('вложение не считается тратой', () => {
    const t = totals(data.operations, ix);
    expect(t.expense).toBe(1000);
    expect(t.investment).toBe(9952);
    expect(t.income).toBe(70000);
  });

  it('результат проходит проверку как наш формат', () => {
    const again = normalizeData(JSON.parse(JSON.stringify(data)));
    expect(again.problems).toEqual([]);
    expect(again.data).toEqual(data);
  });
});

describe('предложения групп и видов дохода', () => {
  it('крупные покупки', () => {
    expect(proposeGroup('Техника', 'PC')).toBe('large');
    expect(proposeGroup('Одежда', 'Магазин')).toBe('large');
    expect(proposeGroup('Саша', 'Подарки')).toBe('large');
    expect(proposeGroup('Для дома', 'Кухонная утварь')).toBe('large');
    expect(proposeGroup('Одежда', 'BrandShop (доставка)')).toBe('large');
  });

  it('повседневные', () => {
    expect(proposeGroup('Еда', 'Доставка')).toBe('daily');
    expect(proposeGroup('Транспорт', 'Такси')).toBe('daily');
    expect(proposeGroup('Саша', 'VPN')).toBe('daily');
  });

  it('виды дохода', () => {
    expect(proposeIncomeKind('Зарплата')).toBe('stable');
    expect(proposeIncomeKind('Накопительный счет')).toBe('investment');
    expect(proposeIncomeKind('Подработка')).toBe('extra');
    expect(proposeIncomeKind('Чаевые')).toBe('extra');
  });
});

// Проверка на настоящем файле владельца, если он лежит в репозитории.
const REAL = 'data/finance-backup-2026-10-18.json';
describe.skipIf(!existsSync(REAL))('перенос реального бэкапа', () => {
  it('сходятся количества и суммы', () => {
    const json = JSON.parse(readFileSync(REAL, 'utf-8'));
    expect(detectFormat(json)).toBe('legacy');
    const { data, report } = convertLegacy(json);
    expect(report.totalOps).toBe(1135);
    expect(report.skipped.count).toBe(31);
    expect(report.broken).toBe(0);
    expect(report.imported).toBe(1104);
    expect(report.movedToInvestments.names).toEqual(['Crypto']);

    // Всё, что было в аналитике, перенесено без потерь: расходы + вложения = старые расходы.
    const oldSubs = new Map(json.subcategories.map((s: { id: string; categoryId: string }) => [s.id, s.categoryId]));
    const oldCats = new Map(json.categories.map((c: { id: string; type: string }) => [c.id, c.type]));
    let oldExpense = 0;
    let oldIncome = 0;
    for (const op of json.operations) {
      if (op.includeInAnalytics === false) continue;
      if (oldCats.get(oldSubs.get(op.subcategoryId)) === 'income') oldIncome += op.amount;
      else oldExpense += op.amount;
    }
    const t = totals(data.operations, buildIndex(data));
    expect(t.income).toBeCloseTo(oldIncome, 2);
    expect(t.expense + t.investment).toBeCloseTo(oldExpense, 2);
    expect(normalizeData(JSON.parse(JSON.stringify(data))).problems).toEqual([]);
  });
});
