-- Fatia 1: perfis, parceiros, regras de remuneração, empresas, indicações,
-- importação do BI e cálculo "vidas × valor vigente".
-- Leitura: RLS por perfil. Escrita: só por função security definer que confere o perfil.
-- Schema public. Tabelas nesta migration: 8 (limite do projeto: 12).

-- ---------------------------------------------------------------------------
-- CNPJ: formato alfanumérico vigente desde julho de 2026
-- (12 caracteres [A-Z0-9] + 2 dígitos verificadores; valor do caractere = ASCII − 48).
-- ---------------------------------------------------------------------------
create function public.valid_cnpj(value text) returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  base text;
  total integer;
  weight integer;
  digit integer;
  stage integer;
  idx integer;
begin
  if value is null or value !~ '^[A-Z0-9]{12}[0-9]{2}$' then
    return false;
  end if;
  if value ~ '^([0-9])\1{13}$' then
    return false;
  end if;
  base := left(value, 12);
  for stage in 1..2 loop
    total := 0;
    weight := 2;
    for idx in reverse length(base)..1 loop
      total := total + (ascii(substr(base, idx, 1)) - 48) * weight;
      weight := case when weight = 9 then 2 else weight + 1 end;
    end loop;
    digit := case when total % 11 < 2 then 0 else 11 - total % 11 end;
    base := base || digit::text;
  end loop;
  return base = value;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  kind text not null check (kind in ('unit', 'external')),
  city text check (city is null or length(city) between 1 and 120),
  state text check (state is null or state ~ '^[A-Z]{2}$'),
  contact_name text check (contact_name is null or length(contact_name) between 1 and 160),
  contact_email text check (
    contact_email is null
    or (length(contact_email) <= 254 and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
  ),
  contact_phone text check (contact_phone is null or length(contact_phone) between 1 and 40),
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected')),
  payment_method text check (payment_method is null or payment_method in ('card', 'pix', 'bank_transfer')),
  pix_key text check (pix_key is null or length(pix_key) between 1 and 120),
  bank_name text check (bank_name is null or length(bank_name) between 1 and 120),
  bank_branch text check (bank_branch is null or length(bank_branch) between 1 and 20),
  bank_account text check (bank_account is null or length(bank_account) between 1 and 40),
  rejection_reason text check (rejection_reason is null or length(rejection_reason) <= 1000),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint partners_pix_data check (payment_method is distinct from 'pix' or pix_key is not null),
  constraint partners_bank_data check (
    payment_method is distinct from 'bank_transfer'
    or (bank_name is not null and bank_branch is not null and bank_account is not null)
  ),
  constraint partners_active_has_payment check (status <> 'active' or payment_method is not null)
);
create index partners_by_status on public.partners (status, name);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('director', 'analyst', 'partner')),
  partner_id uuid references public.partners (id),
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  created_at timestamptz not null default now(),
  constraint profiles_partner_link check ((role = 'partner') = (partner_id is not null))
);
create index profiles_by_partner on public.profiles (partner_id);

create table public.partner_rules (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  value_per_life numeric(10, 2) not null check (value_per_life > 0),
  valid_from date not null check (extract(day from valid_from) = 1),
  term_months integer check (term_months is null or term_months between 1 and 120),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (partner_id, valid_from)
);

create table public.companies (
  cnpj text primary key check (public.valid_cnpj(cnpj)),
  name text not null check (length(trim(name)) between 1 and 240),
  group_name text check (group_name is null or length(group_name) between 1 and 240),
  first_competency date check (first_competency is null or extract(day from first_competency) = 1),
  updated_at timestamptz not null default now()
);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),
  cnpj text not null unique references public.companies (cnpj),
  company_name text not null check (length(trim(company_name)) between 1 and 240),
  estimated_lives integer check (estimated_lives is null or estimated_lives between 0 and 1000000),
  status text not null default 'referred' check (
    status in ('referred', 'negotiating', 'signed', 'active', 'delinquent', 'lost', 'cancelled')
  ),
  status_changed_at timestamptz not null default now(),
  activated_competency date check (activated_competency is null or extract(day from activated_competency) = 1),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index referrals_by_partner on public.referrals (partner_id, created_at desc);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null check (length(file_name) between 1 and 255),
  file_hash text not null check (file_hash ~ '^[0-9a-f]{64}$'),
  competencies date[] not null default '{}',
  rows_read integer not null default 0 check (rows_read >= 0),
  rows_imported integer not null default 0 check (rows_imported >= 0),
  rows_ignored integer not null default 0 check (rows_ignored >= 0),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index import_batches_recent on public.import_batches (created_at desc);

-- Só as linhas que não entraram como estavam (ignoradas) ou foram mescladas; as válidas estão em monthly_lives.
create table public.import_rows (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.import_batches (id) on delete cascade,
  line_number integer not null check (line_number >= 1),
  raw_line text not null check (length(raw_line) <= 4000),
  outcome text not null check (outcome in ('ignored', 'merged')),
  reason text not null check (length(reason) between 1 and 400)
);
create index import_rows_by_batch on public.import_rows (batch_id, line_number);

create table public.monthly_lives (
  cnpj text not null references public.companies (cnpj),
  competency date not null check (extract(day from competency) = 1),
  lives integer not null check (lives >= 0),
  batch_id uuid not null references public.import_batches (id),
  imported_at timestamptz not null default now(),
  primary key (cnpj, competency)
);
create index monthly_lives_by_competency on public.monthly_lives (competency);

-- ---------------------------------------------------------------------------
-- Perfil do usuário logado (usado pelas policies e pelas funções de escrita)
-- ---------------------------------------------------------------------------
create function public.current_role_name() returns text
language sql stable security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.user_id = auth.uid();
$$;

create function public.is_director() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(public.current_role_name() = 'director', false);
$$;

create function public.is_analyst() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(public.current_role_name() = 'analyst', false);
$$;

create function public.my_partner_id() returns uuid
language sql stable security definer
set search_path = ''
as $$
  select p.partner_id from public.profiles p where p.user_id = auth.uid() and p.role = 'partner';
$$;

create function public.current_profile() returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', p.user_id,
    'role', p.role,
    'display_name', p.display_name,
    'partner', case
      when pa.id is null then null
      else jsonb_build_object('id', pa.id, 'name', pa.name, 'status', pa.status, 'rejection_reason', pa.rejection_reason)
    end
  )
  from public.profiles p
  left join public.partners pa on pa.id = p.partner_id
  where p.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- RLS (somente leitura; escrita só por função)
-- ---------------------------------------------------------------------------
alter table public.partners enable row level security;
alter table public.profiles enable row level security;
alter table public.partner_rules enable row level security;
alter table public.companies enable row level security;
alter table public.referrals enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
alter table public.monthly_lives enable row level security;

create policy profiles_read on public.profiles for select to authenticated
using (
  user_id = auth.uid()
  or public.is_director()
  or (public.is_analyst() and role in ('director', 'analyst'))
);

create policy partners_read on public.partners for select to authenticated
using (public.is_director() or id = public.my_partner_id());

create policy partner_rules_read on public.partner_rules for select to authenticated
using (public.is_director() or partner_id = public.my_partner_id());

create policy companies_read on public.companies for select to authenticated
using (
  public.is_director()
  or public.is_analyst()
  or exists (
    select 1 from public.referrals r where r.cnpj = companies.cnpj and r.partner_id = public.my_partner_id()
  )
);

create policy referrals_read on public.referrals for select to authenticated
using (public.is_director() or partner_id = public.my_partner_id());

create policy import_batches_read on public.import_batches for select to authenticated
using (public.is_director() or public.is_analyst());

create policy import_rows_read on public.import_rows for select to authenticated
using (public.is_director() or public.is_analyst());

create policy monthly_lives_read on public.monthly_lives for select to authenticated
using (
  public.is_director()
  or public.is_analyst()
  or exists (
    select 1 from public.referrals r where r.cnpj = monthly_lives.cnpj and r.partner_id = public.my_partner_id()
  )
);

-- ---------------------------------------------------------------------------
-- Cálculo: vidas que contam por indicação × mês, e valor por parceiro × mês.
-- security_invoker: a RLS das tabelas vale dentro das views.
-- ---------------------------------------------------------------------------
create view public.referral_month_lives
with (security_invoker = true)
as
select
  r.id as referral_id,
  r.partner_id,
  r.cnpj,
  m.competency,
  m.lives,
  rule.value_per_life,
  rule.term_months
from public.referrals r
join public.monthly_lives m on m.cnpj = r.cnpj
left join lateral (
  select pr.value_per_life, pr.term_months
  from public.partner_rules pr
  where pr.partner_id = r.partner_id and pr.valid_from <= m.competency
  order by pr.valid_from desc
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
    rule.term_months is null
    or r.activated_competency is null
    or m.competency < (r.activated_competency + make_interval(months => rule.term_months))::date
  );

create view public.partner_month_amounts
with (security_invoker = true)
as
select
  l.partner_id,
  l.competency,
  sum(l.lives)::integer as lives,
  l.value_per_life,
  (sum(l.lives) * coalesce(l.value_per_life, 0))::numeric(12, 2) as amount
from public.referral_month_lives l
group by l.partner_id, l.competency, l.value_per_life;

-- ---------------------------------------------------------------------------
-- Escrita do diretor: parceiro e regra
-- ---------------------------------------------------------------------------
create function public.save_partner(payload jsonb) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  target uuid := nullif(payload->>'id', '')::uuid;
  method text := nullif(trim(payload->>'payment_method'), '');
  pix text := nullif(trim(payload->>'pix_key'), '');
  bank text := nullif(trim(payload->>'bank_name'), '');
  branch text := nullif(trim(payload->>'bank_branch'), '');
  account text := nullif(trim(payload->>'bank_account'), '');
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  if coalesce(length(trim(payload->>'name')), 0) not between 1 and 160 then
    raise exception using errcode = 'P0001', message = 'PARTNER_FIELDS', detail = 'Informe o nome do parceiro.';
  end if;
  if coalesce(payload->>'kind', '') not in ('unit', 'external') then
    raise exception using errcode = 'P0001', message = 'PARTNER_FIELDS', detail = 'Informe se é unidade ou indicador externo.';
  end if;
  if method is null or method not in ('card', 'pix', 'bank_transfer') then
    raise exception using errcode = 'P0001', message = 'PARTNER_FIELDS', detail = 'Informe o meio de pagamento.';
  end if;
  if method = 'pix' and pix is null then
    raise exception using errcode = 'P0001', message = 'PARTNER_FIELDS', detail = 'Informe a chave PIX.';
  end if;
  if method = 'bank_transfer' and (bank is null or branch is null or account is null) then
    raise exception using errcode = 'P0001', message = 'PARTNER_FIELDS', detail = 'Informe banco, agência e conta.';
  end if;
  if method <> 'pix' then
    pix := null;
  end if;
  if method <> 'bank_transfer' then
    bank := null;
    branch := null;
    account := null;
  end if;
  if target is null then
    insert into public.partners (
      name, kind, city, state, contact_name, contact_email, contact_phone,
      status, payment_method, pix_key, bank_name, bank_branch, bank_account,
      approved_by, approved_at, created_by
    )
    values (
      trim(payload->>'name'),
      payload->>'kind',
      nullif(trim(payload->>'city'), ''),
      nullif(upper(trim(payload->>'state')), ''),
      nullif(trim(payload->>'contact_name'), ''),
      nullif(lower(trim(payload->>'contact_email')), ''),
      nullif(trim(payload->>'contact_phone'), ''),
      'active', method, pix, bank, branch, account,
      auth.uid(), now(), auth.uid()
    )
    returning id into target;
  else
    update public.partners
    set
      name = trim(payload->>'name'),
      kind = payload->>'kind',
      city = nullif(trim(payload->>'city'), ''),
      state = nullif(upper(trim(payload->>'state')), ''),
      contact_name = nullif(trim(payload->>'contact_name'), ''),
      contact_email = nullif(lower(trim(payload->>'contact_email')), ''),
      contact_phone = nullif(trim(payload->>'contact_phone'), ''),
      payment_method = method,
      pix_key = pix,
      bank_name = bank,
      bank_branch = branch,
      bank_account = account
    where id = target;
    if not found then
      raise no_data_found;
    end if;
  end if;
  return target;
end;
$$;

create function public.save_partner_rule(payload jsonb) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  target uuid := nullif(payload->>'id', '')::uuid;
  partner uuid := nullif(payload->>'partner_id', '')::uuid;
  rule_value numeric(10, 2);
  rule_start date;
  term integer := nullif(payload->>'term_months', '')::integer;
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  if coalesce(payload->>'value_per_life', '') !~ '^\d{1,8}(\.\d{1,2})?$' then
    raise exception using errcode = 'P0001', message = 'RULE_FIELDS', detail = 'Informe o valor por vida (ex.: 1.50).';
  end if;
  rule_value := (payload->>'value_per_life')::numeric(10, 2);
  if rule_value <= 0 then
    raise exception using errcode = 'P0001', message = 'RULE_FIELDS', detail = 'O valor por vida deve ser maior que zero.';
  end if;
  if coalesce(payload->>'valid_from', '') !~ '^\d{4}-(0[1-9]|1[0-2])-01$' then
    raise exception using errcode = 'P0001', message = 'RULE_FIELDS', detail = 'Informe o mês de início da vigência.';
  end if;
  rule_start := (payload->>'valid_from')::date;
  if term is not null and term not between 1 and 120 then
    raise exception using errcode = 'P0001', message = 'RULE_FIELDS', detail = 'O prazo deve ficar entre 1 e 120 meses, ou em branco.';
  end if;
  if partner is null or not exists (select 1 from public.partners p where p.id = partner) then
    raise no_data_found;
  end if;
  if exists (
    select 1 from public.partner_rules r
    where r.partner_id = partner and r.valid_from = rule_start and r.id is distinct from target
  ) then
    raise exception using errcode = 'P0001', message = 'RULE_DUPLICATE';
  end if;
  if target is null then
    insert into public.partner_rules (partner_id, value_per_life, valid_from, term_months, created_by)
    values (partner, rule_value, rule_start, term, auth.uid())
    returning id into target;
  else
    update public.partner_rules r
    set value_per_life = rule_value, valid_from = rule_start, term_months = term
    where r.id = target and r.partner_id = partner;
    if not found then
      raise no_data_found;
    end if;
  end if;
  return target;
end;
$$;

create function public.delete_partner_rule(target uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  delete from public.partner_rules where id = target;
  if not found then
    raise no_data_found;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Indicação (diretor em nome de um parceiro; parceiro ativo em nome próprio)
-- Vale a primeira: CNPJ repetido é barrado com a data da primeira indicação.
-- ---------------------------------------------------------------------------
create function public.create_referral(payload jsonb) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  own_partner uuid := public.my_partner_id();
  partner uuid := nullif(payload->>'partner_id', '')::uuid;
  document text := upper(regexp_replace(coalesce(payload->>'cnpj', ''), '[^A-Za-z0-9]', '', 'g'));
  company text := trim(coalesce(payload->>'company_name', ''));
  lives integer := nullif(payload->>'estimated_lives', '')::integer;
  first_referral_at timestamptz;
  target uuid;
begin
  if public.is_director() then
    if partner is null then
      raise exception using errcode = 'P0001', message = 'REFERRAL_FIELDS', detail = 'Selecione o parceiro.';
    end if;
  elsif own_partner is not null then
    partner := own_partner;
    if not exists (select 1 from public.partners p where p.id = partner and p.status = 'active') then
      raise insufficient_privilege;
    end if;
  else
    raise insufficient_privilege;
  end if;
  if not public.valid_cnpj(document) then
    raise exception using errcode = 'P0001', message = 'REFERRAL_FIELDS', detail = 'CNPJ inválido.';
  end if;
  if length(company) not between 1 and 240 then
    raise exception using errcode = 'P0001', message = 'REFERRAL_FIELDS', detail = 'Informe o nome da empresa.';
  end if;
  if lives is not null and lives not between 0 and 1000000 then
    raise exception using errcode = 'P0001', message = 'REFERRAL_FIELDS', detail = 'Vidas estimadas inválidas.';
  end if;
  if not exists (select 1 from public.partners p where p.id = partner) then
    raise no_data_found;
  end if;
  perform pg_advisory_xact_lock(hashtext('referral:' || document));
  select r.created_at into first_referral_at from public.referrals r where r.cnpj = document;
  if found then
    raise exception using
      errcode = 'P0001',
      message = 'REFERRAL_DUPLICATE',
      detail = to_char(first_referral_at at time zone 'America/Fortaleza', 'DD/MM/YYYY');
  end if;
  insert into public.companies (cnpj, name) values (document, company)
  on conflict (cnpj) do nothing;
  insert into public.referrals (partner_id, cnpj, company_name, estimated_lives, created_by)
  values (partner, document, company, lives, auth.uid())
  returning id into target;
  return target;
end;
$$;

-- ---------------------------------------------------------------------------
-- Importação do CSV do BI (já lido e validado no servidor).
-- batch: {file_name, file_hash, rows_read, issues: [{line_number, raw_line, outcome, reason}]}
-- rows:  [{cnpj, competency 'YYYY-MM-01', lives, company_name, group_name}] sem (cnpj, competency) repetido.
-- Cada competência presente no arquivo é substituída por inteiro; nunca soma.
-- ---------------------------------------------------------------------------
create function public.import_lives(batch jsonb, rows jsonb) returns uuid
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
    nullif(trim(x->>'group_name'), '') as group_name
  from jsonb_array_elements(rows) as x;

  if exists (select 1 from pg_temp.import_input group by cnpj, competency having count(*) > 1) then
    raise exception using errcode = 'P0001', message = 'IMPORT_FIELDS', detail = 'Há CNPJ repetido no mesmo mês.';
  end if;

  select coalesce(array_agg(c order by c), '{}')
  into months
  from (select distinct competency as c from pg_temp.import_input) as m;

  insert into public.import_batches (file_name, file_hash, competencies, rows_read, created_by)
  values (batch->>'file_name', batch->>'file_hash', months, coalesce((batch->>'rows_read')::integer, 0), auth.uid())
  returning id into target;

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
  set rows_imported = imported, rows_ignored = ignored
  where b.id = target;

  -- Status automático só quando o arquivo traz o mês mais recente conhecido.
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

-- ---------------------------------------------------------------------------
-- Privilégios: nada para anon; authenticated lê (via RLS) e executa só as funções listadas.
-- ---------------------------------------------------------------------------
revoke all on table
  public.partners, public.profiles, public.partner_rules, public.companies,
  public.referrals, public.import_batches, public.import_rows, public.monthly_lives,
  public.referral_month_lives, public.partner_month_amounts
from anon, authenticated;

grant select on table
  public.partners, public.profiles, public.partner_rules, public.companies,
  public.referrals, public.import_batches, public.import_rows, public.monthly_lives,
  public.referral_month_lives, public.partner_month_amounts
to authenticated;

revoke all on function
  public.valid_cnpj(text), public.current_role_name(), public.is_director(), public.is_analyst(),
  public.my_partner_id(), public.current_profile(), public.save_partner(jsonb),
  public.save_partner_rule(jsonb), public.delete_partner_rule(uuid), public.create_referral(jsonb),
  public.import_lives(jsonb, jsonb)
from public, anon;

grant execute on function
  public.valid_cnpj(text), public.current_role_name(), public.is_director(), public.is_analyst(),
  public.my_partner_id(), public.current_profile(), public.save_partner(jsonb),
  public.save_partner_rule(jsonb), public.delete_partner_rule(uuid), public.create_referral(jsonb),
  public.import_lives(jsonb, jsonb)
to authenticated;
