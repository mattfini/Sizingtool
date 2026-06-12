# Size Curve Studio

A local, client-side web app that turns retail SKU sales/stock data into size
curves. All processing happens in the browser — no backend, nothing leaves the
machine.

## Stack

React + TypeScript + Vite, SheetJS (`xlsx`) for CSV/XLSX ingestion, and a
hand-rolled SVG chart (so curve points can be dragged directly).

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build into dist/
npm test         # domain unit tests (Vitest)
```

There is no server to deploy — `npm run build` produces a static `dist/` you can
open from any static host or file server.

## How it works

### Data ingestion (Data tab)

Upload a SKU export (CSV/XLSX) or click **Load sample data**. The parser
auto-detects a two-row header (a block-label row such as `ONLINE SALES UNITS`
over a week-name row) and proposes a column mapping by header name. You can
override every mapping: Department, Category, Option, Size, First Sale Week, an
optional per-row Season, and the weekly **online sales** and **online stock**
blocks (paired by position).

Each upload is tagged with a **season** (e.g. `SS26`). If a Season column is
mapped, each row keeps its own season and the tag is only a fallback. Multiple
datasets can be loaded and pooled together; the season picker in each studio
mode chooses which season to build a curve from.

Optionally upload a **retail-depth** file (keyed Dept + Category + Size with a
Depth column) to seed the per-size depth table in the assumptions panel.

### Core metric — in-stock-adjusted, full-price, online ROS

For each group, pooled across all its SKUs:

```
full-price weeks = trading weeks strictly before the option's First Sale Week
                   (blank First Sale Week ⇒ all weeks qualify)
ROS_size = Σ(full-price online sales units)
         ÷ Σ(full-price weeks where online stock > 0)
```

Pooling sums sales and in-stock weeks across SKUs, so each size is weighted by
how available it actually was.

### Size-convention detection

Sizes are classified so different scales aren't blended: `Alpha` (no digit),
`Combo` (contains `/`), `OneSize`, or — when a digit is present — `WL`/`W`/`RL`/
`R`/`L`/`Num` by the waist/leg/regular letters. An option's convention is the
set of distinct classes across its size run, pruned so `WL` drops `W` and `RL`
drops `R` and `L`. Category mode groups by **Department × Category ×
Convention**.

### Two curves

- **Demand curve** = `ROS_size ÷ Σ ROS`, normalised to 100%.
- **Retail-adjusted curve (subtractive)**, given Buy units, Stores, and per-size
  Depth:

  ```
  RetailUnits  = Depth × Stores
  Residual     = max(Buy − Σ RetailUnits, 0)
  AdjBuyUnits  = RetailUnits + DemandCurve × Residual
  Adjusted     = AdjBuyUnits ÷ Σ AdjBuyUnits
  ```

  Invariant: subtract the retail allocation back out and the remainder
  renormalises to the demand curve exactly (covered by a unit test).

The adjustment method is pluggable (`src/domain/adjustments.ts` — `None` /
`Subtractive`, with room to add more).

## Two analysis modes

- **Category mode** — pick a Season, a Department · Category, and one of the
  detected size conventions. Both curves are overlaid on one chart.
- **Style mode** — search/select a single Option (style); the same metric and
  curves are scoped to that style's own size run, not pooled across the category.

## Interactivity

- Assumptions panel (method, Buy, Stores, editable depth table) recomputes live.
- The **working curve** is graphically adjustable: drag a point on the chart or
  edit a value in the table. The rest of the curve auto-renormalises to 100%, a
  delta-vs-computed column shows the change, and **Reset edits** restores it.
- Underlying numbers (SKUs, full-price sales, in-stock weeks, ROS, %, units) sit
  in a table beside the chart.
- Export the curve as **CSV** or **PNG**.

## Project layout

```
src/domain/      pure calculation logic (no React) — the source of truth
  sizeConvention.ts  size classification + convention pruning + ordering
  ros.ts             full-price weeks + pooled in-stock ROS
  adjustments.ts     pluggable adjustment methods + curve builder
  groups.ts          Dept × Category × Convention grouping
  parse.ts           CSV/XLSX ingestion, header/column-mapping detection
src/components/  React UI (Data tab, two studio modes, chart, table, panels)
src/lib/         CSV + PNG export helpers
tests/           Vitest unit tests, including against the sample file
sample-data/     sample_sku.csv and retail_depth.csv
```
