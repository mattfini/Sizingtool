import type { SizeClass } from './types';

/**
 * Classify a single size string into a size class.
 * Mirrors size_curve.pq:
 *   no digit => Alpha; contains "/" => Combo; "one size" => OneSize
 *   has digit: W&L => WL; W only => W; R&L => RL; R only => R; L only => L; else Num
 */
export function classifySize(size: string): SizeClass {
  const s = size.trim();
  const upper = s.toUpperCase();
  if (upper.replace(/\s+/g, ' ') === 'ONE SIZE') return 'OneSize';
  if (s.includes('/')) return 'Combo';
  if (!/\d/.test(s)) return 'Alpha';
  const hasW = upper.includes('W');
  const hasL = upper.includes('L');
  const hasR = upper.includes('R');
  if (hasW && hasL) return 'WL';
  if (hasW) return 'W';
  if (hasR && hasL) return 'RL';
  if (hasR) return 'R';
  if (hasL) return 'L';
  return 'Num';
}

/**
 * An option's convention: the set of distinct classes across its size run,
 * pruned so near-identical runs merge: WL present => drop W; RL present => drop R and L.
 * Returned as a stable, sorted key like "L+R+W".
 */
export function conventionOf(sizes: string[]): string {
  const classes = new Set<SizeClass>(sizes.map(classifySize));
  if (classes.has('WL')) classes.delete('W');
  if (classes.has('RL')) {
    classes.delete('R');
    classes.delete('L');
  }
  return [...classes].sort().join('+');
}

const ALPHA_ORDER = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '2XL', '3XL', '4XL'];

/** Sort sizes into a natural retail order: alpha run order, else by first number, else lexical. */
export function compareSizes(a: string, b: string): number {
  const ai = ALPHA_ORDER.indexOf(a.trim().toUpperCase());
  const bi = ALPHA_ORDER.indexOf(b.trim().toUpperCase());
  if (ai !== -1 && bi !== -1) return ai - bi;
  if (ai !== -1) return -1;
  if (bi !== -1) return 1;
  const an = firstNumber(a);
  const bn = firstNumber(b);
  if (an !== null && bn !== null && an !== bn) return an - bn;
  return a.localeCompare(b);
}

function firstNumber(s: string): number | null {
  const m = s.match(/\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
