// ===== Sincronização com Planilha Google (serverless, opcional) =====
// Mantém o app estático: apenas chama uma URL HTTPS (Apps Script Web App p/ enviar e
// CSV publicado p/ ler). Sem configuração → app 100% local (degrada com elegância).
// Expõe window.PAENuvem consumido por inteligencia.js (fonte de dados) e registro.js (envio).
(function () {
  const CFG_KEY = 'aceitabilidade_cloud_cfg_v1';
  const QUEUE_KEY = 'aceitabilidade_fila_sync_v1';
  const $ = s => document.querySelector(s);

  // Padrões da gestão: já apontam para a planilha central, então qualquer aparelho
  // que abrir o app envia automaticamente, sem ninguém precisar colar nada.
  // Para apontar para outra base, basta salvar URLs diferentes na tela de Sincronização
  // (o que ficar salvo no aparelho sobrescreve estes padrões; campo vazio salvo = desliga).
  const DEFAULTS = {
    writeUrl: 'https://script.google.com/macros/s/AKfycbxiIBLabWyREf0XVKw0aew-BHDV5zkp7D6mdqMq9Melf5cdsiN9qvzcWQNpxbwRcXL6/exec',
    readUrl: ''
  };

  const state = { mode: 'local', remote: [] };

  // ---------- config ----------
  function getCfg() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(CFG_KEY)) || {}); }
    catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function setCfg(cfg) {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); return true; } catch (e) { return false; }
  }
  function isConfigured() { const c = getCfg(); return !!(c.writeUrl || c.readUrl); }

  // ---------- fila offline ----------
  function getQueue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch (e) { return []; } }
  function setQueue(q) { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) {} }
  function enqueue(snap) {
    const q = getQueue();
    if (!q.some(s => s.id === snap.id)) { q.push(snap); setQueue(q); }
  }

  // ---------- envio ----------
  // no-cors: requisição "simples" (sem preflight). Resposta é opaca — assume-se entregue
  // se a promise resolver; o servidor faz dedupe por id, então reenvios são seguros.
  async function trySend(snap) {
    const cfg = getCfg();
    if (!cfg.writeUrl) return false;
    try {
      await fetch(cfg.writeUrl, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(snap)
      });
      return true;
    } catch (e) { return false; }
  }
  async function sendSnapshot(snap) {
    if (!getCfg().writeUrl) return { ok: false, queued: false };
    const ok = await trySend(snap);
    if (!ok) { enqueue(snap); return { ok: false, queued: true }; }
    return { ok: true, queued: false };
  }
  async function flush() {
    if (!getCfg().writeUrl) return 0;
    const q = getQueue();
    if (!q.length) return 0;
    const remaining = [];
    for (const s of q) { const ok = await trySend(s); if (!ok) remaining.push(s); }
    setQueue(remaining);
    return q.length - remaining.length;
  }

  // ---------- leitura (CSV publicado) ----------
  function parseCSV(text) {
    const rows = []; let row = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* ignora */ }
      else field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  function rowsToSnapshots(rows) {
    if (!rows.length) return [];
    const head = rows[0].map(h => h.trim());
    const idx = name => head.indexOf(name);
    const n = (v) => { const x = parseFloat(String(v).replace(',', '.')); return isNaN(x) ? 0 : x; };
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row.length || row.every(c => !String(c).trim())) continue;
      const g = name => { const i = idx(name); return i >= 0 ? (row[i] || '') : ''; };
      out.push({
        id: g('id') || ('r_' + r),
        savedAt: g('savedAt'),
        header: {
          regional: g('regional'), escola: g('escola'), programa: g('programa'),
          preparacao: g('preparacao'), data: g('data'), aplicador: g('aplicador')
        },
        totals: {
          matric: n(g('matriculados')), pres: n(g('presentes')), partic: n(g('participantes')),
          adorei: n(g('adorei')), gostei: n(g('gostei')), indif: n(g('indiferente')),
          naogostei: n(g('naogostei')), detestei: n(g('detestei'))
        },
        aceitacao: n(g('aceitacao')),
        adesaoMedia: n(g('adesaoMedia')),
        passou: /^(sim|true|1)$/i.test(String(g('passou')).trim())
      });
    }
    return out;
  }
  async function fetchRemote() {
    const cfg = getCfg();
    if (!cfg.readUrl) throw new Error('Configure a URL CSV publicada para ler da nuvem.');
    const res = await fetch(cfg.readUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return rowsToSnapshots(parseCSV(await res.text()));
  }

  // ---------- fonte de dados ativa ----------
  function getActiveHistory() {
    return state.mode === 'nuvem' ? state.remote : (window.PAEReg ? window.PAEReg.getHistory() : []);
  }
  function rerender() { if (window.PAEIntel && window.PAEIntel.render) window.PAEIntel.render(); }

  // ---------- UI ----------
  const msgBox = $('#cloudMsg');
  const statusBox = $('#cloudStatus');
  function showMsg(text, type) {
    if (!msgBox) return;
    msgBox.textContent = text;
    msgBox.style.color = type === 'err' ? 'var(--red)' : (type === 'ok' ? 'var(--ok)' : 'var(--muted)');
    if (text) setTimeout(() => { if (msgBox.textContent === text) msgBox.textContent = ''; }, 5000);
  }
  function refreshStatus() {
    if (!statusBox) return;
    const pend = getQueue().length;
    const fonte = state.mode === 'nuvem' ? `Nuvem (${state.remote.length} testes)` : 'Local (este aparelho)';
    statusBox.textContent = `Fonte atual: ${fonte}` +
      (pend ? ` · ${pend} envio(s) pendente(s)` : '') +
      (isConfigured() ? '' : ' · nuvem não configurada');
  }

  function loadCfgIntoForm() {
    const c = getCfg();
    if ($('#cloudWriteUrl')) $('#cloudWriteUrl').value = c.writeUrl || '';
    if ($('#cloudReadUrl')) $('#cloudReadUrl').value = c.readUrl || '';
  }

  function bind(id, fn) { const el = $('#' + id); if (el) el.addEventListener('click', fn); }

  bind('cloudSave', () => {
    const writeUrl = ($('#cloudWriteUrl').value || '').trim();
    const readUrl = ($('#cloudReadUrl').value || '').trim();
    setCfg({ writeUrl, readUrl });
    showMsg('Configuração salva.', 'ok');
    refreshStatus();
    flush().then(nf => { if (nf) { showMsg(`Configuração salva · ${nf} pendente(s) enviado(s).`, 'ok'); refreshStatus(); } });
  });

  bind('cloudPull', async () => {
    try {
      showMsg('Buscando dados da nuvem…');
      state.remote = await fetchRemote();
      state.mode = 'nuvem';
      refreshStatus();
      rerender();
      showMsg(`Exibindo ${state.remote.length} teste(s) da nuvem.`, 'ok');
    } catch (e) {
      showMsg('Falha ao ler a nuvem: ' + e.message, 'err');
    }
  });

  bind('cloudLocal', () => {
    state.mode = 'local';
    refreshStatus();
    rerender();
    showMsg('Exibindo dados locais (este aparelho).', 'ok');
  });

  bind('cloudFlush', async () => {
    if (!getCfg().writeUrl) { showMsg('Configure a URL de envio primeiro.', 'err'); return; }
    const nf = await flush();
    refreshStatus();
    showMsg(nf ? `${nf} pendente(s) enviado(s).` : 'Nenhum pendente para enviar.', 'ok');
  });

  // reenvio automático ao reconectar / ao abrir
  window.addEventListener('online', () => { flush().then(refreshStatus); });

  // ---------- API pública ----------
  window.PAENuvem = {
    getCfg, setCfg, isConfigured,
    sendSnapshot, flush,
    fetchRemote, getActiveHistory,
    getMode: () => state.mode
  };

  // ---------- boot ----------
  loadCfgIntoForm();
  refreshStatus();
  flush().then(nf => { if (nf) refreshStatus(); });
})();
