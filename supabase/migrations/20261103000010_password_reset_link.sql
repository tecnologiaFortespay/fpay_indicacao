-- Nova senha pelo diretor (03/11/2026). O e-mail do Supabase não é confiável, então o diretor gera
-- um link de uso único na ficha do parceiro e o envia por conta própria. Como nos convites, só o
-- hash do segredo fica guardado.

alter table public.profiles
  add column password_reset_hash text unique,
  add column password_reset_expires_at timestamptz;

-- Gera (ou substitui) o link de nova senha de uma conta. Vale 24 horas e uma única vez.
create function public.create_password_reset(target uuid, secret text) returns timestamptz
language plpgsql security definer
set search_path = ''
as $$
declare
  expires timestamptz := now() + interval '24 hours';
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  if coalesce(secret, '') !~ '^[A-Za-z0-9_-]{40,128}$' then
    raise exception using errcode = 'P0001', message = 'RESET_FIELDS', detail = 'Segredo do link inválido.';
  end if;
  update public.profiles p
  set password_reset_hash = public.invitation_token_hash(secret), password_reset_expires_at = expires
  where p.user_id = target;
  if not found then
    raise exception using errcode = 'P0001', message = 'RESET_FIELDS', detail = 'Conta não encontrada.';
  end if;
  return expires;
end;
$$;

-- O que a página do link mostra antes de pedir a senha: nome, e-mail de acesso e validade.
create function public.password_reset_preview(secret text) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'display_name', p.display_name,
    'email', u.email,
    'expires_at', p.password_reset_expires_at
  )
  from public.profiles p
  join auth.users u on u.id = p.user_id
  where p.password_reset_hash = public.invitation_token_hash(secret)
    and p.password_reset_expires_at > now();
$$;

-- Troca a senha pelo link e o invalida. A senha vai no mesmo formato do Supabase Auth (bcrypt,
-- custo 10), então o login normal passa a aceitá-la.
create function public.reset_password_with_token(secret text, password text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  if coalesce(length(password), 0) not between 8 and 128 then
    raise exception using errcode = 'P0001', message = 'RESET_FIELDS', detail = 'A senha precisa ter de 8 a 128 caracteres.';
  end if;
  update public.profiles p
  set password_reset_hash = null, password_reset_expires_at = null
  where p.password_reset_hash = public.invitation_token_hash(secret)
    and p.password_reset_expires_at > now()
  returning p.user_id into target;
  if target is null then
    raise exception using errcode = 'P0001', message = 'RESET_INVALID';
  end if;
  update auth.users u
  set encrypted_password = extensions.crypt(password, extensions.gen_salt('bf', 10)), updated_at = now()
  where u.id = target;
end;
$$;

revoke all on function
  public.create_password_reset(uuid, text),
  public.password_reset_preview(text),
  public.reset_password_with_token(text, text)
from public, anon, authenticated;

grant execute on function public.create_password_reset(uuid, text) to authenticated;
grant execute on function public.password_reset_preview(text), public.reset_password_with_token(text, text)
to anon, authenticated;
