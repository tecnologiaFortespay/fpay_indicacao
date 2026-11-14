-- 14/11/2026 — decisão 24: o primeiro mês pago da empresa vem do BI ("Prim cashin").
-- Apontamento da área (carga das indicações antigas de Teresina): a indicação cadastrada hoje, de
-- um cliente que já paga desde antes, caía na vigência nova do parceiro (a regra era escolhida só
-- pela data do cadastro na plataforma) e o prazo contava do primeiro mês com planilha na plataforma.
-- (a) referrals.first_cashin guarda o mês do primeiro pagamento da empresa informado pelo BI.
-- (b) A regra do parceiro é escolhida pelo mês mais antigo entre o da indicação e o do primeiro
--     pagamento: quem já pagava antes de uma vigência nova segue a anterior. Sem "Prim cashin",
--     nada muda (decisão 23).
-- (c) O primeiro mês pago (activated_competency), de onde o prazo conta, nunca fica depois do
--     "Prim cashin". Meses fechados não mudam: o fechamento guarda os valores gravados.
-- Nenhuma tabela nova.

alter table public.referrals
  add column first_cashin date check (first_cashin is null or extract(day from first_cashin) = 1);

comment on column public.referrals.first_cashin is
  'Mês do primeiro pagamento da empresa à Fortes Pay, lido da coluna "Prim cashin" do BI a cada envio; nulo = o BI ainda não informou.';

-- 1. Cálculo: igual ao de 20261110000017, trocando só o mês de referência da indicação.
create or replace view public.referral_month_lives
with (security_invoker = true)
as
select
  r.id as referral_id,
  r.partner_id,
  r.cnpj,
  m.competency,
  m.lives,
  coalesce(own.value_per_life, rule.value_per_life) as value_per_life,
  coalesce(own.term_months, rule.term_months) as term_months,
  (m.lives * coalesce(own.value_per_life, rule.value_per_life, 0))::numeric(12, 2) as amount
from public.referrals r
join public.monthly_lives m on m.cnpj = r.cnpj
-- Mês de referência: o da indicação ou, se a empresa já pagava antes, o do primeiro pagamento.
cross join lateral (
  select least(
    date_trunc('month', r.created_at at time zone 'America/Fortaleza')::date,
    r.first_cashin
  ) as month
) referred
-- Vigência própria da indicação em vigor no mês (manda sobre a do parceiro).
left join lateral (
  select pr.value_per_life, pr.term_months
  from public.partner_rules pr
  where pr.referral_id = r.id and pr.valid_from <= m.competency
  order by pr.valid_from desc
  limit 1
) own on true
-- Regra do parceiro: entre as que já valem no mês, a mais recente que já existia no mês de
-- referência; se nenhuma existia ainda, a primeira que passou a valer (decisões 23 e 24).
left join lateral (
  select pr.value_per_life, pr.term_months
  from public.partner_rules pr
  where pr.partner_id = r.partner_id and pr.referral_id is null and pr.valid_from <= m.competency
  order by
    (pr.valid_from <= referred.month) desc,
    case when pr.valid_from <= referred.month then pr.valid_from end desc,
    pr.valid_from asc
  limit 1
) rule on true
where (
    r.status not in ('lost', 'cancelled')
    or (
      r.status = 'cancelled'
      and m.competency < date_trunc('month', r.status_changed_at at time zone 'America/Fortaleza')::date
    )
  )
  and (
    coalesce(own.term_months, rule.term_months) is null
    or r.activated_competency is null
    or m.competency < (r.activated_competency + make_interval(months => coalesce(own.term_months, rule.term_months)))::date
  );

-- 2. Importação: o corpo é o de 20261104000012, mais a leitura de first_cashin em cada linha.
create or replace function public.import_lives(batch jsonb, rows jsonb) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  target uuid;
  months date[];
  imported integer;
  ignored integer;
  skipped integer;
  complete date;
  reference date;
begin
  if not public.is_director() then
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
      or coalesce(x->>'first_cashin', '') !~ '^(\d{4}-(0[1-9]|1[0-2])-01)?$'
  ) then
    raise exception using errcode = 'P0001', message = 'IMPORT_FIELDS', detail = 'Há linha com CNPJ, mês, vidas, empresa ou primeiro pagamento inválidos.';
  end if;

  drop table if exists pg_temp.import_input;
  create temp table import_input on commit drop as
  select
    x->>'cnpj' as cnpj,
    (x->>'competency')::date as competency,
    (x->>'lives')::integer as lives,
    trim(x->>'company_name') as company_name,
    nullif(trim(x->>'group_name'), '') as group_name,
    nullif(x->>'first_cashin', '')::date as first_cashin,
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

  -- Primeiro pagamento da empresa segundo o BI (decisão 24): vale o que o envio mais novo informa.
  update public.referrals r
  set first_cashin = i.first_cashin
  from (
    select cnpj, min(first_cashin) as first_cashin
    from pg_temp.import_input
    where first_cashin is not null
    group by cnpj
  ) i
  where i.cnpj = r.cnpj and r.first_cashin is distinct from i.first_cashin;

  -- Situação automática das indicações, recalculada a cada envio. Durante o mês chegam arquivos
  -- parciais (vidas até o dia): eles ativam a indicação assim que o cliente aparece, mas não a
  -- tornam inadimplente, porque o cliente ainda pode pagar até o fim do mês. Inadimplência só com
  -- mês completo, isto é, importado depois de terminar (o mesmo critério que libera o fechamento):
  -- ativa sem vidas nele nem depois dele vira inadimplente.
  complete := public.latest_complete_competency();
  reference := coalesce(complete, (select max(m.competency) from public.monthly_lives m));

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
      select 1 from public.monthly_lives m
      where m.cnpj = r.cnpj and m.competency >= reference and m.lives > 0
    );

  -- O prazo conta do primeiro mês pago de verdade: se o BI diz que a empresa já pagava antes do
  -- primeiro mês com planilha na plataforma, vale o mês do BI.
  update public.referrals r
  set activated_competency = r.first_cashin
  where r.activated_competency is not null
    and r.first_cashin < r.activated_competency;

  if complete is not null then
    update public.referrals r
    set status = 'delinquent', status_changed_at = now()
    where r.status = 'active'
      and coalesce(r.activated_competency, complete) <= complete
      and not exists (
        select 1 from public.monthly_lives m
        where m.cnpj = r.cnpj and m.competency >= complete and m.lives > 0
      );
  end if;

  return target;
end;
$$;
