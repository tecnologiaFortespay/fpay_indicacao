-- 16/11/2026 — decisão 25: o parceiro cria a própria conta no site, sem convite; o diretor só
-- confirma. Apontamento do time: gerar um link por parceiro era um passo a mais para o diretor.
-- (a) register_partner deixa de exigir o segredo do convite: a conta conectada, ainda sem perfil,
--     cadastra o parceiro, que nasce pendente.
-- (b) O tipo (unidade ou parceiro externo) vinha do convite; passa a ser escolhido pelo diretor na
--     aprovação. Enquanto o cadastro aguarda, partners.kind fica nulo.
-- (c) Convite só existe para diretor (Equipe, decisão 19). Os de parceiro ainda abertos deixam de
--     valer; os já usados ficam como histórico.
-- Nenhuma tabela nova.

alter table public.partners alter column kind drop not null;
alter table public.partners
  add constraint partners_active_has_kind check (status <> 'active' or kind is not null);

comment on column public.partners.kind is
  'Unidade ou parceiro externo, escolhido pelo diretor ao aprovar; nulo enquanto o cadastro aguarda.';

update public.invitations
set expires_at = now()
where kind <> 'director' and used_at is null and expires_at > now();

-- Cadastro aberto: cria o parceiro pendente e o perfil da conta conectada. Cidade, UF e telefone
-- são obrigatórios (pedido do Denis, 14/11/2026). O e-mail de contato é o da conta.
drop function public.register_partner(text, jsonb);

create function public.register_partner(payload jsonb) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  existing public.profiles;
  region text := upper(trim(coalesce(payload->>'state', '')));
  account_email text;
  target uuid;
begin
  if auth.uid() is null then
    raise insufficient_privilege;
  end if;
  select * into existing from public.profiles p where p.user_id = auth.uid();
  if found then
    -- Segundo envio do mesmo formulário: devolve o cadastro que já existe.
    if existing.role = 'partner' then
      return existing.partner_id;
    end if;
    raise exception using errcode = 'P0001', message = 'ALREADY_REGISTERED';
  end if;
  if coalesce(length(trim(payload->>'name')), 0) not between 1 and 160 then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_FIELDS', detail = 'Informe o nome da unidade ou do parceiro.';
  end if;
  if coalesce(length(trim(payload->>'city')), 0) not between 1 and 120 then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_FIELDS', detail = 'Informe a cidade.';
  end if;
  if region !~ '^[A-Z]{2}$' then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_FIELDS', detail = 'Informe a UF com duas letras.';
  end if;
  if coalesce(length(trim(payload->>'contact_name')), 0) not between 1 and 160 then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_FIELDS', detail = 'Informe o nome do responsável.';
  end if;
  if coalesce(length(trim(payload->>'contact_phone')), 0) not between 1 and 40 then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_FIELDS', detail = 'Informe o telefone.';
  end if;
  select lower(u.email) into account_email from auth.users u where u.id = auth.uid();
  insert into public.partners (
    name, city, state, contact_name, contact_email, contact_phone, status, created_by
  )
  values (
    trim(payload->>'name'), trim(payload->>'city'), region, trim(payload->>'contact_name'),
    account_email, trim(payload->>'contact_phone'), 'pending', auth.uid()
  )
  returning id into target;
  insert into public.profiles (user_id, role, partner_id, display_name)
  values (auth.uid(), 'partner', target, left(trim(payload->>'contact_name'), 120));
  return target;
end;
$$;

revoke all on function public.register_partner(jsonb) from public, anon;
grant execute on function public.register_partner(jsonb) to authenticated;

-- Aprovação: igual à versão de 20261110000017, mais o tipo do parceiro, que o diretor escolhe aqui.
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
  if coalesce(payload->>'kind', '') not in ('unit', 'external') then
    raise exception using errcode = 'P0001', message = 'APPROVAL_FIELDS', detail = 'Informe se é unidade ou parceiro externo.';
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
  set
    status = 'active',
    kind = payload->>'kind',
    approved_by = auth.uid(),
    approved_at = now(),
    rejection_reason = null
  where id = target;
  insert into public.partner_rules (partner_id, value_per_life, valid_from, term_months, created_by)
  values (target, rule_value, rule_start, term, auth.uid())
  on conflict (partner_id, valid_from) where referral_id is null do update
  set value_per_life = excluded.value_per_life, term_months = excluded.term_months;
end;
$$;

-- Convite: igual à versão de 20261109000014, só para diretor.
create or replace function public.create_invitation(payload jsonb) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  secret text := coalesce(payload->>'secret', '');
  valid_until timestamptz;
  target uuid;
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  if coalesce(length(trim(payload->>'partner_name')), 0) not between 1 and 160 then
    raise exception using errcode = 'P0001', message = 'INVITATION_FIELDS', detail = 'Informe o nome de quem será convidado.';
  end if;
  if coalesce(payload->>'kind', '') <> 'director' then
    raise exception using errcode = 'P0001', message = 'INVITATION_FIELDS', detail = 'Convite é só para diretor: o parceiro cria a própria conta em Criar conta.';
  end if;
  if length(secret) < 32 then
    raise exception using errcode = 'P0001', message = 'INVITATION_FIELDS', detail = 'Convite inválido.';
  end if;
  begin
    valid_until := (payload->>'valid_until')::timestamptz;
  exception when others then
    raise exception using errcode = 'P0001', message = 'INVITATION_FIELDS', detail = 'Informe a validade do convite.';
  end;
  if valid_until is null or valid_until <= now() then
    raise exception using errcode = 'P0001', message = 'INVITATION_FIELDS', detail = 'A validade do convite precisa ser hoje ou uma data futura.';
  end if;
  insert into public.invitations (token_hash, partner_name, kind, expires_at, created_by)
  values (public.invitation_token_hash(secret), trim(payload->>'partner_name'), payload->>'kind', valid_until, auth.uid())
  returning id into target;
  return target;
end;
$$;

-- Confirmação do e-mail pelo convite ("Confirm email" ligado): igual à de 20261029000008, só com
-- convite de diretor, o único que ainda cadastra alguém.
create or replace function public.confirm_invited_signup(secret text, account uuid) returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.invitations i
    where i.token_hash = public.invitation_token_hash(secret)
      and i.kind = 'director'
      and i.used_at is null
      and i.expires_at > now()
  ) then
    return false;
  end if;
  update auth.users u
  set email_confirmed_at = now()
  where u.id = account
    and u.email_confirmed_at is null
    and u.created_at > now() - interval '15 minutes'
    and not exists (select 1 from public.profiles p where p.user_id = u.id);
  return found;
end;
$$;
