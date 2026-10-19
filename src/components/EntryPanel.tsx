// Запасной способ ввода: боковая панель «Новая операция» с полями по одному.
// Открывается кнопкой «+ Новая операция» или клавишей N.

import { useState } from 'react';
import { formatDate } from '../domain/dates';
import { formatMoney } from '../domain/money';
import { opType } from '../domain/ops';
import { newOperation } from '../store/reducer';
import { useStore, useUndoToast } from '../store/store';
import { CategoryIcon } from './CategoryIcon';
import { EntryForm } from './EntryForm';

export function EntryPanel({ onClose }: { onClose: () => void }) {
  const { data, ix, options, dispatch } = useStore();
  const undoToast = useUndoToast();
  /** Операции, добавленные, пока панель открыта. */
  const [added, setAdded] = useState<string[]>([]);

  const recent = added
    .map((id) => data.operations.find((o) => o.id === id))
    .filter((o) => !!o)
    .slice(-6)
    .reverse();

  return (
    <aside className="card entry-card" aria-label="Новая операция">
      <div className="card-head">
        <h2>Новая операция</h2>
        <button type="button" className="icon-btn" aria-label="Закрыть" title="Закрыть (Esc)" onClick={onClose}>
          ×
        </button>
      </div>
      <EntryForm
        layout="stack"
        initial={{ date: data.settings.lastDate, amountText: '', subId: null, comment: '', income: false }}
        options={options}
        autoFocus
        submitLabel="Добавить"
        onCancel={onClose}
        onSubmit={(r) => {
          const op = newOperation(r);
          dispatch({ type: 'op/add', op });
          setAdded((a) => [...a, op.id]);
          return true;
        }}
      />
      {recent.length > 0 && (
        <div className="recent">
          <div className="recent-title">Добавлено сейчас</div>
          {recent.map((op) => {
            const sub = op.subcategoryId ? ix.sub.get(op.subcategoryId) : undefined;
            const cat = sub ? ix.cat.get(sub.categoryId) : undefined;
            const income = opType(op, ix) === 'income';
            return (
              <div key={op.id} className="recent-item">
                <CategoryIcon sub={sub} cat={cat} size="sm" />
                <span className="recent-name">{sub ? sub.name : 'Во «Входящие»'}</span>
                <span className="muted small">{formatDate(op.date).slice(0, 5)}</span>
                <span className={`recent-amount ${income ? 'amount-income' : ''}`}>
                  {income ? '+' : '−'}
                  {formatMoney(op.amount)}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Удалить"
                  title="Удалить"
                  onClick={() => {
                    dispatch({ type: 'op/delete', ids: [op.id] });
                    undoToast('Операция удалена');
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
