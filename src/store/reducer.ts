// Все изменения данных проходят через эти действия.
// Действия, которые что-то удаляют или массово меняют, запоминают прошлое
// состояние, чтобы их можно было отменить.

import { nowStamp, uid } from '../domain/ids';
import { upsertLimits } from '../domain/insights';
import type { AppData, Category, ExpenseGroup, LimitSet, Operation, Settings, Subcategory } from '../domain/types';

export type Action =
  | { type: 'op/add'; op: Operation }
  | { type: 'op/update'; id: string; patch: Partial<Operation> }
  | { type: 'op/delete'; ids: string[] }
  | { type: 'op/assign'; ids: string[]; subcategoryId: string }
  | { type: 'op/group'; ids: string[]; group: ExpenseGroup }
  | { type: 'cat/add'; cat: Category }
  | { type: 'cat/update'; id: string; patch: Partial<Category> }
  | { type: 'cat/delete'; id: string }
  | { type: 'sub/add'; sub: Subcategory }
  | { type: 'sub/update'; id: string; patch: Partial<Subcategory> }
  | { type: 'sub/delete'; id: string }
  /** Все операции подкатегории from переходят в into, сама from удаляется. */
  | { type: 'sub/merge'; from: string; into: string }
  /** Добавить или заменить лимиты, действующие с месяца limits.from. */
  | { type: 'limits/set'; limits: LimitSet }
  | { type: 'limits/delete'; from: string }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'replace'; data: AppData }
  | { type: 'undo' };

export interface State {
  data: AppData;
  /** Что можно отменить последним действием. */
  undo: { data: AppData; label: string } | null;
}

const UNDOABLE: Partial<Record<Action['type'], string>> = {
  'op/delete': 'Удаление',
  'op/assign': 'Назначение категории',
  'op/group': 'Смена группы',
  'cat/delete': 'Удаление категории',
  'sub/delete': 'Удаление подкатегории',
  'sub/merge': 'Объединение',
  'limits/delete': 'Удаление лимитов',
  'replace': 'Замена данных',
};

export function reducer(state: State, action: Action): State {
  if (action.type === 'undo') return state.undo ? { data: state.undo.data, undo: null } : state;
  const data = apply(state.data, action);
  if (data === state.data) return state;
  const label = UNDOABLE[action.type];
  // Любое другое изменение сбрасывает отмену: иначе «Отменить» стёрло бы и то, что ввели после.
  return { data, undo: label ? { data: state.data, label } : null };
}

function mapOps(data: AppData, ids: string[], fn: (op: Operation) => Operation): AppData {
  const set = new Set(ids);
  const stamp = nowStamp();
  return { ...data, operations: data.operations.map((op) => (set.has(op.id) ? { ...fn(op), updatedAt: stamp } : op)) };
}

function apply(data: AppData, a: Action): AppData {
  switch (a.type) {
    case 'op/add':
      return { ...data, operations: [...data.operations, a.op], settings: { ...data.settings, lastDate: a.op.date } };
    case 'op/update':
      return mapOps(data, [a.id], (op) => cleanOp({ ...op, ...a.patch }));
    case 'op/delete': {
      const set = new Set(a.ids);
      return { ...data, operations: data.operations.filter((op) => !set.has(op.id)) };
    }
    case 'op/assign':
      return mapOps(data, a.ids, (op) => cleanOp({ ...op, subcategoryId: a.subcategoryId }));
    case 'op/group': {
      const subs = new Map(data.subcategories.map((s) => [s.id, s]));
      return mapOps(data, a.ids, (op) => {
        const subGroup = (op.subcategoryId && subs.get(op.subcategoryId)?.group) || 'daily';
        const next = { ...op };
        // Если выбранная группа совпадает с группой подкатегории, ручная отметка не нужна.
        if (a.group === subGroup) delete next.groupOverride;
        else next.groupOverride = a.group;
        return next;
      });
    }
    case 'cat/add':
      return { ...data, categories: [...data.categories, a.cat] };
    case 'cat/update':
      return { ...data, categories: data.categories.map((c) => (c.id === a.id ? { ...c, ...a.patch } : c)) };
    case 'cat/delete':
      // Удалить можно только пустую категорию: экран не даёт удалить категорию с подкатегориями.
      if (data.subcategories.some((s) => s.categoryId === a.id)) return data;
      return { ...data, categories: data.categories.filter((c) => c.id !== a.id) };
    case 'sub/add':
      return { ...data, subcategories: [...data.subcategories, a.sub] };
    case 'sub/update':
      return { ...data, subcategories: data.subcategories.map((s) => (s.id === a.id ? { ...s, ...a.patch } : s)) };
    case 'sub/delete':
      if (data.operations.some((op) => op.subcategoryId === a.id)) return data;
      return { ...data, subcategories: data.subcategories.filter((s) => s.id !== a.id) };
    case 'sub/merge': {
      const from = data.subcategories.find((s) => s.id === a.from);
      const into = data.subcategories.find((s) => s.id === a.into);
      const typeOf = (s: Subcategory) => data.categories.find((c) => c.id === s.categoryId)?.type;
      if (!from || !into || from.id === into.id || typeOf(from) !== typeOf(into)) return data;
      const ids = data.operations.filter((op) => op.subcategoryId === from.id).map((op) => op.id);
      const moved = mapOps(data, ids, (op) => {
        const next = { ...op, subcategoryId: into.id };
        // Ручная группа, совпавшая с группой новой подкатегории, больше не нужна.
        if (next.groupOverride && next.groupOverride === (into.group ?? 'daily')) delete next.groupOverride;
        return next;
      });
      return { ...moved, subcategories: moved.subcategories.filter((s) => s.id !== from.id) };
    }
    case 'settings':
      return { ...data, settings: { ...data.settings, ...a.patch } };
    case 'limits/set':
      return { ...data, settings: { ...data.settings, limits: upsertLimits(data.settings.limits, a.limits) } };
    case 'limits/delete':
      if (!data.settings.limits.some((l) => l.from === a.from)) return data;
      return { ...data, settings: { ...data.settings, limits: data.settings.limits.filter((l) => l.from !== a.from) } };
    case 'replace':
      return a.data;
    default:
      return data;
  }
}

/** Убирает лишнее: у операции с категорией не нужна пометка типа «из входящих». */
function cleanOp(op: Operation): Operation {
  const next = { ...op };
  if (next.subcategoryId) delete next.inboxType;
  else next.inboxType ??= 'expense';
  return next;
}

export function newOperation(fields: Pick<Operation, 'date' | 'amount' | 'subcategoryId' | 'comment'> & { income?: boolean }): Operation {
  const stamp = nowStamp();
  const op: Operation = {
    id: uid('op'),
    date: fields.date,
    amount: fields.amount,
    subcategoryId: fields.subcategoryId,
    comment: fields.comment.trim(),
    createdAt: stamp,
    updatedAt: stamp,
  };
  if (!op.subcategoryId) op.inboxType = fields.income ? 'income' : 'expense';
  return op;
}
