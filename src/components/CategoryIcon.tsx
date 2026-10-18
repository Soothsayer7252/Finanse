import { iconFor, tintFor } from '../domain/icons';
import type { Category, Subcategory } from '../domain/types';

interface Props {
  sub?: Subcategory;
  cat?: Category;
  size?: 'sm' | 'md';
}

/** Кружок со значком категории. Без категории — знак вопроса. */
export function CategoryIcon({ sub, cat, size = 'md' }: Props) {
  if (!sub) return <span className={`cat-icon cat-icon-${size} cat-icon-empty`}>?</span>;
  return <span className={`cat-icon cat-icon-${size} tint-${tintFor(cat?.id ?? sub.id)}`}>{iconFor(sub.name, cat?.name ?? '')}</span>;
}
