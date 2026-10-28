-- Fatia 2: convite por unidade (gerado pelo diretor), cadastro do parceiro pelo link,
-- aprovação com regra e meio de pagamento obrigatórios. Tabela nova: invitations (9 de 12).

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  partner_name text not null check (length(trim(partner_name)) between 1 and 160),
  kind text not null check (kind in ('unit', 'external')),
  expires_at timestamptz not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references auth.users (id),
  partner_id uuid references public.partners (id)
);
create index invitations_recent on public.invitations (created_at desc);

alter table public.invitations enable row level security;
create policy invitations_read on public.invitations for select to authenticated
using (public.is_director());

-- O segredo do link nunca é guardado: só o hash.
create function public.invitation_token_hash(secret text) returns text
language sql immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(secret, 'UTF8')), 'hex');
$$;

create function public.create_invitation(payload jsonb) returns uuid
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
    raise exception using errcode = 'P0001', message = 'INVITATION_FIELDS', detail = 'Informe o nome da unidade ou do indicador.';
  end if;
  if coalesce(payload->>'kind', '') not in ('unit', 'external') then
    raise exception using errcode = 'P0001', message = 'INVITATION_FIELDS', detail = 'Informe se é unidade ou indicador externo.';
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
    raise exception using errcode = 'P0001', message = 'INVITATION_FIELDS', detail = 'A validade precisa ser uma data futura.';
  end if;
  insert into public.invitations (token_hash, partner_name, kind, expires_at, created_by)
  values (public.invitation_token_hash(secret), trim(payload->>'partner_name'), payload->>'kind', valid_until, auth.uid())
  returning id into target;
  return target;
end;
$$;

-- Quem abre o link (ainda sem conta) vê só o nome do convite e se ele ainda vale.
create function public.invitation_preview(secret text) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'partner_name', i.partner_name,
    'kind', i.kind,
    'expires_at', i.expires_at,
    'status', case
      when i.used_at is not null then 'used'
      when i.expires_at <= now() then 'expired'
      else 'open'
    end
  )
  from public.invitations i
  where i.token_hash = public.invitation_token_hash(secret);
$$;

-- Cadastro pelo link: cria o parceiro (pendente) e o perfil do usuário logado; marca o convite como usado.
create function public.register_partner(secret text, payload jsonb) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  invitation public.invitations;
  existing public.profiles;
  method text := nullif(trim(payload->>'payment_method'), '');
  pix text := nullif(trim(payload->>'pix_key'), '');
  bank text := nullif(trim(payload->>'bank_name'), '');
  branch text := nullif(trim(payload->>'bank_branch'), '');
  account text := nullif(trim(payload->>'bank_account'), '');
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
    raise exception using errcode = 'P0001', message = 'REGISTRATION_FIELDS', detail = 'Informe o nome da unidade ou do indicador.';
  end if;
  if coalesce(length(trim(payload->>'contact_name')), 0) not between 1 and 160 then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_FIELDS', detail = 'Informe o nome do responsável.';
  end if;
  if region is not null and region !~ '^[A-Z]{2}$' then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_FIELDS', detail = 'Informe a UF com duas letras.';
  end if;
  if method is not null and method not in ('card', 'pix', 'bank_transfer') then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_FIELDS', detail = 'Meio de pagamento inválido.';
  end if;
  if method = 'pix' and pix is null then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_FIELDS', detail = 'Informe a chave PIX.';
  end if;
  if method = 'bank_transfer' and (bank is null or branch is null or account is null) then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_FIELDS', detail = 'Informe banco, agência e conta.';
  end if;
  if method is distinct from 'pix' then
    pix := null;
  end if;
  if method is distinct from 'bank_transfer' then
    bank := null;
    branch := null;
    account := null;
  end if;
  select lower(u.email) into account_email from auth.users u where u.id = auth.uid();
  insert into public.partners (
    name, kind, city, state, contact_name, contact_email, contact_phone,
    status, payment_method, pix_key, bank_name, bank_branch, bank_account, created_by
  )
  values (
    trim(payload->>'name'), invitation.kind, nullif(trim(payload->>'city'), ''), region,
    trim(payload->>'contact_name'), account_email, nullif(trim(payload->>'contact_phone'), ''),
    'pending', method, pix, bank, branch, account, auth.uid()
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

-- Aprovação: exige meio de pagamento com dados e a primeira regra (valor, vigência, prazo).
create function public.approve_partner(payload jsonb) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  target uuid := nullif(payload->>'partner_id', '')::uuid;
  current_status text;
  method text := nullif(trim(payload->>'payment_method'), '');
  pix text := nullif(trim(payload->>'pix_key'), '');
  bank text := nullif(trim(payload->>'bank_name'), '');
  branch text := nullif(trim(payload->>'bank_branch'), '');
  account text := nullif(trim(payload->>'bank_account'), '');
  rule_value numeric(10, 2);
  rule_start date;
  term integer := nullif(payload->>'term_months', '')::integer;
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
  if method is null or method not in ('card', 'pix', 'bank_transfer') then
    raise exception using errcode = 'P0001', message = 'APPROVAL_FIELDS', detail = 'Informe o meio de pagamento.';
  end if;
  if method = 'pix' and pix is null then
    raise exception using errcode = 'P0001', message = 'APPROVAL_FIELDS', detail = 'Informe a chave PIX.';
  end if;
  if method = 'bank_transfer' and (bank is null or branch is null or account is null) then
    raise exception using errcode = 'P0001', message = 'APPROVAL_FIELDS', detail = 'Informe banco, agência e conta.';
  end if;
  if method <> 'pix' then
    pix := null;
  end if;
  if method <> 'bank_transfer' then
    bank := null;
    branch := null;
    account := null;
  end if;
  if coalesce(payload->>'value_per_life', '') !~ '^\d{1,8}(\.\d{1,2})?$' then
    raise exception using errcode = 'P0001', message = 'APPROVAL_FIELDS', detail = 'Informe o valor por vida (ex.: 1.50).';
  end if;
  rule_value := (payload->>'value_per_life')::numeric(10, 2);
  if rule_value <= 0 then
    raise exception using errcode = 'P0001', message = 'APPROVAL_FIELDS', detail = 'O valor por vida deve ser maior que zero.';
  end if;
  if coalesce(payload->>'valid_from', '') !~ '^\d{4}-(0[1-9]|1[0-2])-01$' then
    raise exception using errcode = 'P0001', message = 'APPROVAL_FIELDS', detail = 'Informe o mês de início da vigência.';
  end if;
  rule_start := (payload->>'valid_from')::date;
  if term is not null and term not between 1 and 120 then
    raise exception using errcode = 'P0001', message = 'APPROVAL_FIELDS', detail = 'O prazo deve ficar entre 1 e 120 meses, ou em branco.';
  end if;
  update public.partners
  set
    payment_method = method,
    pix_key = pix,
    bank_name = bank,
    bank_branch = branch,
    bank_account = account,
    status = 'active',
    approved_by = auth.uid(),
    approved_at = now(),
    rejection_reason = null
  where id = target;
  insert into public.partner_rules (partner_id, value_per_life, valid_from, term_months, created_by)
  values (target, rule_value, rule_start, term, auth.uid())
  on conflict (partner_id, valid_from) do update
  set value_per_life = excluded.value_per_life, term_months = excluded.term_months;
end;
$$;

create function public.reject_partner(target uuid, reason text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  current_status text;
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  if coalesce(length(trim(reason)), 0) not between 1 and 1000 then
    raise exception using errcode = 'P0001', message = 'APPROVAL_FIELDS', detail = 'Informe o motivo da recusa (até 1000 caracteres).';
  end if;
  select p.status into current_status from public.partners p where p.id = target for update;
  if not found then
    raise no_data_found;
  end if;
  if current_status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'APPROVAL_FIELDS', detail = 'Só um cadastro pendente pode ser recusado.';
  end if;
  update public.partners
  set status = 'rejected', rejection_reason = trim(reason)
  where id = target;
end;
$$;

revoke all on table public.invitations from anon, authenticated;
grant select on table public.invitations to authenticated;

revoke all on function
  public.invitation_token_hash(text), public.create_invitation(jsonb), public.invitation_preview(text),
  public.register_partner(text, jsonb), public.approve_partner(jsonb), public.reject_partner(uuid, text)
from public, anon;

grant execute on function public.invitation_preview(text) to anon, authenticated;
grant execute on function
  public.create_invitation(jsonb), public.register_partner(text, jsonb),
  public.approve_partner(jsonb), public.reject_partner(uuid, text)
to authenticated;
