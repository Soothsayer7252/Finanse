// Мастер переноса из старой версии: показывает, что перенесётся, и даёт
// подтвердить группы расходов и виды доходов, которые приложение предложило само.

import { useMemo, useState } from 'react';
import { formatMoney, round2 } from '../domain/money';
import type { LegacyResult } from '../domain/legacy';
import { GROUP_LABEL, INCOME_KIND_LABEL, type AppData, type ExpenseGroup, type IncomeKind, type Subcategory } from '../domain/types';

interface Props {
  result: LegacyResult;
  hasCurrentData: boolean;
  onCancel: () => void;
  onConfirm: (data: AppData) => void;
}

export function LegacyWizard({ result, hasCurrentData, onCancel, onConfirm }: Props) {
  const { report } = result;
  const [subs, setSubs] = useState<Subcategory[]>(result.data.subcategories);

  const stats = useMemo(() => {
    const m = new Map<string, { count: number; sum: number }>();
    for (const op of result.data.operations) {
      if (!op.subcategoryId) continue;
      const s = m.get(op.subcategoryId) ?? { count: 0, sum: 0 };
      s.count++;
      s.sum = round2(s.sum + op.amount);
      m.set(op.subcategoryId, s);
    }
    return m;
  }, [result]);

  const update = (id: string, patch: Partial<Subcategory>) => setSubs((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const setAll = (catId: string, group: ExpenseGroup) => setSubs((list) => list.map((s) => (s.categoryId === catId ? { ...s, group } : s)));

  const sections: { title: string; type: 'expense' | 'income' | 'investment' }[] = [
    { title: 'Расходы: повседневные или крупные?', type: 'expense' },
    { title: 'Доходы: какой это доход?', type: 'income' },
    { title: 'Инвестиции', type: 'investment' },
  ];

  return (
    <div className="stack narrow">
      <div className="panel">
        <h2>Перенос из старой версии</h2>
        <ul className="report">
          <li>
            Будет перенесено операций: <b>{report.imported}</b> из {report.totalOps}.
          </li>
          {report.skipped.count > 0 && (
            <li>
              Не переносятся операции «не в аналитике» / долги: {report.skipped.count} шт. на {formatMoney(report.skipped.sum)} — как договорились.
            </li>
          )}
          {report.movedToInvestments.count > 0 && (
            <li>
              «{report.movedToInvestments.names.join('», «')}» переносится в «Инвестиции»: это вложения, а не траты ({report.movedToInvestments.count} опер. на{' '}
              {formatMoney(report.movedToInvestments.sum)}).
            </li>
          )}
          {report.broken > 0 && <li className="warn">Пропущено операций с неверной датой или суммой: {report.broken}.</li>}
          <li>Подписки становятся обычной категорией расходов. Архивные категории остаются в архиве.</li>
        </ul>
        <p className="muted">
          Ниже — группы, которые приложение предложило по названиям. Проверьте и поправьте: потом это тоже можно менять во вкладке «Категории».
        </p>
      </div>

      {sections.map((sec) => {
        const cats = result.data.categories.filter((c) => c.type === sec.type);
        if (!cats.length) return null;
        return (
          <div key={sec.type} className="panel">
            <h3>{sec.title}</h3>
            {cats.map((cat) => {
              const catSubs = subs.filter((s) => s.categoryId === cat.id);
              return (
                <div key={cat.id} className="wizard-cat">
                  <div className="wizard-cat-head">
                    <b>{cat.name}</b>
                    {cat.archived && <span className="badge">архив</span>}
                    {sec.type === 'expense' && catSubs.length > 1 && (
                      <span className="chips">
                        <span className="muted small">всю категорию:</span>
                        <button type="button" className="chip chip-sm" onClick={() => setAll(cat.id, 'daily')}>
                          {GROUP_LABEL.daily}
                        </button>
                        <button type="button" className="chip chip-sm" onClick={() => setAll(cat.id, 'large')}>
                          {GROUP_LABEL.large}
                        </button>
                      </span>
                    )}
                  </div>
                  {catSubs.map((s) => {
                    const st = stats.get(s.id);
                    return (
                      <div key={s.id} className="wizard-sub">
                        <span>{s.name}</span>
                        <span className="muted small">{st ? `${st.count} опер. · ${formatMoney(st.sum)}` : 'нет операций'}</span>
                        {sec.type === 'expense' && (
                          <span className="chips">
                            {(['daily', 'large'] as ExpenseGroup[]).map((g) => (
                              <button key={g} type="button" className={`chip chip-sm ${s.group === g ? 'active' : ''}`} onClick={() => update(s.id, { group: g })}>
                                {GROUP_LABEL[g]}
                              </button>
                            ))}
                          </span>
                        )}
                        {sec.type === 'income' && (
                          <span className="chips">
                            {(['stable', 'extra', 'investment'] as IncomeKind[]).map((k) => (
                              <button key={k} type="button" className={`chip chip-sm ${s.incomeKind === k ? 'active' : ''}`} onClick={() => update(s.id, { incomeKind: k })}>
                                {INCOME_KIND_LABEL[k]}
                              </button>
                            ))}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}

      <div className="panel">
        {hasCurrentData && <p className="warn">Данные, которые уже есть в новой версии, будут заменены. Они сохранятся, и их можно будет вернуть в «Настройках».</p>}
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={() => onConfirm({ ...result.data, subcategories: subs })}>
            Перенести {report.imported} операций
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
