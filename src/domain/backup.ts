// Резервная копия: проверка и приведение данных к нужному виду.

import { isValidISO, todayISO } from './dates';
import { round2 } from './money';
import { SCHEMA_VERSION, type AppData, type Category, type Operation, type Subcategory } from './types';

export const BACKUP_APP_MARK = 'finance-tracker';

export function emptyData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    categories: [],
    subcategories: [],
    operations: [],
    settings: { lastDate: todayISO(), period: { mode: 'all', single: '', from: '', to: '' } },
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
  let badOps = 0;
  let orphaned = 0;
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
    const next: Operation = {
      id: str(op.id) || `op_${operations.length}_${Date.now().toString(36)}`,
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

  const s = (o.settings ?? {}) as Record<string, unknown>;
  const p = (s.period ?? {}) as Record<string, unknown>;
  const settings = {
    lastDate: isValidISO(str(s.lastDate)) ? str(s.lastDate) : base.settings.lastDate,
    period: {
      mode: p.mode === 'single' || p.mode === 'range' ? p.mode : 'all',
      single: str(p.single),
      from: str(p.from),
      to: str(p.to),
    } as AppData['settings']['period'],
  };

  return { data: { schemaVersion: SCHEMA_VERSION, categories, subcategories, operations, settings }, problems };
}
