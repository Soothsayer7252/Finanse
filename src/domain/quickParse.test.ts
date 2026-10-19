import { describe, expect, it } from 'vitest';
import { buildIndex, subOptions } from './ops';
import { buildLearned, parseLine, parseMany, type ParseContext } from './quickParse';
import type { Category, Operation, Subcategory } from './types';

const categories: Category[] = [
  { id: 'food', name: 'Еда', type: 'expense', archived: false },
  { id: 'trans', name: 'Транспорт', type: 'expense', archived: false },
  { id: 'trip', name: 'Путешествия', type: 'expense', archived: false },
  { id: 'fun', name: 'Досуг', type: 'expense', archived: false },
  { id: 'inc', name: 'Доходы', type: 'income', archived: false },
  { id: 'inv', name: 'Инвестиции', type: 'investment', archived: false },
];
const sub = (id: string, categoryId: string, name: string): Subcategory => ({ id, categoryId, name, archived: false });
const subcategories: Subcategory[] = [
  sub('market', 'food', 'Супермаркеты'),
  sub('deliv', 'food', 'Доставка'),
  sub('rest', 'food', 'Ресторан и кафе'),
  sub('home', 'food', 'Продукты домой'),
  sub('taxi', 'trans', 'Такси'),
  sub('metro', 'trans', 'Общественный транспорт'),
  sub('trip-taxi', 'trip', 'Такси'),
  sub('cinema', 'fun', 'Кино'),
  sub('brand-deliv', 'fun', 'BrandShop (доставка)'),
  sub('salary', 'inc', 'Зарплата'),
  sub('tips', 'inc', 'Чаевые'),
  sub('crypto', 'inv', 'Crypto'),
];
const uses = new Map([['market', 50], ['deliv', 20], ['rest', 10], ['taxi', 30], ['trip-taxi', 2]]);
const ctx: ParseContext = {
  options: subOptions({ categories, subcategories }, uses),
  today: '2026-10-18', // воскресенье
  defaultDate: '2026-10-15',
};
const p = (s: string, extra: Partial<ParseContext> = {}) => parseLine(s, { ...ctx, ...extra });

describe('строка текстом: основное', () => {
  it('«470 доставка вчера пицца»', () => {
    expect(p('470 доставка вчера пицца')).toMatchObject({
      amount: 470, income: false, date: '2026-10-17', dateGiven: true,
      subcategoryId: 'deliv', matchedBy: 'name', comment: 'пицца', status: 'ok',
    });
  });

  it('порядок слов любой', () => {
    expect(p('вчера доставка 470')).toMatchObject({ amount: 470, subcategoryId: 'deliv', date: '2026-10-17', comment: '' });
  });

  it('без даты — дата прошлой операции', () => {
    expect(p('350 такси')).toMatchObject({ date: '2026-10-15', dateGiven: false });
  });

  it('окончания и начала слов: «доставку», «супер», «кафешка»', () => {
    expect(p('500 за доставку').subcategoryId).toBe('deliv');
    expect(p('1200 супер').subcategoryId).toBe('market');
    expect(p('800 ресторан').subcategoryId).toBe('rest');
  });

  it('полное название важнее слова из длинного названия', () => {
    expect(p('470 доставка')).toMatchObject({ subcategoryId: 'deliv', status: 'ok' });
    expect(p('900 brandshop доставка').subcategoryId).toBe('brand-deliv');
  });

  it('несколько слов названия: «общественный транспорт»', () => {
    expect(p('37 общественный транспорт')).toMatchObject({ subcategoryId: 'metro', comment: '' });
  });

  it('комментарий сохраняет исходное написание', () => {
    expect(p('1200 кафе с Сашей').comment).toBe('с Сашей');
  });
});

describe('строка текстом: суммы', () => {
  it('«1 500» — одно число', () => {
    expect(p('1 500 супермаркеты').amount).toBe(1500);
  });
  it('копейки и калькулятор', () => {
    expect(p('99,90 кино').amount).toBe(99.9);
    expect(p('350+120 такси').amount).toBe(470);
  });
  it('«р», «руб», «₽» после числа', () => {
    expect(p('470р доставка').amount).toBe(470);
    expect(p('470руб доставка').amount).toBe(470);
    expect(p('470₽ доставка').amount).toBe(470);
  });
  it('без суммы — ошибка', () => {
    expect(p('доставка вчера')).toMatchObject({ status: 'error', error: 'Не нашёл сумму', amount: null });
  });
  it('второе число уходит в комментарий', () => {
    expect(p('600 такси 2 поездки')).toMatchObject({ amount: 600, comment: '2 поездки' });
  });
});

describe('строка текстом: доходы и вложения', () => {
  it('плюс перед суммой без категории — доход во «Входящие»', () => {
    expect(p('+5000 перевод от мамы')).toMatchObject({ amount: 5000, income: true, subcategoryId: null, status: 'unsure' });
  });
  it('категория дохода делает операцию доходом и без плюса', () => {
    expect(p('14400 зарплата 29.09')).toMatchObject({ income: true, subcategoryId: 'salary', date: '2026-09-29' });
  });
  it('вложение', () => {
    expect(p('10000 crypto')).toMatchObject({ subcategoryId: 'crypto', income: false });
  });
});

describe('строка текстом: даты', () => {
  it('сегодня, позавчера', () => {
    expect(p('100 кино сегодня').date).toBe('2026-10-18');
    expect(p('100 кино позавчера').date).toBe('2026-10-16');
  });
  it('28.09, 28/09, 28.09.2025, 28.09.25', () => {
    expect(p('100 кино 28.09').date).toBe('2026-09-28');
    expect(p('100 кино 28/09').date).toBe('2026-09-28');
    expect(p('100 кино 28.09.2025').date).toBe('2025-09-28');
    expect(p('100 кино 28.09.25').date).toBe('2025-09-28');
  });
  it('«28 сентября», «3 окт»', () => {
    expect(p('100 кино 28 сентября')).toMatchObject({ date: '2026-09-28', amount: 100, comment: '' });
    expect(p('3 окт 250 такси')).toMatchObject({ date: '2026-10-03', amount: 250 });
  });
  it('дата из будущего без года — значит прошлый год', () => {
    expect(p('100 кино 25.12').date).toBe('2025-12-25');
  });
  it('день недели — ближайший прошедший', () => {
    expect(p('300 такси в пятницу')).toMatchObject({ date: '2026-10-16', comment: '' });
    expect(p('300 такси в воскресенье').date).toBe('2026-10-18');
    expect(p('300 такси понедельник').date).toBe('2026-10-12');
  });
  it('несуществующая дата не съедается', () => {
    expect(p('100 кино 31.02')).toMatchObject({ date: '2026-10-15', dateGiven: false });
  });
});

describe('строка текстом: сомнения', () => {
  it('одинаковые названия в разных категориях — выбор, сверху частая', () => {
    const r = p('350 такси');
    expect(r.status).toBe('unsure');
    expect(r.subcategoryId).toBe('taxi');
    expect(r.candidates).toEqual(['taxi', 'trip-taxi']);
  });
  it('только название категории — выбор из её подкатегорий', () => {
    const r = p('900 еда');
    expect(r.status).toBe('unsure');
    expect(r.subcategoryId).toBe('market');
    expect(r.candidates).toEqual(['market', 'deliv', 'rest']);
  });
  it('категорию не узнал — во «Входящие», всё в комментарий', () => {
    expect(p('250 непонятно что')).toMatchObject({ subcategoryId: null, status: 'unsure', comment: 'непонятно что' });
  });
});

describe('строка текстом: обучение на прошлых комментариях', () => {
  const op = (subcategoryId: string, comment: string): Operation => ({ id: comment + subcategoryId + Math.random(), date: '2026-10-01', amount: 1, subcategoryId, comment, createdAt: '', updatedAt: '' });
  const learned = buildLearned([op('deliv', 'пицца'), op('deliv', 'Пицца с друзьями'), op('rest', 'пицца в центре'), op('deliv', 'пицца'), op('market', 'вкусвилл'), op('market', 'ВкусВилл')]);

  it('«пицца» чаще всего была доставкой', () => {
    expect(p('600 пицца', { learned })).toMatchObject({ subcategoryId: 'deliv', matchedBy: 'learned', comment: 'пицца' });
  });
  it('магазин по названию из комментариев', () => {
    expect(p('1340 вкусвилл', { learned }).subcategoryId).toBe('market');
  });
  it('явное название важнее выученного слова', () => {
    expect(p('600 ресторан пицца', { learned }).subcategoryId).toBe('rest');
  });
  it('редкие и спорные слова не угадываются', () => {
    const mixed = buildLearned([op('deliv', 'вечер'), op('rest', 'вечер')]);
    expect(p('500 вечер', { learned: mixed }).subcategoryId).toBeNull();
  });
});

describe('много строк сразу', () => {
  it('каждая строка — операция, дата тянется от прошлой строки', () => {
    const rows = parseMany('28.09 470 доставка пицца\n350 такси\n\n29.09 1200 кафе с Сашей\n+14400 зарплата\nкино', ctx);
    expect(rows.map((r) => [r.date, r.amount, r.status])).toEqual([
      ['2026-09-28', 470, 'ok'],
      ['2026-09-28', 350, 'unsure'],
      ['2026-09-29', 1200, 'ok'],
      ['2026-09-29', 14400, 'ok'],
      ['2026-09-29', null, 'error'],
    ]);
  });
});

describe('индекс подкатегорий для разбора строится из данных', () => {
  it('архивные не участвуют', () => {
    const subs = [...subcategories, { ...sub('old', 'fun', 'Тусовки'), archived: true }];
    const opts = subOptions({ categories, subcategories: subs }, new Map());
    expect(parseLine('500 тусовки', { ...ctx, options: opts }).subcategoryId).toBeNull();
    expect(buildIndex({ categories, subcategories: subs }).sub.has('old')).toBe(true);
  });
});
