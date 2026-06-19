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

## 2026-06-19 — Verificar pelo caminho real (papel anon), não como superusuário
- **Acerto a manter:** validei o RLS/segurança via **REST com a anon key** (papel `anon`),
  não via psycopg2 (que conecta como `postgres` e ignora RLS). Só assim o teste prova que
  o app real está protegido (INSERT direto deu 42501; RPC validou). Conexão postgres serve
  para DDL/limpeza, não para validar políticas de acesso.
