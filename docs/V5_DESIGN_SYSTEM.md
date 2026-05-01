# ARTHA V5 — Design system

Design tokens live in `src/dashboard/styles/tokens.css` (light + `[data-theme="dark"]`). Use **CSS variables only** — no hard-coded hex/rgb in page-specific CSS.

## Core stylesheet stack

| File            | Role                                      |
|-----------------|-------------------------------------------|
| `v5-core.css`   | Tokens + base reset + typography utilities |
| `layout.css`    | App shell, sidebar, topbar, content grid  |
| `components.css`| Cards, buttons, badges, tables, charts    |
| `index.css`     | Full stack for Overview (`/`)             |

## Cards

```html
<section class="card">
  <div class="card-header">
    <div>
      <h2 class="card-title">Title</h2>
      <p class="card-subtitle">Supporting line</p>
    </div>
  </div>
  …
</section>
```

Flat variant: `card-flat`.

## Buttons

```html
<button type="button" class="btn btn-primary">Save</button>
<button type="button" class="btn btn-secondary">Cancel</button>
<a href="/path" class="btn btn-ghost btn-sm">Link</a>
```

## Stat blocks

```html
<div class="stat-block">
  <div class="stat-block-label">Label</div>
  <div class="stat-block-value">1 234 567</div>
  <div class="stat-block-meta">Meta</div>
</div>
```

Use `stat-block-value-lg` for hero numbers. Numeric columns: add class `num` for tabular alignment.

## Badges

```html
<span class="badge badge-positive">On track</span>
<span class="badge badge-warning">Drift</span>
<span class="badge badge-negative">Risk</span>
<span class="badge badge-neutral">Inactive</span>
```

## Tables

```html
<table class="table">
  <thead>…</thead>
  <tbody>
    <tr><td>…</td><td class="num">…</td></tr>
  </tbody>
</table>
```

## Allocation bar

```html
<div class="alloc-bar">
  <div class="alloc-bar-segment alloc-bar-equity" style="width:40%"></div>
  <div class="alloc-bar-segment alloc-bar-bonds" style="width:35%"></div>
  <div class="alloc-bar-segment alloc-bar-cash" style="width:25%"></div>
</div>
```

## Theme (Appearance)

Radios call `window.ArthaTheme.setPreference('system'|'light'|'dark')`. Storage key: `artha-theme-preference`. Legacy `artha-ui.js` defers to `ArthaTheme` when present.

## Responsive overview grids

- `overview-two-col` — two cards side by side; stacks ≤768px.
- `overview-split-2-1` — 2fr / 1fr; stacks ≤1024px.
- `overview-hero-grid` — four KPI columns; 2 cols ≤768px, 1 col ≤480px.

## Shimmer loading

```html
<div class="shimmer" style="height:48px;width:100%"></div>
```

## Divider

```html
<hr class="divider" />
```
