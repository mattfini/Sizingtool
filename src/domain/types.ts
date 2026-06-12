/** One SKU row after column mapping: weekly arrays are aligned by index to weekLabels. */
export interface SkuRow {
  dept: string;
  category: string;
  option: string;
  size: string;
  /** Week label (e.g. "Week 50") when the option went into markdown; '' = full price all season. */
  firstSaleWeek: string;
  /** Season for this row (from a mapped Season column, else the dataset tag). */
  season: string;
  /** Online sales units per trading week, aligned to Dataset.weekLabels. */
  onlineSales: number[];
  /** Online stock units per trading week, aligned to Dataset.weekLabels. */
  onlineStock: number[];
  /** Owning dataset, used to resolve week labels when pooling across uploads. */
  datasetId?: string;
}

export interface Dataset {
  id: string;
  name: string;
  /** User-supplied season tag for the upload, used when no Season column is mapped. */
  seasonTag: string;
  /** Ordered trading-week labels, e.g. ["Week 41", ..., "Week 22"]. */
  weekLabels: string[];
  rows: SkuRow[];
}

export type SizeClass = 'Alpha' | 'Combo' | 'OneSize' | 'WL' | 'W' | 'RL' | 'R' | 'L' | 'Num';

/** Per-size pooled ROS inputs and result. */
export interface SizeRos {
  size: string;
  /** Σ full-price online sales units across SKUs in the group. */
  salesUnits: number;
  /** Σ full-price weeks with online stock > 0 across SKUs in the group. */
  inStockWeeks: number;
  /** salesUnits / inStockWeeks (0 when no in-stock weeks). */
  ros: number;
  /** Number of SKU rows pooled into this size. */
  skuCount: number;
}

export interface CurvePoint {
  size: string;
  /** Demand curve share, 0..1. */
  demand: number;
  /** Retail-adjusted share, 0..1. */
  adjusted: number;
  /** Intermediate values for the table. */
  retailUnits: number;
  adjBuyUnits: number;
}

export interface RetailAssumptions {
  method: AdjustmentMethodId;
  buyUnits: number;
  stores: number;
  /** Per-size allocation depth (units per store). */
  depths: Record<string, number>;
}

export type AdjustmentMethodId = 'none' | 'subtractive';
