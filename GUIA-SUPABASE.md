# Guia — Backend Supabase (Aceitabilidade PAE-DF)

Este app usa o **Supabase** (Postgres) como nuvem central. A sincronização é automática
e o **Painel de Inteligência é aberto** (sem senha): qualquer aparelho lê o consolidado
de todas as escolas. A integridade do dado é garantida no servidor (RLS + validação),
não por senha no app.

> Substitui o fluxo antigo do Google Apps Script (`google-apps-script/Code.gs` e
> `GUIA-NUVEM.md`), que agora são **legado**.

## Como funciona

- **Escrita**: cada teste salvo chama a função `submit_teste()` (no banco), que **valida**
  o dado (contagens ≥ 0, soma das respostas ≤ presentes, percentuais 0–100) e faz
  *upsert* por `id` (reenvio não duplica). Sem internet, o teste fica numa fila local e
  é reenviado sozinho ao reconectar.
- **Leitura**: pública (papel `anon` faz `SELECT`). É isso que abre o painel sem senha.
- **Segurança**: o `anon` **não** consegue inserir/alterar/apagar linhas direto (RLS
  bloqueia) — só pode ler e chamar `submit_teste()`. A `anon key` embutida no app é
  pública por design.

## O que já está pronto (feito na migração)

1. ✅ Schema aplicado no projeto `rjtnzrnbadoxixdxgwpl` (tabela `testes` + RLS + RPCs).
   O SQL fica versionado em [`supabase/schema.sql`](supabase/schema.sql) — é idempotente,
   pode rodar de novo se precisar recriar.
2. ✅ App apontando para a URL + anon key do projeto (`supabase.js`).
3. ✅ Verificado ponta a ponta (escrita validada, leitura pública, RLS bloqueando escrita
   direta, rejeição de dado inválido).

## O que VOCÊ precisa fazer

1. **Rotacionar a senha do banco** (ela foi compartilhada no chat durante a migração):
   Supabase → Project Settings → Database → **Reset database password**. Isso **não**
   afeta o app (ele usa só a anon key, não a senha do banco).

2. **Ligar o keep-alive** (evita a pausa do free tier por inatividade):
   - O workflow já está em [`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml).
   - No GitHub do repositório: aba **Actions** → habilite os workflows se pedir.
   - Ele roda sozinho 1×/dia. Para testar agora: Actions → "Supabase keep-alive" →
     **Run workflow**.

## Como ver / exportar os dados

- **No app**: tela **Inteligência** → indicadores, rankings, gráficos e relatórios
  (PDF/Excel/Word/ODT).
- **Direto no Supabase**: Table Editor → tabela `testes`. Ou SQL Editor:
  `select * from testes order by saved_at desc;`

## Trocar de projeto Supabase (se um dia precisar)

1. Rode [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor do novo projeto.
2. Atualize `SUPABASE_URL` e `SUPABASE_ANON` em `supabase.js`.
3. Atualize a anon key e a URL em `.github/workflows/keepalive.yml`.
