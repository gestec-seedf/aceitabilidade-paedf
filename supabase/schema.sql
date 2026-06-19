-- ============================================================================
-- Aceitabilidade PAE-DF — Schema Supabase (Postgres)
-- Rode este arquivo INTEIRO uma vez no Supabase: SQL Editor → New query → cole → Run.
-- Idempotente: pode rodar de novo sem quebrar (usa IF NOT EXISTS / OR REPLACE).
--
-- Modelo de segurança:
--   • ESCRITA: só pela função submit_teste() (SECURITY DEFINER, valida o dado).
--     O papel "anon" NÃO tem INSERT/UPDATE/DELETE direto na tabela (RLS bloqueia).
--   • LEITURA: pública (anon SELECT) — o painel de Inteligência é aberto, sem senha.
-- ============================================================================

-- ---------- Tabela ----------
create table if not exists public.testes (
  id            text primary key,
  saved_at      timestamptz default now(),
  regional      text,
  escola        text,
  programa      text,
  preparacao    text,
  data          text,          -- data do teste no formato 'YYYY-MM-DD' (string, como no app)
  aplicador     text,
  matriculados  integer default 0 check (matriculados >= 0),
  presentes     integer default 0 check (presentes >= 0),
  participantes integer default 0 check (participantes >= 0),
  adorei        integer default 0 check (adorei >= 0),
  gostei        integer default 0 check (gostei >= 0),
  indiferente   integer default 0 check (indiferente >= 0),
  naogostei     integer default 0 check (naogostei >= 0),
  detestei      integer default 0 check (detestei >= 0),
  aceitacao     numeric default 0 check (aceitacao between 0 and 100),
  adesao_media  numeric default 0 check (adesao_media between 0 and 100),
  passou        boolean default false,
  turmas        jsonb,           -- detalhe por turma (preservado; o Sheets descartava)
  status        text not null default 'final'  -- 'rascunho' (auto-save) | 'final' (BI conta só este)
);

-- Migração idempotente para bancos já criados antes da coluna status existir.
alter table public.testes add column if not exists status text not null default 'final';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'testes_status_chk') then
    alter table public.testes add constraint testes_status_chk check (status in ('rascunho','final'));
  end if;
end $$;

create index if not exists testes_data_idx   on public.testes (data);
create index if not exists testes_escola_idx  on public.testes (escola);
create index if not exists testes_status_idx  on public.testes (status);

-- ---------- RLS: leitura pública, escrita bloqueada (só via RPC) ----------
alter table public.testes enable row level security;

drop policy if exists "leitura publica" on public.testes;
create policy "leitura publica" on public.testes
  for select to anon, authenticated using (true);

-- (sem policy de insert/update/delete → anon não escreve direto na tabela)

-- ---------- RPC de escrita validada ----------
-- Recebe o snapshot do app (mesmo JSON enviado antes ao Apps Script) e faz upsert por id.
-- Roda como dono (postgres) → ignora RLS para gravar, mas valida o conteúdo antes.
create or replace function public.submit_teste(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     text   := nullif(payload->>'id','');
  h        jsonb  := coalesce(payload->'header','{}'::jsonb);
  t        jsonb  := coalesce(payload->'totals','{}'::jsonb);
  v_matric int    := coalesce((t->>'matric')::int, 0);
  v_pres   int    := coalesce((t->>'pres')::int, 0);
  v_part   int    := coalesce((t->>'partic')::int, 0);
  v_ado    int    := coalesce((t->>'adorei')::int, 0);
  v_gos    int    := coalesce((t->>'gostei')::int, 0);
  v_ind    int    := coalesce((t->>'indif')::int, 0);
  v_ng     int    := coalesce((t->>'naogostei')::int, 0);
  v_det    int    := coalesce((t->>'detestei')::int, 0);
  v_soma   int;
  v_aceit  numeric := coalesce((payload->>'aceitacao')::numeric, 0);
  v_ades   numeric := coalesce((payload->>'adesaoMedia')::numeric, 0);
  -- status: 'rascunho' = auto-save em edição (oculto no BI); 'final' = teste concluído.
  -- Ausente no payload (compat. retroativa) → 'final'. Valor inesperado → 'final'.
  v_status text   := coalesce(nullif(payload->>'status',''), 'final');
begin
  if v_id is null then
    raise exception 'id obrigatorio';
  end if;
  if v_status not in ('rascunho','final') then
    v_status := 'final';
  end if;
  if v_matric<0 or v_pres<0 or v_part<0 or v_ado<0 or v_gos<0 or v_ind<0 or v_ng<0 or v_det<0 then
    raise exception 'contagens negativas nao permitidas';
  end if;
  v_soma := v_ado + v_gos + v_ind + v_ng + v_det;
  if v_pres > 0 and v_soma > v_pres then
    raise exception 'soma das respostas (%) maior que presentes (%)', v_soma, v_pres;
  end if;
  if v_aceit < 0 or v_aceit > 100 or v_ades < 0 or v_ades > 100 then
    raise exception 'percentuais fora do intervalo 0-100';
  end if;

  insert into public.testes (
    id, saved_at, regional, escola, programa, preparacao, data, aplicador,
    matriculados, presentes, participantes, adorei, gostei, indiferente,
    naogostei, detestei, aceitacao, adesao_media, passou, turmas, status
  ) values (
    v_id,
    coalesce(nullif(payload->>'savedAt','')::timestamptz, now()),
    h->>'regional', h->>'escola', h->>'programa', h->>'preparacao', h->>'data', h->>'aplicador',
    v_matric, v_pres, v_part, v_ado, v_gos, v_ind, v_ng, v_det,
    v_aceit, v_ades, coalesce((payload->>'passou')::boolean, false),
    payload->'turmas', v_status
  )
  on conflict (id) do update set
    saved_at      = excluded.saved_at,
    regional      = excluded.regional,
    escola        = excluded.escola,
    programa      = excluded.programa,
    preparacao    = excluded.preparacao,
    data          = excluded.data,
    aplicador     = excluded.aplicador,
    matriculados  = excluded.matriculados,
    presentes     = excluded.presentes,
    participantes = excluded.participantes,
    adorei        = excluded.adorei,
    gostei        = excluded.gostei,
    indiferente   = excluded.indiferente,
    naogostei     = excluded.naogostei,
    detestei      = excluded.detestei,
    aceitacao     = excluded.aceitacao,
    adesao_media  = excluded.adesao_media,
    passou        = excluded.passou,
    turmas        = excluded.turmas,
    status        = excluded.status;
end;
$$;

-- anon (app público) só pode EXECUTAR a função de escrita e LER a tabela
grant execute on function public.submit_teste(jsonb) to anon, authenticated;

-- ---------- Health check para o keep-alive (mantém o projeto fora da pausa) ----------
create or replace function public.keepalive()
returns text
language sql
stable
as $$ select 'ok'::text $$;

grant execute on function public.keepalive() to anon;
