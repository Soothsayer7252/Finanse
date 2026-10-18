// Правила, по которым операция получает тип и группу, и подсчёт итогов.

import { round2 } from './money';
import type { AppData, Category, CategoryType, ExpenseGroup, Operation, Subcategory } from './types';

/** Быстрый доступ к категориям и подкатегориям по id. */
export interface Index {
  cat: Map<string, Category>;
  sub: Map<string, Subcategory>;
}

export function buildIndex(data: Pick<AppData, 'categories' | 'subcategories'>): Index {
  return {
    cat: new Map(data.categories.map((c) => [c.id, c])),
    sub: new Map(data.subcategories.map((s) => [s.id, s])),
  };
}

export function categoryOf(op: Operation, ix: Index): Category | null {
  const sub = op.subcategoryId ? ix.sub.get(op.subcategoryId) : undefined;
  return sub ? ix.cat.get(sub.categoryId) ?? null : null;
}

/** Тип определяется категорией. Без категории — расход, если при вводе не поставили «+». */
export function opType(op: Operation, ix: Index): CategoryType {
  return categoryOf(op, ix)?.type ?? op.inboxType ?? 'expense';
}

/** Группа расхода: ручная у операции, иначе у подкатегории, иначе повседневная. */
export function opGroup(op: Operation, ix: Index): ExpenseGroup {
  if (op.groupOverride) return op.groupOverride;
  const sub = op.subcategoryId ? ix.sub.get(op.subcategoryId) : undefined;
  return sub?.group ?? 'daily';
}

/** «Еда › Доставка» */
export function subLabel(subId: string | null, ix: Index): string {
  if (!subId) return '';
  const sub = ix.sub.get(subId);
  if (!sub) return '';
  const cat = ix.cat.get(sub.categoryId);
  return cat ? `${cat.name} › ${sub.name}` : sub.name;
}

export interface Totals {
  count: number;
  income: number;
  expense: number;
  expenseDaily: number;
  expenseLarge: number;
  investment: number;
  /** Доходы минус расходы (вложения не трата и сюда не входят). */
  result: number;
}

export function totals(ops: Operation[], ix: Index): Totals {
  const t = { count: ops.length, income: 0, expense: 0, expenseDaily: 0, expenseLarge: 0, investment: 0, result: 0 };
  for (const op of ops) {
    const type = opType(op, ix);
    if (type === 'income') t.income += op.amount;
    else if (type === 'investment') t.investment += op.amount;
    else {
      t.expense += op.amount;
      if (opGroup(op, ix) === 'large') t.expenseLarge += op.amount;
      else t.expenseDaily += op.amount;
    }
  }
  return {
    count: t.count,
    income: round2(t.income),
    expense: round2(t.expense),
    expenseDaily: round2(t.expenseDaily),
    expenseLarge: round2(t.expenseLarge),
    investment: round2(t.investment),
    result: round2(t.income - t.expense),
  };
}

/** Сумма со знаком для отображения: расход и вложение со знаком минус. */
export function signedAmount(op: Operation, ix: Index): number {
  return opType(op, ix) === 'income' ? op.amount : -op.amount;
}

/** Сколько раз использовалась каждая подкатегория: часто используемые показываем выше. */
export function usageCounts(ops: Operation[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const op of ops) if (op.subcategoryId) m.set(op.subcategoryId, (m.get(op.subcategoryId) ?? 0) + 1);
  return m;
}

export function normalize(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

export interface SubOption {
  id: string;
  label: string;
  categoryName: string;
  subName: string;
  type: CategoryType;
  uses: number;
}

export function subOptions(data: Pick<AppData, 'categories' | 'subcategories'>, uses: Map<string, number>): SubOption[] {
  const ix = buildIndex(data);
  const out: SubOption[] = [];
  for (const sub of data.subcategories) {
    const cat = ix.cat.get(sub.categoryId);
    if (!cat || sub.archived || cat.archived) continue;
    out.push({
      id: sub.id,
      label: `${cat.name} › ${sub.name}`,
      categoryName: cat.name,
      subName: sub.name,
      type: cat.type,
      uses: uses.get(sub.id) ?? 0,
    });
  }
  return out;
}

/**
 * Поиск подкатегории по введённому тексту.
 * Каждое слово запроса должно найтись в названии категории или подкатегории.
 * Выше — совпадения с начала названия подкатегории, затем часто используемые.
 */
export function searchSubOptions(options: SubOption[], query: string): SubOption[] {
  const words = normalize(query).split(' ').filter(Boolean);
  const scored: { o: SubOption; score: number }[] = [];
  for (const o of options) {
    const sub = normalize(o.subName);
    const cat = normalize(o.categoryName);
    const hay = `${cat} ${sub}`;
    if (!words.every((w) => hay.includes(w))) continue;
    let score = 0;
    if (words.length) {
      const first = words[0];
      if (sub.startsWith(first)) score += 3;
      else if (sub.split(' ').some((part) => part.startsWith(first))) score += 2;
      else if (cat.startsWith(first)) score += 1;
    }
    scored.push({ o, score });
  }
  scored.sort((a, b) => b.score - a.score || b.o.uses - a.o.uses || a.o.label.localeCompare(b.o.label, 'ru'));
  return scored.map((s) => s.o);
}
