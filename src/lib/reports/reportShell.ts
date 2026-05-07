export function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function wrapReportHtml(title: string, inner: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<style>
  :root { font-family: Inter, system-ui, sans-serif; color: #0a1628; background: #f7f3ea; }
  body { margin: 0; }
  .wrap { max-width: 880px; margin: 0 auto; padding: 28px 20px; }
  h1 { font-size: 1.35rem; font-weight: 600; margin: 0 0 12px; }
  h2 { font-size: 1.05rem; margin: 24px 0 8px; border-bottom: 1px solid #d8d0c4; padding-bottom: 4px; }
  .muted { color: #5a6578; font-size: 0.9rem; margin-bottom: 20px; }
  .section { margin-bottom: 16px; line-height: 1.55; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5dfd3; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <div class="wrap">
    <p class="no-print"><a href="javascript:window.print()">Print / PDF</a></p>
    <h1>${esc(title)}</h1>
    <div class="muted">PIE smart report · generated ${esc(new Date().toISOString())}</div>
    ${inner}
  </div>
</body>
</html>`
}
