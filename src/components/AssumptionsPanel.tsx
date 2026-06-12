import type { AdjustmentMethodId } from '../domain/types';
import { ADJUSTMENT_METHODS } from '../domain/adjustments';

interface Props {
  method: AdjustmentMethodId;
  setMethod: (m: AdjustmentMethodId) => void;
  buyUnits: number;
  setBuyUnits: (n: number) => void;
  stores: number;
  setStores: (n: number) => void;
  sizes: string[];
  depths: Record<string, number>;
  setDepths: (d: Record<string, number>) => void;
}

export default function AssumptionsPanel({
  method,
  setMethod,
  buyUnits,
  setBuyUnits,
  stores,
  setStores,
  sizes,
  depths,
  setDepths,
}: Props) {
  const totalRetail = sizes.reduce((a, s) => a + (depths[s] ?? 0) * stores, 0);
  const residual = Math.max(buyUnits - totalRetail, 0);

  return (
    <section className="card">
      <h2>Retail allocation assumptions</h2>
      <label>
        <span>Adjustment method</span>
        <select value={method} onChange={(e) => setMethod(e.target.value as AdjustmentMethodId)}>
          {ADJUSTMENT_METHODS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      {method !== 'none' && (
        <>
          <div className="row">
            <label>
              <span>Buy units</span>
              <input
                type="number"
                min={0}
                value={buyUnits}
                onChange={(e) => setBuyUnits(Math.max(0, Number(e.target.value) || 0))}
              />
            </label>
            <label>
              <span>Stores</span>
              <input
                type="number"
                min={0}
                value={stores}
                onChange={(e) => setStores(Math.max(0, Number(e.target.value) || 0))}
              />
            </label>
          </div>
          <table className="depth-table">
            <thead>
              <tr>
                <th>Size</th>
                <th>Depth / store</th>
                <th>Retail units</th>
              </tr>
            </thead>
            <tbody>
              {sizes.map((s) => (
                <tr key={s}>
                  <td>{s}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={depths[s] ?? 0}
                      onChange={(e) =>
                        setDepths({ ...depths, [s]: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
                  </td>
                  <td>{((depths[s] ?? 0) * stores).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td></td>
                <td>{totalRetail.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
          <p className="muted">
            Residual (online) units: <strong>{residual.toLocaleString()}</strong>
            {buyUnits < totalRetail && ' — retail allocation exceeds buy; residual clamped to 0.'}
          </p>
        </>
      )}
    </section>
  );
}
