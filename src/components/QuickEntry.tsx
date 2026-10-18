// Быстрый ввод: строки заполняются подряд с клавиатуры, без окон.

import { useState } from 'react';
import { formatDate } from '../domain/dates';
import { formatMoney } from '../domain/money';
import { subLabel } from '../domain/ops';
import { newOperation } from '../store/reducer';
import { useStore, useUndoToast } from '../store/store';
import { EntryRow } from './EntryRow';

export function QuickEntry() {
  const { data, ix, options, dispatch } = useStore();
  const undoToast = useUndoToast();
  /** Операции, добавленные за этот сеанс, — чтобы видеть, что уже введено. */
  const [added, setAdded] = useState<string[]>([]);
  const [showHelp, setShowHelp] = useState(false);

  const recent = added
    .map((id) => data.operations.find((o) => o.id === id))
    .filter((o) => !!o)
    .slice(-5)
    .reverse();

  return (
    <div className="panel quick-entry">
      <div className="section-head">
        <h2>Быстрый ввод</h2>
        <button type="button" className="btn btn-link" onClick={() => setShowHelp((s) => !s)}>
          {showHelp ? 'Скрыть подсказку' : 'Как вводить быстро?'}
        </button>
      </div>
      {showHelp && (
        <ul className="help">
          <li>
            <b>Enter</b> — к следующему полю, в комментарии — сохранить. <b>Ctrl+Enter</b> — сохранить сразу.
          </li>
          <li>Дата остаётся от прошлой операции: удобно вносить пропущенные дни подряд.</li>
          <li>
            Категорию ищите по первым буквам: «дос» → Доставка. Можно оставить пустой — операция попадёт во «Входящие».
          </li>
          <li>
            <b>+5000</b> — доход (если категория не выбрана). <b>350+120</b> — посчитает сумму.
          </li>
        </ul>
      )}
      <EntryRow
        initial={{ date: data.settings.lastDate, amountText: '', subId: null, comment: '' }}
        options={options}
        autoFocus="amount"
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
          <span className="muted">Только что добавлено:</span>
          {recent.map((op) => (
            <span key={op.id} className="recent-item">
              {formatDate(op.date)} · {formatMoney(op.amount)} · {op.subcategoryId ? subLabel(op.subcategoryId, ix) : 'во «Входящие»'}
              <button
                type="button"
                className="icon-btn icon-danger"
                aria-label="Удалить"
                onClick={() => {
                  dispatch({ type: 'op/delete', ids: [op.id] });
                  undoToast('Операция удалена');
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
