// ===== Sincronização com Supabase (serverless, leitura pública) =====
// Substitui o antigo nuvem.js (Apps Script). O app continua estático:
//  - ESCRITA: cada teste salvo chama a RPC submit_teste() (valida + upsert por id).
//    Sem internet, fica na fila local e é reenviado sozinho ao reconectar.
//  - LEITURA (BI): pública, sem senha — qualquer aparelho lê o consolidado de todas
//    as escolas. A integridade do dado é garantida pelo RLS + validação na RPC.
// Mantém o nome global window.PAENuvem e a superfície consumida por inteligencia.js
// e relatorios.js (getActiveHistory / getMode / sendSnapshot / flush / isConfigured).
(function () {
  // Credenciais públicas por design (a anon key pode ficar embutida; quem protege é o RLS).
  const SUPABASE_URL  = 'https://rjtnzrnbadoxixdxgwpl.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqdG56cm5iYWRveGl4ZHhnd3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjU0MzQsImV4cCI6MjA5NzQ0MTQzNH0.9-aEBPA2uNmG7sp9TxvdxTASzv0780e0yTxPdBVIDQY';

  const QUEUE_KEY = 'aceitabilidade_fila_sync_v1';
  const $ = s => document.querySelector(s);

  // cache:'no-store' em todo fetch → a leitura do BI nunca vem do cache do navegador
  // (senão o painel mostra testes desatualizados e "Atualizar" não traz o novo).
  const sb = (window.supabase && SUPABASE_URL)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
        // persistSession: mantém o gestor logado entre cargas (área do gestor).
        // A leitura pública do BI funciona igual com ou sem sessão (RLS libera anon e authenticated).
        auth: { persistSession: true, autoRefreshToken: true },
        global: { fetch: (url, opts = {}) => fetch(url, { ...opts, cache: 'no-store' }) }
      })
    : null;

  const state = { mode: 'local', remote: [], pulling: false };

  function isConfigured() { return !!sb; }

  // ---------- fila offline ----------
  function getQueue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch (e) { return []; } }
  // Retorna true se gravou; false se o armazenamento recusou (cota cheia etc.).
  // Falha silenciosa aqui significaria perder um teste preenchido offline — então avisamos.
  function setQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); return true; }
    catch (e) {
      console.error('Fila offline não pôde ser gravada:', e && e.name);
      showMsg('Armazenamento local cheio — não foi possível guardar o teste para envio. Sincronize ou libere espaço.', 'err');
      return false;
    }
  }
  function enqueue(snap) {
    // Substitui por id (não apenas ignora): com id estável, um rascunho editado offline
    // várias vezes deve subir na versão mais recente, não na primeira enfileirada.
    const q = getQueue();
    const i = q.findIndex(s => s.id === snap.id);
    if (i >= 0) q[i] = snap; else q.push(snap);
    return setQueue(q);
  }

  // ---------- escrita (RPC validada) ----------
  async function trySend(snap) {
    if (!sb) return false;
    try {
      const { error } = await sb.rpc('submit_teste', { payload: snap });
      if (error) { console.warn('submit_teste:', error.message); return false; }
      return true;
    } catch (e) { return false; }
  }
  async function sendSnapshot(snap) {
    if (!sb) return { ok: false, queued: false };
    const ok = await trySend(snap);
    if (!ok) { const queued = enqueue(snap); return { ok: false, queued }; }
    return { ok: true, queued: false };
  }
  async function flush() {
    if (!sb) return 0;
    const q = getQueue();
    if (!q.length) return 0;
    const remaining = [];
    for (const s of q) { const ok = await trySend(s); if (!ok) remaining.push(s); }
    setQueue(remaining);
    return q.length - remaining.length;
  }

  // ---------- leitura pública ----------
  // Converte a linha do banco (snake_case) de volta ao formato de snapshot que o app usa.
  function rowToSnap(r) {
    return {
      id: String(r.id || ''),
      savedAt: r.saved_at || '',
      header: {
        regional: r.regional || '', escola: r.escola || '', programa: r.programa || '',
        preparacao: r.preparacao || '', data: r.data || '', aplicador: r.aplicador || ''
      },
      totals: {
        matric: +r.matriculados || 0, pres: +r.presentes || 0, partic: +r.participantes || 0,
        adorei: +r.adorei || 0, gostei: +r.gostei || 0, indif: +r.indiferente || 0,
        naogostei: +r.naogostei || 0, detestei: +r.detestei || 0
      },
      aceitacao: +r.aceitacao || 0,
      adesaoMedia: +r.adesao_media || 0,
      passou: !!r.passou,
      turmas: Array.isArray(r.turmas) ? r.turmas : [],
      status: r.status || 'final'
    };
  }
  // BI lê SÓ testes finalizados. Rascunhos (auto-save em edição) ficam na nuvem para não
  // se perder, mas não entram em rankings/tendências até o usuário clicar em "Salvar".
  async function fetchRemote() {
    if (!sb) throw new Error('Supabase não configurado.');
    const { data, error } = await sb.from('testes').select('*')
      .eq('status', 'final').order('saved_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map(rowToSnap);
  }

  // ---------- área do gestor: auth + leitura completa + exclusão ----------
  async function signIn(email, password) {
    if (!sb) return { ok: false, error: 'Nuvem não configurada.' };
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    return error ? { ok: false, error: error.message } : { ok: true, user: data.user };
  }
  async function signOut() { if (sb) { try { await sb.auth.signOut(); } catch (e) {} } }
  async function getUser() {
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data && data.session ? data.session.user : null;
  }
  function onAuthChange(cb) {
    if (!sb) return;
    sb.auth.onAuthStateChange((_evt, session) => cb(session ? session.user : null));
  }
  // Leitura para o gestor: TODOS os testes (inclusive rascunhos), mais recentes primeiro.
  async function fetchAllAdmin() {
    if (!sb) throw new Error('Supabase não configurado.');
    const { data, error } = await sb.from('testes').select('*').order('saved_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(rowToSnap);
  }
  // Exclusão definitiva via RPC validada no servidor (auth + allowlist).
  async function deleteTeste(id) {
    if (!sb) return { ok: false, error: 'Nuvem não configurada.' };
    const { error } = await sb.rpc('delete_teste', { p_id: id });
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  // ---------- fonte de dados ativa ----------
  // 'nuvem' assim que carregar dados remotos; antes disso (offline/carregando) cai no local.
  function getActiveHistory() {
    return state.mode === 'nuvem' ? state.remote : (window.PAEReg ? window.PAEReg.getHistory() : []);
  }
  function rerender() { if (window.PAEIntel && window.PAEIntel.render) window.PAEIntel.render(); }

  // Puxa os dados da nuvem e re-renderiza (uma vez por vez).
  async function pullAndRender() {
    if (state.pulling || !sb) return;
    state.pulling = true;
    try {
      state.remote = await fetchRemote();
      state.mode = 'nuvem';
      refreshStatus();
    } catch (e) {
      showMsg('Não foi possível atualizar a nuvem: ' + e.message, 'err');
    } finally { state.pulling = false; }
    rerender();
  }

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
    const fonte = state.mode === 'nuvem'
      ? `Nuvem (${state.remote.length} testes de todas as escolas)`
      : 'este aparelho (sem conexão com a nuvem ainda)';
    statusBox.textContent = `Sincronização automática ativa · Fonte do painel: ${fonte}` +
      (pend ? ` · ${pend} envio(s) pendente(s)` : '');
  }

  function bind(id, fn) { const el = $('#' + id); if (el) el.addEventListener('click', fn); }

  bind('cloudPull', async () => {
    showMsg('Atualizando dados da nuvem…');
    await pullAndRender();
    if (state.mode === 'nuvem') showMsg(`Exibindo ${state.remote.length} teste(s) da nuvem.`, 'ok');
  });

  bind('cloudFlush', async () => {
    const nf = await flush();
    refreshStatus();
    showMsg(nf ? `${nf} pendente(s) enviado(s).` : 'Nenhum pendente para enviar.', 'ok');
  });

  // reenvio automático ao reconectar
  window.addEventListener('online', () => { flush().then(refreshStatus); });

  // ao abrir a tela Inteligência: puxa a nuvem automaticamente (BI aberto, sem login)
  const section = document.getElementById('inteligencia');
  if (section) {
    const obs = new MutationObserver(() => { if (!section.hidden) pullAndRender(); });
    obs.observe(section, { attributes: true, attributeFilter: ['hidden'] });
  }

  // ---------- API pública ----------
  window.PAENuvem = {
    isConfigured,
    sendSnapshot, flush,
    fetchRemote, getActiveHistory, getMode: () => state.mode,
    // área do gestor
    signIn, signOut, getUser, onAuthChange, fetchAllAdmin, deleteTeste
  };

  // ---------- boot ----------
  refreshStatus();
  flush().then(nf => { if (nf) refreshStatus(); });
  if (section && !section.hidden) pullAndRender();
})();
