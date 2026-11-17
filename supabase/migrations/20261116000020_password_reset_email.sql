-- 16/11/2026 — decisão 26: "Esqueci minha senha" envia o link de nova senha por e-mail, pela caixa
-- de suporte da Fortes Pay, como em qualquer site. O link é o mesmo de 20261103000010 (24 horas,
-- uso único, só o hash guardado); muda quem o gera: o servidor da aplicação, a pedido de quem
-- informou o e-mail, em vez do diretor. O link gerado pelo diretor continua como reserva.
--
-- A função só pode ser chamada com a chave de serviço (service_role), que fica no servidor: se o
-- navegador pudesse chamá-la, qualquer pessoa definiria o segredo do link de uma conta alheia.
-- Nenhuma tabela nova.

create function public.request_password_reset(account_email text, secret text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  target public.profiles;
  address text;
begin
  if coalesce(secret, '') !~ '^[A-Za-z0-9_-]{40,128}$' then
    raise exception using errcode = 'P0001', message = 'RESET_FIELDS', detail = 'Segredo do link inválido.';
  end if;
  select p.* into target
  from auth.users u
  join public.profiles p on p.user_id = u.id
  where lower(u.email) = lower(trim(coalesce(account_email, '')))
  for update of p;
  -- E-mail sem cadastro: nada a enviar (a tela responde igual nos dois casos).
  if not found then
    return null;
  end if;
  -- Um pedido a cada 2 minutos por conta: ninguém enche a caixa de outra pessoa de e-mails.
  if target.password_reset_expires_at > now() + interval '24 hours' - interval '2 minutes' then
    return null;
  end if;
  update public.profiles p
  set
    password_reset_hash = public.invitation_token_hash(secret),
    password_reset_expires_at = now() + interval '24 hours'
  where p.user_id = target.user_id;
  select u.email into address from auth.users u where u.id = target.user_id;
  return jsonb_build_object('display_name', target.display_name, 'email', address);
end;
$$;

-- O e-mail não saiu (falha do servidor de e-mail): o link recém-criado é desfeito, para a pessoa
-- poder pedir de novo na hora, sem esperar os 2 minutos.
create function public.cancel_password_reset(secret text) returns void
language sql security definer
set search_path = ''
as $$
  update public.profiles p
  set password_reset_hash = null, password_reset_expires_at = null
  where p.password_reset_hash = public.invitation_token_hash(secret);
$$;

revoke all on function
  public.request_password_reset(text, text),
  public.cancel_password_reset(text)
from public, anon, authenticated;

grant execute on function
  public.request_password_reset(text, text),
  public.cancel_password_reset(text)
to service_role;
