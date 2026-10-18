// Форма операции: сумма, категория, дата, комментарий.
// Enter переводит к следующему полю, в комментарии — сохраняет. Ctrl+Enter сохраняет из любого поля.

import { useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { addDays, isValidISO, todayISO } from '../domain/dates';
import { parseAmount } from '../domain/money';
import type { SubOption } from '../domain/ops';
import { Lookup } from './Lookup';

export interface EntryValues {
  date: string;
  amountText: string;
  subId: string | null;
  comment: string;
  /** Тип для операции без категории. */
  income: boolean;
}

export interface EntryResult {
  date: string;
  amount: number;
  income: boolean;
  subcategoryId: string | null;
  comment: string;
}

interface Props {
  initial: EntryValues;
  options: SubOption[];
  /** Вернуть true, чтобы очистить форму для следующей операции. */
  onSubmit: (r: EntryResult) => boolean | void;
  onCancel?: () => void;
  submitLabel: string;
  layout: 'stack' | 'inline';
  autoFocus?: boolean;
  valueLabel?: string;
}

export function EntryForm({ initial, options, onSubmit, onCancel, submitLabel, layout, autoFocus, valueLabel }: Props) {
  const [v, setV] = useState<EntryValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const subRef = useRef<HTMLInputElement>(null);
  const commentRef = useRef<HTMLInputElement>(null);

  const parsed = parseAmount(v.amountText);
  const chosen = options.find((o) => o.id === v.subId);
  // С категорией тип берётся из неё; без категории — переключатель или «+» перед суммой.
  const kind = chosen ? chosen.type : v.income || parsed?.income ? 'income' : 'expense';

  const set = (patch: Partial<EntryValues>) => {
    setV((prev) => ({ ...prev, ...patch }));
    setError(null);
  };

  const fail = (msg: string, ref?: RefObject<HTMLInputElement | null>) => {
    setError(msg);
    ref?.current?.focus();
  };

  const submit = () => {
    if (!isValidISO(v.date)) return fail('Укажите дату');
    if (!parsed) return fail('Укажите сумму больше нуля', amountRef);
    const reset = onSubmit({ date: v.date, amount: parsed.amount, income: kind === 'income', subcategoryId: v.subId, comment: v.comment.trim() });
    if (reset) {
      setV({ date: v.date, amountText: '', subId: null, comment: '', income: false });
      amountRef.current?.focus();
    }
  };

  const keys = (next: (() => void) | null) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !next)) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      next!();
    } else if (e.key === 'Escape' && onCancel) {
      e.preventDefault();
      onCancel();
    }
  };

  const today = todayISO();
  const yesterday = addDays(today, -1);
  const calc = parsed && /\d[+-]\d/.test(v.amountText.replace(/\s/g, ''));

  return (
    <div className={`entry entry-${layout}`}>
      <div className="entry-field entry-f-amount">
        <div className="entry-label-row">
          <label className="entry-label" htmlFor={`amount-${layout}`}>
            Сумма
          </label>
          <div className="seg" role="group" aria-label="Тип">
            <button type="button" className={kind === 'expense' ? 'on' : ''} disabled={!!chosen} onClick={() => set({ income: false, amountText: v.amountText.replace(/^\s*\+/, '') })}>
              Расход
            </button>
            <button type="button" className={kind === 'income' ? 'on' : ''} disabled={!!chosen} onClick={() => set({ income: true })}>
              Доход
            </button>
            {chosen?.type === 'investment' && <span className="seg-note">вложение</span>}
          </div>
        </div>
        <div className="entry-amount-wrap">
          <input
            id={`amount-${layout}`}
            ref={amountRef}
            className={`input entry-amount ${error && !parsed ? 'input-error' : ''}`}
            value={v.amountText}
            placeholder="0"
            inputMode="decimal"
            autoComplete="off"
            autoFocus={autoFocus}
            onChange={(e) => set({ amountText: e.target.value })}
            onKeyDown={keys(() => subRef.current?.focus())}
          />
          <span className="entry-currency">{calc ? `= ${parsed!.amount} ₽` : '₽'}</span>
        </div>
      </div>

      <div className="entry-field entry-f-cat">
        <span className="entry-label">Категория</span>
        <Lookup
          value={v.subId}
          options={options}
          inputRef={subRef}
          valueLabel={valueLabel}
          placeholder="Начните печатать…"
          onChange={(id) => set({ subId: id })}
          onEnter={() => commentRef.current?.focus()}
          onEscape={onCancel}
        />
      </div>

      <div className="entry-field entry-f-date">
        <label className="entry-label" htmlFor={`date-${layout}`}>
          Дата
        </label>
        <div className="entry-date-row">
          <input id={`date-${layout}`} type="date" className="input entry-date" value={v.date} onChange={(e) => set({ date: e.target.value })} onKeyDown={keys(() => commentRef.current?.focus())} />
          <button type="button" className={`chip chip-sm ${v.date === today ? 'active' : ''}`} onClick={() => set({ date: today })}>
            Сегодня
          </button>
          <button type="button" className={`chip chip-sm ${v.date === yesterday ? 'active' : ''}`} onClick={() => set({ date: yesterday })}>
            Вчера
          </button>
        </div>
      </div>

      <div className="entry-field entry-f-comment">
        <label className="entry-label" htmlFor={`comment-${layout}`}>
          Комментарий
        </label>
        <input
          id={`comment-${layout}`}
          ref={commentRef}
          className="input"
          value={v.comment}
          placeholder="Необязательно"
          autoComplete="off"
          onChange={(e) => set({ comment: e.target.value })}
          onKeyDown={keys(null)}
        />
      </div>

      {error && <div className="entry-error">{error}</div>}

      <div className="entry-actions">
        <button type="button" className="btn btn-primary entry-submit" onClick={submit}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Отмена
          </button>
        )}
      </div>
    </div>
  );
}
