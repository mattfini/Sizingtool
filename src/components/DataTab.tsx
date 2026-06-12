import { useMemo, useState } from 'react';
import type { Dataset } from '../domain/types';
import {
  parseFile,
  buildDataset,
  parseDepthFile,
  type ParsedFile,
  type ColumnMapping,
} from '../domain/parse';
import MappingEditor from './MappingEditor';

interface Props {
  datasets: Dataset[];
  setDatasets: (fn: (d: Dataset[]) => Dataset[]) => void;
  depthLib: Map<string, number>;
  setDepthLib: (m: Map<string, number>) => void;
}

interface Staged {
  fileName: string;
  parsed: ParsedFile;
  mapping: ColumnMapping;
  seasonTag: string;
}

export default function DataTab({ datasets, setDatasets, depthLib, setDepthLib }: Props) {
  const [staged, setStaged] = useState<Staged | null>(null);
  const [error, setError] = useState('');

  const stageFile = async (name: string, data: ArrayBuffer) => {
    try {
      const parsed = parseFile(data);
      const mapping = parsed.defaultMapping;
      setStaged({ fileName: name, parsed, mapping, seasonTag: inferSeason(parsed, mapping) });
      setError('');
    } catch (e) {
      setError(`Could not parse file: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const onSkuFile = async (file: File) => stageFile(file.name, await file.arrayBuffer());

  const onLoadSample = async () => {
    const res = await fetch('sample_sku.csv');
    if (!res.ok) {
      setError('Sample data not found in this build.');
      return;
    }
    await stageFile('sample_sku.csv', await res.arrayBuffer());
  };

  const onDepthFile = async (file: File) => {
    const parsedDepths = parseDepthFile(await file.arrayBuffer());
    const merged = new Map(depthLib);
    for (const [k, v] of parsedDepths) merged.set(k, v);
    setDepthLib(merged);
  };

  const mappingComplete =
    staged !== null &&
    [staged.mapping.dept, staged.mapping.category, staged.mapping.option, staged.mapping.size].every(
      (i) => i >= 0,
    ) &&
    staged.mapping.firstSaleWeek >= 0 &&
    staged.mapping.salesWeeks.length > 0 &&
    staged.mapping.salesWeeks.length === staged.mapping.stockWeeks.length;

  const addDataset = () => {
    if (!staged || !mappingComplete) return;
    const id = `ds-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const ds = buildDataset(staged.parsed, staged.mapping, staged.seasonTag.trim(), staged.fileName, id);
    setDatasets((prev) => [...prev, ds]);
    setStaged(null);
  };

  const preview = useMemo(() => {
    if (!staged) return null;
    const { grid, headerRows } = staged.parsed;
    const m = staged.mapping;
    const cols = [m.dept, m.category, m.option, m.size, m.firstSaleWeek].filter((i) => i >= 0);
    return grid
      .slice(headerRows, headerRows + 5)
      .map((row) => cols.map((i) => String(row[i] ?? '')));
  }, [staged]);

  return (
    <main className="data-tab">
      <section className="card">
        <h2>1 · Upload SKU export</h2>
        <p className="muted">
          CSV or XLSX with one row per SKU and weekly online sales / online stock columns.
          Two-row headers (block label over week name) are detected automatically.
        </p>
        <div className="row">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => e.target.files?.[0] && onSkuFile(e.target.files[0])}
          />
          <button className="secondary" onClick={onLoadSample}>
            Load sample data
          </button>
        </div>
        {error && <p className="warning">{error}</p>}

        {staged && (
          <div className="staged">
            <h3>Map columns — {staged.fileName}</h3>
            <MappingEditor
              columns={staged.parsed.columns}
              mapping={staged.mapping}
              onChange={(mapping) => setStaged({ ...staged, mapping })}
            />
            <label className="season-tag">
              <span>Season tag for this upload</span>
              <input
                value={staged.seasonTag}
                onChange={(e) => setStaged({ ...staged, seasonTag: e.target.value })}
                placeholder="e.g. SS26"
              />
              <span className="muted">
                Used when no Season column is mapped; rows with a mapped Season keep their own.
              </span>
            </label>
            {preview && preview.length > 0 && (
              <table className="preview">
                <thead>
                  <tr>
                    {['Dept', 'Category', 'Option', 'Size', 'First Sale Week'].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => (
                        <td key={j}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <button onClick={addDataset} disabled={!mappingComplete}>
              Add dataset
            </button>
            {!mappingComplete && (
              <span className="muted"> Complete the mapping (matching week blocks) to add.</span>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <h2>2 · Retail allocation depths (optional)</h2>
        <p className="muted">
          CSV/XLSX keyed Dept + Category + Size with a Depth column. Seeds the per-size depth
          table in the assumptions panel; depths stay editable there.
        </p>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => e.target.files?.[0] && onDepthFile(e.target.files[0])}
        />
        {depthLib.size > 0 && <p className="muted">{depthLib.size} depth entries loaded.</p>}
      </section>

      <section className="card">
        <h2>Datasets</h2>
        {datasets.length === 0 ? (
          <p className="muted">Nothing loaded yet.</p>
        ) : (
          <table className="preview">
            <thead>
              <tr>
                <th>Name</th>
                <th>Season tag</th>
                <th>Seasons in data</th>
                <th>SKUs</th>
                <th>Weeks</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d.seasonTag}</td>
                  <td>{[...new Set(d.rows.map((r) => r.season))].sort().join(', ')}</td>
                  <td>{d.rows.length}</td>
                  <td>
                    {d.weekLabels[0]} – {d.weekLabels.at(-1)} ({d.weekLabels.length})
                  </td>
                  <td>
                    <button
                      className="secondary"
                      onClick={() => setDatasets((prev) => prev.filter((x) => x.id !== d.id))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function inferSeason(parsed: ParsedFile, mapping: ColumnMapping): string {
  if (mapping.season === null) return '';
  const counts = new Map<string, number>();
  for (let r = parsed.headerRows; r < parsed.grid.length; r++) {
    const v = String(parsed.grid[r]?.[mapping.season] ?? '').trim();
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best = '';
  let n = 0;
  for (const [v, c] of counts) if (c > n) ((best = v), (n = c));
  return best;
}
