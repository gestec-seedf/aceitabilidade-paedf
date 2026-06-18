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
