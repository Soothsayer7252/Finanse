import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysInMonth, endOfMonth, formatDayShort, formatDayTitle, formatDaysList, isValidISO, monthPrepositional, monthTitle, periodLabel, quickPeriod, resolvePeriod, todayISO } from './dates';

// Тесты запускаются с часовым поясом Тюмени (UTC+5), см. package.json.
// В старой версии именно в таких поясах даты съезжали на день.
describe('даты не зависят от часового пояса', () => {
  it('часовой пояс тестов — не UTC', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(0);
  });

  it('месяц вперёд от 1 октября — 1 ноября (в старой версии было 31 октября)', () => {
    expect(addMonths('2026-10-01', 1)).toBe('2026-11-01');
  });

  it('день назад от 10 октября — 9 октября (в старой версии было 8 октября)', () => {
    expect(addDays('2026-10-10', -1)).toBe('2026-10-09');
  });

  it('переходы через месяц и год', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2026-05-10', -17)).toBe('2024-12-10');
  });

  it('длина месяца', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(endOfMonth('2026-09-14')).toBe('2026-09-30');
  });

  it('сегодня берётся по местному времени', () => {
    // 23:30 по Тюмени 31 декабря — это ещё 31 декабря, хотя в UTC уже 18:30 того же дня.
    expect(todayISO(new Date(2026, 11, 31, 23, 30))).toBe('2026-12-31');
    expect(todayISO(new Date(2027, 0, 1, 0, 30))).toBe('2027-01-01');
  });
});

describe('проверка даты', () => {
  it('отличает правильные даты от неправильных', () => {
    expect(isValidISO('2026-02-28')).toBe(true);
    expect(isValidISO('2026-02-29')).toBe(false);
    expect(isValidISO('2026-13-01')).toBe(false);
    expect(isValidISO('01.02.2026')).toBe(false);
  });
});

describe('быстрые периоды', () => {
  it('этот и прошлый месяц', () => {
    expect(quickPeriod('month', '2026-10-18')).toEqual({ mode: 'range', single: '', from: '2026-10-01', to: '2026-10-31', quick: 'month' });
    expect(quickPeriod('prevMonth', '2026-01-18')).toEqual({ mode: 'range', single: '', from: '2025-12-01', to: '2025-12-31', quick: 'prevMonth' });
    expect(quickPeriod('today', '2026-10-18').single).toBe('2026-10-18');
  });

  it('«Этот месяц», выбранный в октябре, в ноябре означает ноябрь', () => {
    const saved = quickPeriod('month', '2026-10-18');
    expect(resolvePeriod(saved, '2026-11-03')).toMatchObject({ from: '2026-11-01', to: '2026-11-30' });
    const custom = { mode: 'range' as const, single: '', from: '2026-01-01', to: '2026-01-31' };
    expect(resolvePeriod(custom, '2026-11-03')).toBe(custom);
  });

  it('подписи периодов', () => {
    expect(periodLabel(quickPeriod('month', '2026-10-18'))).toBe('Октябрь 2026');
    expect(periodLabel({ mode: 'range', single: '', from: '2026-10-05', to: '2026-10-12' })).toBe('05.10.2026 — 12.10.2026');
    expect(periodLabel(quickPeriod('all', '2026-10-18'))).toBe('Всё время');
  });
});

describe('заголовки дней', () => {
  it('сегодня, вчера, дата с днём недели', () => {
    expect(formatDayTitle('2026-10-18', '2026-10-18')).toBe('Сегодня');
    expect(formatDayTitle('2026-10-17', '2026-10-18')).toBe('Вчера');
    expect(formatDayTitle('2026-09-29', '2026-10-18')).toBe('29 сентября, вторник');
    expect(formatDayTitle('2025-12-31', '2026-10-18')).toBe('31 декабря 2025, среда');
  });
});

describe('список дней словами', () => {
  it('один, два, несколько', () => {
    expect(formatDaysList(['2026-09-28'])).toBe('28 сентября');
    expect(formatDaysList(['2026-09-28', '2026-09-30'])).toBe('28 и 30 сентября');
    expect(formatDaysList(['2026-10-03', '2026-10-05', '2026-10-09'])).toBe('3, 5 и 9 октября');
  });
});

describe('короткая дата', () => {
  it('сегодня, вчера, день недели и дата', () => {
    expect(formatDayShort('2026-10-18', '2026-10-18')).toBe('Сегодня');
    expect(formatDayShort('2026-10-17', '2026-10-18')).toBe('Вчера');
    expect(formatDayShort('2026-09-28', '2026-10-18')).toBe('пн, 28.09');
    expect(formatDayShort('2025-12-31', '2026-10-18')).toBe('ср, 31.12.2025');
  });
});

describe('названия месяцев', () => {
  it('«сентябрь 2026» и «в сентябре»', () => {
    expect(monthTitle('2026-09')).toBe('сентябрь 2026');
    expect(monthTitle('2027-01')).toBe('январь 2027');
    expect(monthPrepositional('2026-05')).toBe('мае');
  });
});
