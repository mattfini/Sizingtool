import type { CurvePoint, RetailAssumptions, SizeRos, AdjustmentMethodId } from './types';

/**
 * A pluggable retail-allocation adjustment. Given the demand curve and assumptions,
 * it returns per-size adjusted buy units; the adjusted curve is their normalisation.
 */
export interface AdjustmentMethod {
  id: AdjustmentMethodId;
  label: string;
  adjBuyUnits(
    sizes: string[],
    demand: number[],
    assumptions: RetailAssumptions,
  ): { retailUnits: number[]; adjBuyUnits: number[] };
}

const none: AdjustmentMethod = {
  id: 'none',
  label: 'None (demand only)',
  adjBuyUnits(sizes, demand) {
    return { retailUnits: sizes.map(() => 0), adjBuyUnits: [...demand] };
  },
};

/**
 * Subtractive method (per size_curve.pq):
 *   RetailUnits = Depth × Stores
 *   Residual    = max(Buy − ΣRetailUnits, 0)
 *   AdjBuyUnits = RetailUnits + Demand × Residual
 * Invariant: subtracting RetailUnits back out leaves Demand × Residual, i.e. the
 * remainder renormalises exactly to the demand curve.
 */
const subtractive: AdjustmentMethod = {
  id: 'subtractive',
  label: 'Subtractive',
  adjBuyUnits(sizes, demand, assumptions) {
    const retailUnits = sizes.map((s) => (assumptions.depths[s] ?? 0) * assumptions.stores);
    const totalRetail = retailUnits.reduce((a, b) => a + b, 0);
    const residual = Math.max(assumptions.buyUnits - totalRetail, 0);
    const adjBuyUnits = retailUnits.map((r, i) => r + demand[i] * residual);
    return { retailUnits, adjBuyUnits };
  },
};

export const ADJUSTMENT_METHODS: AdjustmentMethod[] = [none, subtractive];

export function getMethod(id: AdjustmentMethodId): AdjustmentMethod {
  return ADJUSTMENT_METHODS.find((m) => m.id === id) ?? none;
}

/** Build demand + retail-adjusted curves (both normalised to shares summing to 1). */
export function buildCurves(sizeRos: SizeRos[], assumptions: RetailAssumptions): CurvePoint[] {
  const sizes = sizeRos.map((r) => r.size);
  const totalRos = sizeRos.reduce((a, r) => a + r.ros, 0);
  const demand = sizeRos.map((r) => (totalRos > 0 ? r.ros / totalRos : 0));
  const { retailUnits, adjBuyUnits } = getMethod(assumptions.method).adjBuyUnits(
    sizes,
    demand,
    assumptions,
  );
  const totalAdj = adjBuyUnits.reduce((a, b) => a + b, 0);
  return sizeRos.map((r, i) => ({
    size: r.size,
    demand: demand[i],
    adjusted: totalAdj > 0 ? adjBuyUnits[i] / totalAdj : demand[i],
    retailUnits: retailUnits[i],
    adjBuyUnits: adjBuyUnits[i],
  }));
}
