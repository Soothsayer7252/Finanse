import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { emptyData, normalizeData } from '../domain/backup';
import { buildIndex, subOptions, usageCounts, type Index, type SubOption } from '../domain/ops';
import type { AppData } from '../domain/types';
import { reducer, type Action, type State } from './reducer';
import { localStorageStore, type DataStorage } from './storage';

interface StoreValue {
  data: AppData;
  ix: Index;
  options: SubOption[];
  dispatch: (a: Action) => void;
  undo: State['undo'];
  storage: DataStorage;
  /** Ошибка сохранения (например, в браузере закончилось место). */
  saveError: string | null;
}

const StoreContext = createContext<StoreValue | null>(null);

function initialState(storage: DataStorage): State {
  const raw = storage.load();
  return { data: raw ? normalizeData(raw).data : emptyData(), undo: null };
}

export function StoreProvider({ children, storage = localStorageStore }: { children: ReactNode; storage?: DataStorage }) {
  const [state, dispatch] = useReducer(reducer, storage, initialState);
  const [saveError, setSaveError] = useState<string | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    try {
      storage.save(state.data);
      setSaveError(null);
    } catch {
      setSaveError('Не удалось сохранить данные в браузере. Скачайте резервную копию в «Настройках», чтобы ничего не потерять.');
    }
  }, [state.data, storage]);

  const ix = useMemo(() => buildIndex(state.data), [state.data.categories, state.data.subcategories]);
  const uses = useMemo(() => usageCounts(state.data.operations), [state.data.operations]);
  const options = useMemo(() => subOptions(state.data, uses), [state.data.categories, state.data.subcategories, uses]);

  const value = useMemo<StoreValue>(
    () => ({ data: state.data, ix, options, dispatch, undo: state.undo, storage, saveError }),
    [state, ix, options, storage, saveError],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore вне StoreProvider');
  return v;
}

// ——— Всплывающие уведомления ———

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
  kind?: 'info' | 'error';
}

const ToastContext = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});
let toastSeq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const remove = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = ++toastSeq;
      setToasts((list) => [...list.slice(-3), { ...t, id }]);
      setTimeout(() => remove(id), t.action ? 8000 : 4000);
    },
    [remove],
  );
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'toast-error' : ''}`}>
            <span>{t.text}</span>
            {t.action && (
              <button
                className="btn btn-link"
                onClick={() => {
                  t.action!.run();
                  remove(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="toast-close" aria-label="Закрыть" onClick={() => remove(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/** Уведомление с кнопкой «Отменить» для только что сделанного действия. */
export function useUndoToast() {
  const toast = useToast();
  const { dispatch } = useStore();
  return useCallback(
    (text: string) => toast({ text, action: { label: 'Отменить', run: () => dispatch({ type: 'undo' }) } }),
    [toast, dispatch],
  );
}
