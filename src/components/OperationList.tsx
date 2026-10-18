// Список операций по дням: выделение, правка прямо в строке, массовые действия.

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDayHeading } from '../domain/dates';
import { amountToInput, formatMoney, round2 } from '../domain/money';
import { opGroup, opType, signedAmount, subLabel } from '../domain/ops';
import type { ExpenseGroup, Operation } from '../domain/types';
import { newOperation } from '../store/reducer';
import { useStore, useUndoToast } from '../store/store';
import { EntryRow } from './EntryRow';
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

  const selectedOps = ops.filter((o) => selected.has(o.id));
  const selectedSum = round2(selectedOps.reduce((sum, o) => sum + o.amount, 0));
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
    <div className="op-list">
      {days.map((day) => {
        const dayExpense = round2(day.ops.filter((o) => opType(o, ix) === 'expense').reduce((s, o) => s + o.amount, 0));
        return (
          <section key={day.date} className="op-day">
            <header className="op-day-head">
              <span>{formatDayHeading(day.date)}</span>
              {dayExpense > 0 && <span className="muted">расходы {formatMoney(dayExpense)}</span>}
            </header>
            {day.ops.map((op) => {
              if (editing === op.id) {
                return (
                  <div key={op.id} className="op-row op-row-editing">
                    <EntryRow
                      initial={{
                        date: op.date,
                        amountText: (!op.subcategoryId && op.inboxType === 'income' ? '+' : '') + amountToInput(op.amount),
                        subId: op.subcategoryId,
                        comment: op.comment,
                      }}
                      valueLabel={subLabel(op.subcategoryId, ix)}
                      options={options}
                      autoFocus="amount"
                      submitLabel="Сохранить"
                      onCancel={() => setEditing(null)}
                      onSubmit={(r) => {
                        const fresh = newOperation({ ...r });
                        dispatch({
                          type: 'op/update',
                          id: op.id,
                          patch: { date: r.date, amount: r.amount, subcategoryId: r.subcategoryId, comment: r.comment, inboxType: fresh.inboxType },
                        });
                        setEditing(null);
                      }}
                    />
                  </div>
                );
              }
              const type = opType(op, ix);
              const large = type === 'expense' && opGroup(op, ix) === 'large';
              const amount = signedAmount(op, ix);
              return (
                <div key={op.id} className={`op-row ${selected.has(op.id) ? 'selected' : ''}`}>
                  <input type="checkbox" className="op-check" checked={selected.has(op.id)} onChange={() => toggle(op.id)} aria-label="Выбрать" />
                  {inbox ? (
                    <div className="op-inbox-lookup">
                      <Lookup
                        value={null}
                        options={options}
                        placeholder="Назначить категорию…"
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
                  ) : (
                    <button type="button" className="op-main" onClick={() => setEditing(op.id)} title="Изменить">
                      {op.subcategoryId ? <span className="op-cat">{subLabel(op.subcategoryId, ix)}</span> : <span className="badge badge-inbox">Без категории</span>}
                    </button>
                  )}
                  <button type="button" className="op-comment" onClick={() => setEditing(op.id)} title="Изменить">
                    {op.comment}
                  </button>
                  <span className="op-badges">
                    {large && <span className="badge badge-large">крупная</span>}
                    {type === 'investment' && <span className="badge badge-investment">вложение</span>}
                  </span>
                  <span className={`op-amount amount-${type}`}>
                    {amount > 0 ? '+ ' : '− '}
                    {formatMoney(Math.abs(amount))}
                  </span>
                  <span className="op-actions">
                    <button type="button" className="icon-btn" onClick={() => setEditing(op.id)} aria-label="Изменить" title="Изменить">
                      ✎
                    </button>
                    <button type="button" className="icon-btn icon-danger" onClick={() => remove([op.id])} aria-label="Удалить" title="Удалить">
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

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-info">
            Выбрано: <b>{selected.size}</b> на {formatMoney(selectedSum)}
          </span>
          {selected.size < ops.length && (
            <button type="button" className="btn btn-link" onClick={() => setSelected(new Set(ops.map((o) => o.id)))}>
              Выбрать все {ops.length}
            </button>
          )}
          <div className="bulk-lookup">
            <Lookup value={null} options={options} placeholder="Назначить категорию…" onChange={(id) => assign(ids, id)} />
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => setGroup(ids, 'large')}>
            Крупные
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setGroup(ids, 'daily')}>
            Повседневные
          </button>
          <button type="button" className="btn btn-danger" onClick={() => remove(ids)}>
            Удалить
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setSelected(new Set())}>
            Снять выделение
          </button>
        </div>
      )}
    </div>
  );
}
