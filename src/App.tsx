import { useEffect, useState } from 'react';
import { CategoriesScreen } from './screens/CategoriesScreen';
import { InboxScreen } from './screens/InboxScreen';
import { OperationsScreen } from './screens/OperationsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { useStore } from './store/store';

type Tab = 'operations' | 'inbox' | 'categories' | 'settings';

export function App() {
  const { data, saveError } = useStore();
  const [tab, setTab] = useState<Tab>('operations');
  const inboxCount = data.operations.filter((op) => !op.subcategoryId).length;

  // При смене раздела начинаем сверху, а не с места, где остановились в прошлом разделе.
  useEffect(() => window.scrollTo(0, 0), [tab]);

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'operations', label: 'Операции' },
    { id: 'inbox', label: 'Входящие', badge: inboxCount },
    { id: 'categories', label: 'Категории' },
    { id: 'settings', label: 'Настройки' },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ₽
          </span>
          Финансы
        </div>
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

      {tab === 'operations' && <OperationsScreen goToSettings={() => setTab('settings')} />}
      {tab === 'inbox' && <InboxScreen />}
      {tab === 'categories' && <CategoriesScreen />}
      {tab === 'settings' && <SettingsScreen onImported={() => setTab('operations')} />}
    </div>
  );
}
