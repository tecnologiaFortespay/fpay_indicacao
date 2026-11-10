-- 10/11/2026 — item 6 da reunião de 09/11/2026 (decisão 23): regra por parceiro ou por cliente,
-- com vigências. Nenhuma tabela nova.
-- (a) A regra do parceiro vale para os meses a partir da vigência e só para as indicações feitas a
--     partir daquele mês (data da indicação). Indicações anteriores seguem a regra anterior; uma
--     indicação anterior a qualquer vigência usa a primeira que passou a valer.
-- (b) A indicação pode ter vigências próprias (valor e/ou prazo), por mês, guardadas em
--     partner_rules com referral_id. Elas substituem referrals.value_per_life/term_months (um valor
--     só, sem histórico e sem trava de mês fechado) e passam pela mesma trava das vigências do
--     parceiro (trigger protect_partner_rules).

-- 1. partner_rules passa a guardar também as vigências de indicação.
alter table public.partner_rules
  add column referral_id uuid references public.referrals (id) on delete cascade;
alter table public.partner_rules alter column value_per_life drop not null;
alter table public.partner_rules drop constraint partner_rules_value_per_life_check;
alter table public.partner_rules
  add constraint partner_rules_value_per_life_check check (value_per_life is null or value_per_life > 0);
-- Vigência do parceiro sempre tem valor; a da indicação tem valor, prazo ou os dois.
alter table public.partner_rules
  add constraint partner_rules_scope check (
    (referral_id is null and value_per_life is not null)
    or (referral_id is not null and (value_per_life is not null or term_months is not null))
  );
alter table public.partner_rules drop constraint partner_rules_partner_id_valid_from_key;
create unique index partner_rules_partner_month
  on public.partner_rules (partner_id, valid_from) where referral_id is null;
create unique index partner_rules_referral_month
  on public.partner_rules (referral_id, valid_from) where referral_id is not null;

comment on column public.partner_rules.referral_id is
  'Nulo = vigência do parceiro (vale para indicações feitas a partir do mês). Preenchido = vigência própria da indicação (vale por mês).';

-- 2. A trava de mês fechado já vale para toda linha; entra a conferência indicação × parceiro.
create or replace function public.guard_partner_rules() returns trigger
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
  if tg_op <> 'DELETE' and new.referral_id is not null and not exists (
    select 1 from public.referrals r where r.id = new.referral_id and r.partner_id = new.partner_id
  ) then
    raise exception using errcode = 'P0001', message = 'RULE_FIELDS', detail = 'A indicação não é deste parceiro.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- 3. Valor e prazo próprios que existiam na indicação viram a primeira vigência dela, começando no
--    mês em que ela passou a contar (o menor entre o mês da indicação e o primeiro mês com vidas),
--    para os totais de hoje não mudarem. A trava fica desligada só aqui: esse mês pode estar fechado.
alter table public.partner_rules disable trigger protect_partner_rules;
insert into public.partner_rules (partner_id, referral_id, value_per_life, term_months, valid_from, created_by)
select
  r.partner_id,
  r.id,
  r.value_per_life,
  r.term_months,
  least(
    date_trunc('month', r.created_at at time zone 'America/Fortaleza')::date,
    coalesce((select min(m.competency) from public.monthly_lives m where m.cnpj = r.cnpj), 'infinity'::date)
  ),
  r.created_by
from public.referrals r
where r.value_per_life is not null or r.term_months is not null;
alter table public.partner_rules enable trigger protect_partner_rules;

-- 4. Cálculo (mesmas colunas de saída de 20261028000007). Para cada indicação e mês:
--    valor = vigência própria em vigor no mês, senão a regra do parceiro escolhida pela data da
--    indicação; vidas × valor.
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
cross join lateral (
  select date_trunc('month', r.created_at at time zone 'America/Fortaleza')::date as month
) referred
-- Vigência própria da indicação em vigor no mês (manda sobre a do parceiro).
left join lateral (
  select pr.value_per_life, pr.term_months
  from public.partner_rules pr
  where pr.referral_id = r.id and pr.valid_from <= m.competency
  order by pr.valid_from desc
  limit 1
) own on true
-- Regra do parceiro: entre as que já valem no mês, a mais recente que já existia quando a
-- indicação foi feita; se nenhuma existia ainda, a primeira que passou a valer (decisão 23).
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

-- "Valor por vida" do parceiro no mês = regra para indicações novas naquele mês (informativo);
-- o valor do mês continua a soma por indicação.
create or replace view public.partner_month_amounts
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
  where pr.partner_id = l.partner_id and pr.referral_id is null and pr.valid_from <= l.competency
  order by pr.valid_from desc
  limit 1
) rule on true
group by l.partner_id, l.competency, rule.value_per_life;

-- 5. As colunas antigas da indicação saem: uma fonte só.
alter table public.referrals drop column value_per_life, drop column term_months;
drop function public.set_referral_config(uuid, jsonb);

-- 6. Uma função para as vigências do parceiro e da indicação (referral_id no payload).
create or replace function public.save_partner_rule(payload jsonb) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  target uuid := nullif(payload->>'id', '')::uuid;
  partner uuid := nullif(payload->>'partner_id', '')::uuid;
  referral uuid := nullif(payload->>'referral_id', '')::uuid;
  value_text text := nullif(trim(coalesce(payload->>'value_per_life', '')), '');
  rule_value numeric(10, 2);
  rule_start date;
  term integer;
  locked date;
  latest public.partner_rules;
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  if partner is null or not exists (select 1 from public.partners p where p.id = partner) then
    raise no_data_found;
  end if;
  if referral is not null and not exists (
    select 1 from public.referrals r where r.id = referral and r.partner_id = partner
  ) then
    raise exception using errcode = 'P0001', message = 'RULE_FIELDS', detail = 'A indicação não é deste parceiro.';
  end if;
  if value_text is null then
    if referral is null then
      raise exception using errcode = 'P0001', message = 'RULE_FIELDS', detail = 'Informe o valor por vida (ex.: 1,50).';
    end if;
  else
    if value_text !~ '^\d{1,8}(\.\d{1,2})?$' then
      raise exception using errcode = 'P0001', message = 'RULE_FIELDS', detail = 'Informe o valor por vida (ex.: 1,50).';
    end if;
    rule_value := value_text::numeric(10, 2);
    if rule_value <= 0 then
      raise exception using errcode = 'P0001', message = 'RULE_FIELDS', detail = 'O valor por vida deve ser maior que zero.';
    end if;
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
  if referral is not null and rule_value is null and term is null then
    raise exception using errcode = 'P0001', message = 'RULE_FIELDS', detail = 'Informe o valor por vida ou o prazo da indicação.';
  end if;
  select * into latest from public.partner_rules r
  where r.partner_id = partner and r.referral_id is not distinct from referral
  order by r.valid_from desc
  limit 1;
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
    where r.partner_id = partner and r.referral_id is not distinct from referral
      and r.id <> target and r.valid_from >= rule_start
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'RULE_FIELDS',
      detail = 'A vigência mais recente precisa começar depois das anteriores.';
  end if;
  if exists (
    select 1 from public.partner_rules r
    where r.partner_id = partner and r.referral_id is not distinct from referral
      and r.valid_from = rule_start and r.id is distinct from target
  ) then
    raise exception using errcode = 'P0001', message = 'RULE_DUPLICATE';
  end if;
  if target is null then
    insert into public.partner_rules (partner_id, referral_id, value_per_life, valid_from, term_months, created_by)
    values (partner, referral, rule_value, rule_start, term, auth.uid())
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
    where r.partner_id = rule.partner_id and r.referral_id is not distinct from rule.referral_id
      and r.valid_from > rule.valid_from
  ) then
    raise exception using errcode = 'P0001', message = 'RULE_FIELDS', detail = 'Só a vigência mais recente pode ser removida.';
  end if;
  select max(c.competency) into locked from public.closings c where c.status = 'closed';
  if locked is not null and rule.valid_from <= locked then
    raise exception using errcode = 'P0001', message = 'RULE_LOCKED', detail = to_char(locked, 'MM/YYYY');
  end if;
  -- Remover a última vigência da indicação é permitido: ela volta à regra do parceiro.
  if rule.referral_id is null
    and not exists (
      select 1 from public.partner_rules r
      where r.partner_id = rule.partner_id and r.referral_id is null and r.id <> rule.id
    )
    and exists (select 1 from public.partners p where p.id = rule.partner_id and p.status = 'active') then
    raise exception using errcode = 'P0001', message = 'RULE_FIELDS', detail = 'Parceiro ativo precisa de pelo menos uma vigência.';
  end if;
  delete from public.partner_rules r where r.id = target;
end;
$$;

-- 7. Aprovação: igual à versão de 20261028000007, com o índice parcial no conflito.
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
  on conflict (partner_id, valid_from) where referral_id is null do update
  set value_per_life = excluded.value_per_life, term_months = excluded.term_months;
end;
$$;

-- 8. Registro da indicação: igual à versão de 20261110000016, mas valor e prazo informados pelo
--    diretor viram a primeira vigência própria da indicação, a partir do mês atual.
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
