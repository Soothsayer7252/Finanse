// Поле выбора подкатегории с поиском по первым буквам.
// Стрелки — выбор, Enter — подтвердить, Esc — отменить, пустое поле — «без категории».

import { useId, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { searchSubOptions, type SubOption } from '../domain/ops';

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  options: SubOption[];
  /** Вызывается после Enter, чтобы перейти к следующему полю. */
  onEnter?: () => void;
  onEscape?: () => void;
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
  /** Подпись текущего значения, если его нет среди вариантов (например, архивная подкатегория). */
  valueLabel?: string;
  ariaLabel?: string;
}

const MAX_SHOWN = 60;

export function Lookup({ value, onChange, options, onEnter, onEscape, placeholder = 'Без категории', inputRef, autoFocus, valueLabel, ariaLabel }: Props) {
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  /** Пользователь листал список стрелками, ничего не набирая. */
  const [navigated, setNavigated] = useState(false);
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  const current = options.find((o) => o.id === value);
  const shownText = query ?? (current?.label || valueLabel || '');
  const matches = useMemo(() => searchSubOptions(options, query ?? '').slice(0, MAX_SHOWN), [options, query]);

  const choose = (opt: SubOption | null) => {
    if ((opt?.id ?? null) !== value) onChange(opt?.id ?? null);
    setQuery(null);
    setOpen(false);
  };

  /** Применить то, что набрано: первое совпадение, пустое поле — без категории. */
  const commitTyped = () => {
    if (query === null) {
      setOpen(false);
      return;
    }
    if (!query.trim()) choose(null);
    else if (matches[active]) choose(matches[active]);
    else {
      setQuery(null);
      setOpen(false);
    }
  };

  const move = (delta: number) => {
    setOpen(true);
    setNavigated(true);
    setActive((i) => {
      const next = Math.max(0, Math.min(matches.length - 1, i + delta));
      requestAnimationFrame(() => listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' }));
      return next;
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (query === null && navigated && open && matches[active]) choose(matches[active]);
      else commitTyped();
      setNavigated(false);
      onEnter?.();
    } else if (e.key === 'Escape') {
      if (open || query !== null) {
        e.preventDefault();
        e.stopPropagation();
        setQuery(null);
        setOpen(false);
      } else onEscape?.();
    } else if (e.key === 'Tab') {
      commitTyped();
    }
  };

  return (
    <div className="lookup" data-open={open && matches.length > 0}>
      <input
        ref={inputRef}
        className="input"
        value={shownText}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={ariaLabel ?? 'Категория'}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        onFocus={(e) => {
          e.target.select();
          setActive(Math.max(0, matches.findIndex((m) => m.id === value)));
          setNavigated(false);
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setNavigated(false);
          setOpen(true);
        }}
        onBlur={commitTyped}
        onKeyDown={onKeyDown}
      />
      {open && matches.length > 0 && (
        <div className="lookup-list" id={listId} role="listbox" ref={listRef}>
          {matches.map((o, i) => (
            <div
              key={o.id}
              role="option"
              aria-selected={i === active}
              className={`lookup-option ${i === active ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
                onEnter?.();
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className={`dot dot-${o.type}`} />
              <span className="lookup-sub">{o.subName}</span>
              <span className="lookup-cat">{o.categoryName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
