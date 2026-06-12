import type { SkuRow, SizeRos } from './types';
import { compareSizes } from './sizeConvention';

/**
 * Full-price week indices for a SKU: trading weeks strictly before the option's
 * First Sale Week (matched by label in the dataset's week sequence).
 * Blank, or a label not present in the sequence, means full price all season.
 */
export function fullPriceWeekIndices(weekLabels: string[], firstSaleWeek: string): number[] {
  const fsw = firstSaleWeek.trim();
  if (fsw === '') return weekLabels.map((_, i) => i);
  const cut = weekLabels.findIndex((w) => w.trim().toLowerCase() === fsw.toLowerCase());
  if (cut === -1) return weekLabels.map((_, i) => i);
  return weekLabels.slice(0, cut).map((_, i) => i);
}

/**
 * In-stock-adjusted, full-price, online ROS per size, pooled across all SKUs in the group:
 *   ROS_size = Σ(full-price online sales units) / Σ(full-price weeks where online stock > 0)
 * Sizes are returned in natural retail order.
 */
export function computeSizeRos(rows: SkuRow[], weekLabels: string[]): SizeRos[] {
  return computeSizeRosPooled(rows, () => weekLabels);
}

/** Same as computeSizeRos but resolves week labels per row (for multi-dataset pooling). */
export function computeSizeRosPooled(
  rows: SkuRow[],
  labelsFor: (row: SkuRow) => string[],
): SizeRos[] {
  const bySize = new Map<string, { sales: number; weeks: number; skus: number }>();
  for (const row of rows) {
    const idxs = fullPriceWeekIndices(labelsFor(row), row.firstSaleWeek);
    let sales = 0;
    let weeks = 0;
    for (const i of idxs) {
      sales += row.onlineSales[i] ?? 0;
      if ((row.onlineStock[i] ?? 0) > 0) weeks += 1;
    }
    const acc = bySize.get(row.size) ?? { sales: 0, weeks: 0, skus: 0 };
    acc.sales += sales;
    acc.weeks += weeks;
    acc.skus += 1;
    bySize.set(row.size, acc);
  }
  return [...bySize.entries()]
    .sort((a, b) => compareSizes(a[0], b[0]))
    .map(([size, acc]) => ({
      size,
      salesUnits: acc.sales,
      inStockWeeks: acc.weeks,
      ros: acc.weeks > 0 ? acc.sales / acc.weeks : 0,
      skuCount: acc.skus,
    }));
}
