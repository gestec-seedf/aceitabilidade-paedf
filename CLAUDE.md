# CLAUDE.md — Aceitabilidade · PAE-DF

App de bolso (**PWA**) para os **testes de aceitabilidade da alimentação escolar do DF** (PNAE/FNDE).
Reúne o conteúdo do *Boletim Alimentação — 24ª ed. (06/2026)* (DIAE/SEE-DF), calculadoras, registro
de resultados com exportação e um painel de Inteligência (BI) alimentado por uma nuvem Supabase.

> Instruções globais de comportamento (modo plano, subagentes, verificação, memória) estão em
> `~/.claude/CLAUDE.md`. Este arquivo cobre **só o que é específico deste projeto**.

---

## Stack e princípio central

**HTML + CSS + JavaScript puro. Sem build, sem framework, sem npm, sem bundler.**
Abre direto pelo `index.html`; funciona offline via service worker. Todas as bibliotecas são
**vendorizadas** em `lib/` (SheetJS, Chart.js, supabase-js) — nunca via CDN em runtime.

> Não introduza dependências, etapa de build ou framework sem necessidade real e discutida.
> DOCX/ODT, por exemplo, são gerados por um mini-ZIP próprio em `relatorios.js`, sem libs externas.

---

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | Todas as telas (`<section class="view">`), cards da home, template de turma |
| `styles.css` | Estilos, temas (`[data-theme]`), tokens em `:root` |
| `app.js` | Navegação SPA, tema, busca, 5 calculadoras |
| `registro.js` | Registro de resultados, consolidação, histórico local, exports (CSV/XLSX/PDF). Expõe `window.PAEReg` |
| `inteligencia.js` | Painel BI: diagnóstico do teste atual + histórico (rankings, tendências). Expõe `window.PAEIntel` |
| `graficos.js` | Gráficos do BI (Chart.js vendorizado). Lê cores via CSS vars (dark mode OK) |
| `relatorios.js` | Relatórios consolidados PDF/XLSX/DOCX/ODT (mini-ZIP sem dependências) |
| `supabase.js` | Sincronização com a nuvem. Expõe `window.PAENuvem` |
| `sw.js` | Service worker (cache offline) |
| `manifest.json` | Metadados PWA |
| `lib/` | Bibliotecas vendorizadas — **não editar** |
| `supabase/schema.sql` | Schema + RLS + RPCs do backend (rodar inteiro no SQL Editor) |
| `google-apps-script/` | **Legado** (backend antigo via Sheets) — substituído pelo Supabase |

Cada módulo JS é uma **IIFE isolada** que falha silenciosamente se seus elementos não existem,
e se comunica com os outros **só pelas APIs globais** (`window.PAEReg`, `PAEIntel`, `PAENuvem`).
Não duplique lógica de domínio entre módulos — consuma a API pública.

---

## ⚠️ Regras críticas (quebram silenciosamente se ignoradas)

1. **Bump do cache do service worker.** Ao editar **qualquer** asset cacheado (html/css/js/icons/
   manifest), incremente `const CACHE` em `sw.js:1` (`aceitabilidade-v9` → `-v10`). Sem isso, usuários
   instalados continuam recebendo a versão antiga. Arquivo novo servido → adicione-o também ao array
   `ASSETS` (`sw.js:2-19`).

2. **Leitura da nuvem com `cache:'no-store'`.** O `createClient` do supabase-js (`supabase.js:19-24`)
   injeta um `fetch` sem cache. Sem isso o BI mostra dados desatualizados e "Atualizar" não traz o novo.
   Não remova essa injeção. (Ver `tasks/lessons.md`.)

3. **`searchIndex` é manual** (`app.js:64-79`). Uma seção/calculadora sem entrada lá fica **invisível
   na busca**. Ao adicionar tela, adicione a entrada (`id`, `t`, `kw` sem acento).

4. **Invariantes de domínio** ao mexer em qualquer número: aceitação usa **participantes** no
   denominador, adesão usa **presentes**; soma das 5 respostas de uma turma **nunca** excede os
   presentes (`enforceMax`). Ver skill `pae-df-dominio`.

---

## Domínio (PNAE/PAE-DF) — limiares que são contrato

| Métrica | Fórmula | Critério |
|---|---|---|
| Aceitação (hedônica) | (Adorei+Gostei) / Participantes | **≥ 85%** |
| Resto-ingestão | 100 − (resto/distribuído) | **≥ 90%** |
| Índice de adesão | Participantes / Presentes (média das turmas) | Alta >70 · Média 50–70 · Baixa 30–50 · Muito baixa <30 |
| Tamanho da amostra | n finito, com clamp **100–500** (regra DF, NT 3/2022) | +20% de folga na escola |

**Não invente limiares.** Toda mudança numérica deve casar com o *Boletim 24ª ed.* e com os textos das
seções em `index.html`. Ao alterar um limiar, atualize em conjunto: calculadora (`app.js`), `registro.js`,
textos do `index.html` e `searchIndex`. Detalhes completos na skill **`pae-df-dominio`**.

---

## Backend — Supabase (serverless)

Migrado do Apps Script/Sheets em 2026-06-19. App continua 100% estático.

- **Escrita:** cada teste salvo chama a RPC `submit_teste()` (`SECURITY DEFINER`, valida e faz upsert
  por `id`). `anon` **não** tem INSERT/UPDATE/DELETE direto (bloqueado por RLS). Offline → fila local
  (`localStorage`) reenviada sozinha ao reconectar.
- **Leitura (BI):** pública, sem senha — `anon SELECT` liberado. Integridade garantida por RLS + validação na RPC.
- A **anon key é pública por design** (já embutida no app e no workflow); quem protege é o RLS. Não a trate como segredo.
- Schema completo e idempotente em `supabase/schema.sql`. `keepalive()` + workflow diário
  (`.github/workflows/keepalive.yml`) evitam a pausa do free tier.
- Em rede IPv4, conexão direta `psycopg2`/`psql` falha (host só publica IPv6) — usar o **pooler**
  (`...pooler.supabase.com`). Ver `tasks/lessons.md`.

---

## Como validar mudanças

- **Frontend:** servir por http (`python -m http.server 8080`) — o SW não funciona via `file://`.
  Antes de verificar, **desregistre o SW e limpe `caches`**, senão o navegador serve a versão antiga
  (cache-first). Bump de versão resolve em produção, mas no teste local force a limpeza.
- **Gráficos/agregações:** testar com **dados variados** (várias datas, datas repetidas, intervalos
  diferentes), nunca com 1 ponto só.
- **Segurança/RLS:** validar pelo caminho real (**REST com a anon key**, papel `anon`), não via
  `postgres` (que ignora RLS).

---

## Skills do projeto (em `.claude/skills/`)

| Skill | Quando usar |
|---|---|
| `pae-df-dominio` | Qualquer cálculo, critério, classificação, limiar ou base legal |
| `pwa-vanilla-arquitetura` | Seções, calculadoras, navegação SPA, tema, busca, service worker |
| `registro-exportacoes` | Módulo de registro e exportações (CSV/XLSX/PDF/DOCX/ODT) |

`tasks/lessons.md` guarda as lições já aprendidas (cache do SW, no-store, IPv6 do Supabase,
validação por papel anon) — revise no início de cada sessão relevante.
