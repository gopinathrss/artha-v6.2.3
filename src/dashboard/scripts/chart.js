/**
 * Minimal SVG multi-series line chart (no external deps).
 * @param {HTMLElement} container
 * @param {{ label: string; color: string; points: { x: string; y: number }[] }[]} series
 */
function renderSvgMultiLineChart(container, series) {
  if (!container || !Array.isArray(series) || series.length === 0) return
  const pad = { t: 12, r: 12, b: 28, l: 48 }
  const W = Math.min(900, container.clientWidth || 800)
  const H = 220
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b

  const allY = series.flatMap((s) => s.points.map((p) => p.y))
  const minY = Math.min(0, ...allY)
  const maxY = Math.max(1, ...allY)
  const yScale = (y) => pad.t + innerH - ((y - minY) / (maxY - minY)) * innerH

  const n = Math.max(...series.map((s) => s.points.length), 1)
  const xScale = (i) => pad.l + (i / Math.max(n - 1, 1)) * innerW

  const paths = series
    .map((s) => {
      const d = s.points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)} ${yScale(p.y).toFixed(1)}`)
        .join(' ')
      return `<path fill="none" stroke="${s.color}" stroke-width="2" d="${d}" />`
    })
    .join('')

  const yTicks = 4
  let grid = ''
  for (let i = 0; i <= yTicks; i++) {
    const yv = minY + (i / yTicks) * (maxY - minY)
    const yy = yScale(yv)
    grid += `<line x1="${pad.l}" y1="${yy}" x2="${W - pad.r}" y2="${yy}" stroke="var(--color-border-subtle)" stroke-width="1" />`
    grid += `<text x="${pad.l - 6}" y="${yy + 4}" text-anchor="end" fill="var(--color-text-tertiary)" font-size="10">${Math.round(
      yv
    )}</text>`
  }

  const labels = series[0]?.points?.map((p) => p.x.slice(0, 7)) || []
  const lx = labels.length ? xScale(Math.min(5, labels.length - 1)) : pad.l
  const legend = series
    .map(
      (s, i) =>
        `<g transform="translate(${lx + i * 120},${H - 10})"><rect width="10" height="10" fill="${s.color}" rx="2"/><text x="14" y="9" fill="var(--color-text-secondary)" font-size="11">${escapeChartText(
          s.label
        )}</text></g>`
    )
    .join('')

  container.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Backtest chart">${grid}${paths}${legend}</svg>`
}

function escapeChartText(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
}

const _pieChart = { renderSvgMultiLineChart }
window.PieChart = _pieChart
window.ArthaChart = _pieChart
