# Lições — aceitabilidade-paedf

## 2026-06-19 — Supabase: host direto é IPv6-only
- **Erro:** tentei `psycopg2.connect` no host `db.<ref>.supabase.co:5432` → DNS falhou
  ("could not translate host name") nesta rede IPv4.
- **Causa raiz:** o host de conexão direta do Supabase só publica AAAA (IPv6). Rede sem IPv6.
- **Regra:** para DDL/migração via psycopg2/psql em rede IPv4, usar o **pooler**:
  `aws-<n>-<região>.pooler.supabase.com`, porta **5432 (session, p/ DDL)** ou 6543
  (transaction), user `postgres.<ref>`. O app em si usa REST (IPv4 OK), não conexão direta.

## 2026-06-19 — Service worker serve assets obsoletos no teste local
- **Erro:** primeira carga no Chrome mostrou o código ANTIGO (chaves de gate, sem libs
  novas) mesmo com os arquivos já atualizados em disco.
- **Causa raiz:** SW com fetch **cache-first** de uma sessão anterior (v8) interceptou e
  serviu o cache velho; o `reload` normal não basta.
- **Regra:** antes de verificar mudanças de frontend num PWA com SW, **desregistrar o SW
  e limpar `caches`** (`navigator.serviceWorker.getRegistrations()` + `caches.keys/delete`),
  depois `reload` com `ignoreCache`. Bump do nome do cache no `sw.js` ajuda em produção,
  mas no teste local force a limpeza.

## 2026-06-19 — supabase-js sem cache:'no-store' → BI mostra dados velhos
- **Erro:** após migrar para `supabase-js`, a leitura do painel vinha do **cache HTTP do
  navegador** — mostrava testes já apagados; "Atualizar dados da nuvem" não trazia o novo.
  O `nuvem.js` antigo tinha `cache:'no-store'` e eu perdi isso na troca.
- **Causa raiz:** `createClient` usa o `fetch` global sem desabilitar cache; respostas GET
  ficavam cacheadas (servidor era `CF-Cache-Status: DYNAMIC`, ou seja, o cache era do browser).
- **Regra:** ao usar `supabase-js` para dados que mudam, injetar fetch sem cache:
  `createClient(url, key, { global: { fetch: (u,o={}) => fetch(u, {...o, cache:'no-store'}) } })`.
- **Detecção:** comparar a resposta do **curl** (sem cache do browser) com a do app. Se o
  curl traz o dado novo e o app não, é cache do navegador.

## 2026-06-19 — Verificar gráfico com DADOS VARIADOS, não com 1 ponto
- **Erro:** validei os gráficos com 1 só teste → o gráfico de "Evolução por data" parecia ok,
  mas estava **semanticamente errado**: ligava testes de preparações/escolas diferentes numa
  linha, duplicava datas iguais e usava eixo categórico (intervalos desiguais apareciam iguais).
- **Causa raiz:** com 1 ponto não dá para ver agregação, duplicatas nem espaçamento temporal.
- **Regra:** testar gráfico/agregação com **dados que cobrem os casos** (várias datas, datas
  repetidas, intervalos diferentes). Para série temporal: agregar por data (1 ponto/dia) e usar
  **eixo de tempo proporcional** (`type:'linear'` + x = timestamp), nunca eixo categórico de strings.

## 2026-06-19 — Verificar pelo caminho real (papel anon), não como superusuário
- **Acerto a manter:** validei o RLS/segurança via **REST com a anon key** (papel `anon`),
  não via psycopg2 (que conecta como `postgres` e ignora RLS). Só assim o teste prova que
  o app real está protegido (INSERT direto deu 42501; RPC validou). Conexão postgres serve
  para DDL/limpeza, não para validar políticas de acesso.

## 2026-06-19 — Filtro de leitura que depende de coluna nova = migração ANTES do frontend
- **Risco identificado (antes de quebrar):** ao adicionar auto-save com `status`
  ('rascunho'/'final'), o `fetchRemote` passou a filtrar `.eq('status','final')`. O banco de
  produção ainda **não** tinha a coluna → REST devolveu `42703 column testes.status does not
  exist`. Se o frontend subisse antes do SQL, o **BI inteiro quebraria** (read lança erro).
- **Regra:** quando uma mudança de frontend passa a depender de coluna/RPC novos, a **migração
  idempotente (`schema.sql`) roda PRIMEIRO**, depois publica o frontend. Verificar o estado real
  do banco por REST anon (`select=...,coluna`) antes de assumir que a coluna existe.
- **Detecção barata:** `curl .../rest/v1/testes?select=id,status&limit=1` com a anon key —
  se vier `42703`, a migração ainda não foi aplicada.
- **Design correlato:** id **estável** por sessão de formulário (não aleatório a cada save) é o
  que permite auto-save sem duplicar — upsert por id cai sempre na mesma linha. Rotacionar o id
  só ao "Limpar tudo" ou quando a identidade (escola|preparação|data) de um teste já finalizado
  muda (= começou outro teste no mesmo formulário).

## 2026-06-22 — Auditoria: `searchView` invisível e fila offline com perda silenciosa
- **Bug 1 (busca):** a view `registro` ("Planilha de Resultados") não tinha entrada no
  `searchIndex` (`app.js`) → buscar "planilha", "exportar", "csv" não achava a principal
  ferramenta. É exatamente o gotcha do `CLAUDE.md §3` ("searchIndex é manual"). Corrigido
  adicionando a entrada. **Regra:** ao criar/renomear uma `section.view`, adicionar SEMPRE a
  entrada no `searchIndex` no mesmo commit; validar buscando um termo da tela.
- **Bug 2 (offline):** `setQueue` em `supabase.js` engolia `QuotaExceededError` com
  `catch(e){}` → se o `localStorage` lotasse offline, o teste preenchido sumia sem aviso.
  Corrigido: `setQueue` retorna bool e avisa via `showMsg(...,'err')`; `enqueue`/`sendSnapshot`
  propagam o resultado. **Regra:** nunca engolir erro de escrita em `localStorage` quando o
  dado é a única cópia (fila offline) — sempre dar feedback ao usuário.
- **Falsos positivos de subagentes (descartados após verificar):** "SSL divide por zero"
  (já há guarda antes), "adesão deveria ser ponderada" (contradiz o contrato "média das
  turmas"), "leitura pública é vulnerabilidade" (é design documentado, dados sem PII de aluno),
  "SW não registrado" (está, com skipWaiting+claim). **Regra:** achado de subagente de auditoria
  é hipótese, não veredito — confirmar contra o contrato (`CLAUDE.md`/skill de domínio) e o
  código real antes de "corrigir". Vários "críticos" eram by-design.
- **Verificação de UI local:** o cache de disco do navegador serviu HTML/JS antigos mesmo após
  desregistrar SW + limpar `caches` + `ignoreCache`. O que funcionou: abrir aba em
  **`isolatedContext`** novo (contexto de browser limpo) com query cache-buster. `curl` ao
  servidor confirma o que está realmente sendo entregue vs. o que o browser executou.
- **Busca tem debounce de 120ms** (`app.js`): ler `#searchResults` síncrono logo após disparar
  o evento `input` dá vazio (falso negativo). Em teste automatizado, `await ~220ms` antes de ler.

## 2026-06-23 — Área do gestor: exclusão na nuvem exige auth validada no servidor
- **Necessidade:** gestores precisavam apagar testes preenchidos indevidamente. O "Remover" do BI
  só limpa histórico **local**; `anon` não tem DELETE (RLS) → não havia como excluir da nuvem.
- **Solução:** Supabase Auth (login único compartilhado) + RPC `delete_teste(p_id)`
  `SECURITY DEFINER` que exige `auth.role()='authenticated'` **e** e-mail numa allowlist, com
  `grant execute ... to authenticated` (revogado de `anon`). Hard delete. Front em `gestao.js`
  (IIFE isolada consumindo `window.PAENuvem`), novos métodos no `supabase.js`
  (signIn/signOut/onAuthChange/fetchAllAdmin/deleteTeste) e `persistSession:true`.
- **Regra de segurança (causa raiz):** como o app é estático e a anon key é pública, QUALQUER
  proteção tem de ser no servidor. Atenção ao **auto-cadastro do Supabase** (ligado por padrão):
  sem desabilitar, qualquer um vira `authenticated`. Por isso a allowlist na RPC é obrigatória
  (defesa em profundidade), além de desligar signup no painel.
- **Validação:** testar `delete_teste` pelo papel **anon** (sem sessão) → deve falhar; com sessão
  fora da allowlist → `sem permissao`. Só o gestor da allowlist apaga. (DDL roda no painel; não
  apliquei no banco de produção — fica nos passos manuais do `GUIA-SUPABASE.md`.)
