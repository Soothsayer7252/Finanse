// Строка ввода операции: дата, сумма, категория, комментарий.
// Enter переводит к следующему полю, в комментарии — сохраняет. Ctrl+Enter сохраняет из любого поля.

import { useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { isValidISO } from '../domain/dates';
import { parseAmount } from '../domain/money';
import type { SubOption } from '../domain/ops';
import { Lookup } from './Lookup';

export interface EntryValues {
  date: string;
  amountText: string;
  subId: string | null;
  comment: string;
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
  /** Вернуть true, чтобы очистить строку для следующей операции (быстрый ввод). */
  onSubmit: (r: EntryResult) => boolean | void;
  onCancel?: () => void;
  submitLabel: string;
  autoFocus?: 'amount' | 'category';
  valueLabel?: string;
}

export function EntryRow({ initial, options, onSubmit, onCancel, submitLabel, autoFocus, valueLabel }: Props) {
  const [v, setV] = useState<EntryValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const subRef = useRef<HTMLInputElement>(null);
  const commentRef = useRef<HTMLInputElement>(null);

  const parsed = parseAmount(v.amountText);
  const set = (patch: Partial<EntryValues>) => {
    setV((prev) => ({ ...prev, ...patch }));
    setError(null);
  };

  const submit = () => {
    if (!isValidISO(v.date)) return fail('Укажите дату');
    if (!parsed) return fail('Укажите сумму больше нуля', amountRef);
    const reset = onSubmit({ date: v.date, amount: parsed.amount, income: parsed.income, subcategoryId: v.subId, comment: v.comment.trim() });
    if (reset) {
      setV({ date: v.date, amountText: '', subId: null, comment: '' });
      amountRef.current?.focus();
    }
  };

  const fail = (msg: string, ref?: RefObject<HTMLInputElement | null>) => {
    setError(msg);
    ref?.current?.focus();
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

  return (
    <div className="entry-row">
      <input
        type="date"
        className="input entry-date"
        value={v.date}
        aria-label="Дата"
        onChange={(e) => set({ date: e.target.value })}
        onKeyDown={keys(() => amountRef.current?.focus())}
      />
      <div className="entry-amount-wrap">
        <input
          ref={amountRef}
          className={`input entry-amount ${error && !parsed ? 'input-error' : ''}`}
          value={v.amountText}
          placeholder="Сумма"
          inputMode="decimal"
          aria-label="Сумма"
          autoFocus={autoFocus === 'amount'}
          onChange={(e) => set({ amountText: e.target.value })}
          onKeyDown={keys(() => subRef.current?.focus())}
        />
        {parsed && /\d[+-]\d/.test(v.amountText.replace(/\s/g, '')) && <span className="entry-calc">= {parsed.amount}</span>}
        {parsed?.income && !v.subId && <span className="entry-hint-income">доход</span>}
      </div>
      <div>
        <Lookup
          value={v.subId}
          options={options}
          inputRef={subRef}
          autoFocus={autoFocus === 'category'}
          valueLabel={valueLabel}
          onChange={(id) => set({ subId: id })}
          onEnter={() => commentRef.current?.focus()}
          onEscape={onCancel}
        />
      </div>
      <input
        ref={commentRef}
        className="input entry-comment"
        value={v.comment}
        placeholder="Комментарий"
        aria-label="Комментарий"
        onChange={(e) => set({ comment: e.target.value })}
        onKeyDown={keys(null)}
      />
      <div className="entry-actions">
        <button type="button" className="btn btn-primary" onClick={submit}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Отмена
          </button>
        )}
      </div>
      {error && <div className="entry-error">{error}</div>}
    </div>
  );
}
