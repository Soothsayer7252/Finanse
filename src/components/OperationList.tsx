// Список операций по дням. Нажатие на значок — выделить, на строку — изменить.

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDayTitle, todayISO } from '../domain/dates';
import { amountToInput, formatMoney, round2 } from '../domain/money';
import { opGroup, opType, subLabel } from '../domain/ops';
import type { ExpenseGroup, Operation } from '../domain/types';
import { useStore, useUndoToast } from '../store/store';
import { CategoryIcon } from './CategoryIcon';
import { EntryForm } from './EntryForm';
import { Lookup } from './Lookup';

interface Props {
  ops: Operation[];
  emptyText: string;
  /** Режим «Входящих»: у каждой строки своё поле категории, Enter — к следующей. */
  inbox?: boolean;
}

const PAGE = 150;

export function OperationList({ ops, emptyText, inbox }: Props) {
  const { ix, options, dispatch } = useStore();
  const undoToast = useUndoToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const inboxRefs = useRef(new Map<string, HTMLInputElement>());
  const today = todayISO();

  // Выделение не должно держать операции, которых больше нет в списке.
  useEffect(() => {
    const ids = new Set(ops.map((o) => o.id));
    setSelected((s) => {
      const next = new Set([...s].filter((id) => ids.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [ops]);

  const shown = ops.slice(0, limit);
  const days = useMemo(() => {
    const out: { date: string; ops: Operation[] }[] = [];
    for (const op of shown) {
      const last = out[out.length - 1];
      if (last && last.date === op.date) last.ops.push(op);
      else out.push({ date: op.date, ops: [op] });
    }
    return out;
  }, [shown]);

  if (!ops.length) return <div className="empty">{emptyText}</div>;

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selecting = selected.size > 0;
  const selectedSum = round2(ops.filter((o) => selected.has(o.id)).reduce((sum, o) => sum + o.amount, 0));
  const ids = [...selected];

  const remove = (list: string[]) => {
    dispatch({ type: 'op/delete', ids: list });
    undoToast(list.length === 1 ? 'Операция удалена' : `Удалено операций: ${list.length}`);
  };

  const assign = (list: string[], subId: string | null) => {
    if (!subId) return;
    dispatch({ type: 'op/assign', ids: list, subcategoryId: subId });
    if (list.length > 1) undoToast(`Категория назначена: ${list.length} опер.`);
  };

  const setGroup = (list: string[], group: ExpenseGroup) => {
    dispatch({ type: 'op/group', ids: list, group });
    undoToast(`${group === 'large' ? 'Отмечено как крупные' : 'Отмечено как повседневные'}: ${list.length}`);
  };

  /** Во «Входящих» после назначения категории переходим к следующей строке. */
  const focusNextInbox = (id: string) => {
    const idx = shown.findIndex((o) => o.id === id);
    const next = shown[idx + 1];
    if (next) requestAnimationFrame(() => inboxRefs.current.get(next.id)?.focus());
  };

  return (
    <div className={`op-list ${selecting ? 'is-selecting' : ''}`}>
      {days.map((day) => {
        const dayExpense = round2(day.ops.filter((o) => opType(o, ix) === 'expense').reduce((s, o) => s + o.amount, 0));
        return (
          <section key={day.date} className="op-day">
            <header className="op-day-head">
              <span>{formatDayTitle(day.date, today)}</span>
              {dayExpense > 0 && <span className="op-day-total">−{formatMoney(dayExpense)}</span>}
            </header>
            {day.ops.map((op) => {
              const sub = op.subcategoryId ? ix.sub.get(op.subcategoryId) : undefined;
              const cat = sub ? ix.cat.get(sub.categoryId) : undefined;
              if (editing === op.id) {
                return (
                  <div key={op.id} className="op-edit">
                    <EntryForm
                      layout="inline"
                      initial={{
                        date: op.date,
                        amountText: amountToInput(op.amount),
                        subId: op.subcategoryId,
                        comment: op.comment,
                        income: !op.subcategoryId && op.inboxType === 'income',
                      }}
                      valueLabel={subLabel(op.subcategoryId, ix)}
                      options={options}
                      autoFocus
                      submitLabel="Сохранить"
                      onCancel={() => setEditing(null)}
                      onSubmit={(r) => {
                        dispatch({
                          type: 'op/update',
                          id: op.id,
                          patch: {
                            date: r.date,
                            amount: r.amount,
                            subcategoryId: r.subcategoryId,
                            comment: r.comment,
                            inboxType: r.subcategoryId ? undefined : r.income ? 'income' : 'expense',
                          },
                        });
                        setEditing(null);
                      }}
                    />
                  </div>
                );
              }
              const type = opType(op, ix);
              const large = type === 'expense' && opGroup(op, ix) === 'large';
              const isSel = selected.has(op.id);
              const subtitle = [cat?.name, op.comment].filter(Boolean).join(' · ');
              return (
                <div key={op.id} className={`op-row ${isSel ? 'selected' : ''} ${inbox ? 'op-row-inbox' : ''}`}>
                  <button type="button" className="op-icon" onClick={() => toggle(op.id)} aria-pressed={isSel} aria-label="Выбрать" title="Выбрать">
                    <CategoryIcon sub={sub} cat={cat} />
                    <span className="op-tick">✓</span>
                  </button>
                  <button type="button" className="op-body" onClick={() => setEditing(op.id)} title="Изменить">
                    <span className="op-title">{sub ? sub.name : inbox ? op.comment || 'Без комментария' : 'Без категории'}</span>
                    {!inbox && subtitle && <span className="op-subtitle">{subtitle}</span>}
                    {inbox && <span className="op-subtitle">{type === 'income' ? 'доход' : 'расход'} без категории</span>}
                  </button>
                  {inbox && (
                    <div className="op-inbox-lookup">
                      <Lookup
                        value={null}
                        options={options}
                        placeholder="Категория…"
                        inputRef={(el) => {
                          if (el) inboxRefs.current.set(op.id, el);
                          else inboxRefs.current.delete(op.id);
                        }}
                        onChange={(id) => {
                          if (id) {
                            focusNextInbox(op.id);
                            assign([op.id], id);
                          }
                        }}
                      />
                    </div>
                  )}
                  <span className="op-tags">
                    {large && <span className="tag tag-large">крупная</span>}
                    {type === 'investment' && <span className="tag tag-invest">вложение</span>}
                  </span>
                  <span className={`op-amount amount-${type}`}>
                    {type === 'income' ? '+' : '−'}
                    {formatMoney(op.amount)}
                  </span>
                  <span className="op-actions">
                    <button type="button" className="icon-btn" onClick={() => remove([op.id])} aria-label="Удалить" title="Удалить">
                      ×
                    </button>
                  </span>
                </div>
              );
            })}
          </section>
        );
      })}
      {ops.length > limit && (
        <button type="button" className="btn btn-ghost show-more" onClick={() => setLimit((l) => l + PAGE)}>
          Показать ещё ({ops.length - limit})
        </button>
      )}

      {selecting && (
        <div className="bulk-bar" role="toolbar" aria-label="Действия с выбранными">
          <span className="bulk-info">
            Выбрано <b>{selected.size}</b> · {formatMoney(selectedSum)}
          </span>
          {selected.size < ops.length && (
            <button type="button" className="link" onClick={() => setSelected(new Set(ops.map((o) => o.id)))}>
              Выбрать все {ops.length}
            </button>
          )}
          <div className="bulk-lookup">
            <Lookup value={null} options={options} placeholder="Назначить категорию…" onChange={(id) => assign(ids, id)} />
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setGroup(ids, 'large')}>
            В крупные
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setGroup(ids, 'daily')}>
            В повседневные
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(ids)}>
            Удалить
          </button>
          <button type="button" className="icon-btn" onClick={() => setSelected(new Set())} aria-label="Снять выделение" title="Снять выделение">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
