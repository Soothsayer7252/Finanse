// Модель данных приложения. Все суммы — в рублях, даты — строки 'ГГГГ-ММ-ДД'.

export type CategoryType = 'expense' | 'income' | 'investment';

/** Группа расхода: повседневные траты или крупные покупки. */
export type ExpenseGroup = 'daily' | 'large';

/** Вид дохода. */
export type IncomeKind = 'stable' | 'extra' | 'investment';

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  archived: boolean;
}

export interface Subcategory {
  id: string;
  categoryId: string;
  name: string;
  archived: boolean;
  /** Только у подкатегорий расходов. */
  group?: ExpenseGroup;
  /** Только у подкатегорий доходов. */
  incomeKind?: IncomeKind;
}

export interface Operation {
  id: string;
  date: string;
  amount: number;
  /** null — операция без категории, лежит во «Входящих». */
  subcategoryId: string | null;
  /** Тип операции, пока у неё нет категории. С категорией тип берётся из категории. */
  inboxType?: 'expense' | 'income';
  comment: string;
  /** Группа, заданная вручную для этой операции (иначе — группа подкатегории). */
  groupOverride?: ExpenseGroup;
  createdAt: string;
  updatedAt: string;
}

export type PeriodMode = 'all' | 'single' | 'range';

export interface Period {
  mode: PeriodMode;
  single: string;
  from: string;
  to: string;
}

export interface Settings {
  /** Дата последней введённой операции: подставляется в следующую. */
  lastDate: string;
  period: Period;
}

export const SCHEMA_VERSION = 1;

export interface AppData {
  schemaVersion: number;
  categories: Category[];
  subcategories: Subcategory[];
  operations: Operation[];
  settings: Settings;
}

export const TYPE_LABEL: Record<CategoryType, string> = {
  expense: 'Расход',
  income: 'Доход',
  investment: 'Инвестиции',
};

export const GROUP_LABEL: Record<ExpenseGroup, string> = {
  daily: 'Повседневные',
  large: 'Крупные',
};

export const INCOME_KIND_LABEL: Record<IncomeKind, string> = {
  stable: 'Стабильный',
  extra: 'Дополнительный',
  investment: 'Инвестиционный',
};
