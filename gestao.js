// ===== Área do gestor: login (Supabase Auth) + exclusão reversível na nuvem =====
// Módulo isolado (IIFE). Conversa só pela API global window.PAENuvem. Falha em silêncio
// se seus elementos não existirem. Exclusão e restauração são validadas NO SERVIDOR
// (RPCs delete_teste/restore_teste: sessão autenticada + e-mail na allowlist, lookup vivo)
// — o cliente aqui é só a interface. Exclusão é soft delete (marca deleted_at), reversível.
// Lista com filtro de texto + situação e paginação incremental ("Carregar mais").
(function () {
  const view = document.getElementById('gestao');
  if (!view) return;

  const elLogin    = document.getElementById('gestaoLogin');
  const elPanel    = document.getElementById('gestaoPanel');
  const form       = document.getElementById('gestaoLoginForm');
  const inEmail    = document.getElementById('gestaoEmail');
  const inSenha    = document.getElementById('gestaoSenha');
  const loginMsg   = document.getElementById('gestaoLoginMsg');
  const panelMsg   = document.getElementById('gestaoPanelMsg');
  const userLbl    = document.getElementById('gestaoUser');
  const lista      = document.getElementById('gestaoLista');
  const btnSair    = document.getElementById('gestaoSair');
  const btnAtual   = document.getElementById('gestaoAtualizar');
  const inFiltro   = document.getElementById('gestaoFiltro');
  const selStatus  = document.getElementById('gestaoStatus');

  const api = () => window.PAENuvem;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // normaliza p/ busca insensível a acento/caixa
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function setMsg(box, text, type) {
    if (!box) return;
    box.textContent = text || '';
    box.style.color = type === 'err' ? 'var(--red)' : (type === 'ok' ? 'var(--ok)' : 'var(--muted)');
  }

  function fmtPct(v) { return (Math.round((+v || 0) * 10) / 10).toFixed(1).replace('.', ',') + '%'; }

  // ---------- alterna login × painel conforme a sessão ----------
  let lastUser = null;
  function showLoggedOut() {
    lastUser = null;
    disarm();                          // não deixar exclusão "armada" sobreviver ao logout
    if (lista) lista.innerHTML = '';   // não vazar a lista de testes para a próxima sessão
    if (elLogin) elLogin.hidden = false;
    if (elPanel) elPanel.hidden = true;
  }
  function showLoggedIn(user) {
    lastUser = user;
    if (elLogin) elLogin.hidden = true;
    if (elPanel) elPanel.hidden = false;
    if (userLbl) userLbl.textContent = 'Conectado: ' + (user && user.email ? user.email : '—');
    loadList();
  }

  async function refreshAuth() {
    if (!api() || !api().isConfigured || !api().isConfigured()) {
      if (elLogin) elLogin.hidden = true;
      if (elPanel) elPanel.hidden = true;
      setMsg(loginMsg, 'Nuvem não configurada neste aparelho.', 'err');
      return;
    }
    const user = await api().getUser();
    if (user) showLoggedIn(user); else showLoggedOut();
  }

  // ---------- lista de testes da nuvem ----------
  // allTests: tudo que veio da nuvem (cru). filtered: após filtro de texto/situação.
  // shown: quantas linhas estão renderizadas (paginação incremental "Carregar mais").
  const PAGE = 40;
  let allTests = [], filtered = [], shown = PAGE;

  // Guarda de concorrência: no login, o handler do form e o onAuthChange chamam loadList()
  // quase juntos; sem isto seriam dois fetchAllAdmin em paralelo (flicker + resposta velha
  // podendo sobrescrever a mais nova). Também dedupe cliques repetidos em "Atualizar".
  let loading = false;
  async function loadList() {
    if (!lista || loading) return;
    loading = true;
    disarm();                          // re-render zera qualquer exclusão "armada" (ver disarm)
    lista.innerHTML = '<div class="meta">Carregando testes da nuvem…</div>';
    setMsg(panelMsg, '');
    try {
      allTests = await api().fetchAllAdmin();
      applyFilter();
    } catch (e) {
      allTests = [];
      lista.innerHTML = '<div class="meta">Não foi possível carregar.</div>';
      setMsg(panelMsg, 'Erro ao carregar: ' + (e && e.message ? e.message : e), 'err');
    } finally {
      loading = false;
    }
  }

  // Aplica filtro de texto (escola/preparação/aplicador/data) + situação e re-pagina do zero.
  function applyFilter() {
    const q = norm(inFiltro ? inFiltro.value.trim() : '');
    const sit = selStatus ? selStatus.value : 'ativos';
    filtered = allTests.filter(t => {
      const h = t.header || {};
      if (sit === 'ativos'   && t.deletedAt) return false;
      if (sit === 'final'    && (t.deletedAt || t.status !== 'final')) return false;
      if (sit === 'rascunho' && (t.deletedAt || t.status !== 'rascunho')) return false;
      if (sit === 'excluido' && !t.deletedAt) return false;
      // 'todos' não filtra por situação
      if (!q) return true;
      return norm(`${h.escola} ${h.preparacao} ${h.aplicador} ${h.data}`).includes(q);
    });
    shown = PAGE;
    renderRows();
  }

  function renderRows() {
    disarm();                          // qualquer re-render volta ao estado neutro
    if (!filtered.length) {
      const vazio = allTests.length ? 'Nenhum teste corresponde ao filtro.' : 'Nenhum teste na nuvem.';
      lista.innerHTML = `<div class="meta">${vazio}</div>`;
      return;
    }
    const pagina = filtered.slice(0, shown);
    const linhas = pagina.map(t => {
      const h = t.header || {};
      const tag = t.deletedAt
        ? '<span class="meta" style="color:var(--red)">excluído</span>'
        : (t.status === 'rascunho'
            ? '<span class="meta" style="color:var(--warn)">rascunho</span>'
            : '<span class="meta" style="color:var(--ok)">final</span>');
      const acao = t.deletedAt
        ? `<button type="button" class="btn btn--ghost btn--small" data-restore-cloud="${esc(t.id)}">Restaurar</button>`
        : `<button type="button" class="btn btn--ghost btn--small" data-del-cloud="${esc(t.id)}">Excluir</button>`;
      return `<tr class="${t.deletedAt ? 'is-deleted' : ''}">
        <td>
          <b>${esc(h.preparacao || '(sem preparação)')}</b><br>
          <span class="meta">${esc(h.escola || '(sem escola)')} · ${esc(h.data || 's/ data')}${h.aplicador ? ' · ' + esc(h.aplicador) : ''}</span>
        </td>
        <td style="text-align:center">${tag}</td>
        <td style="text-align:right; white-space:nowrap">${fmtPct(t.aceitacao)} ${t.passou ? '✅' : '❌'}</td>
        <td style="text-align:right">${acao}</td>
      </tr>`;
    }).join('');
    const resumo = `Mostrando ${pagina.length} de ${filtered.length} teste(s)` +
      (filtered.length !== allTests.length ? ` (${allTests.length} no total)` : '') + '.';
    const maisBtn = shown < filtered.length
      ? `<div style="text-align:center; margin-top:.6rem"><button type="button" class="btn btn--ghost btn--small" data-loadmore>Carregar mais (${filtered.length - shown})</button></div>`
      : '';
    lista.innerHTML = `<div class="meta" style="margin-bottom:.4rem">${resumo}</div>
      <table><tbody>${linhas}</tbody></table>${maisBtn}`;
  }

  // ---------- ações ----------
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (inEmail && inEmail.value || '').trim();
      const senha = (inSenha && inSenha.value || '');
      if (!email || !senha) { setMsg(loginMsg, 'Informe e-mail e senha.', 'err'); return; }
      setMsg(loginMsg, 'Entrando…');
      const r = await api().signIn(email, senha);
      if (!r.ok) { setMsg(loginMsg, 'Falha no login: ' + (r.error || 'verifique os dados.'), 'err'); return; }
      if (inSenha) inSenha.value = '';
      setMsg(loginMsg, '');
      // a troca de tela vem pelo onAuthChange; mas garantimos aqui também:
      showLoggedIn(r.user);
    });
  }

  if (btnSair) btnSair.addEventListener('click', async () => {
    await api().signOut();
    showLoggedOut();
  });

  if (btnAtual) btnAtual.addEventListener('click', loadList);

  // filtro/busca (Tier 3): re-renderiza sobre os dados já em memória (sem novo fetch).
  let filtroTimer = null;
  if (inFiltro) inFiltro.addEventListener('input', () => {
    if (filtroTimer) clearTimeout(filtroTimer);
    filtroTimer = setTimeout(applyFilter, 150);
  });
  if (selStatus) selStatus.addEventListener('change', applyFilter);

  // exclusão (delegação) — confirmação NA PÁGINA (não usa confirm() nativo, que o
  // navegador pode suprimir após o 1º diálogo / extensões podem interceptar):
  // 1º clique arma o botão ("Confirmar exclusão"); 2º clique em até 4s apaga.
  let armedId = null, armTimer = null;
  function disarm() {
    if (armTimer) { clearTimeout(armTimer); armTimer = null; }
    armedId = null;
    if (!lista) return;
    const b = lista.querySelector('[data-del-cloud].is-armed');
    if (b) { b.classList.remove('is-armed'); b.textContent = 'Excluir'; }
  }
  if (lista) {
    lista.addEventListener('click', async (e) => {
      // "Carregar mais" — paginação incremental (sem novo fetch)
      if (e.target.closest('[data-loadmore]')) { shown += PAGE; renderRows(); return; }

      // "Restaurar" — desfaz o soft delete. Ação não destrutiva → 1 clique basta.
      const rb = e.target.closest('[data-restore-cloud]');
      if (rb) {
        const rid = rb.getAttribute('data-restore-cloud');
        rb.disabled = true; rb.textContent = 'Restaurando…';
        setMsg(panelMsg, 'Restaurando…');
        const rr = await api().restoreTeste(rid);
        if (!rr.ok) {
          rb.disabled = false; rb.textContent = 'Restaurar';
          const motivo = /sem permiss/i.test(rr.error || '')
            ? 'Seu e-mail não está autorizado. Verifique a allowlist no Supabase (e-mail do gestor).'
            : (rr.error || 'erro desconhecido.');
          setMsg(panelMsg, 'Não foi possível restaurar: ' + motivo, 'err');
          return;
        }
        setMsg(panelMsg, 'Teste restaurado.', 'ok');
        loadList();
        return;
      }

      // "Excluir" — soft delete, confirmação em 2 cliques na página
      const btn = e.target.closest('[data-del-cloud]');
      if (!btn) return;
      const id = btn.getAttribute('data-del-cloud');

      // 1º clique: arma este botão e desarma qualquer outro
      if (armedId !== id) {
        disarm();
        armedId = id;
        btn.classList.add('is-armed');
        btn.textContent = 'Confirmar exclusão';
        armTimer = setTimeout(disarm, 4000);
        setMsg(panelMsg, 'Clique de novo em "Confirmar exclusão" para excluir (pode ser restaurado depois).', 'err');
        return;
      }

      // 2º clique: executa
      if (armTimer) { clearTimeout(armTimer); armTimer = null; }
      armedId = null;
      btn.classList.remove('is-armed');
      btn.disabled = true;
      btn.textContent = 'Excluindo…';
      setMsg(panelMsg, 'Excluindo…');
      const r = await api().deleteTeste(id);
      if (!r.ok) {
        btn.disabled = false;
        btn.textContent = 'Excluir';
        const motivo = /sem permiss/i.test(r.error || '')
          ? 'Seu e-mail não está autorizado a excluir. Verifique a allowlist da função delete_teste no Supabase (e-mail do gestor).'
          : (r.error || 'erro desconhecido.');
        setMsg(panelMsg, 'Não foi possível excluir: ' + motivo, 'err');
        return;
      }
      setMsg(panelMsg, 'Teste excluído. Para reverter, filtre por "Excluídos" e clique em Restaurar.', 'ok');
      loadList();
    });
  }

  // ---------- reage à sessão e à abertura da tela ----------
  if (api() && api().onAuthChange) api().onAuthChange((user) => {
    if (user) showLoggedIn(user); else showLoggedOut();
  });

  // ao abrir a tela do gestor, revalida a sessão (e recarrega a lista se logado)
  const obs = new MutationObserver(() => { if (!view.hidden) refreshAuth(); });
  obs.observe(view, { attributes: true, attributeFilter: ['hidden'] });

  // estado inicial
  if (!view.hidden) refreshAuth();
})();
