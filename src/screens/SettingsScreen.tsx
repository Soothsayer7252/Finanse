import { useRef, useState } from 'react';
import { detectFormat, makeBackup, normalizeData } from '../domain/backup';
import { formatDate, todayISO } from '../domain/dates';
import { convertLegacy, type LegacyResult } from '../domain/legacy';
import type { AppData } from '../domain/types';
import { insideClaude, saveTextFile } from '../platform';
import { readLegacyFromBrowser } from '../store/storage';
import { useStore, useToast } from '../store/store';
import { LegacyWizard } from './LegacyWizard';

type Pending = { kind: 'native'; data: AppData; problems: string[] } | { kind: 'legacy'; result: LegacyResult };

export function SettingsScreen({ onImported }: { onImported: () => void }) {
  const { data, dispatch, storage } = useStore();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const legacyInBrowser = useState(() => readLegacyFromBrowser())[0];
  const beforeImport = storage.loadBeforeImport();

  const download = async () => {
    const result = await saveTextFile(`finance-backup-${todayISO()}.json`, makeBackup(data));
    if (result === 'failed') toast({ text: 'Не получилось сохранить файл. Попробуйте ещё раз.', kind: 'error' });
  };

  const openJson = (json: unknown) => {
    const format = detectFormat(json);
    if (format === 'native') {
      const { data: next, problems } = normalizeData(json);
      setPending({ kind: 'native', data: next, problems });
    } else if (format === 'legacy') {
      setPending({ kind: 'legacy', result: convertLegacy(json) });
    } else {
      toast({ text: 'Не похоже на файл резервной копии', kind: 'error' });
    }
  };

  const readFile = (file: File) => {
    file
      .text()
      .then((text) => openJson(JSON.parse(text)))
      .catch(() => toast({ text: 'Не удалось прочитать файл', kind: 'error' }))
      .finally(() => {
        if (fileRef.current) fileRef.current.value = '';
      });
  };

  /** Замена всех данных. Текущие сначала сохраняются, чтобы можно было вернуть. */
  const replaceAll = (next: AppData, message: string) => {
    if (data.operations.length || data.categories.length) storage.saveBeforeImport(data);
    dispatch({ type: 'replace', data: next });
    setPending(null);
    toast({ text: message });
    onImported();
  };

  if (pending?.kind === 'legacy') {
    return (
      <LegacyWizard
        result={pending.result}
        hasCurrentData={data.operations.length > 0}
        onCancel={() => setPending(null)}
        onConfirm={(next) => replaceAll(next, `Перенесено операций: ${next.operations.length}`)}
      />
    );
  }

  return (
    <div className="stack narrow">
      <div className="card">
        <h2>Резервная копия</h2>
        <p className="muted">
          {insideClaude
            ? 'Данные хранятся в этом браузере на этом устройстве: на телефоне и компьютере они разные. Время от времени скачивайте копию — из неё всё восстанавливается.'
            : 'Данные хранятся только в этом браузере. Время от времени скачивайте копию: если браузер очистится, из неё всё восстанавливается.'}
        </p>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={download}>
            Скачать копию
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            Загрузить копию…
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
        </div>
        <p className="muted small">Сейчас: операций {data.operations.length}, категорий {data.categories.length}, подкатегорий {data.subcategories.length}.</p>

        {pending?.kind === 'native' && (
          <div className="confirm">
            <p>
              <b>В файле:</b> операций {pending.data.operations.length}
              {pending.data.operations.length > 0 && ` (${rangeText(pending.data)})`}, категорий {pending.data.categories.length}.
            </p>
            {pending.problems.map((p) => (
              <p key={p} className="warn">
                {p}
              </p>
            ))}
            <p>Текущие данные будут заменены. Перед заменой они сохранятся, и их можно будет вернуть кнопкой ниже.</p>
            <div className="actions">
              <button type="button" className="btn btn-danger" onClick={() => replaceAll(pending.data, 'Данные восстановлены из копии')}>
                Заменить
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>
                Отмена
              </button>
            </div>
          </div>
        )}

        {beforeImport != null && (
          <div className="actions">
            <button
              type="button"
              className="link"
              onClick={() => {
                const { data: prev } = normalizeData(beforeImport);
                setPending({ kind: 'native', data: prev, problems: [] });
              }}
            >
              Вернуть данные, которые были до последней загрузки…
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Перенос из старой версии</h2>
        <p className="muted">
          В старой версии откройте «Настройки» → «Выгрузить копию», затем загрузите этот файл кнопкой «Загрузить копию…» выше. Приложение само
          поймёт, что файл из старой версии, и покажет, что и как перенесётся.
        </p>
        {legacyInBrowser != null && (
          <div className="actions">
            <span>В этом браузере найдены данные старой версии.</span>
            <button type="button" className="btn btn-primary" onClick={() => openJson(legacyInBrowser)}>
              Перенести их
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function rangeText(d: AppData): string {
  const dates = d.operations.map((o) => o.date).sort();
  return `с ${formatDate(dates[0])} по ${formatDate(dates[dates.length - 1])}`;
}
