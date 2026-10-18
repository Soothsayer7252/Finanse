// Суммы: разбор того, что ввёл пользователь, и красивый вывод.

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface ParsedAmount {
  amount: number;
  /** Пользователь поставил «+» в начале: это доход. */
  income: boolean;
}

/**
 * Разбирает ввод суммы.
 * «1500», «1 500», «1500,50» — обычная сумма;
 * «+5000» — доход (плюс в самом начале);
 * «350+120-50» — посчитать как в калькуляторе.
 * Возвращает null, если ввод непонятен или сумма не больше нуля.
 */
export function parseAmount(raw: string): ParsedAmount | null {
  let s = raw.replace(/[\s  ₽]/g, '').replace(/,/g, '.');
  if (!s) return null;
  let income = false;
  if (s.startsWith('+')) {
    income = true;
    s = s.slice(1);
  }
  if (!/^\d+(\.\d+)?([+-]\d+(\.\d+)?)*$/.test(s)) return null;
  const parts = s.match(/[+-]?\d+(\.\d+)?/g) ?? [];
  const amount = round2(parts.reduce((sum, p) => sum + Number(p), 0));
  if (!(amount > 0)) return null;
  return { amount, income };
}

/** 1 234 ₽ или 1 234,50 ₽ */
export function formatMoney(value: number): string {
  const v = round2(value);
  const hasKopecks = Math.abs(v % 1) > 0.001;
  return (
    new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: hasKopecks ? 2 : 0,
      maximumFractionDigits: 2,
    })
      .format(v)
      .replace(/[  ]/g, ' ') + ' ₽'
  );
}

/** Сумма для поля ввода: без пробелов и знака рубля. */
export function amountToInput(value: number): string {
  return String(round2(value)).replace('.', ',');
}
