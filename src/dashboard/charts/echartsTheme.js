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
  var PieE = {
    getGold: function () {
      return readVar('--gold', '#B8922A')
    },
    getTeal: function () {
      return readVar('--teal', '#0a7a8a')
    },
    getSlate: function () {
      return readVar('--text-muted', '#4a5a6b')
    },
    applyTo: function (chart) {
      if (!chart || !chart.setOption) return
      var g = PieE.getGold()
      var t = PieE.getTeal()
      var s = PieE.getSlate()
      chart.setOption({ color: [g, t, s] })
    }
  }
  window.PieEcharts = window.PieEcharts || PieE
  window.ArthaEcharts = window.ArthaEcharts || window.PieEcharts
})()
