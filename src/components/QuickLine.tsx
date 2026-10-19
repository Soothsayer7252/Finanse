// Основной ввод: операция пишется обычной фразой, приложение показывает, как её поняло.
// Можно вставить сразу много строк — тогда появится список на проверку.

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDayShort, formatDayTitle, todayISO } from '../domain/dates';
import { formatMoney } from '../domain/money';
import { subLabel } from '../domain/ops';
import { buildLearned, parseLine, parseMany, type ParsedLine } from '../domain/quickParse';
import { newOperation } from '../store/reducer';
import { useStore, useToast, useUndoToast } from '../store/store';
import { Lookup } from './Lookup';

interface Props {
  /** Текст, с которого начать (например, дата пропущенного дня с Главной). */
  prefill?: string;
}

interface Override {
  subId?: string | null;
  date?: string;
}

export function QuickLine({ prefill }: Props) {
  const { data, ix, options, dispatch } = useStore();
  const toast = useToast();
  const undoToast = useUndoToast();
  const [text, setText] = useState(prefill ?? '');
  const [overrides, setOverrides] = useState<Map<number, Override>>(new Map());
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<{ row: number; what: 'cat' | 'date' } | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [tried, setTried] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const today = todayISO();

  useEffect(() => {
    if (prefill === undefined) return;
    setText(prefill);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    });
  }, [prefill]);

  const learned = useMemo(() => buildLearned(data.operations), [data.operations]);
  const ctx = { options, today, defaultDate: data.settings.lastDate, learned };
  const multi = text.includes('\n');
  const parsed: ParsedLine[] = useMemo(
    () => (!text.trim() ? [] : multi ? parseMany(text, ctx) : [parseLine(text, ctx)]),
    [text, options, learned, data.settings.lastDate, today],
  );

  // Поправки пользователя поверх разбора.
  const rows = parsed.map((r, i) => {
    const o = overrides.get(i);
    if (!o) return r;
    const next = { ...r };
    if (o.subId !== undefined) {
      next.subcategoryId = o.subId;
      next.candidates = [];
      const opt = options.find((x) => x.id === o.subId);
      next.income = opt ? opt.type === 'income' : r.income;
      next.status = r.amount === null ? 'error' : o.subId ? 'ok' : 'unsure';
    }
    if (o.date) next.date = o.date;
    return next;
  });

  const change = (value: string) => {
    setText(value);
    setOverrides(new Map());
    setRemoved(new Set());
    setEditing(null);
    setTried(false);
  };

  const override = (i: number, o: Override) => {
    setOverrides((m) => new Map(m).set(i, { ...m.get(i), ...o }));
    setEditing(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const save = (list: ParsedLine[]) => {
    const ids: string[] = [];
    for (const r of list) {
      const op = newOperation({ date: r.date, amount: r.amount!, subcategoryId: r.subcategoryId, comment: r.comment, income: r.income });
      dispatch({ type: 'op/add', op });
      ids.push(op.id);
    }
    setAdded((a) => [...a, ...ids].slice(-6));
    change('');
    inputRef.current?.focus();
    return ids;
  };

  const submit = () => {
    setTried(true);
    const active = rows.filter((_, i) => !removed.has(i));
    if (!active.length) return;
    if (!multi) {
      const r = active[0];
      if (r.status === 'error') return;
      save([r]);
      return;
    }
    const good = active.filter((r) => r.status !== 'error');
    if (!good.length) return;
    save(good);
    const skipped = active.length - good.length;
    toast({ text: `Добавлено операций: ${good.length}${skipped ? `, пропущено без суммы: ${skipped}` : ''}` });
  };

  const single = !multi ? rows[0] : undefined;
  const activeCount = rows.filter((r, i) => !removed.has(i) && r.status !== 'error').length;

  const catChip = (r: ParsedLine, i: number) =>
    editing?.row === i && editing.what === 'cat' ? (
      <div className="chip-editor">
        <Lookup value={r.subcategoryId} options={options} autoFocus commitOnBlur={false} onChange={(id) => override(i, { subId: id })} onEscape={() => setEditing(null)} />
      </div>
    ) : (
      <button type="button" className={`pchip ${r.subcategoryId ? 'pchip-cat' : 'pchip-warn'}`} onClick={() => setEditing({ row: i, what: 'cat' })} title="Изменить категорию">
        {r.subcategoryId ? subLabel(r.subcategoryId, ix) : 'во «Входящие»'}
      </button>
    );

  const dateChip = (r: ParsedLine, i: number, short = false) =>
    editing?.row === i && editing.what === 'date' ? (
      <input
        type="date"
        className="input chip-date"
        autoFocus
        defaultValue={r.date}
        aria-label="Дата"
        onChange={(e) => e.target.value && override(i, { date: e.target.value })}
        onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
        onBlur={() => setEditing(null)}
      />
    ) : (
      <button type="button" className="pchip" onClick={() => setEditing({ row: i, what: 'date' })} title="Изменить дату">
        {short ? formatDayShort(r.date, today) : formatDayTitle(r.date, today)}
      </button>
    );

  return (
    <div className="card quick-line">
      <div className="ql-row">
        <textarea
          ref={inputRef}
          className="input ql-input"
          rows={multi ? Math.min(text.split('\n').length, 8) : 1}
          value={text}
          autoFocus
          aria-label="Новая операция одной строкой"
          placeholder="Например: 470 доставка вчера пицца"
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" className="btn btn-primary ql-add" onClick={submit} disabled={!text.trim()}>
          {multi ? `Добавить все (${activeCount})` : 'Добавить'}
        </button>
      </div>

      {single && (
        <div className="ql-preview" aria-live="polite">
          <span className="muted small">Поймёт так:</span>
          {single.amount !== null ? (
            <span className={`pchip pchip-amount ${single.income ? 'amount-income' : ''}`}>
              {single.income ? '+' : '−'}
              {formatMoney(single.amount)}
            </span>
          ) : (
            <span className={`pchip pchip-error ${tried ? 'shake' : ''}`}>нет суммы</span>
          )}
          {catChip(single, 0)}
          {single.candidates.length > 1 &&
            editing === null &&
            single.candidates
              .filter((id) => id !== single.subcategoryId)
              .map((id) => (
                <button key={id} type="button" className="pchip pchip-alt" onClick={() => override(0, { subId: id })}>
                  или {subLabel(id, ix)}
                </button>
              ))}
          {dateChip(single, 0)}
          {single.comment && <span className="pchip pchip-note">«{single.comment}»</span>}
        </div>
      )}

      {multi && rows.length > 0 && (
        <div className="ql-review">
          {rows.map((r, i) =>
            removed.has(i) ? null : (
              <div key={i} className={`ql-review-row st-${r.status}`}>
                <span className="ql-dot" aria-hidden="true" />
                {dateChip(r, i, true)}
                <span className={`ql-amount ${r.income ? 'amount-income' : ''}`}>{r.amount !== null ? `${r.income ? '+' : '−'}${formatMoney(r.amount)}` : 'нет суммы'}</span>
                {catChip(r, i)}
                <span className="ql-note">{r.comment}</span>
                <button type="button" className="icon-btn" aria-label="Убрать строку" title="Убрать строку" onClick={() => setRemoved((s) => new Set(s).add(i))}>
                  ×
                </button>
              </div>
            ),
          )}
        </div>
      )}

      {!text && added.length === 0 && (
        <div className="ql-hint">
          Пишите как в заметках: <b>350 такси</b>, <b>+14400 зарплата 29.09</b>, <b>1200 кафе с Сашей вчера</b>. Можно вставить сразу много строк —
          каждая станет операцией. Shift+Enter — новая строка.
        </div>
      )}

      {added.length > 0 && !text && (
        <div className="recent">
          <span className="recent-title">Только что добавлено</span>
          <div className="recent-list">
            {added
              .map((id) => data.operations.find((o) => o.id === id))
              .filter((o) => !!o)
              .reverse()
              .map((op) => (
                <span key={op.id} className="recent-item">
                  {op.subcategoryId ? ix.sub.get(op.subcategoryId)?.name : 'во «Входящие»'} · {formatMoney(op.amount)}
                  <button
                    type="button"
                    className="icon-btn"
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
        </div>
      )}
    </div>
  );
}
