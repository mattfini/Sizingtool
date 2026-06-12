import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset, SkuRow, AdjustmentMethodId, CurvePoint, SizeRos } from '../domain/types';
import { computeSizeRosPooled } from '../domain/ros';
import { buildCurves } from '../domain/adjustments';
import { conventionsInCategory, rowsInGroup } from '../domain/groups';
import { depthKey } from '../domain/parse';
import AssumptionsPanel from './AssumptionsPanel';
import CurveChart, { type ChartSeries } from './CurveChart';
import CurveTable from './CurveTable';
import { downloadCsv, downloadSvgAsPng } from '../lib/export';

interface Props {
  mode: 'category' | 'style';
  datasets: Dataset[];
  depthLib: Map<string, number>;
}

const DEMAND_COLOR = '#2563eb';
const ADJUSTED_COLOR = '#ea580c';
const WORKING_COLOR = '#059669';

export default function StudioTab({ mode, datasets, depthLib }: Props) {
  const labelsById = useMemo(
    () => new Map(datasets.map((d) => [d.id, d.weekLabels])),
    [datasets],
  );
  const allRows = useMemo(() => datasets.flatMap((d) => d.rows), [datasets]);

  const seasons = useMemo(
    () => [...new Set(allRows.map((r) => r.season).filter(Boolean))].sort(),
    [allRows],
  );
  const [season, setSeason] = useState('');
  useEffect(() => {
    if (!seasons.includes(season)) setSeason(seasons[0] ?? '');
  }, [seasons, season]);

  const seasonRows = useMemo(() => allRows.filter((r) => r.season === season), [allRows, season]);

  // --- Scope selection -------------------------------------------------------
  const deptCats = useMemo(() => {
    const set = new Map<string, { dept: string; category: string }>();
    for (const r of seasonRows) set.set(`${r.dept}|${r.category}`, r);
    return [...set.values()].sort((a, b) =>
      `${a.dept} ${a.category}`.localeCompare(`${b.dept} ${b.category}`),
    );
  }, [seasonRows]);
  const [deptCat, setDeptCat] = useState('');
  useEffect(() => {
    if (!deptCats.some((d) => `${d.dept}|${d.category}` === deptCat)) {
      const first = deptCats[0];
      setDeptCat(first ? `${first.dept}|${first.category}` : '');
    }
  }, [deptCats, deptCat]);
  const [dept, category] = deptCat.split('|');

  const conventions = useMemo(
    () => (mode === 'category' && dept ? conventionsInCategory(seasonRows, dept, category) : []),
    [mode, seasonRows, dept, category],
  );
  const [convention, setConvention] = useState('');
  useEffect(() => {
    if (!conventions.some((c) => c.convention === convention)) {
      setConvention(conventions[0]?.convention ?? '');
    }
  }, [conventions, convention]);

  const [styleSearch, setStyleSearch] = useState('');
  const styles = useMemo(() => {
    if (mode !== 'style') return [];
    const set = new Map<string, SkuRow>();
    for (const r of seasonRows) if (!set.has(r.option)) set.set(r.option, r);
    const q = styleSearch.trim().toLowerCase();
    return [...set.values()]
      .filter((r) => !q || r.option.toLowerCase().includes(q))
      .sort((a, b) => a.option.localeCompare(b.option));
  }, [mode, seasonRows, styleSearch]);
  const [style, setStyle] = useState('');
  useEffect(() => {
    if (!styles.some((s) => s.option === style)) setStyle(styles[0]?.option ?? '');
  }, [styles, style]);

  const groupRows = useMemo(() => {
    if (mode === 'category') {
      return dept && convention ? rowsInGroup(seasonRows, dept, category, convention) : [];
    }
    return seasonRows.filter((r) => r.option === style);
  }, [mode, seasonRows, dept, category, convention, style]);

  const groupDept = mode === 'category' ? dept : groupRows[0]?.dept ?? '';
  const groupCategory = mode === 'category' ? category : groupRows[0]?.category ?? '';

  // --- Metric + assumptions --------------------------------------------------
  const sizeRos: SizeRos[] = useMemo(
    () =>
      computeSizeRosPooled(groupRows, (r) => labelsById.get(r.datasetId ?? '') ?? []),
    [groupRows, labelsById],
  );
  const sizes = useMemo(() => sizeRos.map((r) => r.size), [sizeRos]);

  const [method, setMethod] = useState<AdjustmentMethodId>('subtractive');
  const [buyUnits, setBuyUnits] = useState(1000);
  const [stores, setStores] = useState(20);
  const [depths, setDepths] = useState<Record<string, number>>({});

  const groupKey = `${season}|${groupDept}|${groupCategory}|${mode === 'category' ? convention : style}`;
  useEffect(() => {
    // Seed depths from the uploaded depth library whenever the size run changes.
    setDepths(
      Object.fromEntries(
        sizes.map((s) => [s, depthLib.get(depthKey(groupDept, groupCategory, s)) ?? 0]),
      ),
    );
    setWorking(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey, sizes.join(''), depthLib]);

  const points: CurvePoint[] = useMemo(
    () => buildCurves(sizeRos, { method, buyUnits, stores, depths }),
    [sizeRos, method, buyUnits, stores, depths],
  );

  // --- Manual working curve ---------------------------------------------------
  const [editTarget, setEditTarget] = useState<'demand' | 'adjusted'>('adjusted');
  const [working, setWorking] = useState<number[] | null>(null);
  const baseValues = points.map((p) => (editTarget === 'demand' ? p.demand : p.adjusted));

  const applyEdit = (index: number, value: number) => {
    setWorking(renormalise(working ?? baseValues, index, value));
  };

  const series: ChartSeries[] = [
    { name: 'Demand curve', color: DEMAND_COLOR, values: points.map((p) => p.demand) },
    ...(method !== 'none'
      ? [
          {
            name: 'Retail-adjusted',
            color: ADJUSTED_COLOR,
            values: points.map((p) => p.adjusted),
          },
        ]
      : []),
    {
      name: working ? `Working (edited ${editTarget})` : `Working (drag to edit ${editTarget})`,
      color: WORKING_COLOR,
      dashed: true,
      values: working ?? baseValues,
      onDrag: applyEdit,
    },
  ];

  // --- Export -----------------------------------------------------------------
  const svgRef = useRef<SVGSVGElement>(null);
  const exportName = `${groupDept}-${groupCategory}-${mode === 'category' ? convention : style}-${season}`
    .replace(/[^\w.-]+/g, '_');

  const exportCsv = () => {
    const w = working ?? baseValues;
    downloadCsv(`size-curve_${exportName}.csv`, [
      ['Size', 'SKUs', 'FP sales units', 'In-stock weeks', 'ROS', 'Demand %', 'Retail units', 'Adj buy units', 'Adjusted %', 'Working %', 'Δ working vs computed'],
      ...points.map((p, i) => [
        p.size,
        sizeRos[i].skuCount,
        sizeRos[i].salesUnits,
        sizeRos[i].inStockWeeks,
        round(sizeRos[i].ros, 4),
        round(p.demand * 100, 2),
        round(p.retailUnits, 1),
        round(p.adjBuyUnits, 1),
        round(p.adjusted * 100, 2),
        round(w[i] * 100, 2),
        round((w[i] - baseValues[i]) * 100, 2),
      ]),
    ]);
  };

  const exportPng = () => {
    if (svgRef.current) void downloadSvgAsPng(svgRef.current, `size-curve_${exportName}.png`);
  };

  if (datasets.length === 0) {
    return (
      <main className="studio empty">
        <p>No data loaded — add a dataset in the Data tab first.</p>
      </main>
    );
  }

  return (
    <main className="studio">
      <aside className="sidebar">
        <section className="card">
          <h2>{mode === 'category' ? 'Category scope' : 'Style scope'}</h2>
          <label>
            <span>Season</span>
            <select value={season} onChange={(e) => setSeason(e.target.value)}>
              {seasons.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          {mode === 'category' ? (
            <>
              <label>
                <span>Department · Category</span>
                <select value={deptCat} onChange={(e) => setDeptCat(e.target.value)}>
                  {deptCats.map((d) => (
                    <option key={`${d.dept}|${d.category}`} value={`${d.dept}|${d.category}`}>
                      {d.dept} · {d.category}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Size convention</span>
                <select value={convention} onChange={(e) => setConvention(e.target.value)}>
                  {conventions.map((c) => (
                    <option key={c.convention} value={c.convention}>
                      {c.convention} ({c.options} option{c.options === 1 ? '' : 's'})
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <>
              <label>
                <span>Search styles</span>
                <input
                  value={styleSearch}
                  onChange={(e) => setStyleSearch(e.target.value)}
                  placeholder="Type to filter…"
                />
              </label>
              <label>
                <span>Style ({styles.length} match{styles.length === 1 ? '' : 'es'})</span>
                <select value={style} onChange={(e) => setStyle(e.target.value)} size={8}>
                  {styles.map((s) => (
                    <option key={s.option} value={s.option}>
                      {s.option}
                    </option>
                  ))}
                </select>
              </label>
              {groupRows.length > 0 && (
                <p className="muted">
                  {groupDept} · {groupCategory} — {groupRows.length} SKUs
                </p>
              )}
            </>
          )}
        </section>
        <AssumptionsPanel
          method={method}
          setMethod={setMethod}
          buyUnits={buyUnits}
          setBuyUnits={setBuyUnits}
          stores={stores}
          setStores={setStores}
          sizes={sizes}
          depths={depths}
          setDepths={setDepths}
        />
      </aside>

      <section className="chart-area">
        <div className="card">
          <div className="chart-header">
            <h2>
              {groupDept} · {groupCategory}
              {mode === 'category' ? ` · ${convention}` : ` · ${style}`} · {season}
            </h2>
            <div className="chart-actions">
              <label className="inline">
                Edit target{' '}
                <select
                  value={editTarget}
                  onChange={(e) => {
                    setEditTarget(e.target.value as 'demand' | 'adjusted');
                    setWorking(null);
                  }}
                >
                  <option value="adjusted">Adjusted curve</option>
                  <option value="demand">Demand curve</option>
                </select>
              </label>
              <button className="secondary" onClick={() => setWorking(null)} disabled={!working}>
                Reset edits
              </button>
              <button className="secondary" onClick={exportCsv}>
                Export CSV
              </button>
              <button className="secondary" onClick={exportPng}>
                Export PNG
              </button>
            </div>
          </div>
          {sizes.length === 0 ? (
            <p className="muted">No SKUs match this selection.</p>
          ) : (
            <CurveChart sizes={sizes} series={series} svgRef={svgRef} />
          )}
        </div>
        {sizes.length > 0 && (
          <div className="card">
            <CurveTable
              sizeRos={sizeRos}
              points={points}
              working={working ?? baseValues}
              baseValues={baseValues}
              edited={working !== null}
              onEdit={applyEdit}
            />
          </div>
        )}
      </section>
    </main>
  );
}

/** Set index i to `value` (clamped) and rescale the rest so the curve sums to 100%. */
export function renormalise(values: number[], i: number, value: number): number[] {
  const v = Math.min(Math.max(value, 0), 1);
  const othersSum = values.reduce((a, x, j) => (j === i ? a : a + x), 0);
  const remaining = 1 - v;
  return values.map((x, j) => {
    if (j === i) return v;
    if (othersSum > 0) return (x * remaining) / othersSum;
    return remaining / (values.length - 1 || 1);
  });
}

function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}
