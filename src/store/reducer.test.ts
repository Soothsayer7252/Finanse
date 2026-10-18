import { describe, expect, it } from 'vitest';
import { emptyData } from '../domain/backup';
import type { AppData } from '../domain/types';
import { newOperation, reducer, type State } from './reducer';

function base(): State {
  const data: AppData = {
    ...emptyData(),
    categories: [{ id: 'food', name: 'Еда', type: 'expense', archived: false }],
    subcategories: [
      { id: 'deliv', categoryId: 'food', name: 'Доставка', archived: false, group: 'daily' },
      { id: 'rest', categoryId: 'food', name: 'Рестораны', archived: false, group: 'large' },
    ],
    operations: [
      { id: 'a', date: '2026-10-01', amount: 100, subcategoryId: null, inboxType: 'expense', comment: '', createdAt: '', updatedAt: '' },
      { id: 'b', date: '2026-10-02', amount: 200, subcategoryId: 'deliv', comment: '', createdAt: '', updatedAt: '' },
    ],
  };
  return { data, undo: null };
}

describe('действия с данными', () => {
  it('новая операция запоминает свою дату для следующей', () => {
    const s = reducer(base(), { type: 'op/add', op: newOperation({ date: '2026-09-15', amount: 50, subcategoryId: null, comment: ' кофе ' }) });
    expect(s.data.settings.lastDate).toBe('2026-09-15');
    expect(s.data.operations.at(-1)).toMatchObject({ amount: 50, comment: 'кофе', inboxType: 'expense', subcategoryId: null });
  });

  it('назначение категории убирает пометку «из входящих»', () => {
    const s = reducer(base(), { type: 'op/assign', ids: ['a'], subcategoryId: 'deliv' });
    const op = s.data.operations.find((o) => o.id === 'a')!;
    expect(op.subcategoryId).toBe('deliv');
    expect(op.inboxType).toBeUndefined();
  });

  it('ручная группа хранится, только если отличается от группы подкатегории', () => {
    let s = reducer(base(), { type: 'op/group', ids: ['b'], group: 'large' });
    expect(s.data.operations.find((o) => o.id === 'b')!.groupOverride).toBe('large');
    s = reducer(s, { type: 'op/group', ids: ['b'], group: 'daily' });
    expect(s.data.operations.find((o) => o.id === 'b')!.groupOverride).toBeUndefined();
  });

  it('удаление можно отменить', () => {
    const before = base();
    const s = reducer(before, { type: 'op/delete', ids: ['a', 'b'] });
    expect(s.data.operations).toHaveLength(0);
    expect(reducer(s, { type: 'undo' }).data).toEqual(before.data);
  });

  it('после нового ввода старая отмена не стирает введённое', () => {
    let s = reducer(base(), { type: 'op/delete', ids: ['a'] });
    s = reducer(s, { type: 'op/add', op: newOperation({ date: '2026-10-03', amount: 1, subcategoryId: null, comment: '' }) });
    expect(s.undo).toBeNull();
    expect(reducer(s, { type: 'undo' }).data.operations).toHaveLength(2);
  });

  it('нельзя удалить подкатегорию с операциями и категорию с подкатегориями', () => {
    const s = base();
    expect(reducer(s, { type: 'sub/delete', id: 'deliv' })).toBe(s);
    expect(reducer(s, { type: 'cat/delete', id: 'food' })).toBe(s);
    expect(reducer(s, { type: 'sub/delete', id: 'rest' }).data.subcategories).toHaveLength(1);
  });
});
