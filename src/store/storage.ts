// Слой хранилища. Сейчас данные лежат в браузере (localStorage).
// Когда появится облако, здесь появится вторая реализация того же интерфейса,
// а остальной код не изменится.

import type { AppData } from '../domain/types';

export interface DataStorage {
  load(): unknown | null;
  save(data: AppData): void;
  /** Копия данных перед заменой (импортом), чтобы можно было вернуть. */
  loadBeforeImport(): unknown | null;
  saveBeforeImport(data: AppData): void;
}

const KEY = 'finance-tracker-v2';
const KEY_BEFORE_IMPORT = 'finance-tracker-v2:before-import';

function read(key: string): unknown | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const localStorageStore: DataStorage = {
  load: () => read(KEY),
  save: (data) => localStorage.setItem(KEY, JSON.stringify(data)),
  loadBeforeImport: () => read(KEY_BEFORE_IMPORT),
  saveBeforeImport: (data) => {
    // Запасная копия — не повод срывать замену данных, если браузер не дал её сохранить.
    try {
      localStorage.setItem(KEY_BEFORE_IMPORT, JSON.stringify(data));
    } catch {
      /* нет места или хранилище недоступно */
    }
  },
};
