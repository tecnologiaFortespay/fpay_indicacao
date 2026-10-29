-- Ajustes do MVP a partir do roteiro de validação e das decisões de 28/10/2026 (docs/decisoes.md).
--   1. Indicação com configuração própria (valor por vida e prazo em meses), definida pelo diretor;
--      em branco, vale a regra do parceiro.
--   2. O parceiro não tem mais meio de pagamento; cada linha paga do fechamento guarda "como foi pago".
--   3. Fechamentos em ordem: nenhum mês com importação fica para trás sem fechar.
--   4. Vigências: só a mais recente muda, e só enquanto nenhum mês fechado a usa.
-- Nenhuma tabela nova (11 de 12).

-- ---------------------------------------------------------------------------
-- 2. Meio de pagamento sai do parceiro; "como foi pago" entra no fechamento.
-- ---------------------------------------------------------------------------
alter table public.partners
  drop constraint partners_pix_data,
  drop constraint partners_bank_data,
  drop constraint partners_active_has_payment,
  drop column payment_method,
  drop column pix_key,
  drop column bank_name,
  drop column bank_branch,
  drop column bank_account;

alter table public.closing_items
  add column payment_note text check (payment_note is null or length(payment_note) between 1 and 200);

comment on column public.closing_items.payment_note is
  'Como a Fortes Pay pagou esta linha (texto livre do diretor); só em linha paga de mês fechado.';

-- ---------------------------------------------------------------------------
-- 1. Configuração da indicação.
-- ---------------------------------------------------------------------------
alter table public.referrals
  add column value_per_life numeric(10, 2) check (value_per_life is null or value_per_life > 0),
  add column term_months integer check (term_months is null or term_months between 1 and 120);

comment on column public.referrals.value_per_life is
  'Valor por vida próprio da indicação; nulo = valor da regra do parceiro vigente no mês.';
comment on column public.referrals.term_months is
  'Prazo próprio em meses, contado do primeiro mês pago; nulo = prazo da regra do parceiro.';

-- Campo opcional da configuração: '' vira nulo (usa a regra do parceiro); o resto é validado.
create function public.optional_value_per_life(value text) returns numeric
language plpgsql immutable
set search_path = ''
as $$
declare
  text_value text := nullif(trim(coalesce(value, '')), '');
begin
  if text_value is null then
    return null;
  end if;
  if text_value !~ '^\d{1,8}(\.\d{1,2})?$' or text_value::numeric <= 0 then
    raise exception using
      errcode = 'P0001',
      message = 'REFERRAL_FIELDS',
      detail = 'Valor por vida inválido (ex.: 1,50); em branco usa o do parceiro.';
  end if;
  return text_value::numeric(10, 2);
end;
$$;

create function public.optional_term_months(value text) returns integer
language plpgsql immutable
set search_path = ''
as $$
declare
  text_value text := nullif(trim(coalesce(value, '')), '');
begin
  if text_value is null then
    return null;
  end if;
  if text_value !~ '^\d{1,3}$' or text_value::integer not between 1 and 120 then
    raise exception using
      errcode = 'P0001',
      message = 'REFERRAL_FIELDS',
      detail = 'Prazo entre 1 e 120 meses; em branco usa o do parceiro.';
  end if;
  return text_value::integer;
end;
$$;

-- Cálculo: valor e prazo efetivos de cada indicação (os dela ou, em branco, os da regra do parceiro
-- vigente no mês) e o valor resultante, ainda em SQL.
drop view public.partner_month_amounts;
drop view public.referral_month_lives;

create view public.referral_month_lives
with (security_invoker = true)
as
select
  r.id as referral_id,
  r.partner_id,
  r.cnpj,
  m.competency,
  m.lives,
  coalesce(r.value_per_life, rule.value_per_life) as value_per_life,
  coalesce(r.term_months, rule.term_months) as term_months,
  (m.lives * coalesce(r.value_per_life, rule.value_per_life, 0))::numeric(12, 2) as amount
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
    coalesce(r.term_months, rule.term_months) is null
    or r.activated_competency is null
    or m.competency < (r.activated_competency + make_interval(months => coalesce(r.term_months, rule.term_months)))::date
  );

-- Por parceiro × mês: soma das indicações. value_per_life é a regra do parceiro no mês, só para a tela;
-- indicações com valor próprio já entram em amount com o delas.
create view public.partner_month_amounts
with (security_invoker = true)
as
select
  l.partner_id,
  l.competency,
  sum(l.lives)::integer as lives,
  rule.value_per_life,
  sum(l.amount)::numeric(12, 2) as amount
from public.referral_month_lives l
left join lateral (
  select pr.value_per_life
  from public.partner_rules pr
  where pr.partner_id = l.partner_id and pr.valid_from <= l.competency
  order by pr.valid_from desc
  limit 1
) rule on true
group by l.partner_id, l.competency, rule.value_per_life;

revoke all on table public.referral_month_lives, public.partner_month_amounts from anon, authenticated;
grant select on table public.referral_month_lives, public.partner_month_amounts to authenticated;

-- Só o diretor define valor e prazo da indicação. Em branco = regra do parceiro.
create function public.set_referral_config(target uuid, payload jsonb) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  custom_value numeric(10, 2);
  custom_term integer;
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  custom_value := public.optional_value_per_life(payload->>'value_per_life');
  custom_term := public.optional_term_months(payload->>'term_months');
  update public.referrals r
  set value_per_life = custom_value, term_months = custom_term
  where r.id = target;
  if not found then
    raise no_data_found;
  end if;
end;
$$;

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
    partner_id, cnpj, company_name, estimated_lives, value_per_life, term_months, created_by
  )
  values (partner, document, company, lives, custom_value, custom_term, auth.uid())
  returning id into target;
  return target;
end;
$$;

-- ---------------------------------------------------------------------------
-- Parceiro sem meio de pagamento: cadastro pelo convite, aprovação e edição.
-- ---------------------------------------------------------------------------
create or replace function public.save_partner(payload jsonb) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  target uuid := nullif(payload->>'id', '')::uuid;
  region text := nullif(upper(trim(payload->>'state')), '');
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  if coalesce(length(trim(payload->>'name')), 0) not between 1 and 160 then
    raise exception using errcode = 'P0001', message = 'PARTNER_FIELDS', detail = 'Informe o nome do parceiro.';
  end if;
  if coalesce(payload->>'kind', '') not in ('unit', 'external') then
    raise exception using errcode = 'P0001', message = 'PARTNER_FIELDS', detail = 'Informe se é unidade ou parceiro externo.';
  end if;
  if region is not null and region !~ '^[A-Z]{2}$' then
    raise exception using errcode = 'P0001', message = 'PARTNER_FIELDS', detail = 'Informe a UF com duas letras.';
  end if;
  if target is null then
    insert into public.partners (
      name, kind, city, state, contact_name, contact_email, contact_phone,
      status, approved_by, approved_at, created_by
    )
    values (
      trim(payload->>'name'),
      payload->>'kind',
      nullif(trim(payload->>'city'), ''),
      region,
      nullif(trim(payload->>'contact_name'), ''),
      nullif(lower(trim(payload->>'contact_email')), ''),
      nullif(trim(payload->>'contact_phone'), ''),
      'active', auth.uid(), now(), auth.uid()
    )
    returning id into target;
  else
    update public.partners
    set
      name = trim(payload->>'name'),
      kind = payload->>'kind',
      city = nullif(trim(payload->>'city'), ''),
      state = region,
      contact_name = nullif(trim(payload->>'contact_name'), ''),
      contact_email = nullif(lower(trim(payload->>'contact_email')), ''),
      contact_phone = nullif(trim(payload->>'contact_phone'), '')
    where id = target;
    if not found then
      raise no_data_found;
    end if;
  end if;
  return target;
end;
$$;

create or replace function public.register_partner(secret text, payload jsonb) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  invitation public.invitations;
  existing public.profiles;
  region text := nullif(upper(trim(payload->>'state')), '');
  account_email text;
  target uuid;
begin
  if auth.uid() is null then
    raise insufficient_privilege;
  end if;
  select * into existing from public.profiles p where p.user_id = auth.uid();
  if found then
    if existing.role = 'partner' and exists (
      select 1 from public.invitations i
      where i.token_hash = public.invitation_token_hash(secret) and i.partner_id = existing.partner_id
    ) then
      return existing.partner_id;
    end if;
    raise exception using errcode = 'P0001', message = 'ALREADY_REGISTERED';
  end if;
  select * into invitation from public.invitations i
  where i.token_hash = public.invitation_token_hash(secret)
  for update;
  if not found or invitation.used_at is not null or invitation.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'INVITATION_INVALID';
  end if;
  if coalesce(length(trim(payload->>'name')), 0) not between 1 and 160 then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_FIELDS', detail = 'Informe o nome da unidade ou do parceiro.';
  end if;
  if coalesce(length(trim(payload->>'contact_name')), 0) not between 1 and 160 then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_FIELDS', detail = 'Informe o nome do responsável.';
  end if;
  if region is not null and region !~ '^[A-Z]{2}$' then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_FIELDS', detail = 'Informe a UF com duas letras.';
  end if;
  select lower(u.email) into account_email from auth.users u where u.id = auth.uid();
  insert into public.partners (
    name, kind, city, state, contact_name, contact_email, contact_phone, status, created_by
  )
  values (
    trim(payload->>'name'), invitation.kind, nullif(trim(payload->>'city'), ''), region,
    trim(payload->>'contact_name'), account_email, nullif(trim(payload->>'contact_phone'), ''),
    'pending', auth.uid()
  )
  returning id into target;
  insert into public.profiles (user_id, role, partner_id, display_name)
  values (auth.uid(), 'partner', target, trim(payload->>'contact_name'));
  update public.invitations
  set used_at = now(), used_by = auth.uid(), partner_id = target
  where id = invitation.id;
  return target;
end;
$$;

-- Aprovação exige a regra (valor por vida e vigência; prazo opcional). Não há parceiro ativo sem regra.
create or replace function public.approve_partner(payload jsonb) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  target uuid := nullif(payload->>'partner_id', '')::uuid;
  current_status text;
  rule_value numeric(10, 2);
  rule_start date;
  term integer;
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  select p.status into current_status from public.partners p where p.id = target for update;
  if not found then
    raise no_data_found;
  end if;
  if current_status = 'active' then
    raise exception using errcode = 'P0001', message = 'APPROVAL_FIELDS', detail = 'Este parceiro já está ativo.';
  end if;
  if coalesce(payload->>'value_per_life', '') !~ '^\d{1,8}(\.\d{1,2})?$' then
    raise exception using errcode = 'P0001', message = 'APPROVAL_FIELDS', detail = 'Informe o valor por vida (ex.: 1,50).';
  end if;
  rule_value := (payload->>'value_per_life')::numeric(10, 2);
  if rule_value <= 0 then
    raise exception using errcode = 'P0001', message = 'APPROVAL_FIELDS', detail = 'O valor por vida deve ser maior que zero.';
  end if;
  if coalesce(payload->>'valid_from', '') !~ '^\d{4}-(0[1-9]|1[0-2])-01$' then
    raise exception using errcode = 'P0001', message = 'APPROVAL_FIELDS', detail = 'Informe o mês de início da vigência.';
  end if;
  rule_start := (payload->>'valid_from')::date;
  if coalesce(payload->>'term_months', '') !~ '^(\d{1,3})?$' then
    raise exception using errcode = 'P0001', message = 'APPROVAL_FIELDS', detail = 'O prazo deve ficar entre 1 e 120 meses, ou em branco.';
  end if;
  term := nullif(payload->>'term_months', '')::integer;
  if term is not null and term not between 1 and 120 then
    raise exception using errcode = 'P0001', message = 'APPROVAL_FIELDS', detail = 'O prazo deve ficar entre 1 e 120 meses, ou em branco.';
  end if;
  update public.partners
  set status = 'active', approved_by = auth.uid(), approved_at = now(), rejection_reason = null
  where id = target;
  insert into public.partner_rules (partner_id, value_per_life, valid_from, term_months, created_by)
  values (target, rule_value, rule_start, term, auth.uid())
  on conflict (partner_id, valid_from) do update
  set value_per_life = excluded.value_per_life, term_months = excluded.term_months;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Vigências: mês fechado primeiro; só a mais recente muda ou sai.
-- ---------------------------------------------------------------------------
create or replace function public.save_partner_rule(payload jsonb) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  target uuid := nullif(payload->>'id', '')::uuid;
  partner uuid := nullif(payload->>'partner_id', '')::uuid;
  rule_value numeric(10, 2);
  rule_start date;
  term integer;
  locked date;
  latest public.partner_rules;
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  if coalesce(payload->>'value_per_life', '') !~ '^\d{1,8}(\.\d{1,2})?$' then
    raise exception using errcode = 'P0001', message = 'RULE_FIELDS', detail = 'Informe o valor por vida (ex.: 1,50).';
  end if;
  rule_value := (payload->>'value_per_life')::numeric(10, 2);
  if rule_value <= 0 then
    raise exception using errcode = 'P0001', message = 'RULE_FIELDS', detail = 'O valor por vida deve ser maior que zero.';
  end if;
  if coalesce(payload->>'valid_from', '') !~ '^\d{4}-(0[1-9]|1[0-2])-01$' then
    raise exception using errcode = 'P0001', message = 'RULE_FIELDS', detail = 'Informe o mês de início da vigência.';
  end if;
  rule_start := (payload->>'valid_from')::date;
  if coalesce(payload->>'term_months', '') !~ '^(\d{1,3})?$' then
    raise exception using errcode = 'P0001', message = 'RULE_FIELDS', detail = 'O prazo deve ficar entre 1 e 120 meses, ou em branco.';
  end if;
  term := nullif(payload->>'term_months', '')::integer;
  if term is not null and term not between 1 and 120 then
    raise exception using errcode = 'P0001', message = 'RULE_FIELDS', detail = 'O prazo deve ficar entre 1 e 120 meses, ou em branco.';
  end if;
  if partner is null or not exists (select 1 from public.partners p where p.id = partner) then
    raise no_data_found;
  end if;
  select * into latest from public.partner_rules r where r.partner_id = partner order by r.valid_from desc limit 1;
  if target is not null and (latest.id is null or latest.id <> target) then
    raise exception using
      errcode = 'P0001',
      message = 'RULE_FIELDS',
      detail = 'Só a vigência mais recente pode ser alterada. Para mudar o valor, crie uma vigência nova.';
  end if;
  select max(c.competency) into locked from public.closings c where c.status = 'closed';
  if locked is not null and (rule_start <= locked or (target is not null and latest.valid_from <= locked)) then
    raise exception using errcode = 'P0001', message = 'RULE_LOCKED', detail = to_char(locked, 'MM/YYYY');
  end if;
  if target is not null and exists (
    select 1 from public.partner_rules r
    where r.partner_id = partner and r.id <> target and r.valid_from >= rule_start
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'RULE_FIELDS',
      detail = 'A vigência mais recente precisa começar depois das anteriores.';
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
  end if;
  return target;
end;
$$;

create or replace function public.delete_partner_rule(target uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  rule public.partner_rules;
  locked date;
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  select * into rule from public.partner_rules r where r.id = target for update;
  if not found then
    raise no_data_found;
  end if;
  if exists (
    select 1 from public.partner_rules r
    where r.partner_id = rule.partner_id and r.valid_from > rule.valid_from
  ) then
    raise exception using errcode = 'P0001', message = 'RULE_FIELDS', detail = 'Só a vigência mais recente pode ser removida.';
  end if;
  select max(c.competency) into locked from public.closings c where c.status = 'closed';
  if locked is not null and rule.valid_from <= locked then
    raise exception using errcode = 'P0001', message = 'RULE_LOCKED', detail = to_char(locked, 'MM/YYYY');
  end if;
  if not exists (select 1 from public.partner_rules r where r.partner_id = rule.partner_id and r.id <> rule.id)
    and exists (select 1 from public.partners p where p.id = rule.partner_id and p.status = 'active') then
    raise exception using errcode = 'P0001', message = 'RULE_FIELDS', detail = 'Parceiro ativo precisa de pelo menos uma vigência.';
  end if;
  delete from public.partner_rules r where r.id = target;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Fechamentos em ordem e "como foi pago".
-- ---------------------------------------------------------------------------
-- Primeiro mês anterior a `month` que tem importação e ainda não foi fechado (nulo = nenhum).
create function public.closing_blocker(month date) returns date
language plpgsql stable security definer
set search_path = ''
as $$
declare
  blocker date;
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  select min(covered.competency) into blocker
  from (select distinct unnest(b.competencies) as competency from public.import_batches b) as covered
  where covered.competency < month
    and not public.is_closed_competency(covered.competency);
  return blocker;
end;
$$;

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
end;
$$;

-- Texto livre do diretor sobre como pagou a linha (ex.: "PIX em 05/11"); o parceiro vê.
create function public.set_payment_note(target uuid, note text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  item public.closing_items;
  clean_note text := nullif(trim(coalesce(note, '')), '');
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  if clean_note is not null and length(clean_note) > 200 then
    raise exception using errcode = 'P0001', message = 'CLOSING_FIELDS', detail = 'Use até 200 caracteres.';
  end if;
  select * into item from public.closing_items ci where ci.id = target for update;
  if not found then
    raise no_data_found;
  end if;
  if not public.closing_is_closed(item.closing_id) or item.decision is distinct from 'pay' then
    raise exception using
      errcode = 'P0001',
      message = 'CLOSING_FIELDS',
      detail = 'Só a linha paga de um mês fechado recebe a forma de pagamento.';
  end if;
  update public.closing_items set payment_note = clean_note where id = target;
end;
$$;

revoke all on function
  public.optional_value_per_life(text), public.optional_term_months(text),
  public.set_referral_config(uuid, jsonb), public.closing_blocker(date),
  public.set_payment_note(uuid, text)
from public, anon, authenticated;

grant execute on function
  public.set_referral_config(uuid, jsonb), public.closing_blocker(date),
  public.set_payment_note(uuid, text)
to authenticated;
