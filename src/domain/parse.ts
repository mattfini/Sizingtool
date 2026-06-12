import * as XLSX from 'xlsx';
import type { Dataset, SkuRow } from './types';

export interface ColumnInfo {
  index: number;
  /** Block label from the upper header row (forward-filled), '' for single-row headers. */
  block: string;
  /** Field name from the lowest header row. */
  name: string;
  label: string;
}

export interface ColumnMapping {
  dept: number;
  category: number;
  option: number;
  size: number;
  firstSaleWeek: number;
  /** Optional per-row season column; null falls back to the dataset season tag. */
  season: number | null;
  /** Weekly online sales-unit columns, in trading-week order. */
  salesWeeks: number[];
  /** Weekly online stock-unit columns, paired by position with salesWeeks. */
  stockWeeks: number[];
}

export interface ParsedFile {
  grid: (string | number)[][];
  headerRows: number;
  columns: ColumnInfo[];
  defaultMapping: ColumnMapping;
}

/** Read first sheet of a CSV/XLSX file into a 2-D grid. */
export function readGrid(data: ArrayBuffer): (string | number)[][] {
  const wb = XLSX.read(data, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }) as (
    | string
    | number
  )[][];
}

export function parseFile(data: ArrayBuffer): ParsedFile {
  const grid = readGrid(data);
  const headerRows = detectHeaderRows(grid);
  const columns = buildColumns(grid, headerRows);
  return { grid, headerRows, columns, defaultMapping: defaultMapping(columns) };
}

/**
 * Detect a two-row header: an upper block-label row (sparse, repeated labels)
 * over a lower field-name row. Falls back to a single header row.
 */
export function detectHeaderRows(grid: (string | number)[][]): number {
  if (grid.length < 2) return 1;
  const row0 = grid[0].map(cellStr);
  const row1 = grid[1].map(cellStr);
  const filled0 = row0.filter((c) => c !== '').length;
  const filled1 = row1.filter((c) => c !== '').length;
  const distinct0 = new Set(row0.filter((c) => c !== '')).size;
  // Two-row header when the top row is sparse or highly repetitive (block labels)
  // and the second row is densely populated with field names.
  const sparse = filled0 < row0.length * 0.5;
  const repetitive = filled0 > 0 && distinct0 / filled0 < 0.5;
  return (sparse || repetitive) && filled1 > filled0 ? 2 : 1;
}

export function buildColumns(grid: (string | number)[][], headerRows: number): ColumnInfo[] {
  const nameRow = grid[headerRows - 1] ?? [];
  const blockRow = headerRows >= 2 ? grid[headerRows - 2] : [];
  const width = Math.max(nameRow.length, blockRow.length);
  const cols: ColumnInfo[] = [];
  let block = '';
  for (let i = 0; i < width; i++) {
    const blockCell = cellStr(blockRow[i]);
    if (blockCell !== '') block = blockCell;
    const name = cellStr(nameRow[i]);
    if (name === '') {
      block = blockCell !== '' ? blockCell : block;
      continue; // spacer column
    }
    cols.push({
      index: i,
      block: headerRows >= 2 ? block : '',
      name,
      label: headerRows >= 2 && block ? `${block} › ${name}` : name,
    });
  }
  return cols;
}

function cellStr(v: string | number | undefined): string {
  return v === undefined ? '' : String(v).trim();
}

function findCol(columns: ColumnInfo[], pattern: RegExp): number {
  const hit = columns.find((c) => pattern.test(c.name));
  return hit ? hit.index : -1;
}

function findWeekBlock(columns: ColumnInfo[], blockPattern: RegExp): number[] {
  return columns
    .filter((c) => blockPattern.test(c.block || c.name) && /week/i.test(c.name))
    .map((c) => c.index);
}

export function defaultMapping(columns: ColumnInfo[]): ColumnMapping {
  const seasonIdx = findCol(columns, /^season$/i);
  return {
    dept: findCol(columns, /^dep(t|artment)\.?$/i),
    category: findCol(columns, /^category$/i),
    option: findCol(columns, /^option$/i),
    size: findCol(columns, /^size$/i),
    firstSaleWeek: findCol(columns, /^first\s*sale\s*week$/i),
    season: seasonIdx === -1 ? null : seasonIdx,
    salesWeeks: findWeekBlock(columns, /online\s*sales/i),
    stockWeeks: findWeekBlock(columns, /online\s*stock/i),
  };
}

export function buildDataset(
  parsed: Pick<ParsedFile, 'grid' | 'headerRows' | 'columns'>,
  mapping: ColumnMapping,
  seasonTag: string,
  name: string,
  id: string,
): Dataset {
  const { grid, headerRows, columns } = parsed;
  const colName = (i: number) => columns.find((c) => c.index === i)?.name ?? `Col ${i + 1}`;
  const weekLabels = mapping.salesWeeks.map(colName);
  const rows: SkuRow[] = [];
  for (let r = headerRows; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.every((c) => cellStr(c) === '')) continue;
    const size = cellStr(row[mapping.size]);
    const option = cellStr(row[mapping.option]);
    if (size === '' && option === '') continue;
    rows.push({
      dept: cellStr(row[mapping.dept]),
      category: cellStr(row[mapping.category]),
      option,
      size,
      firstSaleWeek: cellStr(row[mapping.firstSaleWeek]),
      season:
        mapping.season !== null && cellStr(row[mapping.season]) !== ''
          ? cellStr(row[mapping.season])
          : seasonTag,
      onlineSales: mapping.salesWeeks.map((i) => toNum(row[i])),
      onlineStock: mapping.stockWeeks.map((i) => toNum(row[i])),
      datasetId: id,
    });
  }
  return { id, name, seasonTag, weekLabels, rows };
}

function toNum(v: string | number | undefined): number {
  if (typeof v === 'number') return v;
  if (v === undefined) return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Parse a retail-depth CSV/XLSX keyed Dept+Category+Size → depth units per store. */
export function parseDepthFile(data: ArrayBuffer): Map<string, number> {
  const grid = readGrid(data);
  if (grid.length < 2) return new Map();
  const header = grid[0].map(cellStr);
  const di = header.findIndex((h) => /^dep(t|artment)\.?$/i.test(h));
  const ci = header.findIndex((h) => /^category$/i.test(h));
  const si = header.findIndex((h) => /^size$/i.test(h));
  const vi = header.findIndex((h) => /depth/i.test(h));
  const out = new Map<string, number>();
  if (si === -1 || vi === -1) return out;
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    const key = depthKey(
      di === -1 ? '' : cellStr(row[di]),
      ci === -1 ? '' : cellStr(row[ci]),
      cellStr(row[si]),
    );
    out.set(key, toNum(row[vi]));
  }
  return out;
}

export function depthKey(dept: string, category: string, size: string): string {
  return `${dept}|${category}|${size}`;
}
