-- Fatia 5: painel do parceiro. Nenhuma tabela nova (11 de 12).
-- O parceiro confirma ou contesta o valor do seu fechamento fechado e vê "dados atualizados em".

create function public.respond_closing_item(target uuid, response text, note text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  own_partner uuid := public.my_partner_id();
  item public.closing_items;
begin
  if own_partner is null then
    raise insufficient_privilege;
  end if;
  if response is null or response not in ('confirmed', 'disputed') then
    raise exception using errcode = 'P0001', message = 'CLOSING_FIELDS', detail = 'Informe se confirma ou contesta o valor.';
  end if;
  if response = 'disputed' and coalesce(length(trim(note)), 0) not between 1 and 400 then
    raise exception using errcode = 'P0001', message = 'CLOSING_FIELDS', detail = 'Explique o que não confere (até 400 caracteres).';
  end if;
  select * into item from public.closing_items ci where ci.id = target for update;
  if not found or item.partner_id <> own_partner then
    raise no_data_found;
  end if;
  if not public.closing_is_closed(item.closing_id) then
    raise exception using errcode = 'P0001', message = 'CLOSING_FIELDS', detail = 'Este mês ainda não foi fechado.';
  end if;
  update public.closing_items
  set
    partner_response = response,
    partner_response_at = now(),
    partner_note = case when response = 'disputed' then trim(note) else nullif(trim(note), '') end
  where id = target;
end;
$$;

-- Carimbo "dados atualizados em" para quem não lê a tabela de importações (parceiro).
create function public.last_import_at() returns timestamptz
language sql stable security definer
set search_path = ''
as $$
  select max(b.created_at) from public.import_batches b;
$$;

revoke all on function public.respond_closing_item(uuid, text, text), public.last_import_at() from public, anon;
grant execute on function public.respond_closing_item(uuid, text, text), public.last_import_at() to authenticated;
