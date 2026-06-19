// ===== Gráficos do Painel de Inteligência (Chart.js, offline/vendorizado) =====
// Consumido por inteligencia.js. Cada função gerencia sua própria instância de Chart
// (destrói antes de recriar) e lê as cores do tema via CSS vars (funciona no dark mode).
(function () {
  const charts = {};
  function ready() { return !!window.Chart; }
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  function ctx(id) { const el = document.getElementById(id); return el ? el.getContext('2d') : null; }
  function destroy(key) { if (charts[key]) { charts[key].destroy(); delete charts[key]; } }

  // distribuição da escala hedônica do teste atual (rosca)
  function renderDistribuicao(tot) {
    const c = ctx('chartDist'); if (!ready() || !c) return;
    destroy('dist');
    const muted = cssVar('--muted', '#555');
    charts.dist = new window.Chart(c, {
      type: 'doughnut',
      data: {
        labels: ['😍 Adorei', '🙂 Gostei', '😐 Indiferente', '🙁 Não gostei', '😖 Detestei'],
        datasets: [{
          data: [tot.adorei, tot.gostei, tot.indif, tot.naogostei, tot.detestei],
          backgroundColor: ['#047857', '#34d399', '#9ca3af', '#f59e0b', '#b91c1c'],
          borderColor: cssVar('--card', '#fff'), borderWidth: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '55%',
        plugins: { legend: { position: 'bottom', labels: { color: muted, boxWidth: 12, font: { size: 11 } } } }
      }
    });
  }

  // tendência de aceitação por data (linha) + linha de corte 85%.
  // Agrega por DATA (1 ponto por dia = média de aceitação de todos os testes daquele dia)
  // e usa eixo de tempo PROPORCIONAL — senão a linha ligaria testes não relacionados,
  // duplicaria datas iguais e distorceria os intervalos.
  const fmtData = ms => { const d = new Date(ms); const p = n => ('0' + n).slice(-2); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; };
  function renderTendencia(evol) {
    const c = ctx('chartTrend'); if (!ready() || !c) return;
    destroy('trend');
    if (!evol || !evol.length) return;

    const byDate = new Map();
    evol.forEach(h => {
      const d = String(h.header.data || ''); if (!d) return;
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push(h.aceitacao);
    });
    const dates = [...byDate.keys()].sort(); // datas ISO 'YYYY-MM-DD' ordenam como string
    if (!dates.length) return;
    const points = dates.map(d => {
      const arr = byDate.get(d);
      return { x: Date.parse(d + 'T00:00:00'), y: +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1), n: arr.length };
    });
    let minX = points[0].x, maxX = points[points.length - 1].x;
    if (minX === maxX) { minX -= 86400000; maxX += 86400000; } // 1 dia só → não degenerar o eixo

    const blue = cssVar('--blue', '#1862a8'), muted = cssVar('--muted', '#555');
    charts.trend = new window.Chart(c, {
      type: 'line',
      data: {
        datasets: [
          { label: 'Aceitação média do dia', data: points, borderColor: blue, backgroundColor: 'rgba(24,98,168,.12)', tension: .2, fill: true, pointRadius: 4 },
          { label: 'Corte 85%', data: [{ x: minX, y: 85 }, { x: maxX, y: 85 }], borderColor: '#b91c1c', borderDash: [6, 4], pointRadius: 0, fill: false }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, parsing: false,
        scales: {
          x: { type: 'linear', min: minX, max: maxX, ticks: { color: muted, maxRotation: 60, font: { size: 10 }, callback: v => fmtData(v) } },
          y: { min: 0, max: 100, ticks: { color: muted } }
        },
        plugins: {
          legend: { labels: { color: muted, boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: {
            title: items => fmtData(items[0].parsed.x),
            label: it => it.dataset.label === 'Corte 85%' ? 'Corte 85%'
              : `Aceitação média: ${it.raw.y}%` + (it.raw.n > 1 ? ` (${it.raw.n} testes no dia)` : '')
          } }
        }
      }
    });
  }

  // comparativo de aceitação média por escola (barras horizontais)
  function renderEscolas(escolas) {
    const c = ctx('chartEscolas'); if (!ready() || !c) return;
    destroy('escolas');
    if (!escolas || !escolas.length) return;
    const top = escolas.slice(0, 12);
    const labels = top.map(e => e.nome);
    const vals = top.map(e => +(e.aceit || 0).toFixed(1));
    const muted = cssVar('--muted', '#555');
    const colors = vals.map(v => v >= 85 ? '#047857' : '#b45309');
    charts.escolas = new window.Chart(c, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Aceitação média', data: vals, backgroundColor: colors }] },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        scales: { x: { min: 0, max: 100, ticks: { color: muted } }, y: { ticks: { color: muted, font: { size: 10 } } } },
        plugins: { legend: { display: false } }
      }
    });
  }

  window.PAEGraficos = { renderDistribuicao, renderTendencia, renderEscolas };
})();
