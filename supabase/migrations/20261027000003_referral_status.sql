-- Fatia 3: mudança manual de situação da indicação (só diretor).
-- Automáticas (ativa / inadimplente) já acontecem em import_lives; "vale a primeira" já é o unique (cnpj).
-- Manuais permitidas:
--   em negociação  <- indicada, fechada, perdida
--   fechada        <- indicada, em negociação
--   perdida        <- indicada, em negociação, fechada
--   cancelada      <- ativa, inadimplente (encerra a recorrência a partir do mês do cancelamento)

create function public.set_referral_status(target uuid, new_status text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  current_status text;
  allowed boolean;
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  select r.status into current_status from public.referrals r where r.id = target for update;
  if not found then
    raise no_data_found;
  end if;
  allowed := case new_status
    when 'negotiating' then current_status in ('referred', 'signed', 'lost')
    when 'signed' then current_status in ('referred', 'negotiating')
    when 'lost' then current_status in ('referred', 'negotiating', 'signed')
    when 'cancelled' then current_status in ('active', 'delinquent')
    else false
  end;
  if not allowed then
    raise exception using
      errcode = 'P0001',
      message = 'REFERRAL_TRANSITION',
      detail = current_status || '>' || coalesce(new_status, '');
  end if;
  update public.referrals
  set status = new_status, status_changed_at = now()
  where id = target;
end;
$$;

revoke all on function public.set_referral_status(uuid, text) from public, anon;
grant execute on function public.set_referral_status(uuid, text) to authenticated;
