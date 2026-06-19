# Página de Inteligência — Aceitabilidade PAE-DF

## Objetivo
Adicionar uma nova tela "Inteligência" ao PWA que extrai conhecimento dos dados do
questionário (escala hedônica): diagnóstico aprofundado do teste atual + painel
histórico/comparativo de testes salvos. Tudo offline, no aparelho (localStorage).

Decisão do usuário (2026-06-18): escopo **Híbrido** + histórico **salvo no aparelho**.

## Critérios de aceitação
- [ ] Novo card "Inteligência" na home (`data-view="inteligencia"`).
- [ ] Nova `<section id="inteligencia">` com 2 blocos: Teste atual + Histórico.
- [ ] Botão "Salvar no histórico" na tela de registro grava snapshot do teste.
- [ ] Diagnóstico do teste atual: veredito, score sensorial líquido, distribuição,
      turmas que puxam a média, adesão×aceitação (4 quadrantes), suficiência da
      amostra (margem de erro 95%), recomendação acionável.
- [ ] Histórico: KPIs (nº testes, % aprovados, aceitação/adesão médias),
      ranking de preparações (+/−), preparações que precisam reformulação,
      evolução temporal, agregação por escola.
- [ ] Gerenciar histórico: exportar/importar JSON, remover item, limpar tudo.
- [ ] Limiares de domínio reaproveitados (NÃO duplicar): 85% / adesão 70-50-30.
- [ ] `searchIndex` (app.js) atualizado com a nova seção.
- [ ] Cache do SW incrementado (v5→v6) e `inteligencia.js` adicionado a ASSETS.
- [ ] Sem novas dependências/build (regra da arquitetura).

## Plano de execução
1. registro.js: `consolidate(turmas)` helper; `HISTORY_KEY`; `buildSnapshot()`,
   `getHistory()/saveHistory()`; handler do botão "Salvar no histórico";
   expor `window.PAEReg` (API de leitura p/ inteligencia.js, sem duplicar lógica).
2. inteligencia.js (novo, IIFE): renderiza os 2 blocos, re-render ao abrir a view.
3. index.html: card na home; seção #inteligencia; botão salvar no #registro;
   `<script src="inteligencia.js" defer>`.
4. app.js: entrada no `searchIndex`.
5. styles.css: classes para barras de distribuição e listas de ranking.
6. sw.js: bump v5→v6 + ASSETS.

## Verificação
- `node --check` em registro.js, inteligencia.js, app.js (sintaxe).
- Teste funcional no Chrome (devtools MCP) carregando o index.html local:
  preencher registro → salvar no histórico → abrir Inteligência → conferir
  diagnóstico e painel; testar export/import JSON.

## Fase 1 (relatórios) + Fase 2 (nuvem) — 2026-06-18
- **Fase 1 — Relatórios consolidados** (`relatorios.js`): PDF (janela de impressão),
  XLSX (SheetJS, 4 abas), DOCX e ODT reais via mini-ZIP STORE + CRC32 próprio (sem
  libs). `aggregate(hist)` extraído de `inteligencia.js` e exposto em `window.PAEIntel`.
  Verificado: `unzip -t` OK nos 4; XML interno bem-formado (docx/odt); ODT `mimetype`
  1ª entrada stored; XLSX zip válido c/ 4 abas; PDF monta HTML sem erro. Math do
  consolidado conferido (aceit. média 78,0% / aprovados 50% / adesão 58,8%).
- **Fase 2 — Sincronização Google** (`nuvem.js` + `google-apps-script/Code.gs` +
  `GUIA-NUVEM.md`): envio via Apps Script Web App (POST no-cors, fila offline,
  dedupe por id no servidor) e leitura via CSV publicado. Toggle Local/Nuvem;
  relatórios seguem a fonte ativa. Verificado com fetch mockado: config salva;
  CSV parseado (inclui campo com vírgula entre aspas) → painel nuvem (75,0% / 50% /
  67,5%); fila offline enfileira + dedup + esvazia no flush. Setup Google depende
  da gestão (guia entregue). Cache SW → v8.

## Revisão (final — 2026-06-18)
- **Resultado:** Página "Inteligência" entregue (escopo híbrido). Novo arquivo
  `inteligencia.js` consome a API `window.PAEReg` exposta por `registro.js`
  (zero duplicação de lógica de domínio). Botão "💾 Salvar no histórico" grava
  snapshots em `localStorage['aceitabilidade_historico_v1']`.
- **Evidências (teste no Chrome via devtools, dados semeados):**
  - Diagnóstico do teste atual confere: aceitação 84,9%, MoE ±3,3pp (95% c/
    correção finita N=60,n=53), intervalo 81,6–88,2% → "inconclusivo"; SSL +77;
    turma fraca 3º A (78,6%) destacada; recomendação + aviso amostra <100.
  - Histórico: 3 testes → 66,7% aprovados, aceit. média 80,0%, adesão 60,0%;
    rankings, reformulação, evolução por data (corte 85%), por escola
    (CEM 01=90,0% / CEF 02=60,0%).
  - Salvar no histórico: 3→4; dedupe por escola+preparação+data substitui (mantém 4).
  - `node --check` OK nos 4 JS; **zero erros/warnings no console**.
  - Screenshot: `tasks/intel-screenshot.png`.
- **Riscos residuais:** histórico é por-aparelho (localStorage) — backup só via
  exportar/importar JSON. Margem de erro usa matriculados como população (proxy).
- **Próximos passos:** commit/push e deploy (GitHub Pages do repo gestec-seedf)
  dependem de confirmação do usuário — o remoto não é deste usuário.

---

## Revisão — Sync obrigatória + BI protegido por credencial (2026-06-18)

**Decisões do usuário:** sync automática/obrigatória; offline = salvar+fila+reenvio
automático (nunca bloqueia); login do BI lembrado por aparelho (com "Sair").

**Restrição decisiva:** repositório é **público** → senha client-side ou CSV público
seriam teatro. Solução: leitura do BI passa a ser **autenticada por token no Apps Script**
(segredo só na conta da gestão), substituindo o CSV.

**Mudanças:**
- `google-apps-script/Code.gs`: `doPost` com `action:'read'` valida `READ_TOKEN` e devolve
  os testes em JSON; escrita inalterada (dedupe por id, aberta).
- `nuvem.js`: URL de envio embutida; token em localStorage (`getToken/verifyToken/logout`);
  leitura autenticada via POST cors (token no corpo, não na URL); nuvem vira fonte padrão
  do BI; gate (`applyGate`) e auto-pull ao abrir a tela.
- `inteligencia.js`: `render()` **default-deny** — sem módulo de credencial ou sem login,
  não renderiza nada.
- `index.html` (#inteligencia): `#biGate` (senha) + `#biContent` (BI); seção de sync
  simplificada (Atualizar nuvem / Reenviar pendentes / Sair). Campos de URL removidos.
- `GUIA-NUVEM.md`: novo fluxo (sem CSV; senha no Apps Script; login no BI).

**Evidências (verificação local, chrome-devtools):**
- `node --check` OK em nuvem/inteligencia/registro; console sem erros.
- Gate fechado por padrão: gate visível, conteúdo oculto, **0 dados renderizados**.
- Login (fetch mockado, 2 testes): gate oculto, conteúdo visível, indicadores e rankings
  corretos, status "Sincronização automática ativa · Nuvem (2 testes…)".
- Logout: token apagado, volta ao gate, modo local.

**Riscos residuais:** envio aberto (URL pública) permite POST de linha falsa (mitigado por
dedupe; validação estrutural opcional). Token em localStorage → "Sair" limpa. Bloco
"diagnóstico atual" também fica atrás do login (ajuste fácil se quiserem abri-lo).

**Pendente (só o usuário faz):** colar `Code.gs` no Apps Script, definir `READ_TOKEN`,
implantar **Nova versão**. Só então o teste ponta-a-ponta da **leitura** roda contra o
endpoint real (a verificação acima cobre todo o front-end). Apagar a linha `TESTE_NAVEGADOR`.

---

# Plano — Migração Supabase + BI aberto + Gráficos (2026-06-19)

> Decisões do usuário: (1) migrar Google Sheets → **Supabase**; (2) **remover a senha**
> do painel de Inteligência (leitura pública); (3) implementar **gráficos** junto.

## Objetivo
Painel de inteligência **aberto e visual** para as nutricionistas otimizarem o cardápio,
sobre backend **robusto** (Postgres/Supabase) que corrige a fraqueza atual (escrita 100%
aberta na planilha) sem reintroduzir fricção de senha.

## Arquitetura alvo

### Backend (Supabase / Postgres)
- Tabela `testes` (colunas = snapshot atual).
- **Escrita endurecida**: RPC `submit_teste(payload jsonb)` `SECURITY DEFINER` que valida
  faixas (contagens ≥ 0, soma respostas ≤ presentes, aceitação 0–100) e faz **upsert por
  id**. Anon recebe **EXECUTE só nessa função** — sem INSERT/UPDATE/DELETE direto na
  tabela. Resolve estruturalmente a poluição de dados.
- **Leitura pública** (BI sem senha): RLS `SELECT using (true)` para `anon`.
- `anon public key` + URL embutidos no app (públicos por design; RLS protege).
- Ganho: escrita deixa de ser `no-cors` opaca → o app **sabe** se gravou.

### Frontend (continua PWA estático, sem build)
- `lib/supabase.js` + `lib/chart.umd.js` vendorizados (offline-first como o xlsx).
- `nuvem.js` → reescrito como `supabase.js`, **mantendo o nome global `window.PAENuvem`**
  e a superfície (`getActiveHistory`, `getMode`, `sendSnapshot`, `flush`, `isConfigured`)
  p/ não quebrar `inteligencia.js`/`relatorios.js`. Mantém **fila offline**; flush via RPC.
  Remove token/login/logout/verifyToken/gate.
- `inteligencia.js`: `render()` sem bloqueio de auth — sempre Bloco A (local) + Bloco B
  (consolidado público). Preserva `PAEIntel.aggregate/fmt`.
- `graficos.js` (novo, Chart.js tematizado por CSS vars): distribuição (doughnut),
  tendência de aceitação por data (line, corte 85%), comparativo por preparação/escola (bar).
- `index.html`: remove UI do gate (#biGate/#biPass/#biEnter/#biLogout); adiciona canvases;
  injeta config Supabase (URL + anon key).
- `sw.js`: cache v9 — troca `nuvem.js`→`supabase.js`, adiciona libs e `graficos.js`.

### Legado / migração
- `Code.gs` + `GUIA-NUVEM.md` viram legado (fonte da migração). Novo `GUIA-SUPABASE.md`
  com SQL (schema + RLS + RPC) e passo-a-passo. Migração one-time dos testes da planilha.

## Etapas
1. [ ] SQL Supabase: schema + CHECK + RLS (select público) + RPC `submit_teste` + grants.
2. [ ] Vendorizar `lib/supabase.js` e `lib/chart.umd.js`.
3. [ ] Reescrever `nuvem.js` → `supabase.js`.
4. [ ] Ajustar `inteligencia.js` (remover gate).
5. [ ] `graficos.js` + canvases; remover UI de senha no `index.html`.
6. [ ] `sw.js` (v9) + `<script>` no `index.html`.
7. [ ] `GUIA-SUPABASE.md`; marcar `Code.gs`/`GUIA-NUVEM.md` legado.
8. [ ] Migração de dados existentes (se houver).
9. [ ] Verificação + commit/push.

## Critérios de aceitação
- [ ] Salvar online → linha no Supabase via RPC; reabrir → dedupe por id.
- [ ] Offline: salvar → fila; reconectar → flush grava.
- [ ] Painel abre **sem senha**: diagnóstico local + consolidado de todas as escolas.
- [ ] Gráficos renderizam e batem com as tabelas.
- [ ] `relatorios.js` segue exportando (PDF/XLSX/DOCX/ODT).
- [ ] RLS: `anon` não faz UPDATE/DELETE direto; só RPC + SELECT.
- [ ] `submit_teste` rejeita payload inválido (soma respostas > presentes).

## Riscos
- **Free tier pausa após ~1 semana inativo** → BI/sync caem até acordar. Mitigação:
  keep-alive diário, aceitar atraso, ou plano pago.
- `anon key` pública: ok; integridade via RLS + validação na RPC.
- Bundle offline (supabase-js + Chart.js) — vendorizar e cachear no SW.
- LGPD: dado agregado; "aplicador" é o único campo pessoal — avaliar exibir/omitir no BI.

## Preciso de você (bloqueadores)
1. Criar projeto Supabase → me passar **Project URL** + **anon public key** (ou placeholders).
2. Rodar o **SQL** que eu gerar.
3. Há **dados reais** na planilha atual a migrar? (sim/não)
4. Ciente do **risco de pausa do free tier**? Keep-alive ou aceita o atraso?

## Revisão (final — 2026-06-19)
- **Resultado:** Migração concluída e verificada. Backend agora é **Supabase**
  (projeto `rjtnzrnbadoxixdxgwpl`, sa-east-1). Schema aplicado por mim via pooler
  (`supabase/schema.sql`). BI **aberto** (gate removido). **Gráficos** (Chart.js) no painel.
  - Novos: `supabase.js` (substitui `nuvem.js`), `graficos.js`, `lib/supabase.js`,
    `lib/chart.umd.js`, `supabase/schema.sql`, `GUIA-SUPABASE.md`,
    `.github/workflows/keepalive.yml`. Removido: `nuvem.js`.
  - Editados: `index.html` (sem gate, +canvases, +scripts), `inteligencia.js`
    (sem gate, +renderCharts), `styles.css` (.chart-card/.chart-box), `sw.js` (v9).
  - Legado marcado: `Code.gs`, `GUIA-NUVEM.md`.
- **Evidências:**
  - SQL aplicado: "SCHEMA APPLIED OK". `node --check` OK em 7 arquivos JS.
  - REST (papel anon): escrita RPC 204; leitura pública OK (turmas jsonb preservado);
    INSERT direto **bloqueado pelo RLS** (42501); dado inválido **rejeitado** pela RPC
    ("soma das respostas (20) maior que presentes (5)"); keepalive "ok".
  - Chrome (localhost:8765): após limpar SW v8 obsoleto — libs carregadas, `PAENuvem`
    sem chaves de gate, `hasGate:false`, 3 canvases presentes, **console sem erros**.
    `sendSnapshot` E2E → {ok:true}; painel abre sem senha (mode=nuvem, "1 testes");
    gráficos trend+escolas renderizados; dist confirmado com dados de amostra.
  - Linhas de teste limpas do Supabase (0 ao final). Sem vazamento da senha do banco
    em arquivos versionados.
- **Riscos residuais:** free tier pode pausar (mitigado por keep-alive, requer Actions
  habilitado). Senha do banco foi compartilhada no chat → **usuário deve rotacionar**.
  `aplicador` (dado pessoal) fica visível no BI público — avaliar omitir se necessário.
- **Próximos passos (pendente confirmação do usuário):** commit/push ao
  `gestec-seedf/aceitabilidade-paedf` (deploy em produção via GitHub Pages); rotacionar
  senha do banco; habilitar GitHub Actions.
