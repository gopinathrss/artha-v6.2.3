/**
 * V4 ECharts theme tokens (light/dark). Used by overview, India FD, premium report.
 * @global
 */
;(function () {
  function readVar(name, fallback) {
    try {
      var st = getComputedStyle(document.documentElement)
      var v = (st.getPropertyValue(name) || '').trim()
      return v || fallback
    } catch (e) {
      return fallback
    }
  }
  window.ArthaEcharts = window.ArthaEcharts || {}
  window.ArthaEcharts.getGold = function () {
    return readVar('--gold', '#B8922A')
  }
  window.ArthaEcharts.getTeal = function () {
    return readVar('--teal', '#0a7a8a')
  }
  window.ArthaEcharts.getSlate = function () {
    return readVar('--text-muted', '#4a5a6b')
  }
  window.ArthaEcharts.applyTo = function (chart) {
    if (!chart || !chart.setOption) return
    var g = window.ArthaEcharts.getGold()
    var t = window.ArthaEcharts.getTeal()
    var s = window.ArthaEcharts.getSlate()
    chart.setOption({ color: [g, t, s] })
  }
})()
