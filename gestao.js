// ===== Área do gestor: login (Supabase Auth) + exclusão definitiva na nuvem =====
// Módulo isolado (IIFE). Conversa só pela API global window.PAENuvem. Falha em silêncio
// se seus elementos não existirem. A exclusão é validada NO SERVIDOR (RPC delete_teste:
// exige sessão autenticada + e-mail na allowlist) — o cliente aqui é só a interface.
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

  const api = () => window.PAENuvem;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
  async function loadList() {
    if (!lista) return;
    lista.innerHTML = '<div class="meta">Carregando testes da nuvem…</div>';
    setMsg(panelMsg, '');
    try {
      const all = await api().fetchAllAdmin();
      renderList(all);
    } catch (e) {
      lista.innerHTML = '<div class="meta">Não foi possível carregar.</div>';
      setMsg(panelMsg, 'Erro ao carregar: ' + (e && e.message ? e.message : e), 'err');
    }
  }

  function renderList(all) {
    if (!all.length) {
      lista.innerHTML = '<div class="meta">Nenhum teste na nuvem.</div>';
      return;
    }
    const linhas = all.map(t => {
      const h = t.header || {};
      const tag = t.status === 'rascunho'
        ? '<span class="meta" style="color:var(--warn)">rascunho</span>'
        : '<span class="meta" style="color:var(--ok)">final</span>';
      return `<tr>
        <td>
          <b>${esc(h.preparacao || '(sem preparação)')}</b><br>
          <span class="meta">${esc(h.escola || '(sem escola)')} · ${esc(h.data || 's/ data')}${h.aplicador ? ' · ' + esc(h.aplicador) : ''}</span>
        </td>
        <td style="text-align:center">${tag}</td>
        <td style="text-align:right; white-space:nowrap">${fmtPct(t.aceitacao)} ${t.passou ? '✅' : '❌'}</td>
        <td style="text-align:right">
          <button type="button" class="btn btn--ghost btn--small" data-del-cloud="${esc(t.id)}">Excluir</button>
        </td>
      </tr>`;
    }).join('');
    lista.innerHTML = `<div class="meta" style="margin-bottom:.4rem">${all.length} teste(s) na nuvem.</div>
      <table><tbody>${linhas}</tbody></table>`;
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

  // exclusão (delegação) — dois confirmes, pois é definitivo
  if (lista) {
    lista.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-del-cloud]');
      if (!btn) return;
      const id = btn.getAttribute('data-del-cloud');
      if (!confirm('Excluir este teste da nuvem? A ação é DEFINITIVA e vale para todas as escolas.')) return;
      if (!confirm('Confirme novamente: apagar permanentemente este teste?')) return;
      btn.disabled = true;
      setMsg(panelMsg, 'Excluindo…');
      const r = await api().deleteTeste(id);
      if (!r.ok) {
        btn.disabled = false;
        const motivo = /sem permiss/i.test(r.error || '')
          ? 'Seu e-mail não está autorizado a excluir. Verifique a allowlist da função delete_teste no Supabase (e-mail do gestor).'
          : (r.error || 'erro desconhecido.');
        setMsg(panelMsg, 'Não foi possível excluir: ' + motivo, 'err');
        alert('Não foi possível excluir.\n\n' + motivo);
        return;
      }
      setMsg(panelMsg, 'Teste excluído.', 'ok');
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
