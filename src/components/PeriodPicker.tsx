// Выбор периода — как в старой версии: кнопка с текущим периодом и панель
// с быстрыми кнопками, режимами «Одна дата» / «Период» и полями дат.

import { useEffect, useRef, useState } from 'react';
import { periodLabel, quickPeriod, todayISO, type QuickPeriod } from '../domain/dates';
import type { Period } from '../domain/types';

interface Props {
  value: Period;
  onChange: (p: Period) => void;
}

const QUICK: { kind: QuickPeriod; label: string }[] = [
  { kind: 'today', label: 'Сегодня' },
  { kind: 'month', label: 'Этот месяц' },
  { kind: 'prevMonth', label: 'Прошлый месяц' },
  { kind: 'all', label: 'Всё время' },
];

export function PeriodPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Period>(value);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const apply = (p: Period) => {
    onChange(p);
    setOpen(false);
  };

  const applyDraft = () => {
    if (draft.mode === 'single') {
      if (!draft.single) return setError('Выберите дату');
      apply({ mode: 'single', single: draft.single, from: '', to: '' });
    } else if (draft.mode === 'range') {
      if (!draft.from || !draft.to) return setError('Выберите обе даты');
      if (draft.from > draft.to) return setError('Начало позже конца');
      apply({ mode: 'range', single: '', from: draft.from, to: draft.to });
    } else apply(draft);
  };

  const mode = draft.mode === 'all' ? 'range' : draft.mode;
  const today = todayISO();
  const isQuickActive = (kind: QuickPeriod) => (kind === 'all' ? value.mode === 'all' : value.quick === kind);

  return (
    <div className="period" ref={ref}>
      <button
        type="button"
        className="btn btn-ghost period-button"
        onClick={() => {
          setDraft(value);
          setError('');
          setOpen((o) => !o);
        }}
      >
        <span className="muted">Период:</span> {periodLabel(value)}
      </button>
      {open && (
        <div className="popover period-popover">
          <div className="chips">
            {QUICK.map((q) => (
              <button key={q.kind} type="button" className={`chip ${isQuickActive(q.kind) ? 'active' : ''}`} onClick={() => apply(quickPeriod(q.kind, today))}>
                {q.label}
              </button>
            ))}
          </div>
          <div className="chips">
            <button type="button" className={`chip ${mode === 'single' ? 'active' : ''}`} onClick={() => setDraft({ ...draft, mode: 'single', single: draft.single || today })}>
              Одна дата
            </button>
            <button type="button" className={`chip ${mode === 'range' ? 'active' : ''}`} onClick={() => setDraft({ ...draft, mode: 'range' })}>
              Период
            </button>
          </div>
          <div className="period-fields">
            {mode === 'single' ? (
              <label className="field">
                <span>Дата</span>
                <input type="date" className="input" value={draft.single} onChange={(e) => setDraft({ ...draft, mode: 'single', single: e.target.value })} />
              </label>
            ) : (
              <>
                <label className="field">
                  <span>С</span>
                  <input type="date" className="input" value={draft.from} onChange={(e) => setDraft({ ...draft, mode: 'range', from: e.target.value })} />
                </label>
                <label className="field">
                  <span>По</span>
                  <input type="date" className="input" value={draft.to} onChange={(e) => setDraft({ ...draft, mode: 'range', to: e.target.value })} />
                </label>
              </>
            )}
          </div>
          {error && <div className="entry-error">{error}</div>}
          <div className="period-actions">
            <button type="button" className="btn btn-primary" onClick={applyDraft}>
              Применить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
