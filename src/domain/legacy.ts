// Перенос данных из старой версии (v1.1, файл finance-backup-*.json).
// Правила переноса описаны в docs/SPEC.md, раздел 8.

import { isValidISO, todayISO } from './dates';
import { uid } from './ids';
import { round2 } from './money';
import { normalize } from './ops';
import { SCHEMA_VERSION, type AppData, type Category, type ExpenseGroup, type IncomeKind, type Operation, type Subcategory } from './types';

export interface LegacyReport {
  totalOps: number;
  imported: number;
  /** Операции «не в аналитике» / долги — не переносятся. */
  skipped: { count: number; sum: number };
  /** Подкатегории, перенесённые из расходов в инвестиции. */
  movedToInvestments: { names: string[]; count: number; sum: number };
  /** Пропущены из-за неверной даты или суммы. */
  broken: number;
}

export interface LegacyResult {
  data: AppData;
  report: LegacyReport;
}

const LARGE_HINTS = ['техник', 'одежд', 'для дома', 'путешеств', 'подар', 'мебел', 'ремонт', 'самокат', 'электрон', 'brandshop', 'pc', 'отпуск'];
const INVEST_HINTS = ['crypto', 'крипт', 'инвест', 'акци', 'облигац'];
const STABLE_HINTS = ['зарплат', 'оклад', 'аванс', 'преми'];
const INVEST_INCOME_HINTS = ['накопительн', 'вклад', 'процент', 'дивиденд', 'инвест', 'крипт', 'crypto'];

const hasHint = (text: string, hints: string[]) => {
  const t = normalize(text);
  return hints.some((h) => t.split(/[\s()+,.]+/).some((word) => word.startsWith(h)) || (h.includes(' ') && t.includes(h)));
};

/** Предложение группы расхода по названиям. Владелец потом подтверждает. */
export function proposeGroup(categoryName: string, subName: string): ExpenseGroup {
  return hasHint(categoryName, LARGE_HINTS) || hasHint(subName, LARGE_HINTS) ? 'large' : 'daily';
}

/** Предложение вида дохода по названию подкатегории. */
export function proposeIncomeKind(subName: string): IncomeKind {
  if (hasHint(subName, STABLE_HINTS)) return 'stable';
  if (hasHint(subName, INVEST_INCOME_HINTS)) return 'investment';
  return 'extra';
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function convertLegacy(json: unknown): LegacyResult {
  const o = (json ?? {}) as Raw;
  const rawCats = (Array.isArray(o.categories) ? o.categories : []) as Raw[];
  const rawSubs = (Array.isArray(o.subcategories) ? o.subcategories : []) as Raw[];
  const rawOps = (Array.isArray(o.operations) ? o.operations : []) as Raw[];

  const categories: Category[] = rawCats
    .filter((c) => typeof c.id === 'string')
    .map((c) => ({
      id: c.id as string,
      name: str(c.name) || 'Без названия',
      type: c.type === 'income' ? 'income' : 'expense',
      archived: c.archived === true,
    }));
  const catById = new Map(categories.map((c) => [c.id, c]));

  const subcategories: Subcategory[] = [];
  for (const s of rawSubs) {
    const cat = catById.get(str(s.categoryId));
    if (typeof s.id !== 'string' || !cat) continue;
    const name = str(s.name) || 'Без названия';
    const sub: Subcategory = { id: s.id, categoryId: cat.id, name, archived: s.archived === true };
    if (cat.type === 'income') sub.incomeKind = proposeIncomeKind(name);
    else sub.group = proposeGroup(cat.name, name);
    subcategories.push(sub);
  }

  // Вложения (например, «Хобби › Crypto») — это не трата: переносим в категорию «Инвестиции».
  const investSubs = subcategories.filter((s) => {
    const cat = catById.get(s.categoryId)!;
    return cat.type === 'expense' && (hasHint(s.name, INVEST_HINTS) || hasHint(cat.name, INVEST_HINTS));
  });
  if (investSubs.length) {
    let investCat = categories.find((c) => c.type === 'investment');
    if (!investCat) {
      investCat = { id: 'cat_investments', name: 'Инвестиции', type: 'investment', archived: false };
      categories.push(investCat);
    }
    for (const s of investSubs) {
      s.categoryId = investCat.id;
      delete s.group;
    }
  }
  // Категории, которые после переноса остались без подкатегорий, убираем.
  const usedCats = new Set(subcategories.map((s) => s.categoryId));
  const keptCategories = categories.filter((c) => usedCats.has(c.id) || !rawSubs.some((s) => s.categoryId === c.id));

  const subById = new Map(subcategories.map((s) => [s.id, s]));
  const investIds = new Set(investSubs.map((s) => s.id));
  const report: LegacyReport = {
    totalOps: rawOps.length,
    imported: 0,
    skipped: { count: 0, sum: 0 },
    movedToInvestments: { names: investSubs.map((s) => s.name), count: 0, sum: 0 },
    broken: 0,
  };

  const operations: Operation[] = [];
  const seenIds = new Set<string>();
  for (const op of rawOps) {
    const amount = round2(Number(op.amount));
    const date = str(op.date);
    if (op.includeInAnalytics === false) {
      report.skipped.count++;
      report.skipped.sum = round2(report.skipped.sum + (amount > 0 ? amount : 0));
      continue;
    }
    if (!isValidISO(date) || !(amount > 0)) {
      report.broken++;
      continue;
    }
    const subId = str(op.subcategoryId);
    const sub = subById.get(subId);
    const created = str(op.createdAt) || `${date}T12:00:00.000Z`;
    let id = str(op.id);
    if (!id || seenIds.has(id)) id = uid('op');
    seenIds.add(id);
    const next: Operation = {
      id,
      date,
      amount,
      subcategoryId: sub ? sub.id : null,
      comment: str(op.description).trim(),
      createdAt: created,
      updatedAt: str(op.updatedAt) || created,
    };
    if (!sub) next.inboxType = catById.get(str(op.categoryId))?.type === 'income' ? 'income' : 'expense';
    if (sub && investIds.has(sub.id)) {
      report.movedToInvestments.count++;
      report.movedToInvestments.sum = round2(report.movedToInvestments.sum + amount);
    }
    operations.push(next);
  }
  report.imported = operations.length;

  const settings = (o.settings ?? {}) as Raw;
  const lastDate = str(settings.lastOperationDate);
  return {
    data: {
      schemaVersion: SCHEMA_VERSION,
      categories: keptCategories,
      subcategories,
      operations,
      settings: {
        lastDate: isValidISO(lastDate) ? lastDate : todayISO(),
        period: { mode: 'all', single: '', from: '', to: '' },
        limits: [],
      },
    },
    report,
  };
}
