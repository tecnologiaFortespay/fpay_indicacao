-- Fatia 4: fechamento mensal. Tabelas novas: closings, closing_items (11 de 12).
-- Fluxo: diretor prepara (snapshot de vidas × valor por parceiro), ajusta, marca quem paga e fecha o lote.
-- Quem não é marcado acumula: o total vira saldo anterior no próximo fechamento.

create table public.closings (
  id uuid primary key default gen_random_uuid(),
  competency date not null unique check (extract(day from competency) = 1),
  status text not null default 'open' check (status in ('open', 'closed')),
  prepared_by uuid references auth.users (id),
  prepared_at timestamptz not null default now(),
  closed_by uuid references auth.users (id),
  closed_at timestamptz,
  constraint closings_closed_fields check (status <> 'closed' or (closed_by is not null and closed_at is not null))
);

create table public.closing_items (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references public.closings (id) on delete cascade,
  partner_id uuid not null references public.partners (id),
  lives integer not null default 0 check (lives >= 0),
  value_per_life numeric(10, 2),
  month_amount numeric(12, 2) not null default 0,
  adjustment numeric(12, 2) not null default 0,
  adjustment_note text check (adjustment_note is null or length(adjustment_note) <= 400),
  previous_balance numeric(12, 2) not null default 0,
  total numeric(12, 2) generated always as (month_amount + adjustment + previous_balance) stored,
  decision text check (decision is null or decision in ('pay', 'accumulate')),
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  partner_response text check (partner_response is null or partner_response in ('confirmed', 'disputed')),
  partner_response_at timestamptz,
  partner_note text check (partner_note is null or length(partner_note) <= 400),
  unique (closing_id, partner_id)
);
create index closing_items_by_partner on public.closing_items (partner_id);

alter table public.closings enable row level security;
alter table public.closing_items enable row level security;

-- As duas policies se consultariam mutuamente (recursão); as funções abaixo leem sem RLS.
create function public.closing_is_closed(target uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.closings c where c.id = target and c.status = 'closed');
$$;

create function public.partner_has_closing_item(target uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.closing_items ci where ci.closing_id = target and ci.partner_id = public.my_partner_id()
  );
$$;

create policy closings_read on public.closings for select to authenticated
using (public.is_director() or (status = 'closed' and public.partner_has_closing_item(id)));

create policy closing_items_read on public.closing_items for select to authenticated
using (
  public.is_director() or (partner_id = public.my_partner_id() and public.closing_is_closed(closing_id))
);

create function public.is_closed_competency(month date) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.closings c where c.competency = month and c.status = 'closed');
$$;

-- Prepara (ou recalcula) o fechamento aberto de um mês já encerrado, em ordem cronológica,
-- exigindo uma importação do mês feita depois do fim do mês. Preserva ajustes já digitados.
create function public.prepare_closing(month date) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  target uuid;
  previous public.closings;
  current_status text;
  month_start_fortaleza date := date_trunc('month', now() at time zone 'America/Fortaleza')::date;
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  if month is null or extract(day from month) <> 1 then
    raise exception using errcode = 'P0001', message = 'CLOSING_FIELDS', detail = 'Informe o mês do fechamento.';
  end if;
  if month >= month_start_fortaleza then
    raise exception using errcode = 'P0001', message = 'CLOSING_FIELDS', detail = 'Só é possível fechar um mês já encerrado.';
  end if;
  select c.status into current_status from public.closings c where c.competency = month;
  if current_status = 'closed' then
    raise exception using errcode = 'P0001', message = 'CLOSING_FIELDS', detail = 'Este mês já está fechado.';
  end if;
  select * into previous from public.closings c where c.competency < month order by c.competency desc limit 1;
  if found and previous.status <> 'closed' then
    raise exception using
      errcode = 'P0001',
      message = 'CLOSING_FIELDS',
      detail = 'Feche primeiro o mês ' || to_char(previous.competency, 'MM/YYYY') || '.';
  end if;
  if not exists (
    select 1 from public.import_batches b
    where month = any (b.competencies)
      and b.created_at >= ((month + interval '1 month')::timestamp at time zone 'America/Fortaleza')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CLOSING_FIELDS',
      detail = 'Ainda não há importação deste mês feita depois do fim do mês.';
  end if;
  insert into public.closings (competency, prepared_by)
  values (month, auth.uid())
  on conflict (competency) do update set prepared_by = excluded.prepared_by, prepared_at = now()
  returning id into target;

  insert into public.closing_items (closing_id, partner_id, lives, value_per_life, month_amount, previous_balance)
  select
    target,
    p.id,
    coalesce(a.lives, 0),
    a.value_per_life,
    coalesce(a.amount, 0),
    coalesce((
      select ci.total from public.closing_items ci
      where ci.closing_id = previous.id and ci.partner_id = p.id and ci.decision = 'accumulate'
    ), 0)
  from public.partners p
  left join public.partner_month_amounts a on a.partner_id = p.id and a.competency = month
  where p.status = 'active'
  on conflict (closing_id, partner_id) do update
  set
    lives = excluded.lives,
    value_per_life = excluded.value_per_life,
    month_amount = excluded.month_amount,
    previous_balance = excluded.previous_balance;

  delete from public.closing_items ci
  where ci.closing_id = target
    and not exists (select 1 from public.partners p where p.id = ci.partner_id and p.status = 'active');
  return target;
end;
$$;

create function public.set_closing_adjustment(target uuid, amount numeric, note text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  closing_status text;
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  select c.status into closing_status
  from public.closing_items ci
  join public.closings c on c.id = ci.closing_id
  where ci.id = target
  for update of ci;
  if not found then
    raise no_data_found;
  end if;
  if closing_status = 'closed' then
    raise exception using errcode = 'P0001', message = 'CLOSING_FIELDS', detail = 'Este mês já está fechado.';
  end if;
  if amount is null or abs(amount) > 1000000 then
    raise exception using errcode = 'P0001', message = 'CLOSING_FIELDS', detail = 'Informe o valor do ajuste.';
  end if;
  if amount <> 0 and coalesce(length(trim(note)), 0) not between 1 and 400 then
    raise exception using errcode = 'P0001', message = 'CLOSING_FIELDS', detail = 'Informe o motivo do ajuste.';
  end if;
  update public.closing_items
  set adjustment = round(amount, 2), adjustment_note = nullif(trim(note), '')
  where id = target;
end;
$$;

-- Fecha o lote: marcados pagam; os demais com total acumulam (viram saldo anterior no próximo mês).
create function public.close_closing(target uuid, paid_partner_ids uuid[]) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  closing_status text;
  paid uuid[] := coalesce(paid_partner_ids, '{}');
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  select c.status into closing_status from public.closings c where c.id = target for update;
  if not found then
    raise no_data_found;
  end if;
  if closing_status = 'closed' then
    raise exception using errcode = 'P0001', message = 'CLOSING_FIELDS', detail = 'Este mês já está fechado.';
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
end;
$$;

-- Vigências de meses já fechados não mudam mais (o fechamento guarda o valor usado).
create function public.guard_partner_rules() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  affected date := coalesce(new.valid_from, old.valid_from);
  locked date;
begin
  if tg_op = 'UPDATE' and new.valid_from <> old.valid_from then
    affected := least(new.valid_from, old.valid_from);
  end if;
  select max(c.competency) into locked from public.closings c where c.status = 'closed' and c.competency >= affected;
  if locked is not null then
    raise exception using errcode = 'P0001', message = 'RULE_LOCKED', detail = to_char(locked, 'MM/YYYY');
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
create trigger protect_partner_rules
before insert or update or delete on public.partner_rules
for each row execute function public.guard_partner_rules();

-- Importação: linhas de mês já fechado são ignoradas (com o motivo no log do lote).
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

  select coalesce(array_agg(c order by c), '{}')
  into months
  from (select distinct competency as c from pg_temp.import_input) as m;

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
  set competencies = months, rows_imported = imported, rows_ignored = ignored
  where b.id = target;

  select max(m.competency) into latest from public.monthly_lives m;
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

revoke all on table public.closings, public.closing_items from anon, authenticated;
grant select on table public.closings, public.closing_items to authenticated;

revoke all on function
  public.is_closed_competency(date), public.closing_is_closed(uuid), public.partner_has_closing_item(uuid),
  public.prepare_closing(date), public.set_closing_adjustment(uuid, numeric, text),
  public.close_closing(uuid, uuid[]), public.guard_partner_rules()
from public, anon;

grant execute on function
  public.is_closed_competency(date), public.closing_is_closed(uuid), public.partner_has_closing_item(uuid),
  public.prepare_closing(date), public.set_closing_adjustment(uuid, numeric, text),
  public.close_closing(uuid, uuid[])
to authenticated;
