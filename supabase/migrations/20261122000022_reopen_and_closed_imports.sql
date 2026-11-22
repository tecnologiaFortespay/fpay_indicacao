-- 22/11/2026 — pedidos da área de negócio (decisões 30 e 31):
-- (a) Reabrir o último mês fechado, para corrigir erro. O lote volta para "Em preparação" com os
--     valores e ajustes que tinha; a decisão (pagar/acumular), a resposta do parceiro e o "como foi
--     pago" são apagados, porque os valores podem mudar. Os meses fecham em ordem, então só o
--     último mês fechado reabre.
-- (b) Planilha de mês fechado é recusada (antes o envio era aceito e as linhas ficavam como
--     "Mês já fechado"). Para corrigir um mês fechado, o diretor reabre o lote.
-- Nenhuma tabela nova.

-- ---------------------------------------------------------------------------
-- 1. Reabertura do lote.
-- ---------------------------------------------------------------------------
create function public.reopen_closing(target uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  closing public.closings;
  later date;
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  select * into closing from public.closings c where c.id = target for update;
  if not found then
    raise no_data_found;
  end if;
  if closing.status <> 'closed' then
    raise exception using errcode = 'P0001', message = 'CLOSING_FIELDS', detail = 'Este mês não está fechado.';
  end if;
  select max(c.competency) into later
  from public.closings c
  where c.competency > closing.competency and c.status = 'closed';
  if later is not null then
    raise exception using
      errcode = 'P0001',
      message = 'CLOSING_FIELDS',
      detail = 'Reabra primeiro o mês ' || to_char(later, 'MM/YYYY') || ': só o último mês fechado pode ser reaberto.';
  end if;
  update public.closing_items ci
  set
    decision = null,
    decided_by = null,
    decided_at = null,
    partner_response = null,
    partner_response_at = null,
    partner_note = null,
    payment_note = null
  where ci.closing_id = target;
  -- Quem reabriu e quando ficam em prepared_by/prepared_at: o lote volta a "Em preparação".
  update public.closings
  set status = 'open', closed_by = null, closed_at = null, prepared_by = auth.uid(), prepared_at = now()
  where id = target;
end;
$$;

revoke all on function public.reopen_closing(uuid) from public, anon, authenticated;
grant execute on function public.reopen_closing(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Fechar o lote: o corpo é o de 20261028000007, mais o último passo. Depois de uma reabertura o
--    mês seguinte pode já estar em preparação, com o saldo anterior calculado sobre o fechamento
--    antigo; ao fechar de novo, ele recebe o saldo deste fechamento. No fluxo normal o fechamento
--    seguinte ainda não existe e o passo não altera nada.
-- ---------------------------------------------------------------------------
create or replace function public.close_closing(target uuid, paid_partner_ids uuid[]) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  closing public.closings;
  blocker date;
  paid uuid[] := coalesce(paid_partner_ids, '{}');
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  select * into closing from public.closings c where c.id = target for update;
  if not found then
    raise no_data_found;
  end if;
  if closing.status = 'closed' then
    raise exception using errcode = 'P0001', message = 'CLOSING_FIELDS', detail = 'Este mês já está fechado.';
  end if;
  blocker := public.closing_blocker(closing.competency);
  if blocker is not null then
    raise exception using
      errcode = 'P0001',
      message = 'CLOSING_FIELDS',
      detail = 'Feche primeiro o mês ' || to_char(blocker, 'MM/YYYY') || '.';
  end if;
  if exists (
    select 1 from unnest(paid) as marked(partner_id)
    where not exists (select 1 from public.closing_items ci where ci.closing_id = target and ci.partner_id = marked.partner_id)
  ) then
    raise exception using errcode = 'P0001', message = 'CLOSING_FIELDS', detail = 'Parceiro marcado não pertence a este fechamento.';
  end if;
  update public.closing_items ci
  set
    decision = case
      when ci.partner_id = any (paid) then 'pay'
      when ci.total > 0 then 'accumulate'
      else null
    end,
    decided_by = auth.uid(),
    decided_at = now()
  where ci.closing_id = target;
  update public.closings
  set status = 'closed', closed_by = auth.uid(), closed_at = now()
  where id = target;
  -- Só o fechamento imediatamente seguinte, e só se ainda estiver em preparação.
  update public.closing_items next_item
  set previous_balance = coalesce((
    select ci.total from public.closing_items ci
    where ci.closing_id = target and ci.partner_id = next_item.partner_id and ci.decision = 'accumulate'
  ), 0)
  where next_item.closing_id = (
    select c.id from public.closings c
    where c.status = 'open'
      and c.competency = (
        select min(following.competency) from public.closings following
        where following.competency > closing.competency
      )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Importação: o corpo é o de 20261114000018, mais a recusa do mês fechado logo depois das
--    conferências do lote. Como preview_import chama import_lives, a recusa aparece já na
--    conferência do arquivo.
-- ---------------------------------------------------------------------------
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
  -- Mês fechado não recebe planilha: para corrigir, o diretor reabre o lote.
  if batch->>'competency' is not null and public.is_closed_competency((batch->>'competency')::date) then
    raise exception using
      errcode = 'P0001',
      message = 'IMPORT_FIELDS',
      detail = 'Mês já fechado (' || to_char((batch->>'competency')::date, 'MM/YYYY') || '): a planilha não entra. Para corrigir, reabra o lote em Fechamento do mês.';
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
