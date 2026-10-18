import { useMemo, useState } from 'react';
import { uid } from '../domain/ids';
import { formatMoney, round2 } from '../domain/money';
import { GROUP_LABEL, INCOME_KIND_LABEL, TYPE_LABEL, type Category, type CategoryType, type ExpenseGroup, type IncomeKind, type Subcategory } from '../domain/types';
import { useStore, useToast, useUndoToast } from '../store/store';

const TYPES: CategoryType[] = ['expense', 'income', 'investment'];

export function CategoriesScreen() {
  const { data, dispatch } = useStore();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(data.categories.find((c) => !c.archived)?.id ?? null);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<CategoryType>('expense');

  // Сколько операций и на какую сумму у каждой подкатегории.
  const stats = useMemo(() => {
    const m = new Map<string, { count: number; sum: number }>();
    for (const op of data.operations) {
      if (!op.subcategoryId) continue;
      const s = m.get(op.subcategoryId) ?? { count: 0, sum: 0 };
      s.count++;
      s.sum = round2(s.sum + op.amount);
      m.set(op.subcategoryId, s);
    }
    return m;
  }, [data.operations]);

  const addCategory = () => {
    const name = newName.trim();
    if (!name) return;
    if (data.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) return toast({ text: 'Такая категория уже есть', kind: 'error' });
    const cat: Category = { id: uid('cat'), name, type: newType, archived: false };
    dispatch({ type: 'cat/add', cat });
    setSelectedId(cat.id);
    setNewName('');
  };

  const selected = data.categories.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="cat-layout">
      <div className="card">
        <div className="card-head">
          <h2>Категории</h2>
        </div>
        <div className="add-row">
          <input className="input" placeholder="Новая категория" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCategory()} />
          <select className="input" value={newType} onChange={(e) => setNewType(e.target.value as CategoryType)} aria-label="Тип">
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={addCategory}>
            Добавить
          </button>
        </div>
        {TYPES.map((type) => {
          const cats = data.categories
            .filter((c) => c.type === type)
            .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, 'ru'));
          if (!cats.length) return null;
          return (
            <div key={type} className="cat-group">
              <div className="cat-group-title">{TYPE_LABEL[type]}</div>
              {cats.map((c) => (
                <button key={c.id} type="button" className={`cat-item ${c.id === selectedId ? 'active' : ''} ${c.archived ? 'archived' : ''}`} onClick={() => setSelectedId(c.id)}>
                  <span>{c.name}</span>
                  <span className="muted">{c.archived ? 'архив' : data.subcategories.filter((s) => s.categoryId === c.id && !s.archived).length}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <div className="card">{selected ? <CategoryDetails key={selected.id} cat={selected} stats={stats} onDeleted={() => setSelectedId(null)} /> : <div className="empty">Выберите категорию слева или создайте новую.</div>}</div>
    </div>
  );
}

function CategoryDetails({ cat, stats, onDeleted }: { cat: Category; stats: Map<string, { count: number; sum: number }>; onDeleted: () => void }) {
  const { data, dispatch } = useStore();
  const toast = useToast();
  const undoToast = useUndoToast();
  const [newSub, setNewSub] = useState('');
  const subs = data.subcategories.filter((s) => s.categoryId === cat.id).sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, 'ru'));
  const hasOps = subs.some((s) => stats.has(s.id));
  const sameType = data.categories.filter((c) => c.type === cat.type && c.id !== cat.id);

  const addSub = () => {
    const name = newSub.trim();
    if (!name) return;
    if (subs.some((s) => s.name.toLowerCase() === name.toLowerCase())) return toast({ text: 'Такая подкатегория уже есть', kind: 'error' });
    const sub: Subcategory = { id: uid('sub'), categoryId: cat.id, name, archived: false };
    if (cat.type === 'expense') sub.group = 'daily';
    if (cat.type === 'income') sub.incomeKind = 'extra';
    dispatch({ type: 'sub/add', sub });
    setNewSub('');
  };

  const changeType = (type: CategoryType) => {
    dispatch({ type: 'cat/update', id: cat.id, patch: { type } });
    for (const s of subs) {
      dispatch({
        type: 'sub/update',
        id: s.id,
        patch: { group: type === 'expense' ? s.group ?? 'daily' : undefined, incomeKind: type === 'income' ? s.incomeKind ?? 'extra' : undefined },
      });
    }
  };

  return (
    <div>
      <div className="card-head">
        <NameInput className="title-input" value={cat.name} onSave={(name) => dispatch({ type: 'cat/update', id: cat.id, patch: { name } })} />
        <div className="actions">
          <button type="button" className="btn btn-ghost" onClick={() => dispatch({ type: 'cat/update', id: cat.id, patch: { archived: !cat.archived } })}>
            {cat.archived ? 'Вернуть из архива' : 'В архив'}
          </button>
          {subs.length === 0 && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                dispatch({ type: 'cat/delete', id: cat.id });
                undoToast('Категория удалена');
                onDeleted();
              }}
            >
              Удалить
            </button>
          )}
        </div>
      </div>

      <div className="field-row">
        <span className="muted">Тип:</span>
        <div className="chips">
          {TYPES.map((t) => (
            <button key={t} type="button" disabled={hasOps && t !== cat.type} className={`chip ${cat.type === t ? 'active' : ''}`} onClick={() => changeType(t)}>
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        {hasOps && <span className="muted small">тип нельзя сменить, пока есть операции</span>}
      </div>
      {cat.archived && <p className="muted">Категория в архиве: её подкатегории не предлагаются при вводе, но старые операции остаются.</p>}

      <div className="sub-list">
        {subs.map((s) => {
          const st = stats.get(s.id);
          return (
            <div key={s.id} className={`sub-row ${s.archived ? 'archived' : ''}`}>
              <NameInput value={s.name} onSave={(name) => dispatch({ type: 'sub/update', id: s.id, patch: { name } })} />
              {cat.type === 'expense' && (
                <div className="chips">
                  {(['daily', 'large'] as ExpenseGroup[]).map((g) => (
                    <button key={g} type="button" className={`chip chip-sm ${(s.group ?? 'daily') === g ? 'active' : ''}`} onClick={() => dispatch({ type: 'sub/update', id: s.id, patch: { group: g } })}>
                      {GROUP_LABEL[g]}
                    </button>
                  ))}
                </div>
              )}
              {cat.type === 'income' && (
                <div className="chips">
                  {(['stable', 'extra', 'investment'] as IncomeKind[]).map((k) => (
                    <button key={k} type="button" className={`chip chip-sm ${(s.incomeKind ?? 'extra') === k ? 'active' : ''}`} onClick={() => dispatch({ type: 'sub/update', id: s.id, patch: { incomeKind: k } })}>
                      {INCOME_KIND_LABEL[k]}
                    </button>
                  ))}
                </div>
              )}
              {cat.type === 'investment' && <span />}
              <span className="muted small sub-stat">{st ? `${st.count} опер. · ${formatMoney(st.sum)}` : 'нет операций'}</span>
              <div className="actions">
                {sameType.length > 0 && (
                  <select
                    className="input input-sm"
                    value=""
                    aria-label="Перенести в категорию"
                    onChange={(e) => {
                      if (!e.target.value) return;
                      dispatch({ type: 'sub/update', id: s.id, patch: { categoryId: e.target.value } });
                      toast({ text: `«${s.name}» перенесена вместе с операциями` });
                    }}
                  >
                    <option value="">Перенести…</option>
                    {sameType.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'sub/update', id: s.id, patch: { archived: !s.archived } })}>
                  {s.archived ? 'Вернуть' : 'В архив'}
                </button>
                {!st && (
                  <button
                    type="button"
                    className="icon-btn icon-danger"
                    aria-label="Удалить"
                    title="Удалить"
                    onClick={() => {
                      dispatch({ type: 'sub/delete', id: s.id });
                      undoToast('Подкатегория удалена');
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {!subs.length && <div className="empty">Подкатегорий пока нет.</div>}
      </div>

      <div className="add-row">
        <input className="input" placeholder="Новая подкатегория — Enter" value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSub()} />
        <button type="button" className="btn btn-primary" onClick={addSub}>
          Добавить
        </button>
      </div>
      {cat.type === 'expense' && <p className="muted small">Группа задаётся у подкатегории: «Повседневные» идут в повседневный лимит, «Крупные» — в лимит крупных покупок.</p>}
      {cat.type === 'income' && <p className="muted small">Цель по доходу считается по стабильному и дополнительному доходу. Инвестиционный доход показывается отдельно.</p>}
    </div>
  );
}

/** Поле названия: сохраняет по Enter или при уходе с поля. */
function NameInput({ value, onSave, className = '' }: { value: string; onSave: (v: string) => void; className?: string }) {
  const [v, setV] = useState(value);
  const save = () => {
    const name = v.trim();
    if (name && name !== value) onSave(name);
    else setV(value);
  };
  return (
    <input
      className={`input input-name ${className}`}
      value={v}
      aria-label="Название"
      onChange={(e) => setV(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setV(value);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}
