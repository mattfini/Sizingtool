import { useMemo } from 'react';
import type { ColumnInfo, ColumnMapping } from '../domain/parse';

interface Props {
  columns: ColumnInfo[];
  mapping: ColumnMapping;
  onChange: (m: ColumnMapping) => void;
}

const SINGLE_FIELDS: { key: keyof ColumnMapping; label: string; optional?: boolean }[] = [
  { key: 'dept', label: 'Department' },
  { key: 'category', label: 'Category' },
  { key: 'option', label: 'Option (style)' },
  { key: 'size', label: 'Size' },
  { key: 'firstSaleWeek', label: 'First Sale Week' },
  { key: 'season', label: 'Season (per row)', optional: true },
];

export default function MappingEditor({ columns, mapping, onChange }: Props) {
  /** Distinct header blocks containing weekly columns, e.g. "ONLINE SALES UNITS". */
  const weekBlocks = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const c of columns) {
      if (!/week/i.test(c.name)) continue;
      const key = c.block || c.name.replace(/week.*$/i, '').trim() || '(unlabelled)';
      const arr = m.get(key) ?? [];
      arr.push(c.index);
      m.set(key, arr);
    }
    return [...m.entries()].filter(([, idxs]) => idxs.length >= 2);
  }, [columns]);

  const blockValue = (selected: number[]) => {
    const json = JSON.stringify(selected);
    const hit = weekBlocks.find(([, idxs]) => JSON.stringify(idxs) === json);
    return hit ? hit[0] : '';
  };

  const setSingle = (key: keyof ColumnMapping, raw: string) => {
    const v = raw === '' ? (key === 'season' ? null : -1) : Number(raw);
    onChange({ ...mapping, [key]: v });
  };

  const setBlock = (key: 'salesWeeks' | 'stockWeeks', name: string) => {
    const hit = weekBlocks.find(([b]) => b === name);
    onChange({ ...mapping, [key]: hit ? hit[1] : [] });
  };

  const lengthsMismatch =
    mapping.salesWeeks.length > 0 &&
    mapping.stockWeeks.length > 0 &&
    mapping.salesWeeks.length !== mapping.stockWeeks.length;

  return (
    <div className="mapping-editor">
      <div className="mapping-grid">
        {SINGLE_FIELDS.map((f) => {
          const current = mapping[f.key];
          return (
            <label key={f.key}>
              <span>{f.label}</span>
              <select
                value={current === null || current === -1 ? '' : String(current)}
                onChange={(e) => setSingle(f.key, e.target.value)}
              >
                <option value="">{f.optional ? '— none —' : '— select —'}</option>
                {columns.map((c) => (
                  <option key={c.index} value={c.index}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
        <label>
          <span>Weekly online sales block</span>
          <select
            value={blockValue(mapping.salesWeeks)}
            onChange={(e) => setBlock('salesWeeks', e.target.value)}
          >
            <option value="">— select block —</option>
            {weekBlocks.map(([b, idxs]) => (
              <option key={b} value={b}>
                {b} ({idxs.length} weeks)
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Weekly online stock block</span>
          <select
            value={blockValue(mapping.stockWeeks)}
            onChange={(e) => setBlock('stockWeeks', e.target.value)}
          >
            <option value="">— select block —</option>
            {weekBlocks.map(([b, idxs]) => (
              <option key={b} value={b}>
                {b} ({idxs.length} weeks)
              </option>
            ))}
          </select>
        </label>
      </div>
      {lengthsMismatch && (
        <p className="warning">
          Sales block ({mapping.salesWeeks.length} weeks) and stock block (
          {mapping.stockWeeks.length} weeks) have different lengths — they are paired by
          position, so pick matching blocks.
        </p>
      )}
    </div>
  );
}
