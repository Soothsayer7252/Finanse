import { describe, expect, it } from 'vitest';
import { iconFor, tintFor } from './icons';

describe('значки категорий', () => {
  it('по подкатегории, затем по категории', () => {
    expect(iconFor('Доставка', 'Еда')).toBe('🛵');
    expect(iconFor('Барбер', 'Ежемесячные траты')).toBe('✂️');
    expect(iconFor('Продукты домой', 'Еда')).toBe('🛒');
    expect(iconFor('Разное', 'Техника')).toBe('💻');
  });

  it('если ничего не подошло — первая буква', () => {
    expect(iconFor('Ёлка', 'Праздники')).toBe('Ё');
  });

  it('оттенок стабилен и в пределах 1–6', () => {
    expect(tintFor('cat_123')).toBe(tintFor('cat_123'));
    for (const id of ['a', 'b', 'cat_food', 'sub_x']) expect(tintFor(id)).toBeGreaterThanOrEqual(1);
    for (const id of ['a', 'b', 'cat_food', 'sub_x']) expect(tintFor(id)).toBeLessThanOrEqual(6);
  });
});
