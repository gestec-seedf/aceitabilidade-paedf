// ===== Painel de Inteligência =====
// Consome a API pública de registro.js (window.PAEReg) — não duplica lógica de domínio.
// Bloco A: diagnóstico do teste atual (rascunho em edição).
// Bloco B: histórico de testes salvos no aparelho (rankings, tendências, escolas).
(function () {
  const section = document.getElementById('inteligencia');
  if (!section) return;

  const elAtual = document.getElementById('intelAtual');
  const elHist  = document.getElementById('intelHistorico');
  const msgBox  = document.getElementById('intelMsg');

  const Z95 = 1.96; // nível de confiança 95%

  // ---------- utilitários ----------
  function api() { return window.PAEReg; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmt(p) { return (api() ? api().fmt(p) : p.toFixed(1) + '%'); }
  function fmtPP(p) { return p.toFixed(1).replace('.', ',') + ' pp'; }
  function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
  function showMsg(text, type) {
    if (!msgBox) return;
    msgBox.textContent = text;
    msgBox.style.color = type === 'err' ? 'var(--red)' : (type === 'ok' ? 'var(--ok)' : 'var(--muted)');
    if (text) setTimeout(() => { if (msgBox.textContent === text) msgBox.textContent = ''; }, 4000);
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  function bar(label, value, max, cls, sub, cut) {
    const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return `<div class="bar">
      <div class="bar__top"><span>${esc(label)}</span><span>${sub != null ? esc(sub) : ''}</span></div>
      <div class="bartrack${cut ? ' bartrack--cut85' : ''}"><div class="bartrack__fill ${cls || ''}" style="width:${w.toFixed(1)}%"></div></div>
    </div>`;
  }

  // margem de erro (proporção) com correção para população finita
  function marginOfError(pPct, n, N) {
    if (!(n > 0)) return null;
    const p = Math.min(1, Math.max(0, pPct / 100));
    let e = Z95 * Math.sqrt((p * (1 - p)) / n);
    if (N > n && N > 1) e *= Math.sqrt((N - n) / (N - 1)); // correção finita
    return e * 100; // em pontos percentuais
  }

  // ---------- Bloco A: diagnóstico do teste atual ----------
  function renderAtual() {
    const A = api();
    if (!A) { elAtual.innerHTML = '<p class="muted">Módulo de registro indisponível.</p>'; return; }
    const { header, turmas } = A.readAll();
    const tot = A.consolidate(turmas);

    if (tot.partic === 0) {
      elAtual.innerHTML = `<div class="result warn">
        <b>Sem dados para analisar.</b>
        <div class="meta">Preencha a <a href="#" data-view="registro">Planilha de Resultados</a> (turmas e escala hedônica) para ver o diagnóstico do teste atual.</div>
      </div>`;
      return;
    }

    const passou = tot.passou;
    const ssl = ((tot.aceitos - tot.rejeitados) / tot.partic) * 100; // score sensorial líquido
    const sslLabel = ssl >= 50 ? 'Excelente' : ssl >= 20 ? 'Bom' : ssl >= 0 ? 'Neutro' : 'Negativo';
    const sslCls = ssl >= 20 ? 'ok' : ssl >= 0 ? 'warn' : 'fail';

    const moe = marginOfError(tot.aceitacao, tot.partic, tot.matric);
    const lo = moe != null ? tot.aceitacao - moe : null;
    const hi = moe != null ? tot.aceitacao + moe : null;
    let robustez, robCls;
    if (moe == null) { robustez = 'Amostra insuficiente para estimar margem.'; robCls = 'warn'; }
    else if (lo >= 85) { robustez = 'Aprovação robusta — mesmo no pior caso da margem fica ≥ 85%.'; robCls = 'ok'; }
    else if (hi < 85) { robustez = 'Reprovação consistente — mesmo no melhor caso da margem fica < 85%.'; robCls = 'fail'; }
    else { robustez = 'Zona de incerteza — o intervalo cruza o corte de 85%. Resultado inconclusivo.'; robCls = 'warn'; }
    const amostraBaixa = tot.partic < 100;

    // adesão × aceitação
    const adBoa = tot.adesaoMedia >= 50;
    let quad, quadCls;
    if (passou && adBoa) { quad = 'Prato consolidado — boa adesão e boa aceitação. Pode seguir no cardápio.'; quadCls = 'ok'; }
    else if (!passou && adBoa) { quad = 'Muito servido, porém rejeitado — prioridade de reformulação.'; quadCls = 'fail'; }
    else if (passou && !adBoa) { quad = 'Bem avaliado, mas por poucos — repita com mais participantes para confirmar.'; quadCls = 'warn'; }
    else { quad = 'Baixa adesão e rejeição — reavalie a preparação e a divulgação.'; quadCls = 'fail'; }

    // recomendação acionável
    let rec, recCls;
    if (passou && robCls === 'ok') { rec = '✅ Aprovar para o cardápio.'; recCls = 'ok'; }
    else if (passou) { rec = '🔁 Acima de 85%, mas a amostra ainda é incerta — repita/amplie o teste para confirmar.'; recCls = 'warn'; }
    else if (robCls === 'fail') { rec = '🛠️ Reformular a preparação — rejeição consistente abaixo de 85%.'; recCls = 'fail'; }
    else { rec = '🔁 Abaixo de 85%, porém inconclusivo — repita o teste antes de decidir.'; recCls = 'warn'; }
    if (amostraBaixa) rec += ' (Amostra abaixo de 100 — mínimo recomendado pela NT 3/2022.)';

    // turmas que puxam a média (com participantes > 0, aceitação < 85, piores primeiro)
    const fracas = turmas
      .map(t => ({ nome: t.nome, ...A.calcTurma(t) }))
      .filter(t => t.partic > 0 && t.aceitacao < 85)
      .sort((a, b) => a.aceitacao - b.aceitacao);

    // distribuição da escala
    const dist = [
      ['😍 Adorei', tot.adorei, 'ok'],
      ['🙂 Gostei', tot.gostei, 'ok'],
      ['😐 Indiferente', tot.indif, 'neutral'],
      ['🙁 Não gostei', tot.naogostei, 'fail'],
      ['😖 Detestei', tot.detestei, 'fail']
    ];

    const ad = A.classifyAdesao(tot.adesaoMedia);

    elAtual.innerHTML = `
      <div class="resumo__big ${passou ? 'ok' : 'fail'}">
        <div class="resumo__pct">${fmt(tot.aceitacao)}</div>
        <div class="resumo__lbl">${passou ? '✅ Aceita' : '❌ Não aceita'} (critério ≥ 85%) · ${esc(header.preparacao || 'preparação')}</div>
      </div>

      <div class="resumo__grid">
        <div><b>${tot.partic}</b><span>participantes</span></div>
        <div><b>${tot.aceitos}</b><span>aceitaram (A+G)</span></div>
        <div><b>${tot.rejeitados}</b><span>rejeitaram (NG+D)</span></div>
        <div><b>${tot.indif}</b><span>indiferentes</span></div>
      </div>

      <div class="result ${sslCls}">
        <b>Score sensorial líquido: ${ssl >= 0 ? '+' : ''}${ssl.toFixed(0)} · ${sslLabel}</b>
        <div class="meta">(Adorei+Gostei − Não gostei+Detestei) ÷ participantes. Varia de −100 a +100; mede o saldo entre quem amou e quem detestou.</div>
      </div>

      <h4 class="intel-h">Distribuição das respostas</h4>
      <div class="intel-bars">
        ${dist.map(([l, n, c]) => bar(l, n, tot.partic, c, `${n} · ${fmt((n / tot.partic) * 100)}`)).join('')}
      </div>

      <div class="result ${robCls}">
        <b>Confiabilidade da amostra</b>
        <div class="meta">${moe != null
          ? `Aceitação ${fmt(tot.aceitacao)} ± ${fmtPP(moe)} (95%). Intervalo: ${fmt(Math.max(0, lo))} a ${fmt(Math.min(100, hi))}.`
          : 'Sem participantes suficientes para estimar.'}</div>
        <div class="meta">${esc(robustez)}</div>
      </div>

      <div class="result ${quadCls}">
        <b>Adesão × Aceitação</b>
        <div class="meta">Adesão média ${fmt(tot.adesaoMedia)} (${ad.txt}) · Aceitação ${fmt(tot.aceitacao)}.</div>
        <div class="meta">${esc(quad)}</div>
      </div>

      ${fracas.length ? `
      <h4 class="intel-h">Turmas que puxam a média para baixo</h4>
      <div class="intel-bars">
        ${fracas.slice(0, 6).map(t => bar(t.nome || '(sem nome)', t.aceitacao, 100, 'fail', `${fmt(t.aceitacao)} · ${t.partic} part.`)).join('')}
      </div>` : `<p class="muted">Nenhuma turma com aceitação abaixo de 85%. 👏</p>`}

      <div class="result ${recCls}">
        <b>Recomendação</b>
        <div class="meta">${esc(rec)}</div>
      </div>

      <div class="actions" style="margin-top:.6rem">
        <a class="btn btn--ghost" href="#" data-view="registro">✏️ Editar planilha</a>
      </div>
    `;
  }

  // agrega uma lista de snapshots em métricas/coleções (puro — sem DOM).
  // Reutilizado pelo painel (renderHistorico) e pelos relatórios (relatorios.js).
  function aggregate(hist) {
    hist = Array.isArray(hist) ? hist : [];
    const aprovados = hist.filter(h => h.passou).length;
    const ord = [...hist].sort((a, b) => b.aceitacao - a.aceitacao);

    const reformMap = new Map();
    hist.filter(h => !h.passou).forEach(h => {
      const k = (h.header.preparacao || '(sem nome)').trim().toLowerCase();
      if (!reformMap.has(k) || h.aceitacao < reformMap.get(k).aceitacao) reformMap.set(k, h);
    });

    const escMap = new Map();
    hist.forEach(h => {
      const k = (h.header.escola || '(sem escola)').trim();
      if (!escMap.has(k)) escMap.set(k, []);
      escMap.get(k).push(h);
    });
    const escolas = [...escMap.entries()].map(([nome, arr]) => ({
      nome, n: arr.length,
      aceit: avg(arr.map(h => h.aceitacao)),
      aprov: (arr.filter(h => h.passou).length / arr.length) * 100
    })).sort((a, b) => b.aceit - a.aceit);

    return {
      count: hist.length,
      aprovados,
      pctAprov: hist.length ? (aprovados / hist.length) * 100 : 0,
      aceitMedia: avg(hist.map(h => h.aceitacao)),
      adesaoMedia: avg(hist.map(h => h.adesaoMedia || 0)),
      ord,
      top: ord.slice(0, 5),
      bottom: ord.slice(-5).reverse(),
      reform: [...reformMap.values()].sort((a, b) => a.aceitacao - b.aceitacao),
      escolas,
      evol: [...hist].filter(h => h.header.data)
        .sort((a, b) => String(a.header.data).localeCompare(String(b.header.data)))
    };
  }

  // fonte de dados ativa: local (este aparelho) ou nuvem (todas as escolas)
  function activeHistory() {
    if (window.PAENuvem) return window.PAENuvem.getActiveHistory();
    return api() ? api().getHistory() : [];
  }
  function isNuvem() { return window.PAENuvem && window.PAENuvem.getMode() === 'nuvem'; }

  // ---------- Bloco B: histórico ----------
  function renderHistorico() {
    const hist = activeHistory();

    if (!hist.length) {
      elHist.innerHTML = isNuvem()
        ? `<div class="result warn"><b>Nenhum teste na nuvem ainda.</b><div class="meta">Assim que as nutricionistas salvarem testes com a sincronização ativa, eles aparecerão aqui.</div></div>`
        : `<div class="result warn"><b>Nenhum teste salvo ainda.</b><div class="meta">Na <a href="#" data-view="registro">Planilha de Resultados</a>, preencha um teste e toque em <b>💾 Salvar no histórico</b>. Os testes ficam guardados neste aparelho.</div></div>`;
      return;
    }

    const fonteBadge = isNuvem()
      ? `<div class="result ok" style="margin-bottom:.5rem"><b>☁️ Dados da nuvem</b><div class="meta">${hist.length} teste(s) consolidado(s) de todas as escolas que sincronizam.</div></div>`
      : '';

    const ag = aggregate(hist);
    const pctAprov = ag.pctAprov, aceitMedia = ag.aceitMedia, adesaoMedia = ag.adesaoMedia;
    const top = ag.top, bottom = ag.bottom, reform = ag.reform, escolas = ag.escolas, evol = ag.evol;

    function rankRow(h) {
      const data = h.header.data ? esc(h.header.data.split('-').reverse().join('/')) : '—';
      return `<tr>
        <td>${esc(h.header.preparacao || '(sem nome)')}<br><small style="color:var(--muted)">${esc(h.header.escola || '')} · ${data}</small></td>
        <td>${fmt(h.aceitacao)}</td>
        <td class="${h.passou ? 'ok' : 'fail'}">${h.passou ? '✅' : '❌'}</td>
      </tr>`;
    }

    elHist.innerHTML = `
      ${fonteBadge}
      <div class="resumo__grid">
        <div><b>${hist.length}</b><span>testes salvos</span></div>
        <div><b>${fmt(pctAprov)}</b><span>aprovados (≥85%)</span></div>
        <div><b>${fmt(aceitMedia)}</b><span>aceitação média</span></div>
        <div><b>${fmt(adesaoMedia)}</b><span>adesão média</span></div>
      </div>

      <h4 class="intel-h">🏆 Mais aceitas</h4>
      <table class="resumo__tbl"><thead><tr><th>Preparação</th><th>Aceit.</th><th></th></tr></thead>
        <tbody>${top.map(rankRow).join('')}</tbody></table>

      <h4 class="intel-h">⚠️ Menos aceitas</h4>
      <table class="resumo__tbl"><thead><tr><th>Preparação</th><th>Aceit.</th><th></th></tr></thead>
        <tbody>${bottom.map(rankRow).join('')}</tbody></table>

      ${reform.length ? `
      <h4 class="intel-h">🛠️ Precisam de reformulação (&lt; 85%)</h4>
      <ul class="ranks">
        ${reform.slice(0, 8).map(h => `<li class="rank rank--baixo">
          <span>${esc(h.header.preparacao || '(sem nome)')} <small>· ${esc(h.header.escola || '')}</small></span>
          <b>${fmt(h.aceitacao)}</b></li>`).join('')}
      </ul>` : `<p class="muted">Nenhuma preparação reprovada no histórico. 👏</p>`}

      <h4 class="intel-h">📈 Evolução por data</h4>
      ${evol.length ? `<div class="intel-bars">
        ${evol.map(h => bar(
          `${esc(h.header.data.split('-').reverse().join('/'))} · ${esc(h.header.preparacao || '')}`,
          h.aceitacao, 100, h.passou ? 'ok' : 'fail', fmt(h.aceitacao), true
        )).join('')}
        <p class="muted" style="font-size:.78rem">Linha de corte: 85%.</p>
      </div>` : `<p class="muted">Sem datas registradas nos testes salvos.</p>`}

      <h4 class="intel-h">🏫 Por escola</h4>
      <table class="resumo__tbl"><thead><tr><th>Escola</th><th>Testes</th><th>Aceit. média</th></tr></thead>
        <tbody>${escolas.map(e => `<tr>
          <td>${esc(e.nome)}</td><td>${e.n}</td><td>${fmt(e.aceit)}</td>
        </tr>`).join('')}</tbody></table>

      <h4 class="intel-h">🗂️ Testes salvos</h4>
      <ul class="intel-list">
        ${hist.slice().reverse().map(h => `<li>
          <div>
            <b>${esc(h.header.preparacao || '(sem nome)')}</b>
            <small>${esc(h.header.escola || '')} · ${h.header.data ? esc(h.header.data.split('-').reverse().join('/')) : '—'} · ${fmt(h.aceitacao)} ${h.passou ? '✅' : '❌'}</small>
          </div>
          <button type="button" class="btn btn--small btn--ghost" data-del-snap="${esc(h.id)}">Remover</button>
        </li>`).join('')}
      </ul>
    `;
  }

  // ---------- gráficos (delega para graficos.js / Chart.js) ----------
  function renderCharts() {
    if (!window.PAEGraficos) return;
    const A = api();
    if (A) {
      const { turmas } = A.readAll();
      const tot = A.consolidate(turmas);
      if (tot.partic > 0) window.PAEGraficos.renderDistribuicao(tot);
    }
    const ag = aggregate(activeHistory());
    window.PAEGraficos.renderTendencia(ag.evol || []);
    window.PAEGraficos.renderEscolas(ag.escolas || []);
  }

  // ---------- render geral (BI aberto — sem gate de senha) ----------
  function render() {
    try { renderAtual(); } catch (e) { elAtual.innerHTML = '<p class="muted">Erro ao montar diagnóstico.</p>'; }
    try { renderHistorico(); } catch (e) { elHist.innerHTML = '<p class="muted">Erro ao montar histórico.</p>'; }
    try { renderCharts(); } catch (e) {}
  }

  // ---------- gerência do histórico ----------
  const exportBtn = document.getElementById('exportHist');
  const importBtn = document.getElementById('importHistBtn');
  const importFile = document.getElementById('importHistFile');
  const clearBtn = document.getElementById('clearHist');

  if (exportBtn) exportBtn.addEventListener('click', () => {
    const hist = api() ? api().getHistory() : [];
    if (!hist.length) { showMsg('Nada para exportar.', 'err'); return; }
    const blob = new Blob([JSON.stringify(hist, null, 2)], { type: 'application/json' });
    const data = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `aceitabilidade_historico_${data}.json`);
    showMsg('Histórico exportado.', 'ok');
  });

  if (importBtn && importFile) {
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', () => {
      const file = importFile.files && importFile.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const incoming = JSON.parse(reader.result);
          if (!Array.isArray(incoming)) throw new Error('formato');
          const cur = api().getHistory();
          const byId = new Map(cur.map(h => [h.id, h]));
          let novos = 0;
          incoming.forEach(h => {
            if (h && h.id && h.totals && h.header) {
              if (!byId.has(h.id)) novos++;
              byId.set(h.id, h); // dedupe/atualiza por id
            }
          });
          api().setHistory([...byId.values()]);
          render();
          showMsg(`Importado: ${novos} novo(s) teste(s).`, 'ok');
        } catch (e) {
          showMsg('Arquivo inválido — esperado um JSON exportado por este app.', 'err');
        } finally { importFile.value = ''; }
      };
      reader.readAsText(file);
    });
  }

  if (clearBtn) clearBtn.addEventListener('click', () => {
    if (!api().getHistory().length) { showMsg('Histórico já está vazio.', 'err'); return; }
    if (!confirm('Apagar TODOS os testes salvos no histórico? Esta ação não pode ser desfeita.')) return;
    api().setHistory([]);
    render();
    showMsg('Histórico apagado.', 'ok');
  });

  // remover um teste (delegação)
  elHist.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-del-snap]');
    if (!btn) return;
    if (!confirm('Remover este teste do histórico?')) return;
    const id = btn.getAttribute('data-del-snap');
    api().setHistory(api().getHistory().filter(h => h.id !== id));
    render();
    showMsg('Teste removido.', 'ok');
  });

  // ---------- API pública (consumida por relatorios.js e supabase.js) ----------
  window.PAEIntel = { aggregate, fmt, esc, render };

  // ---------- re-render sempre que a tela ficar visível ----------
  const obs = new MutationObserver(() => { if (!section.hidden) render(); });
  obs.observe(section, { attributes: true, attributeFilter: ['hidden'] });
  if (!section.hidden) render();
})();
