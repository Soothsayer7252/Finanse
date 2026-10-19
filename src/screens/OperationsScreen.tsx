import { useEffect, useMemo, useState } from 'react';
import { EntryPanel } from '../components/EntryPanel';
import { OperationList } from '../components/OperationList';
import { PeriodPicker } from '../components/PeriodPicker';
import { QuickLine } from '../components/QuickLine';
import { inPeriod, resolvePeriod, todayISO } from '../domain/dates';
import { formatMoney } from '../domain/money';
import { normalize, opType, subLabel, totals } from '../domain/ops';
import type { CategoryType } from '../domain/types';
import { useStore } from '../store/store';

type TypeFilter = 'all' | CategoryType | 'inbox';

const TYPE_FILTERS: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'expense', label: 'Расходы' },
  { id: 'income', label: 'Доходы' },
  { id: 'investment', label: 'Вложения' },
  { id: 'inbox', label: 'Без категории' },
];

/** Текст для строки ввода, пришедший с другого экрана; n меняется при каждом переходе. */
export interface Prefill {
  text: string;
  n: number;
}

export function OperationsScreen({ prefill, categoryFilter = '' }: { prefill: Prefill | null; categoryFilter?: string }) {
  const { data, ix, dispatch } = useStore();
  const [panelOpen, setPanelOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [categoryId, setCategoryId] = useState(categoryFilter);
  const [search, setSearch] = useState('');

  const period = resolvePeriod(data.settings.period, todayISO());
  const inPeriodOps = useMemo(() => data.operations.filter((op) => inPeriod(op.date, period)), [data.operations, period.mode, period.single, period.from, period.to]);

  const filtered = useMemo(() => {
    const q = normalize(search);
    return inPeriodOps
      .filter((op) => {
        if (typeFilter === 'inbox' && op.subcategoryId) return false;
        if (typeFilter !== 'all' && typeFilter !== 'inbox' && opType(op, ix) !== typeFilter) return false;
        if (categoryId && (op.subcategoryId ? ix.sub.get(op.subcategoryId)?.categoryId : '') !== categoryId) return false;
        if (q && !normalize(`${op.comment} ${subLabel(op.subcategoryId, ix)}`).includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [inPeriodOps, typeFilter, categoryId, search, ix]);

  const t = useMemo(() => totals(inPeriodOps, ix), [inPeriodOps, ix]);
  const filtersOn = typeFilter !== 'all' || categoryId || search;

  // Клавиша N (на русской раскладке — Т) открывает панель «Новая операция», если курсор не в поле ввода.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || el.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'n' || e.key === 'N' || e.key === 'т' || e.key === 'Т') {
        e.preventDefault();
        setPanelOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="stack">
      <QuickLine key={prefill?.n ?? 0} prefill={prefill?.text} />

      <div className="ops-body">
      <main className="card list-card">
        <div className="list-head">
          <div className="list-toolbar">
            <PeriodPicker value={period} onChange={(period) => dispatch({ type: 'settings', patch: { period } })} />
            {!panelOpen && (
              <button type="button" className="btn btn-primary" onClick={() => setPanelOpen(true)} title="Клавиша N">
                + Новая операция
              </button>
            )}
          </div>
          <div className="summary">
            <Sum label="Доходы" value={t.income} cls="amount-income" sign="+" />
            <Sum label="Повседневные" value={t.expenseDaily} cls="" sign="−" />
            <Sum label="Крупные" value={t.expenseLarge} cls="" sign="−" />
            <Sum label="Вложено" value={t.investment} cls="amount-investment" />
            <Sum label="Итог" value={Math.abs(t.result)} cls={t.result < 0 ? 'amount-expense' : 'amount-income'} sign={t.result < 0 ? '−' : '+'} />
          </div>
        </div>

        <div className="filters">
          <div className="chips">
            {TYPE_FILTERS.map((f) => (
              <button key={f.id} type="button" className={`chip ${typeFilter === f.id ? 'active' : ''}`} onClick={() => setTypeFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="filters-row">
            <select className="input filter-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Категория">
              <option value="">Все категории</option>
              {data.categories
                .slice()
                .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, 'ru'))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.archived ? ' (архив)' : ''}
                  </option>
                ))}
            </select>
            <input className="input filter-search" type="search" placeholder="Поиск" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Поиск по комментарию и категории" />
          </div>
          {filtersOn && (
            <div className="muted small">
              Найдено: {filtered.length}{' '}
              <button
                type="button"
                className="link"
                onClick={() => {
                  setTypeFilter('all');
                  setCategoryId('');
                  setSearch('');
                }}
              >
                Сбросить
              </button>
            </div>
          )}
        </div>

        <OperationList ops={filtered} emptyText={filtersOn ? 'Ничего не найдено.' : 'За этот период операций нет.'} />
      </main>
      {panelOpen && <EntryPanel onClose={() => setPanelOpen(false)} />}
      </div>
    </div>
  );
}

function Sum({ label, value, cls, sign }: { label: string; value: number; cls: string; sign?: string }) {
  return (
    <div className="sum">
      <div className="sum-label">{label}</div>
      <div className={`sum-value ${value === 0 ? 'zero' : cls}`}>
        {sign && value !== 0 ? sign : ''}
        {formatMoney(value, { whole: true })}
      </div>
    </div>
  );
}
