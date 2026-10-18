import { useMemo, useState } from 'react';
import { OperationList } from '../components/OperationList';
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
  const { data, ix } = useStore();
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

  const t = useMemo(() => totals(filtered, ix), [filtered, ix]);
  const isEmpty = data.operations.length === 0 && data.categories.length === 0;

  return (
    <div className="stack">
      {isEmpty && (
        <div className="panel welcome">
          <h2>Добро пожаловать!</h2>
          <p>
            Можно сразу вводить операции ниже: категории создаются во вкладке «Категории», а операции без категории ждут во «Входящих».
          </p>
          <p>
            Если есть данные из старой версии — перенесите их: <button className="btn btn-primary" onClick={goToSettings}>Перенести данные</button>
          </p>
        </div>
      )}

      <QuickEntry />

      <div className="panel">
        <div className="stats">
          <Stat label="Доходы" value={t.income} cls="amount-income" sign="+" />
          <Stat label="Повседневные" value={t.expenseDaily} cls="amount-expense" sign="−" />
          <Stat label="Крупные" value={t.expenseLarge} cls="amount-expense" sign="−" />
          <Stat label="Вложено" value={t.investment} cls="amount-investment" />
          <Stat label="Доходы − расходы" value={t.result} cls={t.result < 0 ? 'amount-expense' : 'amount-income'} sign={t.result < 0 ? '−' : '+'} abs />
        </div>

        <div className="filters">
          <div className="chips">
            {TYPE_FILTERS.map((f) => (
              <button key={f.id} type="button" className={`chip ${typeFilter === f.id ? 'active' : ''}`} onClick={() => setTypeFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
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
          <input className="input filter-search" placeholder="Поиск по комментарию и категории" value={search} onChange={(e) => setSearch(e.target.value)} />
          <span className="muted">операций: {filtered.length}</span>
        </div>

        <OperationList ops={filtered} emptyText="За выбранный период операций нет." />
      </div>
    </div>
  );
}

function Stat({ label, value, cls, sign, abs }: { label: string; value: number; cls: string; sign?: string; abs?: boolean }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${cls}`}>
        {sign && value !== 0 ? `${sign} ` : ''}
        {formatMoney(abs ? Math.abs(value) : value)}
      </div>
    </div>
  );
}
