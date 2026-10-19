// Главная: только обзор месяца. Ввода и списка операций здесь нет — они в «Операциях».

import { useMemo, useState } from 'react';
import { addMonths, formatDaysList, formatDate, periodLabel, todayISO, endOfMonth } from '../domain/dates';
import { formatMoney } from '../domain/money';
import { monthSummary } from '../domain/month';
import { useStore } from '../store/store';

type Tab = 'operations' | 'inbox' | 'categories' | 'settings';

interface Props {
  goTo: (tab: Tab) => void;
  /** Перейти в «Операции» и начать ввод за этот день. */
  addForDate: (iso: string) => void;
}

export function HomeScreen({ goTo, addForDate }: Props) {
  const { data, ix } = useStore();
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const s = useMemo(() => monthSummary(data.operations, ix, month, today), [data.operations, ix, month, today]);
  const t = s.totals;
  const inboxCount = data.operations.filter((op) => !op.subcategoryId).length;
  const isEmpty = data.operations.length === 0 && data.categories.length === 0;
  const label = periodLabel({ mode: 'range', single: '', from: `${month}-01`, to: endOfMonth(`${month}-01`) });
  const isCurrent = month === today.slice(0, 7);
  const hasOps = t.count > 0;

  if (isEmpty) {
    return (
      <div className="card welcome">
        <h2>Добро пожаловать!</h2>
        <p>Здесь будет обзор месяца: сколько пришло и ушло, где вы вышли за рамки и что изменилось.</p>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={() => goTo('settings')}>
            Перенести данные из старой версии
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => goTo('operations')}>
            Внести первую операцию
          </button>
        </div>
      </div>
    );
  }

  const shownDays = s.emptyDays.slice(-8);

  return (
    <div className="stack">
      <section className="card hero">
        <div className="hero-main">
          <div className="month-switch">
            <button type="button" className="icon-btn" aria-label="Прошлый месяц" onClick={() => setMonth(addMonths(`${month}-01`, -1).slice(0, 7))}>
              ‹
            </button>
            <span className="month-name">{label}</span>
            <button type="button" className="icon-btn" aria-label="Следующий месяц" disabled={isCurrent} onClick={() => setMonth(addMonths(`${month}-01`, 1).slice(0, 7))}>
              ›
            </button>
          </div>
          {hasOps ? (
            <>
              <div className="hero-title">
                Месяц {t.result >= 0 ? 'в плюсе' : 'в минусе'}
                <br />
                на <span className={t.result >= 0 ? 'amount-income' : 'amount-expense'}>{formatMoney(Math.abs(t.result), { whole: true })}</span>
              </div>
              <div className="hero-sub">
                Пришло <b className="amount-income">{formatMoney(t.income, { whole: true })}</b> · ушло <b>{formatMoney(t.expense, { whole: true })}</b>
              </div>
            </>
          ) : (
            <div className="hero-title hero-title-sm">{isCurrent ? 'В этом месяце пока нет операций' : 'В этом месяце операций нет'}</div>
          )}
        </div>
        {hasOps && (
          <div className="hero-side">
            <Row label="Повседневные траты" value={t.expenseDaily} />
            <Row label="Крупные покупки" value={t.expenseLarge} />
            {t.investment > 0 && <Row label="Вложено" value={t.investment} />}
            <Row label="Доходы" value={t.income} income />
            <p className="hero-note">Лимиты и цель по доходу появятся на следующем шаге — тогда здесь будут полоски «сколько из скольких».</p>
          </div>
        )}
      </section>

      <section className="stack-sm">
        <h2 className="section-title">Что важно</h2>
        <div className="insights">
          {s.emptyDays.length > 0 && (
            <div className="card insight">
              <div className="insight-icon warn" aria-hidden="true">
                !
              </div>
              <div className="insight-body">
                <div className="insight-title">
                  {s.emptyDays.length} {plural(s.emptyDays.length, 'день', 'дня', 'дней')} без записей
                </div>
                <div className="insight-detail">
                  {s.emptyDays.length <= 4 ? `${formatDaysList(s.emptyDays)} — ничего не тратили или забыли внести?` : 'Ничего не тратили или забыли внести? Нажмите на день, чтобы внести за него.'}
                </div>
                <div className="chips">
                  {shownDays.map((d) => (
                    <button key={d} type="button" className="chip chip-sm" onClick={() => addForDate(d)}>
                      + {formatDate(d).slice(0, 5)}
                    </button>
                  ))}
                  {s.emptyDays.length > shownDays.length && <span className="muted small">и ещё {s.emptyDays.length - shownDays.length}</span>}
                </div>
              </div>
            </div>
          )}
          {inboxCount > 0 && (
            <button type="button" className="card insight insight-link" onClick={() => goTo('inbox')}>
              <div className="insight-icon" aria-hidden="true">
                ?
              </div>
              <div className="insight-body">
                <div className="insight-title">
                  {inboxCount} {plural(inboxCount, 'операция', 'операции', 'операций')} без категории
                </div>
                <div className="insight-detail">Разберите во «Входящих» — пачкой, за пару минут</div>
              </div>
            </button>
          )}
          {s.emptyDays.length === 0 && inboxCount === 0 && (
            <div className="card insight">
              <div className="insight-icon ok" aria-hidden="true">
                ✓
              </div>
              <div className="insight-body">
                <div className="insight-title">Всё внесено и разобрано</div>
                <div className="insight-detail">Сравнение с обычными тратами появится на следующем шаге</div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Row({ label, value, income }: { label: string; value: number; income?: boolean }) {
  return (
    <div className="hero-row">
      <span>{label}</span>
      <b className={income ? 'amount-income' : ''}>{formatMoney(value, { whole: true })}</b>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
