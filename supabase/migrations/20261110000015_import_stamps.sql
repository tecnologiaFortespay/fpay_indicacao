-- 10/11/2026 — item 5 da reunião de 09/11/2026 (decisão 21): "atualizado em" por mês e os últimos
-- envios da planilha para o parceiro, que não lê import_batches (RLS só do diretor). A data que o
-- parceiro via era a do último envio de qualquer mês. Nenhuma tabela nova.

-- Com o mês: o último envio que cobriu aquele mês (nulo = ainda não houve envio dele).
-- Sem argumento: o último envio de qualquer mês, como antes (as chamadas existentes continuam).
drop function public.last_import_at();

create function public.last_import_at(month date default null) returns timestamptz
language sql stable security definer
set search_path = ''
as $$
  select max(b.created_at)
  from public.import_batches b
  where month is null or month = any (b.competencies);
$$;

-- Últimos envios, só data e meses cobertos: sem nome de arquivo nem quem enviou. Para quem tem
-- perfil (diretor ou parceiro). "Parcial" ou "mês completo" é decidido na tela pela data.
create function public.recent_imports(how_many integer default 5)
returns table (created_at timestamptz, competencies date[])
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if public.current_role_name() is null then
    raise insufficient_privilege;
  end if;
  return query
    select b.created_at, b.competencies
    from public.import_batches b
    order by b.created_at desc
    limit greatest(1, least(coalesce(how_many, 5), 20));
end;
$$;

revoke all on function public.last_import_at(date), public.recent_imports(integer)
from public, anon, authenticated;

grant execute on function public.last_import_at(date), public.recent_imports(integer)
to authenticated;
