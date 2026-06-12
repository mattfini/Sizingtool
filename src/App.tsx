import { useState } from 'react';
import type { Dataset } from './domain/types';
import DataTab from './components/DataTab';
import StudioTab from './components/StudioTab';

type Tab = 'data' | 'category' | 'style';

export default function App() {
  const [tab, setTab] = useState<Tab>('data');
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [depthLib, setDepthLib] = useState<Map<string, number>>(new Map());

  const tabs: { id: Tab; label: string }[] = [
    { id: 'data', label: 'Data' },
    { id: 'category', label: 'Category mode' },
    { id: 'style', label: 'Style mode' },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <h1>Size Curve Studio</h1>
        <nav>
          {tabs.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'tab active' : 'tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <span className="muted">
          {datasets.reduce((a, d) => a + d.rows.length, 0).toLocaleString()} SKUs ·{' '}
          {datasets.length} dataset{datasets.length === 1 ? '' : 's'}
        </span>
      </header>
      {tab === 'data' ? (
        <DataTab
          datasets={datasets}
          setDatasets={setDatasets}
          depthLib={depthLib}
          setDepthLib={setDepthLib}
        />
      ) : (
        <StudioTab key={tab} mode={tab} datasets={datasets} depthLib={depthLib} />
      )}
    </div>
  );
}
