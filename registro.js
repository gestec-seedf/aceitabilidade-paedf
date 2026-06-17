// ===== Registro de Resultados =====
(function () {
  const STORAGE_KEY = 'aceitabilidade_registro_v1';
  const $ = s => document.querySelector(s);
  const list = $('#turmasList');
  const tmpl = $('#tmplTurma');
  const cab  = $('#formCabecalho');
  const resumoBox = $('#resumo');
  const msgBox = $('#actionMsg');

  if (!list || !tmpl) return;

  function showMsg(text, type) {
    msgBox.textContent = text;
    msgBox.style.color = type === 'err' ? 'var(--red)' : (type === 'ok' ? 'var(--ok)' : 'var(--muted)');
    if (text) setTimeout(() => { if (msgBox.textContent === text) msgBox.textContent = ''; }, 4000);
  }

  function int(v) { const n = parseInt(v, 10); return isNaN(n) ? 0 : Math.max(0, n); }
  function pct(num, den) { return den > 0 ? (num / den) * 100 : 0; }
  function fmt(p) { return p.toFixed(1).replace('.', ',') + '%'; }

  function classifyAdesao(p) {
    if (p > 70) return { txt: 'Alta', cls: 'rank--alto' };
    if (p >= 50) return { txt: 'Média', cls: 'rank--medio' };
    if (p >= 30) return { txt: 'Baixa', cls: 'rank--baixo' };
    return { txt: 'Muito baixa', cls: 'rank--mb' };
  }

  // média das adesões de cada turma (considera apenas turmas com presentes > 0)
  function adesaoMediaTurmas(turmas) {
    const valid = turmas.filter(t => t.pres > 0);
    if (valid.length === 0) return { media: 0, qtd: 0 };
    const soma = valid.reduce((acc, t) => acc + calcTurma(t).adesao, 0);
    return { media: soma / valid.length, qtd: valid.length };
  }

  function readTurma(el) {
    const get = sel => el.querySelector(sel);
    const getN = name => int(get(`[data-f="${name}"]`).value);
    return {
      nome: get('.turma__nome').value.trim(),
      matric: getN('matric'),
      pres: getN('pres'),
      adorei: getN('adorei'),
      gostei: getN('gostei'),
      indif: getN('indif'),
      naogostei: getN('naogostei'),
      detestei: getN('detestei')
    };
  }

  function writeTurma(el, t) {
    el.querySelector('.turma__nome').value = t.nome || '';
    ['matric','pres','adorei','gostei','indif','naogostei','detestei'].forEach(k => {
      el.querySelector(`[data-f="${k}"]`).value = t[k] ?? (k==='matric' || k==='pres' ? '' : 0);
    });
  }

  function calcTurma(t) {
    const partic = t.adorei + t.gostei + t.indif + t.naogostei + t.detestei;
    const adesao = pct(partic, t.pres);
    const aceitos = t.adorei + t.gostei;
    const aceitacao = pct(aceitos, partic);
    return { partic, adesao, aceitos, aceitacao };
  }

  function renderTurmaResumo(el, t) {
    const c = calcTurma(t);
    const box = el.querySelector('[data-turma-resumo]');
    if (c.partic === 0 && t.matric === 0 && t.pres === 0) { box.innerHTML = ''; return; }
    const passou = c.aceitacao >= 85;
    box.innerHTML = `
      <div class="turma__metrics">
        <span><b>Participantes:</b> ${c.partic}</span>
        <span><b>Adesão:</b> ${fmt(c.adesao)}</span>
        <span class="${passou ? 'ok' : 'fail'}"><b>Aceitação:</b> ${fmt(c.aceitacao)} ${passou ? '✅' : '❌'}</span>
      </div>
    `;
  }

  const HED_FIELDS = ['adorei','gostei','indif','naogostei','detestei'];

  function enforceMax(node, changedField) {
    const presInput = node.querySelector('[data-f="pres"]');
    const pres = int(presInput.value);
    const inputs = HED_FIELDS.map(f => node.querySelector(`[data-f="${f}"]`));
    const values = inputs.map(i => int(i.value));
    const sum = values.reduce((a, b) => a + b, 0);
    const warnBox = node.querySelector('[data-warn]');

    // sem presentes informados → desabilita escala
    inputs.forEach(i => {
      const lbl = i.closest('.hf');
      if (pres <= 0) lbl.classList.add('is-disabled'); else lbl.classList.remove('is-disabled');
    });
    if (pres <= 0) {
      warnBox.hidden = false;
      warnBox.textContent = '⚠️ Informe primeiro o número de presentes para liberar a escala hedônica.';
      return;
    }

    // soma ultrapassou → reduz o campo recém-alterado (ou o último não-zero)
    if (sum > pres) {
      const idx = changedField ? HED_FIELDS.indexOf(changedField) : -1;
      const excess = sum - pres;
      if (idx >= 0) {
        const novo = Math.max(0, values[idx] - excess);
        inputs[idx].value = novo;
      }
      warnBox.hidden = false;
      const total = inputs.map(i => int(i.value)).reduce((a, b) => a + b, 0);
      warnBox.textContent = `⚠️ A soma das respostas (${total + excess}) ultrapassou o número de presentes (${pres}). O valor foi limitado em ${pres}.`;
      return;
    }

    // perto do limite → aviso suave
    const restante = pres - sum;
    if (restante === 0) {
      warnBox.hidden = false;
      warnBox.textContent = `✅ Todos os ${pres} presentes foram contabilizados.`;
      warnBox.style.background = ''; warnBox.style.color = ''; warnBox.style.borderLeftColor = '';
    } else if (restante <= 5) {
      warnBox.hidden = false;
      warnBox.textContent = `Restam ${restante} presente(s) para contabilizar.`;
    } else {
      warnBox.hidden = true;
    }
  }

  function addTurma(data) {
    const node = tmpl.content.firstElementChild.cloneNode(true);
    list.appendChild(node);
    if (data) writeTurma(node, data);
    node.querySelector('.turma__del').addEventListener('click', () => {
      if (confirm('Remover esta turma?')) { node.remove(); refreshAll(); saveDraft(); }
    });
    // detecta qual campo foi alterado para aplicar o cap
    HED_FIELDS.forEach(f => {
      const inp = node.querySelector(`[data-f="${f}"]`);
      inp.addEventListener('input', () => enforceMax(node, f));
    });
    node.querySelector('[data-f="pres"]').addEventListener('input', () => enforceMax(node));
    node.addEventListener('input', () => {
      renderTurmaResumo(node, readTurma(node));
      renderResumo();
      saveDraftDebounced();
    });
    enforceMax(node);
    renderTurmaResumo(node, readTurma(node));
    return node;
  }

  function readAll() {
    const data = new FormData(cab);
    const header = {};
    for (const [k, v] of data.entries()) header[k] = v;
    const turmas = [...list.querySelectorAll('[data-turma]')].map(readTurma);
    return { header, turmas };
  }

  function renderResumo() {
    const { turmas } = readAll();
    const tot = turmas.reduce((a, t) => {
      const c = calcTurma(t);
      a.matric += t.matric;
      a.pres += t.pres;
      a.partic += c.partic;
      a.adorei += t.adorei;
      a.gostei += t.gostei;
      a.indif += t.indif;
      a.naogostei += t.naogostei;
      a.detestei += t.detestei;
      return a;
    }, {matric:0,pres:0,partic:0,adorei:0,gostei:0,indif:0,naogostei:0,detestei:0});

    if (tot.partic === 0 && tot.pres === 0 && tot.matric === 0) {
      resumoBox.innerHTML = '<p class="muted">Adicione uma turma e preencha os dados para ver o resumo.</p>';
      return;
    }
    const adM = adesaoMediaTurmas(turmas);
    const adesaoMedia = adM.media;
    const aceitos = tot.adorei + tot.gostei;
    const aceitacao = pct(aceitos, tot.partic);
    const ad = classifyAdesao(adesaoMedia);
    const passou = aceitacao >= 85;

    resumoBox.innerHTML = `
      <div class="resumo__big ${passou ? 'ok' : 'fail'}">
        <div class="resumo__pct">${fmt(aceitacao)}</div>
        <div class="resumo__lbl">${passou ? '✅ Aceita' : '❌ Não aceita'} (critério ≥ 85%)</div>
      </div>
      <div class="resumo__grid">
        <div><b>${turmas.length}</b><span>turma(s)</span></div>
        <div><b>${tot.matric}</b><span>matriculados</span></div>
        <div><b>${tot.pres}</b><span>presentes</span></div>
        <div><b>${tot.partic}</b><span>participantes</span></div>
      </div>
      <div class="resumo__rank rank ${ad.cls}">
        <span>Índice de adesão (média de ${adM.qtd} turma${adM.qtd === 1 ? '' : 's'})</span>
        <b>${fmt(adesaoMedia)} · ${ad.txt}</b>
      </div>
      <table class="resumo__tbl">
        <thead><tr><th>Escala Hedônica</th><th>N</th><th>%</th></tr></thead>
        <tbody>
          <tr><td>Adorei</td><td>${tot.adorei}</td><td>${fmt(pct(tot.adorei, tot.partic))}</td></tr>
          <tr><td>Gostei</td><td>${tot.gostei}</td><td>${fmt(pct(tot.gostei, tot.partic))}</td></tr>
          <tr><td>Indiferente</td><td>${tot.indif}</td><td>${fmt(pct(tot.indif, tot.partic))}</td></tr>
          <tr><td>Não gostei</td><td>${tot.naogostei}</td><td>${fmt(pct(tot.naogostei, tot.partic))}</td></tr>
          <tr><td>Detestei</td><td>${tot.detestei}</td><td>${fmt(pct(tot.detestei, tot.partic))}</td></tr>
          <tr class="tot"><td>TOTAL</td><td>${tot.partic}</td><td>100,0%</td></tr>
          <tr class="hl"><td>Adorei + Gostei</td><td>${aceitos}</td><td><b>${fmt(aceitacao)}</b></td></tr>
        </tbody>
      </table>
    `;
  }

  function refreshAll() {
    [...list.querySelectorAll('[data-turma]')].forEach(el => renderTurmaResumo(el, readTurma(el)));
    renderResumo();
  }

  // ===== persistência =====
  let saveTO;
  function saveDraftDebounced() { clearTimeout(saveTO); saveTO = setTimeout(saveDraft, 400); }
  function saveDraft() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(readAll())); } catch (e) {}
  }
  function loadDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const { header, turmas } = JSON.parse(raw);
      Object.entries(header || {}).forEach(([k, v]) => {
        const f = cab.querySelector(`[name="${k}"]`);
        if (f) f.value = v;
      });
      (turmas || []).forEach(t => addTurma(t));
      return true;
    } catch (e) { return false; }
  }

  // ===== ações =====
  $('#addTurma').addEventListener('click', () => { addTurma(); saveDraft(); });
  cab.addEventListener('input', () => { saveDraftDebounced(); });

  $('#clearAll').addEventListener('click', () => {
    if (!confirm('Apagar todos os dados? Esta ação não pode ser desfeita.')) return;
    cab.reset();
    list.innerHTML = '';
    localStorage.removeItem(STORAGE_KEY);
    renderResumo();
    addTurma();
    showMsg('Dados apagados.', 'ok');
  });

  // ===== exportações =====
  function fileName(ext) {
    const { header } = readAll();
    const esc = (header.escola || 'escola').replace(/[^a-zA-Z0-9_-]+/g, '_');
    const prep = (header.preparacao || 'preparacao').replace(/[^a-zA-Z0-9_-]+/g, '_');
    const data = header.data || new Date().toISOString().slice(0,10);
    return `aceitabilidade_${esc}_${prep}_${data}.${ext}`;
  }

  function buildResumoText() {
    const { header, turmas } = readAll();
    const tot = turmas.reduce((a, t) => {
      const c = calcTurma(t);
      a.matric += t.matric; a.pres += t.pres; a.partic += c.partic;
      a.adorei += t.adorei; a.gostei += t.gostei; a.indif += t.indif;
      a.naogostei += t.naogostei; a.detestei += t.detestei;
      return a;
    }, {matric:0,pres:0,partic:0,adorei:0,gostei:0,indif:0,naogostei:0,detestei:0});
    const aceitos = tot.adorei + tot.gostei;
    const aceitacao = pct(aceitos, tot.partic);
    const adM = adesaoMediaTurmas(turmas);
    const ad = classifyAdesao(adM.media);
    const passou = aceitacao >= 85;
    const lines = [
      `TESTE DE ACEITABILIDADE — Resultados`,
      `Regional: ${header.regional || '—'}`,
      `Escola: ${header.escola || '—'}`,
      `Programa: ${header.programa || '—'}`,
      `Preparação: ${header.preparacao || '—'}`,
      `Data: ${header.data || '—'}`,
      `Aplicador(es): ${header.aplicador || '—'}`,
      ``,
      `Turmas: ${turmas.length}`,
      `Matriculados: ${tot.matric}  ·  Presentes: ${tot.pres}  ·  Participantes: ${tot.partic}`,
      ``,
      `RESPOSTAS:`,
      `Adorei:      ${tot.adorei}  (${fmt(pct(tot.adorei,tot.partic))})`,
      `Gostei:      ${tot.gostei}  (${fmt(pct(tot.gostei,tot.partic))})`,
      `Indiferente: ${tot.indif}  (${fmt(pct(tot.indif,tot.partic))})`,
      `Não gostei:  ${tot.naogostei}  (${fmt(pct(tot.naogostei,tot.partic))})`,
      `Detestei:    ${tot.detestei}  (${fmt(pct(tot.detestei,tot.partic))})`,
      ``,
      `Aceitação (Adorei + Gostei): ${aceitos} de ${tot.partic} = ${fmt(aceitacao)}`,
      `${passou ? '✅ ACEITA (≥ 85%)' : '❌ NÃO ACEITA (< 85%)'}`,
      ``,
      `Índice de adesão (média de ${adM.qtd} turma${adM.qtd === 1 ? '' : 's'}): ${fmt(adM.media)} — ${ad.txt}`
    ];
    return lines.join('\n');
  }

  // --- Copiar resumo ---
  $('#copyResumo').addEventListener('click', async () => {
    const text = buildResumoText();
    try {
      await navigator.clipboard.writeText(text);
      showMsg('Resumo copiado para a área de transferência.', 'ok');
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); showMsg('Resumo copiado.', 'ok'); }
      catch { showMsg('Não foi possível copiar — selecione e copie manualmente.', 'err'); }
      finally { ta.remove(); }
    }
  });

  // --- CSV ---
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  $('#exportCsv').addEventListener('click', () => {
    const { header, turmas } = readAll();
    const rows = [];
    rows.push(['Regional', header.regional || '']);
    rows.push(['Escola', header.escola || '']);
    rows.push(['Programa', header.programa || '']);
    rows.push(['Preparação', header.preparacao || '']);
    rows.push(['Data', header.data || '']);
    rows.push(['Aplicador(es)', header.aplicador || '']);
    rows.push([]);
    rows.push(['Turma','Matriculados','Presentes','Adorei','Gostei','Indiferente','Não gostei','Detestei','Participantes','% Adesão','% Aceitação (A+G)']);
    turmas.forEach(t => {
      const c = calcTurma(t);
      rows.push([t.nome, t.matric, t.pres, t.adorei, t.gostei, t.indif, t.naogostei, t.detestei, c.partic, c.adesao.toFixed(1), c.aceitacao.toFixed(1)]);
    });
    rows.push([]);
    const tot = turmas.reduce((a, t) => {
      const c = calcTurma(t);
      a.matric+=t.matric; a.pres+=t.pres; a.partic+=c.partic;
      a.adorei+=t.adorei; a.gostei+=t.gostei; a.indif+=t.indif;
      a.naogostei+=t.naogostei; a.detestei+=t.detestei;
      return a;
    }, {matric:0,pres:0,partic:0,adorei:0,gostei:0,indif:0,naogostei:0,detestei:0});
    const aceitos = tot.adorei + tot.gostei;
    const aceitacao = pct(aceitos, tot.partic);
    rows.push(['TOTAL', tot.matric, tot.pres, tot.adorei, tot.gostei, tot.indif, tot.naogostei, tot.detestei, tot.partic, pct(tot.partic, tot.pres).toFixed(1), aceitacao.toFixed(1)]);
    rows.push([]);
    rows.push(['Resultado: Adorei + Gostei', aceitos, aceitacao.toFixed(1) + '%']);
    rows.push(['Critério PNAE', '≥ 85%', aceitacao >= 85 ? 'ACEITA' : 'NÃO ACEITA']);

    const csv = '﻿' + rows.map(r => r.map(c => {
      const s = String(c ?? '');
      return /[;",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
    }).join(';')).join('\r\n');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileName('csv'));
    showMsg('CSV gerado.', 'ok');
  });

  // --- XLSX (no formato da planilha original) ---
  $('#exportXlsx').addEventListener('click', () => {
    if (typeof XLSX === 'undefined') { showMsg('Biblioteca de Excel ainda carregando. Tente em 1s.', 'err'); return; }
    const { header, turmas } = readAll();
    const wb = XLSX.utils.book_new();

    // --- Aba 1: Aceitação por Turmas (uma tabela por turma) ---
    const aoa1 = [];
    aoa1.push([`REGIONAL DE ENSINO: ${header.regional || ''}`]);
    aoa1.push([`ESCOLA: ${header.escola || ''}`]);
    aoa1.push([`PROGRAMA/MODALIDADE: ${header.programa || ''}`]);
    aoa1.push([`PREPARAÇÃO: ${header.preparacao || ''}`, '', '', `DATA: ${header.data || ''}`]);
    aoa1.push([]);
    turmas.forEach(t => {
      const c = calcTurma(t);
      aoa1.push([`Turma: ${t.nome || ''}`]);
      aoa1.push(['Escala Hedônica', 'Respostas dos Participantes', '']);
      aoa1.push(['', '(N)', '(%)']);
      const opts = [
        ['Adorei', t.adorei], ['Gostei', t.gostei], ['Indiferente', t.indif],
        ['Não gostei', t.naogostei], ['Detestei', t.detestei]
      ];
      opts.forEach(([lbl, n]) => aoa1.push([lbl, n, c.partic ? +((n*100/c.partic).toFixed(1)) : 0]));
      aoa1.push(['TOTAL', c.partic, c.partic ? 100 : 0]);
      aoa1.push(['% Aceitação (Adorei + Gostei)', c.aceitos, +c.aceitacao.toFixed(1)]);
      aoa1.push([]);
    });
    const ws1 = XLSX.utils.aoa_to_sheet(aoa1);
    ws1['!cols'] = [{wch:32},{wch:18},{wch:12}];
    XLSX.utils.book_append_sheet(wb, ws1, 'Aceitação por Turmas');

    // --- Aba 2: Aceitação e Adesão por Turmas ---
    const aoa2 = [];
    aoa2.push([`REGIONAL DE ENSINO: ${header.regional || ''}`]);
    aoa2.push([`ESCOLA: ${header.escola || ''}`]);
    aoa2.push([`PROGRAMA/MODALIDADE: ${header.programa || ''}`]);
    aoa2.push([`PREPARAÇÃO: ${header.preparacao || ''}`, '', `DATA: ${header.data || ''}`]);
    aoa2.push([]);
    aoa2.push(['Turma','Matriculados','Presentes','Participantes','% Adesão','Adorei','Gostei','Indiferente','Não gostei','Detestei','% Aceitação']);
    const tot = {matric:0,pres:0,partic:0,adorei:0,gostei:0,indif:0,naogostei:0,detestei:0};
    turmas.forEach(t => {
      const c = calcTurma(t);
      aoa2.push([
        t.nome || '', t.matric, t.pres, c.partic, +c.adesao.toFixed(1),
        t.adorei, t.gostei, t.indif, t.naogostei, t.detestei,
        +c.aceitacao.toFixed(1)
      ]);
      tot.matric+=t.matric; tot.pres+=t.pres; tot.partic+=c.partic;
      tot.adorei+=t.adorei; tot.gostei+=t.gostei; tot.indif+=t.indif;
      tot.naogostei+=t.naogostei; tot.detestei+=t.detestei;
    });
    const aceitosTot = tot.adorei + tot.gostei;
    const aceitacaoTot = pct(aceitosTot, tot.partic);
    aoa2.push([
      'TOTAL', tot.matric, tot.pres, tot.partic, +pct(tot.partic, tot.pres).toFixed(1),
      tot.adorei, tot.gostei, tot.indif, tot.naogostei, tot.detestei, +aceitacaoTot.toFixed(1)
    ]);
    const ws2 = XLSX.utils.aoa_to_sheet(aoa2);
    ws2['!cols'] = [{wch:18},{wch:13},{wch:11},{wch:14},{wch:11},{wch:10},{wch:10},{wch:13},{wch:13},{wch:12},{wch:14}];
    XLSX.utils.book_append_sheet(wb, ws2, 'Aceitação e Adesão');

    // --- Aba 3: % de Aceitação - Total ---
    const aoa3 = [
      [`REGIONAL DE ENSINO: ${header.regional || ''}`],
      [`ESCOLA: ${header.escola || ''}`],
      [`PROGRAMA/MODALIDADE: ${header.programa || ''}`],
      [`PREPARAÇÃO: ${header.preparacao || ''}`],
      [],
      ['Escala Hedônica','Total de Respostas',''],
      ['','(N)','(%)'],
      ['Adorei', tot.adorei, tot.partic ? +((tot.adorei*100/tot.partic).toFixed(1)) : 0],
      ['Gostei', tot.gostei, tot.partic ? +((tot.gostei*100/tot.partic).toFixed(1)) : 0],
      ['Indiferente', tot.indif, tot.partic ? +((tot.indif*100/tot.partic).toFixed(1)) : 0],
      ['Não gostei', tot.naogostei, tot.partic ? +((tot.naogostei*100/tot.partic).toFixed(1)) : 0],
      ['Detestei', tot.detestei, tot.partic ? +((tot.detestei*100/tot.partic).toFixed(1)) : 0],
      ['TOTAL', tot.partic, tot.partic ? 100 : 0],
      ['Resultado: Adorei + Gostei', aceitosTot, +aceitacaoTot.toFixed(1)],
      [],
      ['Critério PNAE', '≥ 85%', aceitacaoTot >= 85 ? 'ACEITA' : 'NÃO ACEITA']
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(aoa3);
    ws3['!cols'] = [{wch:32},{wch:18},{wch:18}];
    XLSX.utils.book_append_sheet(wb, ws3, '% Aceitação - Total');

    // --- Aba 4: Índice de Adesão - Total ---
    const adMxl = adesaoMediaTurmas(turmas);
    const ad = classifyAdesao(adMxl.media);
    const aoa4 = [
      [`REGIONAL DE ENSINO: ${header.regional || ''}`],
      [`ESCOLA: ${header.escola || ''}`],
      [`PROGRAMA/MODALIDADE: ${header.programa || ''}`],
      [],
      ['Programa/Modalidade','Total Matriculados','Total Presentes','Total Participantes',`% Índice de Adesão (média de ${adMxl.qtd} turma${adMxl.qtd === 1 ? '' : 's'})`],
      [header.programa || '', tot.matric, tot.pres, tot.partic, +adMxl.media.toFixed(1)],
      [],
      ['CLASSIFICAÇÃO', ad.txt],
      [],
      ['Tabela de classificação','Adesão'],
      ['< 30','Muito baixa'],
      ['30 a 50','Baixa'],
      ['50 a 70','Média'],
      ['> 70','Alta']
    ];
    const ws4 = XLSX.utils.aoa_to_sheet(aoa4);
    ws4['!cols'] = [{wch:28},{wch:20},{wch:18},{wch:20},{wch:20}];
    XLSX.utils.book_append_sheet(wb, ws4, 'Índice de Adesão - Total');

    XLSX.writeFile(wb, fileName('xlsx'));
    showMsg('Planilha (.xlsx) gerada.', 'ok');
  });

  // --- PDF (via impressão) ---
  $('#exportPdf').addEventListener('click', () => {
    const { header, turmas } = readAll();
    const tot = turmas.reduce((a, t) => {
      const c = calcTurma(t);
      a.matric+=t.matric; a.pres+=t.pres; a.partic+=c.partic;
      a.adorei+=t.adorei; a.gostei+=t.gostei; a.indif+=t.indif;
      a.naogostei+=t.naogostei; a.detestei+=t.detestei;
      return a;
    }, {matric:0,pres:0,partic:0,adorei:0,gostei:0,indif:0,naogostei:0,detestei:0});
    const aceitos = tot.adorei + tot.gostei;
    const aceitacao = pct(aceitos, tot.partic);
    const adMpdf = adesaoMediaTurmas(turmas);
    const ad = classifyAdesao(adMpdf.media);
    const passou = aceitacao >= 85;

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Teste de Aceitabilidade</title>
    <style>
      @page { size: A4; margin: 1.5cm; }
      body { font-family: 'Segoe UI', Arial, sans-serif; color:#1a1a1a; }
      h1 { color:#0b6b3a; border-bottom: 2px solid #0b6b3a; padding-bottom:.3rem; }
      h2 { color:#0b6b3a; margin-top: 1.2rem; }
      .head { background:#f4faf6; border-left:4px solid #0b6b3a; padding:.6rem .8rem; }
      .head p { margin: .15rem 0; }
      table { width:100%; border-collapse:collapse; margin-top:.4rem; font-size:.9rem; }
      th, td { border:1px solid #ddd; padding:.35rem .5rem; text-align:left; }
      th { background:#0b6b3a; color:#fff; }
      tr.tot td { background:#eef5f0; font-weight:bold; }
      tr.hl td { background:#e7f7ee; font-weight:bold; }
      .verdict { padding:.7rem 1rem; border-radius:8px; margin: .8rem 0; font-weight:bold; font-size:1.1rem; }
      .verdict.ok { background:#e7f7ee; color:#047857; border-left:5px solid #047857; }
      .verdict.fail { background:#fdecec; color:#b91c1c; border-left:5px solid #b91c1c; }
      .meta { color:#555; font-size:.85rem; margin-top:1rem; border-top:1px solid #ddd; padding-top:.5rem; }
    </style></head><body>
      <h1>Teste de Aceitabilidade — Resultados</h1>
      <div class="head">
        <p><b>Regional:</b> ${header.regional || '—'}</p>
        <p><b>Escola:</b> ${header.escola || '—'}</p>
        <p><b>Programa/Modalidade:</b> ${header.programa || '—'}</p>
        <p><b>Preparação:</b> ${header.preparacao || '—'}</p>
        <p><b>Data:</b> ${header.data || '—'} &nbsp;·&nbsp; <b>Aplicador(es):</b> ${header.aplicador || '—'}</p>
      </div>

      <div class="verdict ${passou ? 'ok' : 'fail'}">
        ${passou ? '✅ ACEITA' : '❌ NÃO ACEITA'} — Aceitação total: ${fmt(aceitacao)} (critério ≥ 85%)
      </div>

      <h2>Por turma</h2>
      <table>
        <thead><tr>
          <th>Turma</th><th>Matric.</th><th>Pres.</th><th>Particip.</th>
          <th>% Adesão</th><th>Ad</th><th>Go</th><th>In</th><th>NG</th><th>De</th>
          <th>% Aceit.</th>
        </tr></thead>
        <tbody>
          ${turmas.map(t => {
            const c = calcTurma(t);
            return `<tr>
              <td>${t.nome || '—'}</td><td>${t.matric}</td><td>${t.pres}</td>
              <td>${c.partic}</td><td>${fmt(c.adesao)}</td>
              <td>${t.adorei}</td><td>${t.gostei}</td><td>${t.indif}</td>
              <td>${t.naogostei}</td><td>${t.detestei}</td>
              <td><b>${fmt(c.aceitacao)}</b></td>
            </tr>`;
          }).join('')}
          <tr class="tot">
            <td>TOTAL</td><td>${tot.matric}</td><td>${tot.pres}</td><td>${tot.partic}</td>
            <td>${fmt(pct(tot.partic, tot.pres))}</td>
            <td>${tot.adorei}</td><td>${tot.gostei}</td><td>${tot.indif}</td>
            <td>${tot.naogostei}</td><td>${tot.detestei}</td>
            <td>${fmt(aceitacao)}</td>
          </tr>
        </tbody>
      </table>

      <h2>Resumo consolidado</h2>
      <table>
        <thead><tr><th>Escala Hedônica</th><th>N</th><th>%</th></tr></thead>
        <tbody>
          <tr><td>Adorei</td><td>${tot.adorei}</td><td>${fmt(pct(tot.adorei,tot.partic))}</td></tr>
          <tr><td>Gostei</td><td>${tot.gostei}</td><td>${fmt(pct(tot.gostei,tot.partic))}</td></tr>
          <tr><td>Indiferente</td><td>${tot.indif}</td><td>${fmt(pct(tot.indif,tot.partic))}</td></tr>
          <tr><td>Não gostei</td><td>${tot.naogostei}</td><td>${fmt(pct(tot.naogostei,tot.partic))}</td></tr>
          <tr><td>Detestei</td><td>${tot.detestei}</td><td>${fmt(pct(tot.detestei,tot.partic))}</td></tr>
          <tr class="tot"><td>TOTAL</td><td>${tot.partic}</td><td>100,0%</td></tr>
          <tr class="hl"><td>Adorei + Gostei</td><td>${aceitos}</td><td>${fmt(aceitacao)}</td></tr>
        </tbody>
      </table>

      <h2>Índice de Adesão</h2>
      <p><b>${fmt(adMpdf.media)}</b> — Classificação: <b>${ad.txt}</b><br/>
      <small>(Média das adesões de ${adMpdf.qtd} turma${adMpdf.qtd === 1 ? '' : 's'} · Muito baixa &lt;30 · Baixa 30–50 · Média 50–70 · Alta &gt;70)</small></p>

      <p class="meta">Gerado pelo app Aceitabilidade · PAE-DF · ${new Date().toLocaleString('pt-BR')}<br/>
      Boletim Alimentação · 24ª ed · DIAE/SEE-DF</p>

      <script>window.onload = () => { window.print(); };</script>
    </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { showMsg('Permita pop-ups para exportar PDF.', 'err'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    showMsg('Janela de impressão aberta — escolha "Salvar como PDF".', 'ok');
  });

  // ===== inicialização =====
  if (!loadDraft()) addTurma();
  renderResumo();
})();
