import { useState } from 'react';
import { PeriodPicker } from './components/PeriodPicker';
import { CategoriesScreen } from './screens/CategoriesScreen';
import { InboxScreen } from './screens/InboxScreen';
import { OperationsScreen } from './screens/OperationsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { useStore } from './store/store';

type Tab = 'operations' | 'inbox' | 'categories' | 'settings';

export function App() {
  const { data, dispatch, saveError } = useStore();
  const [tab, setTab] = useState<Tab>('operations');
  const inboxCount = data.operations.filter((op) => !op.subcategoryId).length;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'operations', label: 'Операции' },
    { id: 'inbox', label: 'Входящие', badge: inboxCount },
    { id: 'categories', label: 'Категории' },
    { id: 'settings', label: 'Настройки' },
  ];

  return (
    <div className="app">
      <header className="header">
        <h1 className="brand">Финансы</h1>
        <nav className="tabs">
          {tabs.map((t) => (
            <button key={t.id} type="button" className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
              {!!t.badge && <span className="tab-badge">{t.badge}</span>}
            </button>
          ))}
        </nav>
        {tab === 'operations' && <PeriodPicker value={data.settings.period} onChange={(period) => dispatch({ type: 'settings', patch: { period } })} />}
      </header>

      {saveError && <div className="panel warn-panel">{saveError}</div>}

      {tab === 'operations' && <OperationsScreen goToSettings={() => setTab('settings')} />}
      {tab === 'inbox' && <InboxScreen />}
      {tab === 'categories' && <CategoriesScreen />}
      {tab === 'settings' && <SettingsScreen onImported={() => setTab('operations')} />}
    </div>
  );
}
