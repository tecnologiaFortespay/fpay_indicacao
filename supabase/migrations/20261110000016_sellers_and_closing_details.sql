-- 10/11/2026 — itens 1 e 2 da reunião de 09/11/2026 (decisão 22). Nenhuma tabela nova.
-- (1) Vendedor: texto opcional na indicação, informado por quem registra (parceiro ou diretor);
--     só o diretor corrige depois. Login e comissão de vendedor continuam fase 2.
-- (2) Fechamento em dois níveis: o retrato de cada parceiro guarda os clientes do mês (vidas,
--     valor por vida, valor, vendedor) no mesmo instante do cálculo, para a soma dos clientes ser
--     sempre o valor do parceiro e o mês fechado continuar lendo o que foi gravado (decisão 8).

alter table public.referrals
  add column seller_name text
  check (seller_name is null or length(seller_name) between 1 and 120);

-- Igual à versão de 20261028000007, mais o vendedor (opcional, até 120 caracteres).
create or replace function public.create_referral(payload jsonb) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  own_partner uuid := public.my_partner_id();
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
  insert into public.referrals (
    partner_id, cnpj, company_name, estimated_lives, value_per_life, term_months, seller_name, created_by
  )
  values (partner, document, company, lives, custom_value, custom_term, seller, auth.uid())
  returning id into target;
  return target;
end;
$$;

-- O diretor corrige o vendedor de uma indicação; em branco apaga.
create function public.set_referral_seller(target uuid, name text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  seller text := nullif(trim(coalesce(name, '')), '');
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  if seller is not null and length(seller) > 120 then
    raise exception using errcode = 'P0001', message = 'REFERRAL_FIELDS', detail = 'Vendedor: use até 120 caracteres.';
  end if;
  update public.referrals r set seller_name = seller where r.id = target;
  if not found then
    raise no_data_found;
  end if;
end;
$$;

-- Clientes do parceiro no mês, como estavam ao preparar ou recalcular o fechamento:
-- [{referral_id, cnpj, company_name, seller_name, lives, value_per_life, amount}]; sum(amount) = month_amount.
alter table public.closing_items
  add column details jsonb not null default '[]'::jsonb
  check (jsonb_typeof(details) = 'array');

-- Igual à versão de 20261028000007, mais o retrato dos clientes no mesmo insert do cálculo.
create or replace function public.prepare_closing(month date) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  target uuid;
  previous public.closings;
  current_status text;
  blocker date;
  month_start_fortaleza date := date_trunc('month', now() at time zone 'America/Fortaleza')::date;
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  if month is null or extract(day from month) <> 1 then
    raise exception using errcode = 'P0001', message = 'CLOSING_FIELDS', detail = 'Informe o mês do fechamento.';
  end if;
  if month >= month_start_fortaleza then
    raise exception using
      errcode = 'P0001',
      message = 'CLOSING_FIELDS',
      detail = 'Mês ainda não encerrado: só é possível fechar um mês que já terminou.';
  end if;
  select c.status into current_status from public.closings c where c.competency = month;
  if current_status = 'closed' then
    raise exception using errcode = 'P0001', message = 'CLOSING_FIELDS', detail = 'Este mês já está fechado.';
  end if;
  blocker := public.closing_blocker(month);
  if blocker is not null then
    raise exception using
      errcode = 'P0001',
      message = 'CLOSING_FIELDS',
      detail = 'Feche primeiro o mês ' || to_char(blocker, 'MM/YYYY') || '.';
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
  select * into previous from public.closings c where c.competency < month order by c.competency desc limit 1;
  insert into public.closings (competency, prepared_by)
  values (month, auth.uid())
  on conflict (competency) do update set prepared_by = excluded.prepared_by, prepared_at = now()
  returning id into target;

  insert into public.closing_items (closing_id, partner_id, lives, value_per_life, month_amount, previous_balance, details)
  select
    target,
    p.id,
    coalesce(a.lives, 0),
    a.value_per_life,
    coalesce(a.amount, 0),
    coalesce((
      select ci.total from public.closing_items ci
      where ci.closing_id = previous.id and ci.partner_id = p.id and ci.decision = 'accumulate'
    ), 0),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'referral_id', l.referral_id,
          'cnpj', l.cnpj,
          'company_name', r.company_name,
          'seller_name', r.seller_name,
          'lives', l.lives,
          'value_per_life', l.value_per_life,
          'amount', l.amount
        )
        order by r.company_name, l.cnpj
      )
      from public.referral_month_lives l
      join public.referrals r on r.id = l.referral_id
      where l.partner_id = p.id and l.competency = month
    ), '[]'::jsonb)
  from public.partners p
  left join public.partner_month_amounts a on a.partner_id = p.id and a.competency = month
  where p.status = 'active'
  on conflict (closing_id, partner_id) do update
  set
    lives = excluded.lives,
    value_per_life = excluded.value_per_life,
    month_amount = excluded.month_amount,
    previous_balance = excluded.previous_balance,
    details = excluded.details;

  delete from public.closing_items ci
  where ci.closing_id = target
    and not exists (select 1 from public.partners p where p.id = ci.partner_id and p.status = 'active');
  return target;
end;
$$;

revoke all on function public.set_referral_seller(uuid, text) from public, anon, authenticated;
grant execute on function public.set_referral_seller(uuid, text) to authenticated;
