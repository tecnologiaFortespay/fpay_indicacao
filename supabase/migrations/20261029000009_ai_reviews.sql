-- Análises da IA para o diretor (29/10/2026): uma por envio da planilha do BI ou por fechamento
-- preparado. Só o diretor lê e grava. É a 12ª tabela, o limite do projeto.

create table public.ai_reviews (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.import_batches (id) on delete cascade,
  closing_id uuid references public.closings (id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  summary text check (length(summary) <= 4000),
  alerts jsonb not null default '[]'::jsonb check (jsonb_typeof(alerts) = 'array'),
  error text check (length(error) <= 500),
  model text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check ((batch_id is null) <> (closing_id is null))
);

create index ai_reviews_batch_idx on public.ai_reviews (batch_id, created_at desc);
create index ai_reviews_closing_idx on public.ai_reviews (closing_id, created_at desc);

alter table public.ai_reviews enable row level security;

create policy ai_reviews_read on public.ai_reviews for select to authenticated
using (public.is_director());

revoke all on table public.ai_reviews from anon, authenticated;
grant select on table public.ai_reviews to authenticated;

-- Abre uma análise ("em andamento") de um envio ou de um fechamento já preparado.
create function public.start_ai_review(subject jsonb) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  batch uuid := nullif(subject->>'batch_id', '')::uuid;
  closing uuid := nullif(subject->>'closing_id', '')::uuid;
  target uuid;
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  if (batch is null) = (closing is null) then
    raise exception using errcode = 'P0001', message = 'AI_FIELDS', detail = 'Informe o envio ou o fechamento.';
  end if;
  if batch is not null and not exists (select 1 from public.import_batches b where b.id = batch) then
    raise exception using errcode = 'P0001', message = 'AI_FIELDS', detail = 'Envio não encontrado.';
  end if;
  if closing is not null and not exists (select 1 from public.closings c where c.id = closing) then
    raise exception using errcode = 'P0001', message = 'AI_FIELDS', detail = 'Fechamento não encontrado.';
  end if;
  -- Evita duas análises ao mesmo tempo do mesmo assunto (ex.: clique duplo).
  if exists (
    select 1 from public.ai_reviews r
    where r.status = 'running'
      and r.created_at > now() - interval '5 minutes'
      and (r.batch_id = batch or r.closing_id = closing)
  ) then
    raise exception using errcode = 'P0001', message = 'AI_FIELDS', detail = 'A IA já está analisando. Aguarde o resultado.';
  end if;
  insert into public.ai_reviews (batch_id, closing_id, created_by)
  values (batch, closing, auth.uid())
  returning id into target;
  return target;
end;
$$;

-- Grava o resultado (done) ou a falha (failed) de uma análise em andamento.
create function public.finish_ai_review(review uuid, payload jsonb) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  outcome text := payload->>'status';
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  if outcome not in ('done', 'failed') then
    raise exception using errcode = 'P0001', message = 'AI_FIELDS', detail = 'Resultado da análise inválido.';
  end if;
  update public.ai_reviews r
  set
    status = outcome,
    summary = left(payload->>'summary', 4000),
    alerts = case when jsonb_typeof(payload->'alerts') = 'array' then payload->'alerts' else '[]'::jsonb end,
    error = left(payload->>'error', 500),
    model = left(payload->>'model', 100),
    finished_at = now()
  where r.id = review and r.status = 'running';
  if not found then
    raise exception using errcode = 'P0001', message = 'AI_FIELDS', detail = 'Análise não encontrada ou já concluída.';
  end if;
end;
$$;

revoke all on function public.start_ai_review(jsonb), public.finish_ai_review(uuid, jsonb)
from public, anon, authenticated;

grant execute on function public.start_ai_review(jsonb), public.finish_ai_review(uuid, jsonb)
to authenticated;
