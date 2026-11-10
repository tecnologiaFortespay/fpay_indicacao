-- 09/11/2026 — Equipe e Minha conta (decisão 19, docs/decisoes.md). O diretor convida outros
-- diretores pelo mesmo link do convite de parceiro (um tipo a mais em invitations), gera link de
-- nova senha para outro diretor (create_password_reset já aceitava qualquer conta; faltava a tela)
-- e toda pessoa conectada troca a própria senha informando a atual. Nenhuma tabela nova.

-- Convite de diretor: partner_name guarda o nome de quem é convidado; partner_id fica nulo.
alter table public.invitations drop constraint invitations_kind_check;
alter table public.invitations
  add constraint invitations_kind_check check (kind in ('unit', 'external', 'director'));

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
  if coalesce(payload->>'kind', '') not in ('unit', 'external', 'director') then
    raise exception using errcode = 'P0001', message = 'INVITATION_FIELDS', detail = 'Informe se é unidade, parceiro externo ou diretor.';
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

-- Igual à versão de 20261028000007, mais a regra: convite de diretor não cadastra parceiro.
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
  if not found
    or invitation.kind = 'director'
    or invitation.used_at is not null
    or invitation.expires_at <= now() then
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

-- Cadastro pelo convite de diretor: cria o perfil de diretor da conta conectada e usa o convite.
-- Entra direto (o convite já é a aprovação). Não há parceiro nem aprovação envolvidos.
create function public.register_director(secret text, payload jsonb) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  invitation public.invitations;
  existing public.profiles;
begin
  if auth.uid() is null then
    raise insufficient_privilege;
  end if;
  select * into existing from public.profiles p where p.user_id = auth.uid();
  if found then
    -- Reenviar o mesmo convite que esta conta já usou não é erro.
    if existing.role = 'director' and exists (
      select 1 from public.invitations i
      where i.token_hash = public.invitation_token_hash(secret) and i.used_by = auth.uid()
    ) then
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'ALREADY_REGISTERED';
  end if;
  select * into invitation from public.invitations i
  where i.token_hash = public.invitation_token_hash(secret)
  for update;
  if not found
    or invitation.kind <> 'director'
    or invitation.used_at is not null
    or invitation.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'INVITATION_INVALID';
  end if;
  if coalesce(length(trim(payload->>'name')), 0) not between 1 and 120 then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_FIELDS', detail = 'Informe o seu nome.';
  end if;
  insert into public.profiles (user_id, role, partner_id, display_name)
  values (auth.uid(), 'director', null, trim(payload->>'name'));
  update public.invitations
  set used_at = now(), used_by = auth.uid()
  where id = invitation.id;
end;
$$;

-- Lista da Equipe: diretores com o e-mail de acesso (que fica em auth.users, fora da RLS).
create function public.list_directors()
returns table (user_id uuid, display_name text, email text, created_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  return query
    select p.user_id, p.display_name, u.email::text, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.user_id
    where p.role = 'director'
    order by p.created_at, p.display_name;
end;
$$;

-- Minha conta: troca a própria senha conferindo a atual. Mesmo formato do Supabase Auth
-- (bcrypt, custo 10), como em reset_password_with_token; a sessão atual continua válida.
create function public.change_my_password(current_password text, new_password text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  stored text;
begin
  if auth.uid() is null then
    raise insufficient_privilege;
  end if;
  if coalesce(length(new_password), 0) not between 8 and 128 then
    raise exception using errcode = 'P0001', message = 'PASSWORD_FIELDS', detail = 'A senha nova precisa ter de 8 a 128 caracteres.';
  end if;
  select u.encrypted_password into stored from auth.users u where u.id = auth.uid();
  if stored is null or extensions.crypt(coalesce(current_password, ''), stored) <> stored then
    raise exception using errcode = 'P0001', message = 'PASSWORD_FIELDS', detail = 'A senha atual não confere.';
  end if;
  if new_password = current_password then
    raise exception using errcode = 'P0001', message = 'PASSWORD_FIELDS', detail = 'A senha nova precisa ser diferente da atual.';
  end if;
  update auth.users u
  set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf', 10)), updated_at = now()
  where u.id = auth.uid();
end;
$$;

revoke all on function
  public.register_director(text, jsonb),
  public.list_directors(),
  public.change_my_password(text, text)
from public, anon, authenticated;

grant execute on function
  public.register_director(text, jsonb),
  public.list_directors(),
  public.change_my_password(text, text)
to authenticated;
