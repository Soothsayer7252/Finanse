import { describe, expect, it } from 'vitest';
import { baselineMonths, categoryChanges, dailyPace, limitStatus, limitsFor, median, monthProgress, upsertLimits, usualMonth } from './insights';
import { buildIndex } from './ops';
import type { Operation } from './types';

const ix = buildIndex({
  categories: [
    { id: 'food', name: 'Еда', type: 'expense', archived: false },
    { id: 'trans', name: 'Транспорт', type: 'expense', archived: false },
    { id: 'fun', name: 'Досуг', type: 'expense', archived: false },
    { id: 'tech', name: 'Техника', type: 'expense', archived: false },
    { id: 'inc', name: 'Доходы', type: 'income', archived: false },
  ],
  subcategories: [
    { id: 'groc', categoryId: 'food', name: 'Продукты', archived: false, group: 'daily' },
    { id: 'cafe', categoryId: 'food', name: 'Кафе', archived: false, group: 'daily' },
    { id: 'taxi', categoryId: 'trans', name: 'Такси', archived: false, group: 'daily' },
    { id: 'cinema', categoryId: 'fun', name: 'Кино', archived: false, group: 'daily' },
    { id: 'laptop', categoryId: 'tech', name: 'Ноутбук', archived: false, group: 'large' },
    { id: 'salary', categoryId: 'inc', name: 'Зарплата', archived: false, incomeKind: 'stable' },
    { id: 'pct', categoryId: 'inc', name: 'Проценты', archived: false, incomeKind: 'investment' },
  ],
});

let n = 0;
const op = (date: string, amount: number, subcategoryId: string | null, extra: Partial<Operation> = {}): Operation => ({
  id: `o${n++}`,
  date,
  amount,
  subcategoryId,
  comment: '',
  createdAt: '',
  updatedAt: '',
  ...extra,
});

/** Обычный месяц: продукты 4×1000, кафе 3×500, такси 2×300, зарплата 50 000, проценты 700. */
function regular(month: string, upToDay = 31): Operation[] {
  const list = [
    ...[2, 9, 16, 23].map((d) => op(`${month}-${String(d).padStart(2, '0')}`, 1000, 'groc')),
    ...[5, 15, 25].map((d) => op(`${month}-${String(d).padStart(2, '0')}`, 500, 'cafe')),
    ...[3, 13].map((d) => op(`${month}-${String(d).padStart(2, '0')}`, 300, 'taxi')),
    op(`${month}-10`, 50000, 'salary'),
    op(`${month}-28`, 700, 'pct'),
  ];
  return list.filter((o) => Number(o.date.slice(8)) <= upToDay);
}

// Учёт начался 20 марта — март неполный и в «обычно» не идёт.
const history = [op('2026-03-20', 400, 'groc'), ...['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'].flatMap((m) => regular(m))];

describe('медиана', () => {
  it('нечётное, чётное, пусто', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('лимиты по месяцам', () => {
  const limits = [
    { from: '2026-01', daily: 50000, large: null, income: 90000 },
    { from: '2026-09', daily: 60000, large: 20000, income: 100000 },
  ];

  it('действует последняя запись, начавшаяся не позже месяца', () => {
    expect(limitsFor('2026-08', limits)?.daily).toBe(50000);
    expect(limitsFor('2026-09', limits)?.daily).toBe(60000);
    expect(limitsFor('2026-12', limits)?.large).toBe(20000);
    expect(limitsFor('2025-12', limits)).toBeNull();
  });

  it('запись с тем же месяцем заменяется, порядок по месяцам', () => {
    const next = upsertLimits(limits, { from: '2026-05', daily: 55000, large: null, income: null });
    expect(next.map((l) => l.from)).toEqual(['2026-01', '2026-05', '2026-09']);
    const replaced = upsertLimits(next, { from: '2026-09', daily: 1, large: null, income: null });
    expect(replaced).toHaveLength(3);
    expect(limitsFor('2026-10', replaced)?.daily).toBe(1);
  });
});

describe('прошло месяца', () => {
  it('прошлый — целиком, текущий — по сегодня, будущий — ничего', () => {
    expect(monthProgress('2026-09', '2026-10-18')).toEqual({ day: 30, days: 30, share: 1 });
    expect(monthProgress('2026-10', '2026-10-18')).toEqual({ day: 18, days: 31, share: 18 / 31 });
    expect(monthProgress('2026-11', '2026-10-18').share).toBe(0);
  });
});

describe('базовые месяцы для «обычно»', () => {
  it('до 6 полных месяцев до выбранного; неполный первый месяц не берётся', () => {
    expect(baselineMonths(history, '2026-10')).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    expect(baselineMonths(history, '2026-06')).toEqual(['2026-04', '2026-05']);
    expect(baselineMonths(history, '2027-06')).toHaveLength(6);
  });

  it('если учёт начался в первые дни месяца — месяц считается полным', () => {
    const ops = [op('2026-03-02', 100, 'groc')];
    expect(baselineMonths(ops, '2026-06')).toEqual(['2026-03', '2026-04', '2026-05']);
  });

  it('без операций — пусто', () => {
    expect(baselineMonths([], '2026-10')).toEqual([]);
  });
});

describe('обычно за месяц', () => {
  it('медиана по месяцам; крупное разовое не сдвигает, доход без инвестиционного', () => {
    const ops = [...history, op('2026-06-12', 80000, 'laptop'), ...regular('2026-09')];
    const u = usualMonth(ops, ix, '2026-10');
    expect(u).toEqual({ daily: 6100, large: 0, income: 50000, months: 6 });
  });

  it('меньше трёх полных месяцев — «обычно» ещё не известно', () => {
    expect(usualMonth(history, ix, '2026-06')).toBeNull();
  });
});

describe('что изменилось: прошлый месяц целиком', () => {
  it('всё как обычно — выводов нет', () => {
    expect(categoryChanges([...history, ...regular('2026-09')], ix, '2026-09', '2026-10-18')).toEqual([]);
  });

  it('чаще обычного — с главной подкатегорией', () => {
    const extra = [6, 8, 12, 18, 20].map((d) => op(`2026-09-${String(d).padStart(2, '0')}`, 500, 'cafe'));
    const [c, ...rest] = categoryChanges([...history, ...regular('2026-09'), ...extra], ix, '2026-09', '2026-10-18');
    expect(rest).toEqual([]);
    expect(c).toMatchObject({ categoryId: 'food', current: 8000, usual: 5500, delta: 2500, direction: 'up' });
    expect(c.title).toBe('Еда на 45% больше обычного');
    expect(c.reason).toBe('чаще обычного: 12 раз вместо ~7; в основном Кафе: +2 500 ₽');
    expect(c.reason).not.toContain('раза');
  });

  it('разовая крупная трата называется прямо', () => {
    const big = op('2026-09-14', 9000, 'groc', { comment: 'стол на ДР' });
    const [c] = categoryChanges([...history, ...regular('2026-09'), big], ix, '2026-09', '2026-10-18');
    expect(c.title).toBe('Еда в 2,6 раза больше обычного');
    expect(c.reason).toBe('разовая трата 9 000 ₽ — Продукты, стол на ДР');
  });

  it('траты дороже обычного', () => {
    const sept = regular('2026-09').map((o) => (o.subcategoryId === 'cafe' ? { ...o, amount: 1500 } : o));
    const [c] = categoryChanges([...history, ...sept], ix, '2026-09', '2026-10-18');
    expect(c.title).toBe('Еда на 55% больше обычного');
    expect(c.reason).toBe('траты крупнее: в среднем 1 214 ₽ вместо ~786 ₽; в основном Кафе: +3 000 ₽');
  });

  it('новая категория без истории', () => {
    const [c] = categoryChanges([...history, ...regular('2026-09'), op('2026-09-05', 1500, 'cinema', { comment: 'IMAX' })], ix, '2026-09', '2026-10-18');
    expect(c.title).toBe('Досуг — непривычная трата');
    expect(c.reason).toBe('одна трата 1 500 ₽ — Кино, IMAX');
  });

  it('несколько непривычных трат — сколько и на что', () => {
    const fun = [op('2026-09-05', 800, 'cinema'), op('2026-09-19', 700, 'cinema')];
    const [c] = categoryChanges([...history, ...regular('2026-09'), ...fun], ix, '2026-09', '2026-10-18');
    expect(c.title).toBe('Досуг — непривычные траты');
    expect(c.reason).toBe('2 траты — Кино');
  });

  it('рост в разы на маленькой сумме — «намного больше», без странных «в 39 раз»', () => {
    const ops = [...history, ...regular('2026-09'), ...['04', '06', '08', '10'].map((d) => op(`2026-09-${d}`, 1000, 'taxi'))];
    const [c] = categoryChanges(ops, ix, '2026-09', '2026-10-18');
    expect(c.title).toBe('Транспорт намного больше обычного');
  });

  it('рост поровну в двух подкатегориях — называются обе', () => {
    const extra = [op('2026-09-11', 900, 'groc'), op('2026-09-12', 900, 'groc'), op('2026-09-13', 700, 'cafe'), op('2026-09-14', 700, 'cafe')];
    const [c] = categoryChanges([...history, ...regular('2026-09'), ...extra], ix, '2026-09', '2026-10-18');
    expect(c.reason).toBe('чаще обычного: 11 раз вместо ~7; в основном Продукты +1 800 ₽ и Кафе +1 400 ₽');
  });

  it('аномально крупные чеки прошлых месяцев не раздувают «обычно»', () => {
    const outliers = ['2026-04-07', '2026-05-07', '2026-06-07'].map((d) => op(d, 10000, 'groc'));
    expect(categoryChanges([...history, ...outliers, ...regular('2026-09')], ix, '2026-09', '2026-10-18')).toEqual([]);
  });

  it('крупные покупки и мелкие отличия не считаются', () => {
    const ops = [...history, ...regular('2026-09'), op('2026-09-11', 80000, 'laptop'), op('2026-09-12', 900, 'cafe', { groupOverride: 'large' }), op('2026-09-13', 700, 'taxi')];
    expect(categoryChanges(ops, ix, '2026-09', '2026-10-18')).toEqual([]);
  });

  it('пока меньше трёх полных месяцев — выводов нет', () => {
    expect(categoryChanges([...history, op('2026-06-05', 9000, 'groc')], ix, '2026-06', '2026-10-18')).toEqual([]);
  });
});

describe('что изменилось: текущий месяц сравнивается к тому же числу', () => {
  const base = [...history, ...regular('2026-09')];

  it('обычный темп к 18-му числу — выводов нет', () => {
    expect(categoryChanges([...base, ...regular('2026-10', 18)], ix, '2026-10', '2026-10-18')).toEqual([]);
  });

  it('заметно меньше обычного — с главной подкатегорией', () => {
    const [c] = categoryChanges([...base, op('2026-10-02', 1000, 'groc')], ix, '2026-10', '2026-10-18');
    expect(c).toMatchObject({ categoryId: 'food', current: 1000, usual: 4000, direction: 'down' });
    expect(c.title).toBe('Еда намного меньше обычного');
    expect(c.reason).toBe('в основном Продукты: −2 000 ₽');
  });

  it('меньше обычного в категории с одной подкатегорией — без пояснения, цифры и так видны', () => {
    const taxiExtra = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].flatMap((m) => [op(`${m}-04`, 1000, 'taxi'), op(`${m}-08`, 1000, 'taxi')]);
    const [c] = categoryChanges([...base, ...taxiExtra, op('2026-10-03', 300, 'taxi')], ix, '2026-10', '2026-10-18').filter((x) => x.categoryId === 'trans');
    expect(c).toMatchObject({ current: 300, usual: 2600, direction: 'down', title: 'Транспорт намного меньше обычного' });
    expect(c.reason).toBe('');
  });

  it('в первую неделю «меньше обычного» не показываем', () => {
    expect(categoryChanges(base, ix, '2026-10', '2026-10-05')).toEqual([]);
  });

  it('будущие операции текущего месяца не учитываются', () => {
    const ops = [...base, ...regular('2026-10', 18), op('2026-10-25', 9000, 'groc')];
    expect(categoryChanges(ops, ix, '2026-10', '2026-10-18')).toEqual([]);
  });
});

describe('темп повседневных трат', () => {
  const ops = [...history, ...regular('2026-09'), ...regular('2026-10', 18), op('2026-10-19', 5000, 'cafe')];

  it('прогноз на конец месяца по сегодняшний день', () => {
    const p = dailyPace(ops, ix, '2026-10', '2026-10-18', 10000);
    expect(p.spent).toBe(4600);
    expect(p.projected).toBeCloseTo((4600 / 18) * 31, 2);
  });

  it('для прошлого месяца и первых дней прогноза нет', () => {
    expect(dailyPace(ops, ix, '2026-09', '2026-10-18', 10000)).toEqual({ spent: 6100, limit: 10000, projected: null });
    expect(dailyPace(ops, ix, '2026-10', '2026-10-04', 10000).projected).toBeNull();
  });
});

describe('подпись к полоске лимита', () => {
  const past = { day: 30, days: 30, share: 1 };
  const now = { day: 18, days: 31, share: 18 / 31 };

  it('лимит не задан — без полоски, с подсказкой «обычно»', () => {
    expect(limitStatus('expense', 5000, null, 51431, now)).toEqual({ fill: null, value: '5 000 ₽', note: 'Лимит не задан · обычно ~51 431 ₽', tone: 'neutral' });
    expect(limitStatus('income', 0, null, null, now).note).toBe('Цель не задана');
  });

  it('прошлый месяц: уложились или перерасход', () => {
    expect(limitStatus('expense', 55333, 60000, null, past)).toEqual({ fill: 55333 / 60000, value: '55 333 из 60 000 ₽', note: 'Уложились, осталось 4 667 ₽', tone: 'ok' });
    expect(limitStatus('expense', 61240, 60000, null, past)).toMatchObject({ fill: 1, note: 'Перерасход 1 240 ₽', tone: 'over' });
  });

  it('текущий месяц: сколько можно в день или предупреждение о темпе', () => {
    // Осталось 14 дней вместе с сегодняшним.
    expect(limitStatus('expense', 32000, 60000, null, now, 55111).note).toBe('Осталось 28 000 ₽ — это ~2 000 ₽ в день');
    expect(limitStatus('expense', 40000, 60000, null, now, 68889)).toMatchObject({ note: 'Осталось 20 000 ₽, но при нынешнем темпе выйдет ~68 889 ₽', tone: 'warn' });
    // Крупные — без прогноза: они бывают разово.
    expect(limitStatus('expense', 1240, 20000, null, now).note).toBe('Осталось 18 760 ₽');
  });

  it('цель по доходу', () => {
    expect(limitStatus('income', 74320, 90000, null, past)).toMatchObject({ note: 'До цели не хватило 15 680 ₽', tone: 'warn' });
    expect(limitStatus('income', 50000, 90000, null, now)).toMatchObject({ note: 'До цели 40 000 ₽', tone: 'neutral' });
    expect(limitStatus('income', 99649, 90000, null, past)).toMatchObject({ fill: 1, note: 'Цель выполнена, сверх +9 649 ₽', tone: 'ok' });
  });
});
