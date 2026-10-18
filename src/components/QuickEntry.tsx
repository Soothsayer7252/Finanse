// Панель «Новая операция»: всегда под рукой слева от списка.

import { useState } from 'react';
import { formatDate } from '../domain/dates';
import { formatMoney } from '../domain/money';
import { opType } from '../domain/ops';
import { newOperation } from '../store/reducer';
import { useStore, useUndoToast } from '../store/store';
import { CategoryIcon } from './CategoryIcon';
import { EntryForm } from './EntryForm';

export function QuickEntry() {
  const { data, ix, options, dispatch } = useStore();
  const undoToast = useUndoToast();
  /** Операции, добавленные за этот сеанс, — чтобы видеть, что уже введено. */
  const [added, setAdded] = useState<string[]>([]);
  const [showHelp, setShowHelp] = useState(false);

  const recent = added
    .map((id) => data.operations.find((o) => o.id === id))
    .filter((o) => !!o)
    .slice(-6)
    .reverse();

  return (
    <aside className="card entry-card">
      <div className="card-head">
        <h2>Новая операция</h2>
        <button type="button" className="link" onClick={() => setShowHelp((s) => !s)}>
          {showHelp ? 'Скрыть' : 'Подсказки'}
        </button>
      </div>
      {showHelp && (
        <ul className="help">
          <li>
            <b>Enter</b> — к следующему полю, в комментарии — сохранить. <b>Ctrl+Enter</b> — сохранить сразу.
          </li>
          <li>Дата остаётся от прошлой операции: удобно вносить пропущенные дни подряд.</li>
          <li>Категорию ищите по первым буквам: «дос» → Доставка. Пустая категория — операция попадёт во «Входящие».</li>
          <li>
            В сумме работает калькулятор: <b>350+120</b> = 470.
          </li>
        </ul>
      )}
      <EntryForm
        layout="stack"
        initial={{ date: data.settings.lastDate, amountText: '', subId: null, comment: '', income: false }}
        options={options}
        autoFocus
        submitLabel="Добавить"
        onSubmit={(r) => {
          const op = newOperation(r);
          dispatch({ type: 'op/add', op });
          setAdded((a) => [...a, op.id]);
          return true;
        }}
      />
      {recent.length > 0 && (
        <div className="recent">
          <div className="recent-title">Только что добавлено</div>
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
