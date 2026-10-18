import { describe, expect, it } from 'vitest';
import { formatMoney, parseAmount } from './money';

describe('ввод суммы', () => {
  it('обычные суммы', () => {
    expect(parseAmount('1500')).toEqual({ amount: 1500, income: false });
    expect(parseAmount('1 500')).toEqual({ amount: 1500, income: false });
    expect(parseAmount('1500,5')).toEqual({ amount: 1500.5, income: false });
    expect(parseAmount('99.99 ₽')).toEqual({ amount: 99.99, income: false });
  });

  it('плюс в начале — доход', () => {
    expect(parseAmount('+5000')).toEqual({ amount: 5000, income: true });
  });

  it('калькулятор', () => {
    expect(parseAmount('350+120')).toEqual({ amount: 470, income: false });
    expect(parseAmount('1000-250+0,5')).toEqual({ amount: 750.5, income: false });
    expect(parseAmount('+100+50')).toEqual({ amount: 150, income: true });
    expect(parseAmount('0,1+0,2')).toEqual({ amount: 0.3, income: false });
  });

  it('ерунда и неположительные суммы не принимаются', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('абв')).toBeNull();
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('100-200')).toBeNull();
    expect(parseAmount('12++3')).toBeNull();
    expect(parseAmount('-50')).toBeNull();
  });
});

describe('вывод суммы', () => {
  it('рубли с пробелами, копейки — только если есть', () => {
    expect(formatMoney(1234)).toBe('1 234 ₽');
    expect(formatMoney(1234.5)).toBe('1 234,50 ₽');
    expect(formatMoney(0)).toBe('0 ₽');
  });
});
