// Резервная копия: проверка и приведение данных к нужному виду.

import { isValidISO, todayISO } from './dates';
import { uid } from './ids';
import { round2 } from './money';
import { SCHEMA_VERSION, type AppData, type Category, type LimitSet, type Operation, type Subcategory } from './types';

export const BACKUP_APP_MARK = 'finance-tracker';

const limitValue = (v: unknown): number | null => (typeof v === 'number' && v > 0 ? round2(v) : null);

function normalizeLimits(raw: unknown): LimitSet[] {
  if (!Array.isArray(raw)) return [];
  const byMonth = new Map<string, LimitSet>();
  for (const l of raw) {
    if (!l || typeof l !== 'object' || typeof l.from !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(l.from)) continue;
    // Повтор того же месяца — берём первую запись.
    if (byMonth.has(l.from)) continue;
    byMonth.set(l.from, { from: l.from, daily: limitValue(l.daily), large: limitValue(l.large), income: limitValue(l.income) });
  }
  return [...byMonth.values()].sort((a, b) => a.from.localeCompare(b.from));
}

export function emptyData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    categories: [],
    subcategories: [],
    operations: [],
    settings: { lastDate: todayISO(), period: { mode: 'all', single: '', from: '', to: '' }, limits: [] },
  };
}

export type BackupFormat = 'native' | 'legacy' | 'unknown';

export function detectFormat(json: unknown): BackupFormat {
  if (!json || typeof json !== 'object') return 'unknown';
  const o = json as Record<string, unknown>;
  const hasArrays = Array.isArray(o.categories) && Array.isArray(o.subcategories) && Array.isArray(o.operations);
  if (!hasArrays) return 'unknown';
  if (typeof o.schemaVersion === 'number') return 'native';
  // Старая версия (v1.1): у операций есть флаг includeInAnalytics, у файла — поле version.
  if (typeof o.version === 'number' || (o.operations as unknown[]).some((op) => op && typeof op === 'object' && 'includeInAnalytics' in op)) return 'legacy';
  return 'unknown';
}

export function makeBackup(data: AppData): string {
  return JSON.stringify({ app: BACKUP_APP_MARK, exportedAt: new Date().toISOString(), ...data }, null, 2);
}

export interface NormalizeResult {
  data: AppData;
  /** Что пришлось поправить или пропустить. Пусто — всё в порядке. */
  problems: string[];
}

const str = (v: unknown, def = '') => (typeof v === 'string' ? v : def);

/**
 * Проверяет данные в нашем формате и аккуратно дополняет недостающее.
 * Операции не теряются молча: всё пропущенное перечисляется в problems.
 */
export function normalizeData(json: unknown): NormalizeResult {
  const problems: string[] = [];
  const o = (json ?? {}) as Record<string, unknown>;
  const base = emptyData();

  const categories: Category[] = (Array.isArray(o.categories) ? o.categories : [])
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && typeof c.id === 'string')
    .map((c) => ({
      id: c.id as string,
      name: str(c.name, 'Без названия'),
      type: c.type === 'income' || c.type === 'investment' ? c.type : 'expense',
      archived: c.archived === true,
    }));
  const catIds = new Set(categories.map((c) => c.id));

  const subcategories: Subcategory[] = [];
  for (const s of Array.isArray(o.subcategories) ? o.subcategories : []) {
    if (!s || typeof s !== 'object' || typeof s.id !== 'string') continue;
    if (!catIds.has(s.categoryId)) {
      problems.push(`Подкатегория «${str(s.name)}» ссылается на несуществующую категорию — пропущена.`);
      continue;
    }
    const sub: Subcategory = { id: s.id, categoryId: s.categoryId, name: str(s.name, 'Без названия'), archived: s.archived === true };
    if (s.group === 'daily' || s.group === 'large') sub.group = s.group;
    if (s.incomeKind === 'stable' || s.incomeKind === 'extra' || s.incomeKind === 'investment') sub.incomeKind = s.incomeKind;
    subcategories.push(sub);
  }
  const subIds = new Set(subcategories.map((s) => s.id));

  const operations: Operation[] = [];
  const seenIds = new Set<string>();
  let badOps = 0;
  let orphaned = 0;
  let duplicated = 0;
  for (const op of Array.isArray(o.operations) ? o.operations : []) {
    if (!op || typeof op !== 'object') continue;
    const amount = Number(op.amount);
    const date = str(op.date);
    if (!isValidISO(date) || !(amount > 0)) {
      badOps++;
      continue;
    }
    let subcategoryId: string | null = typeof op.subcategoryId === 'string' && op.subcategoryId ? op.subcategoryId : null;
    if (subcategoryId && !subIds.has(subcategoryId)) {
      subcategoryId = null;
      orphaned++;
    }
    const created = str(op.createdAt) || `${date}T12:00:00.000Z`;
    let id = str(op.id);
    if (!id || seenIds.has(id)) {
      // Повтор номера: без своего номера правка или удаление задели бы и другую операцию.
      if (id) duplicated++;
      id = uid('op');
    }
    seenIds.add(id);
    const next: Operation = {
      id,
      date,
      amount: round2(amount),
      subcategoryId,
      comment: str(op.comment),
      createdAt: created,
      updatedAt: str(op.updatedAt) || created,
    };
    if (!subcategoryId) next.inboxType = op.inboxType === 'income' ? 'income' : 'expense';
    if (op.groupOverride === 'daily' || op.groupOverride === 'large') next.groupOverride = op.groupOverride;
    operations.push(next);
  }
  if (badOps) problems.push(`Пропущено операций с неверной датой или суммой: ${badOps}.`);
  if (orphaned) problems.push(`Операций с удалённой подкатегорией: ${orphaned} — перенесены во «Входящие».`);
  if (duplicated) problems.push(`Операций с повторяющимся номером: ${duplicated} — им выданы новые номера.`);

  const s = (o.settings ?? {}) as Record<string, unknown>;
  const p = (s.period ?? {}) as Record<string, unknown>;
  const settings = {
    lastDate: isValidISO(str(s.lastDate)) ? str(s.lastDate) : base.settings.lastDate,
    period: {
      mode: p.mode === 'single' || p.mode === 'range' ? p.mode : 'all',
      single: str(p.single),
      from: str(p.from),
      to: str(p.to),
      ...(p.quick === 'today' || p.quick === 'month' || p.quick === 'prevMonth' ? { quick: p.quick } : {}),
    } as AppData['settings']['period'],
    limits: normalizeLimits(s.limits),
  };

  return { data: { schemaVersion: SCHEMA_VERSION, categories, subcategories, operations, settings }, problems };
}
