// Главная: только обзор месяца. Ввода и списка операций здесь нет — они в «Операциях».

import { useMemo } from 'react';
import { addMonths, endOfMonth, formatDate, formatDaysList, monthPrepositional, periodLabel, todayISO } from '../domain/dates';
import { baselineMonths, categoryChanges, dailyPace, limitStatus, limitsFor, monthProgress, monthTotals, usualMonth, type CategoryChange, type LimitStatus } from '../domain/insights';
import { formatMoney } from '../domain/money';
import { monthSummary } from '../domain/month';
import { plural } from '../domain/text';
import { useStore } from '../store/store';

type Tab = 'operations' | 'inbox' | 'categories' | 'settings';

interface Props {
  /** Выбранный месяц 'ГГГГ-ММ' — хранится выше, чтобы не сбрасывался при уходе с Главной. */
  month: string;
  setMonth: (m: string) => void;
  goTo: (tab: Tab) => void;
  /** Перейти в «Операции» и начать ввод за этот день. */
  addForDate: (iso: string) => void;
  /** Перейти в «Операции» с отбором по категории (период уже выставлен). */
  showCategory: (categoryId: string) => void;
}

/** Сколько дней без записей допускаем, прежде чем перестать верить «меньше обычного». */
const EMPTY_DAYS_FOR_DOWN = 3;

export function HomeScreen({ month, setMonth, goTo, addForDate, showCategory }: Props) {
  const { data, ix, dispatch } = useStore();
  const ops = data.operations;
  const today = todayISO();
  const s = useMemo(() => monthSummary(ops, ix, month, today), [ops, ix, month, today]);
  const mt = useMemo(() => monthTotals(ops, ix, month), [ops, ix, month]);
  const usual = useMemo(() => usualMonth(ops, ix, month), [ops, ix, month]);
  const changes = useMemo(() => categoryChanges(ops, ix, month, today), [ops, ix, month, today]);
  const baseCount = useMemo(() => baselineMonths(ops, month).length, [ops, month]);
  const t = s.totals;
  const inboxCount = ops.filter((op) => !op.subcategoryId).length;
  const isEmpty = ops.length === 0 && data.categories.length === 0;
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
            Загрузить копию (в том числе из старой версии)
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => goTo('operations')}>
            Внести первую операцию
          </button>
        </div>
      </div>
    );
  }

  const limits = limitsFor(month, data.settings.limits);
  const progress = monthProgress(month, today);
  const pace = dailyPace(ops, ix, month, today, limits?.daily ?? 0);
  const bars: { key: string; label: string; status: LimitStatus; kind: 'expense' | 'income' }[] = [
    { key: 'daily', label: 'Повседневные траты', kind: 'expense', status: limitStatus('expense', mt.daily, limits?.daily ?? null, usual?.daily ?? null, progress, pace.projected) },
    { key: 'large', label: 'Крупные покупки', kind: 'expense', status: limitStatus('expense', mt.large, limits?.large ?? null, usual?.large ?? null, progress) },
    { key: 'income', label: 'Доход', kind: 'income', status: limitStatus('income', mt.income, limits?.income ?? null, usual?.income ?? null, progress) },
  ];
  const noLimits = !limits || (limits.daily == null && limits.large == null && limits.income == null);

  // Пока есть пропущенные дни, «меньше обычного» скорее значит «не внесено».
  const hideDown = s.emptyDays.length >= EMPTY_DAYS_FOR_DOWN;
  const shownChanges = changes.filter((c) => !hideDown || c.direction === 'up').slice(0, 8);
  const hiddenDown = changes.length - changes.filter((c) => !hideDown || c.direction === 'up').length;
  const ups = changes.filter((c) => c.direction === 'up');
  const whyText = ups.length ? `Больше обычного: ${ups.slice(0, 3).map((c) => `${c.name} +${formatMoney(c.delta, { whole: true })}`).join(', ')}` : '';

  const alerts: { key: string; title: string; detail: string }[] = [];
  if (limits?.daily != null && mt.daily > limits.daily) {
    alerts.push({ key: 'daily-over', title: `Повседневные траты вышли за лимит на ${formatMoney(mt.daily - limits.daily, { whole: true })}`, detail: whyText || 'Посмотрите, что изменилось, ниже' });
  } else if (limits?.daily != null && pace.projected != null && pace.projected > limits.daily) {
    const daysLeft = progress.days - progress.day + 1;
    const perDay = Math.max(0, (limits.daily - mt.daily) / daysLeft);
    alerts.push({
      key: 'daily-pace',
      title: 'Повседневные идут быстрее лимита',
      detail: `К концу месяца выйдет ~${formatMoney(pace.projected, { whole: true })} при лимите ${formatMoney(limits.daily, { whole: true })}. Чтобы уложиться — не больше ~${formatMoney(perDay, { whole: true })} в день.${whyText ? ` ${whyText}.` : ''}`,
    });
  }
  if (limits?.large != null && mt.large > limits.large) {
    alerts.push({ key: 'large-over', title: `Крупные покупки вышли за лимит на ${formatMoney(mt.large - limits.large, { whole: true })}`, detail: 'Список — в «Операциях», фильтр «Расходы»' });
  }

  const openCategory = (c: CategoryChange) => {
    dispatch({ type: 'settings', patch: { period: { mode: 'range', single: '', from: `${month}-01`, to: endOfMonth(`${month}-01`), ...(isCurrent ? { quick: 'month' as const } : {}) } } });
    showCategory(c.categoryId);
  };

  const shownDays = s.emptyDays.slice(-8);
  const sameYear = month.slice(0, 4) === today.slice(0, 4);
  const changesTitle = isCurrent ? 'Что изменилось в этом месяце' : `Что изменилось в ${monthPrepositional(month)}${sameYear ? '' : ` ${month.slice(0, 4)}`}`;
  const allClear = !alerts.length && !s.emptyDays.length && !inboxCount;

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
                {t.investment > 0 && (
                  <>
                    {' '}
                    · вложено <b className="amount-investment">{formatMoney(t.investment, { whole: true })}</b>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="hero-title hero-title-sm">{isCurrent ? 'В этом месяце пока нет операций' : 'В этом месяце операций нет'}</div>
          )}
        </div>
        <div className="hero-side">
          {bars.map((b) => (
            <LimitBar key={b.key} label={b.label} status={b.status} kind={b.kind} marker={isCurrent && b.key === 'daily' && b.status.fill != null ? progress.share : null} />
          ))}
          {noLimits && (
            <button type="button" className="link hero-note" onClick={() => goTo('settings')}>
              Задать лимиты и цель по доходу →
            </button>
          )}
          {isCurrent && limits?.daily != null && <p className="hero-note">Риска на полоске повседневных — сколько месяца уже прошло ({Math.round(progress.share * 100)}%).</p>}
        </div>
      </section>

      <section className="stack-sm" aria-labelledby="important-title">
        <h2 className="section-title" id="important-title">
          Что важно
        </h2>
        <div className="insights">
          {alerts.map((a) => (
            <div key={a.key} className="card insight insight-alert">
              <div className="insight-icon over" aria-hidden="true">
                !
              </div>
              <div className="insight-body">
                <div className="insight-title">{a.title}</div>
                <div className="insight-detail">{a.detail}</div>
              </div>
            </div>
          ))}
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
          {allClear && (
            <div className="card insight">
              <div className="insight-icon ok" aria-hidden="true">
                ✓
              </div>
              <div className="insight-body">
                <div className="insight-title">Всё внесено и разобрано</div>
                <div className="insight-detail">{noLimits ? 'Лимиты не заданы — задайте их в «Настройках», и здесь появятся предупреждения' : 'В рамках лимитов'}</div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="stack-sm" aria-labelledby="changes-title">
        <div className="section-head">
          <h2 className="section-title" id="changes-title">
            {changesTitle}
          </h2>
          {baseCount >= 3 && (
            <span className="muted small">
              {isCurrent ? `Сравниваем с тем, сколько обычно уходит к ${progress.day}-му числу` : 'Сравниваем с обычным месяцем'} · повседневные траты · медиана за {baseCount}{' '}
              {plural(baseCount, 'месяц', 'месяца', 'месяцев')}
            </span>
          )}
        </div>
        {baseCount < 3 ? (
          <div className="card insight">
            <div className="insight-icon" aria-hidden="true">
              …
            </div>
            <div className="insight-body">
              <div className="insight-title">Сравнивать пока не с чем</div>
              <div className="insight-detail">
                «Обычно» считается по полным месяцам до выбранного — нужно хотя бы три, сейчас {baseCount}. Пока смотрите итоги и лимиты выше.
              </div>
            </div>
          </div>
        ) : (
          <div className="insights">
            {shownChanges.map((c) => (
              <ChangeCard key={c.categoryId} change={c} isCurrent={isCurrent} onOpen={() => openCategory(c)} />
            ))}
            {!shownChanges.length && hiddenDown > 0 && (
              <div className="card insight">
                <div className="insight-icon warn" aria-hidden="true">
                  …
                </div>
                <div className="insight-body">
                  <div className="insight-title">Сначала внесите пропущенные дни</div>
                  <div className="insight-detail">Сейчас траты выглядят меньше обычного, но, скорее всего, просто не всё внесено.</div>
                </div>
              </div>
            )}
            {!shownChanges.length && !hiddenDown && (
              <div className="card insight">
                <div className="insight-icon ok" aria-hidden="true">
                  =
                </div>
                <div className="insight-body">
                  <div className="insight-title">Всё как обычно</div>
                  <div className="insight-detail">Ни одна категория заметно не отличается от обычного</div>
                </div>
              </div>
            )}
          </div>
        )}
        {hiddenDown > 0 && shownChanges.length > 0 && (
          <p className="muted small section-note">
            Пока есть дни без записей, «меньше обычного» не показываем: возможно, просто не всё внесено.
          </p>
        )}
      </section>
    </div>
  );
}

function LimitBar({ label, status, kind, marker }: { label: string; status: LimitStatus; kind: 'expense' | 'income'; marker: number | null }) {
  return (
    <div className={`limit-bar tone-${status.tone}`}>
      <div className="limit-bar-head">
        <b>{label}</b>
        <span>{status.value}</span>
      </div>
      {status.fill != null && (
        <div className="bar" role="img" aria-label={`${label}: ${status.value}`}>
          <div className={`bar-fill ${kind === 'income' ? 'fill-income' : status.tone === 'over' ? 'fill-over' : 'fill-spend'}`} style={{ width: `${Math.max(status.fill * 100, status.fill > 0 ? 2 : 0)}%` }} />
          {marker != null && <div className="bar-marker" style={{ left: `${marker * 100}%` }} title={`Прошло ${Math.round(marker * 100)}% месяца`} />}
        </div>
      )}
      <div className="limit-bar-note">{status.note}</div>
    </div>
  );
}

function ChangeCard({ change: c, isCurrent, onOpen }: { change: CategoryChange; isCurrent: boolean; onOpen: () => void }) {
  const scale = Math.max(c.current, c.usual) || 1;
  const reason = c.reason.charAt(0).toUpperCase() + c.reason.slice(1);
  return (
    <button type="button" className="card insight insight-link change-card" onClick={onOpen} title="Показать операции этой категории">
      <div className={`insight-icon ${c.direction}`} aria-hidden="true">
        {c.direction === 'up' ? '↑' : '↓'}
      </div>
      <div className="insight-body">
        <div className="insight-title">{c.title}</div>
        <div className="bar bar-sm">
          <div className={`bar-fill ${c.direction === 'up' ? 'fill-up' : 'fill-down'}`} style={{ width: `${(c.current / scale) * 100}%` }} />
          {c.usual > 0 && <div className="bar-marker" style={{ left: `${(c.usual / scale) * 100}%` }} />}
        </div>
        <div className="insight-numbers">
          <b>{formatMoney(c.current, { whole: true })}</b>
          <span>{c.usual > 0 ? `${isCurrent ? 'обычно к этому числу' : 'обычно'} ~${formatMoney(c.usual, { whole: true })}` : 'обычно почти ничего'}</span>
        </div>
        {reason && <div className="insight-detail">{reason}</div>}
      </div>
    </button>
  );
}
