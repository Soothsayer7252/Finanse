import { useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { makeBackup } from './domain/backup';
import { todayISO } from './domain/dates';
import { saveTextFile } from './platform';
import { formatDate } from './domain/dates';
import { CategoriesScreen } from './screens/CategoriesScreen';
import { HomeScreen } from './screens/HomeScreen';
import { InboxScreen } from './screens/InboxScreen';
import { OperationsScreen, type Prefill } from './screens/OperationsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { useStore } from './store/store';

type Tab = 'home' | 'operations' | 'inbox' | 'categories' | 'settings';

export function App() {
  const { data, saveError } = useStore();
  const [tab, setTab] = useState<Tab>('home');
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [homeMonth, setHomeMonth] = useState(() => todayISO().slice(0, 7));
  const inboxCount = data.operations.filter((op) => !op.subcategoryId).length;

  // При смене раздела начинаем сверху, а не с места, где остановились в прошлом разделе.
  // Внутри claude.ai страница может стоять во встроенном окне, поэтому прокручиваем и его.
  useEffect(() => {
    window.scrollTo(0, 0);
    document.querySelector('.topbar')?.scrollIntoView({ block: 'start' });
  }, [tab]);

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'home', label: 'Главная' },
    { id: 'operations', label: 'Операции' },
    { id: 'inbox', label: 'Входящие', badge: inboxCount },
    { id: 'categories', label: 'Категории' },
    { id: 'settings', label: 'Настройки' },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Финансы</div>
        <nav className="tabs" aria-label="Разделы">
          {tabs.map((t) => (
            <button key={t.id} type="button" className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
              {t.label}
              {!!t.badge && <span className="tab-badge">{t.badge}</span>}
            </button>
          ))}
        </nav>
      </header>

      {saveError && <div className="card warn-card">{saveError}</div>}

      <ErrorBoundary resetKey={tab} onBackup={() => saveTextFile(`finance-backup-${todayISO()}.json`, makeBackup(data))}>
        {tab === 'home' && (
          <HomeScreen
            month={homeMonth}
            setMonth={setHomeMonth}
            goTo={setTab}
            addForDate={(iso) => {
              setPrefill((p) => ({ text: `${formatDate(iso).slice(0, 5)} `, n: (p?.n ?? 0) + 1 }));
              setTab('operations');
            }}
          />
        )}
        {tab === 'operations' && <OperationsScreen prefill={prefill} />}
        {tab === 'inbox' && <InboxScreen />}
        {tab === 'categories' && <CategoriesScreen />}
        {tab === 'settings' && <SettingsScreen onImported={() => setTab('operations')} />}
      </ErrorBoundary>
    </div>
  );
}
