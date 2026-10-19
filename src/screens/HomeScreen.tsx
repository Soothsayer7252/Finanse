// Главная: только обзор месяца. Ввода и списка операций здесь нет — они в «Операциях».

import { useMemo, type ReactNode } from 'react';
import { addMonths, endOfMonth, formatDate, formatDaysList, monthPrepositional, periodLabel, todayISO } from '../domain/dates';
import { baselineMonths, categoryChanges, dailyPace, limitStatus, limitsFor, monthProgress, monthTotals, topLarge, usualMonth, type CategoryChange, type LimitStatus } from '../domain/insights';
import { formatMoney } from '../domain/money';
import { monthSummary } from '../domain/month';
import { subLabel } from '../domain/ops';
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
    { key: 'daily', label: 'Повседневные', kind: 'expense', status: limitStatus('expense', mt.daily, limits?.daily ?? null, usual?.daily ?? null, progress, pace.projected) },
    { key: 'large', label: 'Крупные', kind: 'expense', status: limitStatus('expense', mt.large, limits?.large ?? null, usual?.large ?? null, progress) },
    { key: 'income', label: 'Доход', kind: 'income', status: limitStatus('income', mt.income, limits?.income ?? null, usual?.income ?? null, progress) },
  ];
  const noLimits = !limits || (limits.daily == null && limits.large == null && limits.income == null);
  const money = (n: number) => formatMoney(n, { whole: true });

  // Пока есть пропущенные дни, «меньше обычного» скорее значит «не внесено».
  const hideDown = s.emptyDays.length >= EMPTY_DAYS_FOR_DOWN;
  const visible = changes.filter((c) => !hideDown || c.direction === 'up');
  const shownChanges = visible.slice(0, 8);
  const hiddenDown = changes.length - visible.length;
  const ups = changes.filter((c) => c.direction === 'up');
  const whyText = ups.length ? `Больше обычного: ${ups.slice(0, 3).map((c) => `${c.name} +${money(c.delta)}`).join(', ')}` : '';

  // «Что важно»: сначала выход за рамки, потом то, что надо доделать.
  const rows: { key: string; tone: 'over' | 'warn' | 'info' | 'ok'; title: string; detail?: string; extra?: ReactNode }[] = [];
  if (limits?.daily != null && mt.daily > limits.daily) {
    rows.push({ key: 'daily-over', tone: 'over', title: `Повседневные вышли за лимит на ${money(mt.daily - limits.daily)}`, detail: whyText || undefined });
  } else if (limits?.daily != null && pace.projected != null && pace.projected > limits.daily) {
    const daysLeft = progress.days - progress.day + 1;
    const perDay = Math.max(0, (limits.daily - mt.daily) / daysLeft);
    rows.push({
      key: 'daily-pace',
      tone: 'warn',
      title: 'Повседневные идут быстрее лимита',
      detail: `К концу месяца ~${money(pace.projected)} при лимите ${money(limits.daily)}. Чтобы уложиться — не больше ~${money(perDay)} в день.${whyText ? ` ${whyText}.` : ''}`,
    });
  }
  if (limits?.large != null && mt.large > limits.large) {
    const top = topLarge(ops, ix, month).map((op) => `${[subLabel(op.subcategoryId, ix), op.comment].filter(Boolean).join(', ') || 'без категории'} — ${money(op.amount)}`);
    rows.push({ key: 'large-over', tone: 'over', title: `Крупные вышли за лимит на ${money(mt.large - limits.large)}`, detail: top.length ? `Крупнее всего: ${top.join('; ')}` : undefined });
  }
  if (s.emptyDays.length > 0) {
    const shownDays = s.emptyDays.slice(-8);
    rows.push({
      key: 'empty',
      tone: 'warn',
      title: `${s.emptyDays.length} ${plural(s.emptyDays.length, 'день', 'дня', 'дней')} без записей`,
      detail: s.emptyDays.length <= 4 ? `${formatDaysList(s.emptyDays)} — ничего не тратили или забыли внести?` : 'Ничего не тратили или забыли внести? Нажмите на день, чтобы внести за него.',
      extra: (
        <div className="chips">
          {shownDays.map((d) => (
            <button key={d} type="button" className="chip chip-sm day-chip" onClick={() => addForDate(d)}>
              + {formatDate(d).slice(0, 5)}
            </button>
          ))}
          {s.emptyDays.length > shownDays.length && <span className="muted small">и ещё {s.emptyDays.length - shownDays.length}</span>}
        </div>
      ),
    });
  }
  if (inboxCount > 0) {
    rows.push({
      key: 'inbox',
      tone: 'info',
      title: `${inboxCount} ${plural(inboxCount, 'операция', 'операции', 'операций')} без категории`,
      extra: (
        <button type="button" className="link todo-link" onClick={() => goTo('inbox')}>
          Разобрать во «Входящих» →
        </button>
      ),
    });
  }
  if (!rows.length) {
    rows.push({ key: 'ok', tone: 'ok', title: 'Всё внесено и разобрано', detail: noLimits ? 'Задайте лимиты в «Настройках» — здесь появятся предупреждения о перерасходе' : 'Лимиты в порядке' });
  }

  const openCategory = (c: CategoryChange) => {
    dispatch({ type: 'settings', patch: { period: { mode: 'range', single: '', from: `${month}-01`, to: endOfMonth(`${month}-01`), ...(isCurrent ? { quick: 'month' as const } : {}) } } });
    showCategory(c.categoryId);
  };

  const sameYear = month.slice(0, 4) === today.slice(0, 4);
  const changesTitle = isCurrent ? 'Где траты не как обычно' : `Где траты в ${monthPrepositional(month)}${sameYear ? '' : ` ${month.slice(0, 4)}`} были не как обычно`;
  const changesSub = isCurrent ? `Сравниваем с тем, сколько вы обычно тратите к ${progress.day}-му числу` : 'Сравниваем с вашим обычным месяцем';
  const method = `Обычно — типичный месяц из последних ${baseCount} ${plural(baseCount, 'полного', 'полных', 'полных')}, только повседневные траты, без разовых крупных чеков`;

  return (
    <div className="stack">
      <section className="card hero">
        <div className="hero-top">
          <div className="month-nav">
            <button type="button" className="square-btn" aria-label="Прошлый месяц" onClick={() => setMonth(addMonths(`${month}-01`, -1).slice(0, 7))}>
              ‹
            </button>
            <span className="month-name">{label}</span>
            <button type="button" className="square-btn" aria-label="Следующий месяц" disabled={isCurrent} onClick={() => setMonth(addMonths(`${month}-01`, 1).slice(0, 7))}>
              ›
            </button>
          </div>
          {isCurrent && <span className="muted">Прошло {Math.round(progress.share * 100)}% месяца</span>}
        </div>

        <div className="hero-mid">
          {hasOps ? (
            <div className="hero-title">
              <span className="hero-label">Месяц {t.result >= 0 ? 'в плюсе' : 'в минусе'}</span>
              <span className={`hero-amount ${t.result >= 0 ? 'amount-income' : 'amount-expense'}`}>
                {t.result >= 0 ? '+' : '−'}
                {money(Math.abs(t.result))}
              </span>
            </div>
          ) : (
            <div className="hero-title hero-title-sm">{isCurrent ? 'В этом месяце пока нет операций' : 'В этом месяце операций нет'}</div>
          )}
          <div className="hero-tiles">
            <Tile label="Пришло" value={t.income} cls="amount-income" />
            <Tile label="Ушло" value={t.expense} />
            <Tile label="Вложено" value={t.investment} cls="amount-investment" />
          </div>
        </div>

        <div className="hero-bars">
          {bars.map((b) => (
            <LimitBar key={b.key} label={b.label} status={b.status} kind={b.kind} marker={isCurrent && b.key === 'daily' && b.status.fill != null ? progress.share : null} />
          ))}
        </div>
        {noLimits && (
          <button type="button" className="link hero-link" onClick={() => goTo('settings')}>
            Задать лимиты и цель по доходу →
          </button>
        )}
      </section>

      <div className="home-columns">
        <section className="stack-sm" aria-labelledby="important-title">
          <div className="section-head">
            <h2 className="section-title" id="important-title">
              Что важно
            </h2>
          </div>
          <div className="card list-panel">
            {rows.map((r) => (
              <div key={r.key} className="todo-row">
                <span className={`todo-dot todo-dot-${r.tone}`} aria-hidden="true" />
                <div className="todo-body">
                  <div className="todo-title">{r.title}</div>
                  {r.detail && <div className="todo-detail">{r.detail}</div>}
                  {r.extra}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="stack-sm" aria-labelledby="changes-title">
          <div className="section-head">
            <h2 className="section-title" id="changes-title">
              {changesTitle}
            </h2>
            {baseCount >= 3 && (
              <p className="section-sub" title={method}>
                {changesSub}
              </p>
            )}
          </div>
          <div className="card list-panel">
            {baseCount < 3 ? (
              <InfoRow title="Сравнивать пока не с чем" detail={`«Обычно» считается по полным месяцам до выбранного — нужно хотя бы три, сейчас ${baseCount}. Пока смотрите итоги и лимиты выше.`} />
            ) : shownChanges.length ? (
              shownChanges.map((c) => <ChangeRow key={c.categoryId} change={c} onOpen={() => openCategory(c)} />)
            ) : hiddenDown > 0 ? (
              <InfoRow title="Сначала внесите пропущенные дни" detail="Сейчас траты выглядят меньше обычного, но, скорее всего, просто не всё внесено." />
            ) : (
              <InfoRow tone="ok" title="Всё как обычно" detail="Ни одна категория заметно не отличается от обычного" />
            )}
          </div>
          {hiddenDown > 0 && shownChanges.length > 0 && <p className="muted small section-note">Пока есть дни без записей, «меньше обычного» не показываем: возможно, просто не всё внесено.</p>}
        </section>
      </div>
    </div>
  );
}

function Tile({ label, value, cls = '' }: { label: string; value: number; cls?: string }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className={`tile-value ${value === 0 ? 'zero' : cls}`}>{formatMoney(value, { whole: true })}</div>
    </div>
  );
}

function LimitBar({ label, status, kind, marker }: { label: string; status: LimitStatus; kind: 'expense' | 'income'; marker: number | null }) {
  const fillCls = kind === 'income' ? 'fill-income' : status.tone === 'over' ? 'fill-over' : status.tone === 'warn' ? 'fill-warn' : 'fill-spend';
  return (
    <div className={`limit-bar tone-${status.tone}`}>
      <div className="limit-bar-head">
        <b>{label}</b>
        <span>{status.value}</span>
      </div>
      {status.fill != null ? (
        <div className="bar" role="img" aria-label={`${label}: ${status.value}`}>
          <div className={`bar-fill ${fillCls}`} style={{ width: `${Math.max(status.fill * 100, status.fill > 0 ? 2 : 0)}%` }} />
          {marker != null && <div className="bar-marker" style={{ left: `${marker * 100}%` }} title={`Прошло ${Math.round(marker * 100)}% месяца`} />}
        </div>
      ) : (
        <div className="bar bar-none" aria-hidden="true" />
      )}
      <div className="limit-bar-note">{status.note}</div>
    </div>
  );
}

function ChangeRow({ change: c, onOpen }: { change: CategoryChange; onOpen: () => void }) {
  const money = (n: number) => formatMoney(n, { whole: true });
  const scale = Math.max(c.current, c.usual) || 1;
  // Сильный рост (вдвое и больше) — красным, обычный рост — янтарным, снижение — зелёным.
  const tone = c.direction === 'down' ? 'down' : c.usual === 0 || c.current >= c.usual * 2 ? 'hot' : 'up';
  return (
    <button type="button" className="change-row" onClick={onOpen} title={`${c.title}. Нажмите, чтобы увидеть операции`}>
      <div className="change-head">
        <span className={`change-icon tone-${tone}`} aria-hidden="true">
          {c.direction === 'up' ? '↑' : '↓'}
        </span>
        <b>{c.name}</b>
        <span className={`pill tone-${tone}`}>
          на {money(Math.abs(c.delta))} {c.direction === 'up' ? 'больше' : 'меньше'}
        </span>
      </div>
      <div className="change-bars">
        <span className="change-label">Сейчас</span>
        <div className="bar">
          <div className={`bar-fill fill-${tone}`} style={{ width: `${(c.current / scale) * 100}%` }} />
        </div>
        <b className="change-value">{money(c.current)}</b>
        <span className="change-label muted">Обычно</span>
        <div className="bar">
          <div className="bar-fill fill-usual" style={{ width: `${(c.usual / scale) * 100}%` }} />
        </div>
        <span className="change-value muted">~{money(c.usual)}</span>
      </div>
      {c.reason && (
        <div className="change-why">
          <b>Почему:</b> {c.reason}
        </div>
      )}
    </button>
  );
}

function InfoRow({ title, detail, tone = 'info' }: { title: string; detail: string; tone?: 'info' | 'ok' }) {
  return (
    <div className="todo-row">
      <span className={`todo-dot todo-dot-${tone}`} aria-hidden="true" />
      <div className="todo-body">
        <div className="todo-title">{title}</div>
        <div className="todo-detail">{detail}</div>
      </div>
    </div>
  );
}
