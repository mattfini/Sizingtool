import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { classifySize, conventionOf, compareSizes } from '../src/domain/sizeConvention';
import { fullPriceWeekIndices, computeSizeRos } from '../src/domain/ros';
import { buildCurves } from '../src/domain/adjustments';
import { parseFile, buildDataset } from '../src/domain/parse';
import { conventionsInCategory, rowsInGroup } from '../src/domain/groups';
import type { SkuRow } from '../src/domain/types';

describe('classifySize', () => {
  it('classifies per the PQ rules', () => {
    expect(classifySize('One Size')).toBe('OneSize');
    expect(classifySize('S/M')).toBe('Combo');
    expect(classifySize('XL')).toBe('Alpha');
    expect(classifySize('32W 34L')).toBe('WL');
    expect(classifySize('32W')).toBe('W');
    expect(classifySize('32R 34L')).toBe('RL');
    expect(classifySize('32R')).toBe('R');
    expect(classifySize('34L')).toBe('L');
    expect(classifySize('12')).toBe('Num');
    expect(classifySize('EU 42')).toBe('Num');
    expect(classifySize('UK 9')).toBe('Num');
  });
});

describe('conventionOf', () => {
  it('prunes W when WL present, R and L when RL present', () => {
    expect(conventionOf(['30W 32L', '32W'])).toBe('WL');
    expect(conventionOf(['30R 32L', '30R', '34L'])).toBe('RL');
    expect(conventionOf(['30W', '32L'])).toBe('L+W');
    expect(conventionOf(['S', 'M', 'L'])).toBe('Alpha');
    expect(conventionOf(['8', '10', '12'])).toBe('Num');
  });
});

describe('compareSizes', () => {
  it('orders alpha runs and numeric sizes naturally', () => {
    expect(['M', 'XS', 'XL', 'S', 'L'].sort(compareSizes)).toEqual(['XS', 'S', 'M', 'L', 'XL']);
    expect(['12', '8', '10'].sort(compareSizes)).toEqual(['8', '10', '12']);
    expect(['EU 40', 'EU 38', 'EU 39'].sort(compareSizes)).toEqual(['EU 38', 'EU 39', 'EU 40']);
  });
});

const WEEKS = ['Week 41', 'Week 42', 'Week 43', 'Week 44'];

function sku(over: Partial<SkuRow>): SkuRow {
  return {
    dept: 'Mens',
    category: 'Tees',
    option: 'Opt A',
    size: 'M',
    firstSaleWeek: '',
    season: 'AW25',
    onlineSales: [0, 0, 0, 0],
    onlineStock: [0, 0, 0, 0],
    ...over,
  };
}

describe('fullPriceWeekIndices', () => {
  it('blank means all weeks qualify', () => {
    expect(fullPriceWeekIndices(WEEKS, '')).toEqual([0, 1, 2, 3]);
  });
  it('weeks strictly before First Sale Week qualify', () => {
    expect(fullPriceWeekIndices(WEEKS, 'Week 43')).toEqual([0, 1]);
    expect(fullPriceWeekIndices(WEEKS, 'Week 41')).toEqual([]);
  });
});

describe('computeSizeRos', () => {
  it('pools sales and in-stock weeks across SKUs', () => {
    const rows = [
      sku({ size: 'M', onlineSales: [4, 2, 9, 9], onlineStock: [5, 5, 0, 9], firstSaleWeek: 'Week 43' }),
      sku({ size: 'M', option: 'Opt B', onlineSales: [1, 1, 1, 1], onlineStock: [1, 0, 1, 1] }),
      sku({ size: 'L', onlineSales: [3, 0, 0, 0], onlineStock: [2, 0, 0, 0] }),
    ];
    const out = computeSizeRos(rows, WEEKS);
    // M: option A full-price weeks 41,42 -> sales 6, stock>0 weeks 2.
    //    option B all weeks -> sales 4, stock>0 weeks 3. Pooled: 10 / 5 = 2.
    const m = out.find((r) => r.size === 'M')!;
    expect(m.salesUnits).toBe(10);
    expect(m.inStockWeeks).toBe(5);
    expect(m.ros).toBe(2);
    const l = out.find((r) => r.size === 'L')!;
    expect(l.ros).toBe(3);
    expect(out.map((r) => r.size)).toEqual(['M', 'L']); // natural order
  });
});

describe('buildCurves (subtractive)', () => {
  const ros = [
    { size: 'S', salesUnits: 10, inStockWeeks: 10, ros: 1, skuCount: 1 },
    { size: 'M', salesUnits: 30, inStockWeeks: 10, ros: 3, skuCount: 1 },
    { size: 'L', salesUnits: 10, inStockWeeks: 5, ros: 2, skuCount: 1 },
  ];

  it('demand curve normalises ROS to 100%', () => {
    const pts = buildCurves(ros, { method: 'none', buyUnits: 0, stores: 0, depths: {} });
    expect(pts.map((p) => p.demand)).toEqual([1 / 6, 3 / 6, 2 / 6]);
    expect(pts.map((p) => p.adjusted)).toEqual(pts.map((p) => p.demand));
  });

  it('subtractive: AdjBuy = Depth×Stores + Demand×Residual; invariant holds', () => {
    const assumptions = {
      method: 'subtractive' as const,
      buyUnits: 1000,
      stores: 50,
      depths: { S: 2, M: 4, L: 2 },
    };
    const pts = buildCurves(ros, assumptions);
    const retail = pts.map((p) => p.retailUnits);
    expect(retail).toEqual([100, 200, 100]);
    const residual = 1000 - 400;
    expect(pts.map((p) => p.adjBuyUnits)).toEqual([
      100 + (1 / 6) * residual,
      200 + (3 / 6) * residual,
      100 + (2 / 6) * residual,
    ]);
    const sum = pts.reduce((a, p) => a + p.adjusted, 0);
    expect(sum).toBeCloseTo(1, 12);
    // Invariant: remove retail allocation, remainder renormalises to demand exactly.
    const remainder = pts.map((p) => p.adjBuyUnits - p.retailUnits);
    const remSum = remainder.reduce((a, b) => a + b, 0);
    remainder.forEach((r, i) => expect(r / remSum).toBeCloseTo(pts[i].demand, 12));
  });

  it('residual clamps at zero when retail exceeds buy', () => {
    const pts = buildCurves(ros, {
      method: 'subtractive',
      buyUnits: 100,
      stores: 50,
      depths: { S: 2, M: 4, L: 2 },
    });
    expect(pts.map((p) => p.adjBuyUnits)).toEqual([100, 200, 100]);
    expect(pts[1].adjusted).toBeCloseTo(0.5, 12);
  });
});

describe('sample file ingestion', () => {
  const buf = readFileSync(new URL('../sample-data/sample_sku.csv', import.meta.url));
  const parsed = parseFile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

  it('detects the two-row header and default mapping', () => {
    expect(parsed.headerRows).toBe(2);
    const m = parsed.defaultMapping;
    expect(m.dept).toBe(3);
    expect(m.category).toBe(4);
    expect(m.option).toBe(8);
    expect(m.size).toBe(9);
    expect(m.firstSaleWeek).toBe(16);
    expect(m.season).toBe(13);
    expect(m.salesWeeks).toHaveLength(34);
    expect(m.stockWeeks).toHaveLength(34);
    expect(m.salesWeeks[0]).toBe(57);
    expect(m.stockWeeks[0]).toBe(166);
  });

  it('builds a dataset with seasons from the Season column', () => {
    const ds = buildDataset(parsed, parsed.defaultMapping, 'TEST', 'sample', 'ds1');
    expect(ds.rows).toHaveLength(300);
    expect(ds.weekLabels[0]).toBe('Week 41');
    expect(ds.weekLabels.at(-1)).toBe('Week 22');
    const seasons = new Set(ds.rows.map((r) => r.season));
    expect(seasons.has('AW25')).toBe(true);
    expect(seasons.has('SS26')).toBe(true);
  });

  it('detects conventions and computes a plausible category curve', () => {
    const ds = buildDataset(parsed, parsed.defaultMapping, 'TEST', 'sample', 'ds1');
    const convs = conventionsInCategory(ds.rows, 'Womens', 'Legwear');
    expect(convs.length).toBeGreaterThan(0);
    const rows = rowsInGroup(ds.rows, 'Womens', 'Legwear', convs[0].convention);
    const ros = computeSizeRos(rows, ds.weekLabels);
    const pts = buildCurves(ros, { method: 'none', buyUnits: 0, stores: 0, depths: {} });
    const sum = pts.reduce((a, p) => a + p.demand, 0);
    expect(sum).toBeCloseTo(1, 9);
  });
});
