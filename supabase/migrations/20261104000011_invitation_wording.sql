-- Textos de 04/11/2026: as mensagens do convite usam "parceiro" (a interface já usa; "indicador"
-- era o termo antigo). Só a função muda; nenhuma tabela.

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
    raise exception using errcode = 'P0001', message = 'INVITATION_FIELDS', detail = 'Informe o nome da unidade ou do parceiro.';
  end if;
  if coalesce(payload->>'kind', '') not in ('unit', 'external') then
    raise exception using errcode = 'P0001', message = 'INVITATION_FIELDS', detail = 'Informe se é unidade ou parceiro externo.';
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
