-- Ajuste da Fatia 1 depois do arquivo real do BI: o export "Detalhamento Empresas" lista todas
-- as empresas clientes da Fortes Pay. Só as empresas indicadas na plataforma entram; as demais
-- são contadas em rows_skipped e descartadas, sem gravar nada.

alter table public.import_batches
  add column rows_skipped integer not null default 0 check (rows_skipped >= 0);

comment on column public.import_batches.rows_skipped is
  'Linhas de empresas sem indicação na plataforma: contadas, não gravadas.';

-- batch: {file_name, file_hash, competency 'YYYY-MM-01', rows_read,
--         issues: [{line_number, raw_line, outcome, reason}]}
-- rows:  [{line_number, cnpj, competency 'YYYY-MM-01', lives, company_name, group_name}]
--        sem (cnpj, competency) repetido; o arquivo já foi lido e validado no servidor.
-- O mês do lote conta como coberto mesmo quando nenhuma empresa indicada aparece no arquivo:
-- as vidas daquele mês são zeradas e, se for o mês mais recente, os ativos ficam inadimplentes.
create or replace function public.import_lives(batch jsonb, rows jsonb) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  target uuid;
  months date[];
  latest date;
  imported integer;
  ignored integer;
  skipped integer;
begin
  if not (public.is_director() or public.is_analyst()) then
    raise insufficient_privilege;
  end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) not between 1 and 50000 then
    raise exception using errcode = 'P0001', message = 'IMPORT_FIELDS', detail = 'O arquivo não tem linhas válidas ou passa de 50.000 linhas.';
  end if;
  if coalesce(batch->>'file_name', '') !~ '^[^/\\]{1,255}$' or coalesce(batch->>'file_hash', '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'IMPORT_FIELDS', detail = 'Identificação do arquivo inválida.';
  end if;
  if batch->>'competency' is not null and batch->>'competency' !~ '^\d{4}-(0[1-9]|1[0-2])-01$' then
    raise exception using errcode = 'P0001', message = 'IMPORT_FIELDS', detail = 'Mês de referência inválido.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(rows) as x
    where not public.valid_cnpj(x->>'cnpj')
      or coalesce(x->>'competency', '') !~ '^\d{4}-(0[1-9]|1[0-2])-01$'
      or coalesce(x->>'lives', '') !~ '^\d{1,7}$'
      or coalesce(length(trim(x->>'company_name')), 0) not between 1 and 240
  ) then
    raise exception using errcode = 'P0001', message = 'IMPORT_FIELDS', detail = 'Há linha com CNPJ, mês, vidas ou empresa inválidos.';
  end if;

  drop table if exists pg_temp.import_input;
  create temp table import_input on commit drop as
  select
    x->>'cnpj' as cnpj,
    (x->>'competency')::date as competency,
    (x->>'lives')::integer as lives,
    trim(x->>'company_name') as company_name,
    nullif(trim(x->>'group_name'), '') as group_name,
    coalesce(nullif(x->>'line_number', '')::integer, 1) as line_number
  from jsonb_array_elements(rows) as x;

  if exists (select 1 from pg_temp.import_input group by cnpj, competency having count(*) > 1) then
    raise exception using errcode = 'P0001', message = 'IMPORT_FIELDS', detail = 'Há CNPJ repetido no mesmo mês.';
  end if;

  insert into public.import_batches (file_name, file_hash, competencies, rows_read, created_by)
  values (batch->>'file_name', batch->>'file_hash', '{}', coalesce((batch->>'rows_read')::integer, 0), auth.uid())
  returning id into target;

  -- Só empresas indicadas na plataforma entram; as demais são contadas e descartadas.
  delete from pg_temp.import_input i
  where not exists (select 1 from public.referrals r where r.cnpj = i.cnpj);
  get diagnostics skipped = row_count;

  insert into public.import_rows (batch_id, line_number, raw_line, outcome, reason)
  select
    target,
    i.line_number,
    i.cnpj || ';' || to_char(i.competency, 'YYYY-MM') || ';' || i.lives,
    'ignored',
    'Mês já fechado (' || to_char(i.competency, 'MM/YYYY') || '); a linha não entrou.'
  from pg_temp.import_input i
  where public.is_closed_competency(i.competency);

  delete from pg_temp.import_input i where public.is_closed_competency(i.competency);

  -- Meses cobertos: os das linhas e o informado no lote, fora os já fechados.
  select coalesce(array_agg(c order by c), '{}')
  into months
  from (
    select distinct c
    from (
      select competency as c from pg_temp.import_input
      union
      select (batch->>'competency')::date where batch->>'competency' is not null
    ) as covered
    where not public.is_closed_competency(c)
  ) as open_months;

  with first_months as (
    select cnpj, min(competency) as first_competency from pg_temp.import_input group by cnpj
  ),
  names as (
    select distinct on (cnpj) cnpj, company_name, group_name
    from pg_temp.import_input
    order by cnpj, competency desc
  )
  insert into public.companies (cnpj, name, group_name, first_competency)
  select n.cnpj, n.company_name, n.group_name, f.first_competency
  from names n
  join first_months f on f.cnpj = n.cnpj
  on conflict (cnpj) do update set
    name = excluded.name,
    group_name = coalesce(excluded.group_name, public.companies.group_name),
    first_competency = least(public.companies.first_competency, excluded.first_competency),
    updated_at = now();

  delete from public.monthly_lives m where m.competency = any (months);

  insert into public.monthly_lives (cnpj, competency, lives, batch_id)
  select i.cnpj, i.competency, i.lives, target from pg_temp.import_input i;
  get diagnostics imported = row_count;

  insert into public.import_rows (batch_id, line_number, raw_line, outcome, reason)
  select
    target,
    (x->>'line_number')::integer,
    left(coalesce(x->>'raw_line', ''), 4000),
    x->>'outcome',
    left(coalesce(x->>'reason', ''), 400)
  from jsonb_array_elements(coalesce(batch->'issues', '[]'::jsonb)) as x;

  select count(*) into ignored from public.import_rows r where r.batch_id = target and r.outcome = 'ignored';

  update public.import_batches b
  set competencies = months, rows_imported = imported, rows_ignored = ignored, rows_skipped = skipped
  where b.id = target;

  -- Mês mais recente conhecido: o maior já importado ou o deste lote.
  select greatest(
    (select max(m.competency) from public.monthly_lives m),
    (select max(c) from unnest(months) as c)
  ) into latest;
  if latest = any (months) then
    update public.referrals r
    set
      status = 'active',
      status_changed_at = now(),
      activated_competency = coalesce(
        r.activated_competency,
        (select min(m.competency) from public.monthly_lives m where m.cnpj = r.cnpj and m.lives > 0)
      )
    where r.status in ('referred', 'negotiating', 'signed', 'delinquent')
      and exists (
        select 1 from public.monthly_lives m where m.cnpj = r.cnpj and m.competency = latest and m.lives > 0
      );

    update public.referrals r
    set status = 'delinquent', status_changed_at = now()
    where r.status = 'active'
      and not exists (
        select 1 from public.monthly_lives m where m.cnpj = r.cnpj and m.competency = latest and m.lives > 0
      );
  end if;

  return target;
end;
$$;
