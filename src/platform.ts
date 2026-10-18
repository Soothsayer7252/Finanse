// Связь с окружением, в котором открыта страница.
// Открыта как файл — скачивание обычной ссылкой.
// Открыта по ссылке claude.ai — скачивание через встроенную функцию сохранения файлов,
// потому что там обычные ссылки на скачивание не работают.

interface ClaudeDownloads {
  save(req: { filename: string; data: string }): Promise<unknown>;
}

declare global {
  interface Window {
    claude?: { use(name: string): Promise<unknown> };
  }
}

/** Страница открыта внутри claude.ai. */
export const insideClaude = typeof window !== 'undefined' && !!window.claude;

export async function saveTextFile(filename: string, text: string): Promise<'saved' | 'declined' | 'failed'> {
  if (window.claude) {
    try {
      const downloads = (await window.claude.use('downloads')) as ClaudeDownloads | null;
      if (!downloads) return 'failed';
      await downloads.save({ filename, data: text });
      return 'saved';
    } catch (e) {
      return (e as { code?: string })?.code === 'declined' ? 'declined' : 'failed';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  return 'saved';
}
