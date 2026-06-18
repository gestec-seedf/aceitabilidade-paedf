// ===== Sincronização com Planilha Google (serverless, obrigatória) =====
// O app continua estático: apenas chama uma URL HTTPS (Apps Script Web App).
// - ESCRITA: cada teste salvo é enviado automaticamente para a planilha central
//   (URL embutida abaixo). Sem internet, fica pendente e é reenviado sozinho.
// - LEITURA (BI): protegida por senha. O painel de Inteligência só carrega os dados
//   após o login; a senha é validada pelo Apps Script (o segredo vive lá, não aqui).
// Expõe window.PAENuvem consumido por inteligencia.js (fonte de dados) e registro.js (envio).
(function () {
  const CFG_KEY = 'aceitabilidade_cloud_cfg_v1';
  const QUEUE_KEY = 'aceitabilidade_fila_sync_v1';
  const TOKEN_KEY = 'aceitabilidade_bi_token_v1';
  const $ = s => document.querySelector(s);

  // URL da gestão: já aponta para a planilha central, então qualquer aparelho que abrir
  // o app envia automaticamente. A mesma URL serve para a leitura autenticada do BI.
  const DEFAULTS = {
    writeUrl: 'https://script.google.com/macros/s/AKfycbxiIBLabWyREf0XVKw0aew-BHDV5zkp7D6mdqMq9Melf5cdsiN9qvzcWQNpxbwRcXL6/exec'
  };

  const state = { mode: 'local', remote: [], pulling: false };

  // ---------- config ----------
  function getCfg() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(CFG_KEY)) || {}); }
    catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function endpoint() { return getCfg().writeUrl; }
  function isConfigured() { return !!endpoint(); }

  // ---------- credencial do BI ----------
  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch (e) {} }
  function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
  function isAuthed() { return !!getToken(); }

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
    if (!endpoint()) return false;
    try {
      await fetch(endpoint(), {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(snap)
      });
      return true;
    } catch (e) { return false; }
  }
  async function sendSnapshot(snap) {
    if (!endpoint()) return { ok: false, queued: false };
    const ok = await trySend(snap);
    if (!ok) { enqueue(snap); return { ok: false, queued: true }; }
    return { ok: true, queued: false };
  }
  async function flush() {
    if (!endpoint()) return 0;
    const q = getQueue();
    if (!q.length) return 0;
    const remaining = [];
    for (const s of q) { const ok = await trySend(s); if (!ok) remaining.push(s); }
    setQueue(remaining);
    return q.length - remaining.length;
  }

  // ---------- leitura autenticada (JSON via Apps Script) ----------
  // cors: precisamos LER a resposta. O Apps Script devolve cabeçalhos CORS no redirect.
  // O token vai no corpo (POST), não na URL, para não vazar em logs/referer.
  async function fetchRemoteWith(token) {
    if (!endpoint()) throw new Error('Endpoint não configurado.');
    const res = await fetch(endpoint(), {
      method: 'POST', mode: 'cors', cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'read', token })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data || !data.ok) throw new Error(data && data.error === 'unauthorized' ? 'unauthorized' : 'falha na leitura');
    return Array.isArray(data.rows) ? data.rows : [];
  }
  async function fetchRemote() {
    const token = getToken();
    if (!token) throw new Error('Faça login no BI primeiro.');
    return fetchRemoteWith(token);
  }

  // Valida a senha tentando a leitura. Sucesso → guarda o token e os dados.
  async function verifyToken(token) {
    try {
      const rows = await fetchRemoteWith(token);
      setToken(token);
      state.remote = rows;
      state.mode = 'nuvem';
      return true;
    } catch (e) {
      return e.message === 'unauthorized' ? false : Promise.reject(e);
    }
  }

  function logout() {
    clearToken();
    state.mode = 'local';
    state.remote = [];
    applyGate();
    refreshStatus();
    rerender();
  }

  // ---------- fonte de dados ativa ----------
  function getActiveHistory() {
    return state.mode === 'nuvem' ? state.remote : (window.PAEReg ? window.PAEReg.getHistory() : []);
  }
  function rerender() { if (window.PAEIntel && window.PAEIntel.render) window.PAEIntel.render(); }

  // ---------- gate do BI ----------
  function applyGate() {
    const gate = $('#biGate'), content = $('#biContent');
    const authed = isAuthed();
    if (gate) gate.hidden = authed;
    if (content) content.hidden = !authed;
  }

  // Puxa os dados da nuvem e re-renderiza (uma vez por vez). Token inválido → desloga.
  async function pullAndRender() {
    if (state.pulling || !isAuthed()) return;
    state.pulling = true;
    try {
      state.remote = await fetchRemote();
      state.mode = 'nuvem';
      refreshStatus();
    } catch (e) {
      if (e.message === 'unauthorized') { state.pulling = false; logout(); showMsg('Sessão expirada — entre novamente.', 'err'); return; }
      showMsg('Não foi possível atualizar a nuvem: ' + e.message, 'err');
    } finally { state.pulling = false; }
    rerender();
  }

  // ---------- UI ----------
  const msgBox = $('#cloudMsg');
  const statusBox = $('#cloudStatus');
  const gateMsgBox = $('#biGateMsg');
  function showMsg(text, type) {
    if (!msgBox) return;
    msgBox.textContent = text;
    msgBox.style.color = type === 'err' ? 'var(--red)' : (type === 'ok' ? 'var(--ok)' : 'var(--muted)');
    if (text) setTimeout(() => { if (msgBox.textContent === text) msgBox.textContent = ''; }, 5000);
  }
  function gateMsg(text, type) {
    if (!gateMsgBox) return;
    gateMsgBox.textContent = text;
    gateMsgBox.style.color = type === 'err' ? 'var(--red)' : (type === 'ok' ? 'var(--ok)' : 'var(--muted)');
  }
  function refreshStatus() {
    if (!statusBox) return;
    const pend = getQueue().length;
    const fonte = state.mode === 'nuvem' ? `Nuvem (${state.remote.length} testes de todas as escolas)` : 'aguardando login';
    statusBox.textContent = `Sincronização automática ativa · Fonte do painel: ${fonte}` +
      (pend ? ` · ${pend} envio(s) pendente(s)` : '');
  }

  function bind(id, fn) { const el = $('#' + id); if (el) el.addEventListener('click', fn); }

  // login do BI
  bind('biEnter', async () => {
    const pass = ($('#biPass') ? $('#biPass').value : '').trim();
    if (!pass) { gateMsg('Informe a senha.', 'err'); return; }
    gateMsg('Verificando…');
    try {
      const ok = await verifyToken(pass);
      if (!ok) { gateMsg('Senha incorreta.', 'err'); return; }
      if ($('#biPass')) $('#biPass').value = '';
      gateMsg('');
      applyGate();
      refreshStatus();
      rerender();
    } catch (e) {
      gateMsg('Sem conexão para validar a senha. Tente novamente.', 'err');
    }
  });
  // Enter no campo de senha confirma
  if ($('#biPass')) $('#biPass').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const b = $('#biEnter'); if (b) b.click(); } });

  bind('biLogout', () => { logout(); gateMsg(''); });

  bind('cloudPull', async () => {
    if (!isAuthed()) { showMsg('Faça login no BI primeiro.', 'err'); return; }
    showMsg('Atualizando dados da nuvem…');
    await pullAndRender();
    if (state.mode === 'nuvem') showMsg(`Exibindo ${state.remote.length} teste(s) da nuvem.`, 'ok');
  });

  bind('cloudFlush', async () => {
    const nf = await flush();
    refreshStatus();
    showMsg(nf ? `${nf} pendente(s) enviado(s).` : 'Nenhum pendente para enviar.', 'ok');
  });

  // reenvio automático ao reconectar / ao abrir
  window.addEventListener('online', () => { flush().then(refreshStatus); });

  // ao abrir a tela Inteligência: aplica o gate e, se logado, atualiza a nuvem
  const section = document.getElementById('inteligencia');
  if (section) {
    const obs = new MutationObserver(() => {
      applyGate();
      if (!section.hidden && isAuthed()) pullAndRender();
    });
    obs.observe(section, { attributes: true, attributeFilter: ['hidden'] });
  }

  // ---------- API pública ----------
  window.PAENuvem = {
    getCfg, isConfigured,
    sendSnapshot, flush,
    fetchRemote, getActiveHistory, getMode: () => state.mode,
    isAuthed, verifyToken, logout, applyGate
  };

  // ---------- boot ----------
  applyGate();
  refreshStatus();
  flush().then(nf => { if (nf) refreshStatus(); });
})();
