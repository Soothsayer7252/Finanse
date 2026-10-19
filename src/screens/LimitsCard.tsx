// «Лимиты и цель» в Настройках. Каждая запись действует с выбранного месяца до следующей записи,
// поэтому прошлые месяцы оцениваются по тем лимитам, что были тогда.

import { useMemo, useState } from 'react';
import { addMonths, monthGenitive, todayISO } from '../domain/dates';
import { limitsFor, usualMonth } from '../domain/insights';
import { formatMoney, parseAmount } from '../domain/money';
import type { LimitSet } from '../domain/types';
import { useStore, useToast, useUndoToast } from '../store/store';

type Key = 'daily' | 'large' | 'income';

const FIELDS: { key: Key; label: string; hint: string }[] = [
  { key: 'daily', label: 'Повседневные траты', hint: 'Еда, транспорт, мелочи — всё, что каждый день' },
  { key: 'large', label: 'Крупные покупки', hint: 'Техника, одежда, подарки — редкие и большие' },
  { key: 'income', label: 'Цель по доходу', hint: 'Стабильный и дополнительный доход, без инвестиционного' },
];

/** 50000 → «50 000»: так легче проверить нули. */
const toInput = (v: number | null) => (v == null ? '' : formatMoney(v, { whole: true }).replace(' ₽', ''));
/** «с октября 2026» */
const sinceText = (ym: string) => `с ${monthGenitive(Number(ym.slice(5, 7)))} ${ym.slice(0, 4)}`;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function LimitsCard() {
  const { data, ix, dispatch } = useStore();
  const toast = useToast();
  const undoToast = useUndoToast();
  const current = todayISO().slice(0, 7);
  const limits = data.settings.limits;

  // Месяцы, с которых можно начать: от первой операции до следующего месяца.
  const months = useMemo(() => {
    const first = data.operations.reduce((min, op) => (op.date.slice(0, 7) < min ? op.date.slice(0, 7) : min), current);
    const out: string[] = [];
    for (let m = addMonths(`${current}-01`, 1).slice(0, 7); m >= first; m = addMonths(`${m}-01`, -1).slice(0, 7)) out.push(m);
    return out;
  }, [data.operations, current]);

  const usual = useMemo(() => usualMonth(data.operations, ix, current), [data.operations, ix, current]);

  const [from, setFrom] = useState(current);
  const fill = (m: string, list = limits) => {
    const l = limitsFor(m, list);
    return { daily: toInput(l?.daily ?? null), large: toInput(l?.large ?? null), income: toInput(l?.income ?? null) };
  };
  const [values, setValues] = useState<Record<Key, string>>(() => fill(current));
  const [bad, setBad] = useState<Key | null>(null);

  const changeFrom = (m: string) => {
    setFrom(m);
    setValues(fill(m));
    setBad(null);
  };

  const save = () => {
    const next: LimitSet = { from, daily: null, large: null, income: null };
    for (const f of FIELDS) {
      const raw = values[f.key].trim();
      if (!raw) continue;
      const parsed = parseAmount(raw);
      if (!parsed) {
        setBad(f.key);
        toast({ text: `Не понял сумму в поле «${f.label}»`, kind: 'error' });
        return;
      }
      next[f.key] = Math.round(parsed.amount);
    }
    setBad(null);
    setValues({ daily: toInput(next.daily), large: toInput(next.large), income: toInput(next.income) });
    dispatch({ type: 'limits/set', limits: next });
    toast({ text: `Сохранено: действует ${sinceText(from)}` });
  };

  const history = [...limits].sort((a, b) => b.from.localeCompare(a.from));

  return (
    <section className="card panel" aria-labelledby="limits-title">
      <h2 id="limits-title">Лимиты и цель</h2>
      <p className="muted">
        Лимит — сколько готовы тратить за месяц, цель — сколько хотите получать. Каждый месяц считается с нуля: остаток не переносится. Пустое поле —
        не задано.
      </p>

      <div className="limits-grid">
        {FIELDS.map((f) => {
          const typical = usual ? Math.round(usual[f.key] / 1000) * 1000 : null;
          return (
            <div key={f.key} className="limit-field">
              <label htmlFor={`limit-${f.key}`}>{f.label}</label>
              <div className={`money-input ${bad === f.key ? 'invalid' : ''}`}>
                <input
                  id={`limit-${f.key}`}
                  inputMode="decimal"
                  placeholder="не задано"
                  value={values[f.key]}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  onBlur={() => {
                    const parsed = parseAmount(values[f.key]);
                    if (parsed) setValues({ ...values, [f.key]: toInput(Math.round(parsed.amount)) });
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && save()}
                />
                <span aria-hidden="true">₽ в месяц</span>
              </div>
              <span className="muted small">{f.hint}</span>
              {typical != null && typical > 0 && (
                <button type="button" className="link small" onClick={() => setValues({ ...values, [f.key]: toInput(typical) })}>
                  обычно ~{formatMoney(typical, { whole: true })} — подставить
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="actions limits-actions">
        <label className="inline-field">
          <span>Действует</span>
          <select className="input" value={from} onChange={(e) => changeFrom(e.target.value)} aria-label="Действует с месяца">
            {months.map((m) => (
              <option key={m} value={m}>
                {sinceText(m)}
                {m === current ? ' (этот месяц)' : m > current ? ' (следующий)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-primary" onClick={save}>
          Сохранить
        </button>
      </div>
      {!usual && <p className="muted small">Подсказка «обычно» появится, когда наберётся три полных месяца записей.</p>}

      {history.length > 0 && (
        <div className="limits-history">
          <h3>Что задано</h3>
          {history.map((l) => (
            <div key={l.from} className="limits-row">
              <span>
                <b>{capitalize(sinceText(l.from))}</b>
                <span className="muted">
                  {' '}
                  — повседневные {l.daily != null ? formatMoney(l.daily, { whole: true }) : 'не заданы'} · крупные{' '}
                  {l.large != null ? formatMoney(l.large, { whole: true }) : 'не заданы'} · доход {l.income != null ? formatMoney(l.income, { whole: true }) : 'не задан'}
                </span>
              </span>
              <button
                type="button"
                className="link"
                aria-label={`Удалить лимиты ${sinceText(l.from)}`}
                onClick={() => {
                  dispatch({ type: 'limits/delete', from: l.from });
                  setValues(fill(from, limits.filter((x) => x.from !== l.from)));
                  undoToast(`Лимиты ${sinceText(l.from)} удалены`);
                }}
              >
                Удалить
              </button>
            </div>
          ))}
          <p className="muted small">Прошлые месяцы на Главной сравниваются с теми лимитами, что действовали тогда.</p>
        </div>
      )}
    </section>
  );
}
