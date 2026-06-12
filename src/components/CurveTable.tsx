import { useState } from 'react';
import type { CurvePoint, SizeRos } from '../domain/types';

interface Props {
  sizeRos: SizeRos[];
  points: CurvePoint[];
  /** Working curve shares (the editable curve), summing to 1. */
  working: number[];
  /** Computed values of the edit target, for the delta column. */
  baseValues: number[];
  edited: boolean;
  onEdit: (index: number, value: number) => void;
}

export default function CurveTable({ sizeRos, points, working, baseValues, edited, onEdit }: Props) {
  const [draft, setDraft] = useState<{ index: number; text: string } | null>(null);

  const commit = (index: number) => {
    if (!draft || draft.index !== index) return;
    const v = parseFloat(draft.text);
    if (Number.isFinite(v)) onEdit(index, v / 100);
    setDraft(null);
  };

  return (
    <div className="table-wrap">
      <table className="curve-table">
        <thead>
          <tr>
            <th>Size</th>
            <th>SKUs</th>
            <th>FP sales units</th>
            <th>In-stock weeks</th>
            <th>ROS</th>
            <th className="demand">Demand %</th>
            <th>Retail units</th>
            <th>Adj buy units</th>
            <th className="adjusted">Adjusted %</th>
            <th className="working">Working %</th>
            <th>Δ vs computed</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => {
            const delta = (working[i] - baseValues[i]) * 100;
            return (
              <tr key={p.size}>
                <td>{p.size}</td>
                <td>{sizeRos[i].skuCount}</td>
                <td>{sizeRos[i].salesUnits.toLocaleString()}</td>
                <td>{sizeRos[i].inStockWeeks.toLocaleString()}</td>
                <td>{sizeRos[i].ros.toFixed(3)}</td>
                <td className="demand">{(p.demand * 100).toFixed(1)}%</td>
                <td>{p.retailUnits.toLocaleString()}</td>
                <td>{p.adjBuyUnits.toFixed(1)}</td>
                <td className="adjusted">{(p.adjusted * 100).toFixed(1)}%</td>
                <td className="working">
                  <input
                    value={
                      draft?.index === i ? draft.text : (working[i] * 100).toFixed(1)
                    }
                    onFocus={(e) => {
                      setDraft({ index: i, text: (working[i] * 100).toFixed(1) });
                      e.target.select();
                    }}
                    onChange={(e) => setDraft({ index: i, text: e.target.value })}
                    onBlur={() => commit(i)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                </td>
                <td className={Math.abs(delta) >= 0.05 ? 'delta-hot' : 'muted'}>
                  {edited ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pp` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td>{sizeRos.reduce((a, r) => a + r.skuCount, 0)}</td>
            <td>{sizeRos.reduce((a, r) => a + r.salesUnits, 0).toLocaleString()}</td>
            <td>{sizeRos.reduce((a, r) => a + r.inStockWeeks, 0).toLocaleString()}</td>
            <td>{sizeRos.reduce((a, r) => a + r.ros, 0).toFixed(3)}</td>
            <td className="demand">{sum(points.map((p) => p.demand))}</td>
            <td>{points.reduce((a, p) => a + p.retailUnits, 0).toLocaleString()}</td>
            <td>{points.reduce((a, p) => a + p.adjBuyUnits, 0).toFixed(1)}</td>
            <td className="adjusted">{sum(points.map((p) => p.adjusted))}</td>
            <td className="working">{sum(working)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function sum(values: number[]): string {
  return `${(values.reduce((a, b) => a + b, 0) * 100).toFixed(1)}%`;
}
