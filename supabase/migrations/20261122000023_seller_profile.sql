-- 22/11/2026 — pedido da área de negócio (decisão 29): perfil de vendedor, o terceiro perfil,
-- ligado a um parceiro.
-- (a) O vendedor pede a conta no site com o nome e o e-mail da unidade a que pertence. O pedido
--     nasce pendente; um diretor aprova, recusa ou, depois, remove o acesso. Sem aprovação o
--     vendedor não lê nem grava nada.
-- (b) O vendedor aprovado só registra indicações em nome da unidade e vê as que ele mesmo
--     registrou: empresa, CNPJ, situação, datas e as vidas pagas do mês. Ele não lê tabela
--     nenhuma (nenhuma policy muda): a lista sai de seller_referrals(), que devolve só essas
--     colunas, sem valor por vida, valor, regra ou prazo.
-- (c) O vendedor da indicação (referrals.seller_name) passa a ser o e-mail da conta que registra,
--     para o parceiro e para o vendedor. O texto livre continua com o diretor (ao registrar em nome
--     do parceiro e em set_referral_seller). As indicações que já existem ficam como estão.
-- Nenhuma tabela nova (12 de 12): o vendedor é uma linha de profiles.

-- ---------------------------------------------------------------------------
-- 1. profiles: papel 'seller', parceiro obrigatório para ele e situação do pedido.
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('director', 'partner', 'seller'));

alter table public.profiles drop constraint profiles_partner_link;
alter table public.profiles
  add constraint profiles_partner_link
  check ((role in ('partner', 'seller')) = (partner_id is not null));

-- Só o vendedor passa por aprovação aqui: a do parceiro continua em partners.status e o diretor
-- entra pelo convite.
alter table public.profiles
  add column status text not null default 'active'
  check (status in ('pending', 'active', 'rejected'));
alter table public.profiles
  add constraint profiles_status_seller_only check (status = 'active' or role = 'seller');

comment on column public.profiles.status is
  'Acesso do vendedor: pending (pediu a conta), active (aprovado pelo diretor), rejected (recusado ou acesso removido). Diretor e parceiro são sempre active.';

-- ---------------------------------------------------------------------------
-- 2. O vendedor da indicação passa a guardar um e-mail de conta (até 254 caracteres).
-- ---------------------------------------------------------------------------
alter table public.referrals drop constraint referrals_seller_name_check;
alter table public.referrals
  add constraint referrals_seller_name_check
  check (seller_name is null or length(seller_name) between 1 and 254);

-- ---------------------------------------------------------------------------
-- 3. Parceiro do vendedor conectado, só com o pedido aprovado e o parceiro ativo; nulo para
--    qualquer outra conta. Nenhuma policy a usa: só as funções abaixo.
-- ---------------------------------------------------------------------------
create function public.my_seller_partner_id() returns uuid
language sql stable security definer
set search_path = ''
as $$
  select p.partner_id
  from public.profiles p
  join public.partners pa on pa.id = p.partner_id
  where p.user_id = auth.uid() and p.role = 'seller' and p.status = 'active' and pa.status = 'active';
$$;

-- Igual à versão de 20261027000001, mais a situação do perfil. O motivo da recusa do parceiro só
-- vai para o próprio parceiro.
create or replace function public.current_profile() returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', p.user_id,
    'role', p.role,
    'status', p.status,
    'display_name', p.display_name,
    'partner', case
      when pa.id is null then null
      else jsonb_build_object(
        'id', pa.id,
        'name', pa.name,
        'status', pa.status,
        'rejection_reason', case when p.role = 'partner' then pa.rejection_reason end
      )
    end
  )
  from public.profiles p
  left join public.partners pa on pa.id = p.partner_id
  where p.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 4. Pedido de conta do vendedor: a conta conectada, ainda sem perfil, informa o nome e o e-mail
--    da unidade. O pedido nasce pendente.
-- ---------------------------------------------------------------------------
create function public.register_seller(payload jsonb) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  existing public.profiles;
  full_name text := trim(coalesce(payload->>'name', ''));
  unit_email text := lower(trim(coalesce(payload->>'unit_email', '')));
  unit uuid;
begin
  if auth.uid() is null then
    raise insufficient_privilege;
  end if;
  select * into existing from public.profiles p where p.user_id = auth.uid();
  if found then
    -- Segundo envio do mesmo formulário: o pedido já existe e não muda.
    if existing.role = 'seller' then
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'ALREADY_REGISTERED';
  end if;
  if length(full_name) not between 1 and 120 then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_FIELDS', detail = 'Informe o seu nome.';
  end if;
  if length(unit_email) > 254 or unit_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_FIELDS', detail = 'Informe o e-mail da unidade.';
  end if;
  -- A unidade pelo e-mail com que ela entra no sistema...
  select pa.id into unit
  from public.partners pa
  join public.profiles p on p.partner_id = pa.id and p.role = 'partner'
  join auth.users u on u.id = p.user_id
  where pa.status = 'active' and lower(u.email) = unit_email
  limit 1;
  -- ...ou pelo e-mail de contato do cadastro, quando ele aponta para um parceiro só.
  if unit is null and (
    select count(*) from public.partners pa
    where pa.status = 'active' and lower(pa.contact_email) = unit_email
  ) = 1 then
    select pa.id into unit
    from public.partners pa
    where pa.status = 'active' and lower(pa.contact_email) = unit_email;
  end if;
  if unit is null then
    raise exception using
      errcode = 'P0001',
      message = 'REGISTRATION_FIELDS',
      detail = 'Não encontramos uma unidade ativa com este e-mail. Confira com a sua unidade o e-mail que ela usa para entrar no sistema.';
  end if;
  insert into public.profiles (user_id, role, partner_id, display_name, status)
  values (auth.uid(), 'seller', unit, full_name, 'pending');
end;
$$;

-- O diretor aprova ('active') ou recusa / remove o acesso ('rejected'); pode liberar de novo.
create function public.set_seller_status(target uuid, new_status text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  current_status text;
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  if new_status is null or new_status not in ('active', 'rejected') then
    raise exception using errcode = 'P0001', message = 'APPROVAL_FIELDS', detail = 'Informe se libera ou retira o acesso do vendedor.';
  end if;
  select p.status into current_status
  from public.profiles p
  where p.user_id = target and p.role = 'seller'
  for update;
  if not found then
    raise no_data_found;
  end if;
  if current_status = new_status then
    raise exception using
      errcode = 'P0001',
      message = 'APPROVAL_FIELDS',
      detail = case new_status
        when 'active' then 'Este vendedor já está com o acesso liberado.'
        else 'Este vendedor já está sem acesso.'
      end;
  end if;
  update public.profiles p set status = new_status where p.user_id = target;
end;
$$;

-- Vendedores com o e-mail de acesso (auth.users, fora da RLS) e a unidade, para o diretor.
create function public.list_sellers()
returns table (
  user_id uuid,
  display_name text,
  email text,
  partner_id uuid,
  partner_name text,
  status text,
  created_at timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  return query
    select p.user_id, p.display_name, u.email::text, p.partner_id, pa.name, p.status, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.user_id
    join public.partners pa on pa.id = p.partner_id
    where p.role = 'seller'
    order by p.created_at, p.display_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Registro da indicação: igual à versão de 20261110000017, mais (i) o vendedor aprovado, que
--    registra em nome da unidade, e (ii) o vendedor da indicação gravado com o e-mail da conta
--    quando quem registra é o parceiro ou o vendedor. O caminho do diretor não muda.
-- ---------------------------------------------------------------------------
create or replace function public.create_referral(payload jsonb) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  own_partner uuid := public.my_partner_id();
  own_unit uuid := public.my_seller_partner_id();
  partner uuid := nullif(payload->>'partner_id', '')::uuid;
  document text := upper(regexp_replace(coalesce(payload->>'cnpj', ''), '[^A-Za-z0-9]', '', 'g'));
  company text := trim(coalesce(payload->>'company_name', ''));
  lives integer := nullif(payload->>'estimated_lives', '')::integer;
  seller text := nullif(trim(coalesce(payload->>'seller_name', '')), '');
  custom_value numeric(10, 2);
  custom_term integer;
  first_referral_at timestamptz;
  target uuid;
begin
  if public.is_director() then
    if partner is null then
      raise exception using errcode = 'P0001', message = 'REFERRAL_FIELDS', detail = 'Selecione o parceiro.';
    end if;
    custom_value := public.optional_value_per_life(payload->>'value_per_life');
    custom_term := public.optional_term_months(payload->>'term_months');
  elsif own_partner is not null then
    partner := own_partner;
    if not exists (select 1 from public.partners p where p.id = partner and p.status = 'active') then
      raise insufficient_privilege;
    end if;
    if nullif(trim(coalesce(payload->>'value_per_life', '')), '') is not null
      or nullif(trim(coalesce(payload->>'term_months', '')), '') is not null then
      raise exception using
        errcode = 'P0001',
        message = 'REFERRAL_FIELDS',
        detail = 'Valor e prazo da indicação são definidos pela Fortes Pay.';
    end if;
  elsif own_unit is not null then
    -- Vendedor aprovado de uma unidade ativa: sempre em nome da unidade, sem valor nem prazo.
    partner := own_unit;
    if nullif(trim(coalesce(payload->>'value_per_life', '')), '') is not null
      or nullif(trim(coalesce(payload->>'term_months', '')), '') is not null then
      raise exception using
        errcode = 'P0001',
        message = 'REFERRAL_FIELDS',
        detail = 'Valor e prazo da indicação são definidos pela Fortes Pay.';
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
  if seller is not null and length(seller) > 120 then
    raise exception using errcode = 'P0001', message = 'REFERRAL_FIELDS', detail = 'Vendedor: use até 120 caracteres.';
  end if;
  -- Decisão 29: só o diretor escreve o vendedor (texto livre). Para o parceiro e para o vendedor
  -- vale o e-mail da conta que registra.
  if not public.is_director() then
    select lower(u.email) into seller from auth.users u where u.id = auth.uid();
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
  insert into public.referrals (partner_id, cnpj, company_name, estimated_lives, seller_name, created_by)
  values (partner, document, company, lives, seller, auth.uid())
  returning id into target;
  if custom_value is not null or custom_term is not null then
    insert into public.partner_rules (partner_id, referral_id, value_per_life, valid_from, term_months, created_by)
    values (
      partner, target, custom_value,
      date_trunc('month', now() at time zone 'America/Fortaleza')::date, custom_term, auth.uid()
    );
  end if;
  return target;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. O que o vendedor vê: só as indicações que ele registrou, com as vidas pagas do mês mais
--    recente que a unidade dele enxerga (o mesmo mês e o mesmo número de "Minhas indicações" do
--    parceiro, pela view referral_month_lives). Nenhuma coluna de valor, regra ou prazo.
-- ---------------------------------------------------------------------------
create function public.seller_referrals()
returns table (
  id uuid,
  cnpj text,
  company_name text,
  status text,
  status_changed_at timestamptz,
  activated_competency date,
  created_at timestamptz,
  competency date,
  lives integer
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  unit uuid := public.my_seller_partner_id();
  latest date;
begin
  if unit is null then
    raise insufficient_privilege;
  end if;
  select max(m.competency) into latest
  from public.monthly_lives m
  join public.referrals r on r.cnpj = m.cnpj
  where r.partner_id = unit;
  return query
    select
      r.id, r.cnpj, r.company_name, r.status, r.status_changed_at, r.activated_competency,
      r.created_at, latest, coalesce(l.lives, 0)::integer
    from public.referrals r
    left join public.referral_month_lives l on l.referral_id = r.id and l.competency = latest
    where r.created_by = auth.uid() and r.partner_id = unit
    order by r.created_at desc
    limit 500;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Últimos envios: igual à versão de 20261110000015, só para diretor e parceiro (antes bastava
--    ter um perfil; o vendedor não vê envios).
-- ---------------------------------------------------------------------------
create or replace function public.recent_imports(how_many integer default 5)
returns table (created_at timestamptz, competencies date[])
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not coalesce(public.current_role_name() in ('director', 'partner'), false) then
    raise insufficient_privilege;
  end if;
  return query
    select b.created_at, b.competencies
    from public.import_batches b
    order by b.created_at desc
    limit greatest(1, least(coalesce(how_many, 5), 20));
end;
$$;

revoke all on function
  public.my_seller_partner_id(), public.register_seller(jsonb),
  public.set_seller_status(uuid, text), public.list_sellers(), public.seller_referrals()
from public, anon, authenticated;

grant execute on function
  public.register_seller(jsonb), public.set_seller_status(uuid, text),
  public.list_sellers(), public.seller_referrals()
to authenticated;
