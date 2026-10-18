import { useMemo, useState } from 'react';
import { OperationList } from '../components/OperationList';
import { PeriodPicker } from '../components/PeriodPicker';
import { QuickEntry } from '../components/QuickEntry';
import { inPeriod } from '../domain/dates';
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

export function OperationsScreen({ goToSettings }: { goToSettings: () => void }) {
  const { data, ix, dispatch } = useStore();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');

  const inPeriodOps = useMemo(() => data.operations.filter((op) => inPeriod(op.date, data.settings.period)), [data.operations, data.settings.period]);

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
  const isEmpty = data.operations.length === 0 && data.categories.length === 0;
  const filtersOn = typeFilter !== 'all' || categoryId || search;

  return (
    <div className="ops-layout">
      <QuickEntry />

      <main className="card list-card">
        {isEmpty && (
          <div className="welcome">
            <h2>Добро пожаловать!</h2>
            <p>Вводите операции в форме слева. Категории создаются во вкладке «Категории», а операции без категории ждут во «Входящих».</p>
            <p>
              Есть данные из старой версии? <button className="btn btn-primary btn-sm" onClick={goToSettings}>Перенести данные</button>
            </p>
          </div>
        )}

        <div className="list-head">
          <PeriodPicker value={data.settings.period} onChange={(period) => dispatch({ type: 'settings', patch: { period } })} />
          <div className="summary">
            <Sum label="Доходы" value={t.income} cls="amount-income" sign="+" />
            <Sum label="Расходы" value={t.expense} cls="" sign="−" hint={t.expenseLarge > 0 ? `из них крупные ${formatMoney(t.expenseLarge, { whole: true })}` : undefined} />
            {t.investment > 0 && <Sum label="Вложено" value={t.investment} cls="amount-investment" />}
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
    </div>
  );
}

function Sum({ label, value, cls, sign, hint }: { label: string; value: number; cls: string; sign?: string; hint?: string }) {
  return (
    <div className="sum">
      <div className="sum-label">{label}</div>
      <div className={`sum-value ${cls}`}>
        {sign && value !== 0 ? sign : ''}
        {formatMoney(value, { whole: true })}
      </div>
      {hint && <div className="sum-hint">{hint}</div>}
    </div>
  );
}
