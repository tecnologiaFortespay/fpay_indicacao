-- Conferência do envio antes de gravar (09/11/2026). A função roda a importação de verdade
-- (import_lives) dentro de um bloco que é desfeito no fim e devolve o que mudaria: vidas,
-- situação e valor de cada indicação, linhas ignoradas e empresas fora da plataforma. Nada fica
-- gravado (nem o lote, nem as vidas, nem as situações) e as regras são as da própria
-- import_lives, sem cópia. Nenhuma tabela nova.

create function public.preview_import(batch jsonb, rows jsonb) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  month date;
  before jsonb;
  outcome jsonb;
  target uuid;
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  if coalesce(batch->>'competency', '') !~ '^\d{4}-(0[1-9]|1[0-2])-01$' then
    raise exception using errcode = 'P0001', message = 'IMPORT_FIELDS', detail = 'Mês de referência inválido.';
  end if;
  month := (batch->>'competency')::date;

  -- Antes do envio: situação, vidas e valor de cada indicação no mês.
  select coalesce(
    jsonb_object_agg(
      r.id::text,
      jsonb_build_object(
        'status', r.status,
        'lives', coalesce(m.lives, 0),
        'amount', coalesce(l.amount, 0),
        'counts', l.referral_id is not null
      )
    ),
    '{}'::jsonb
  )
  into before
  from public.referrals r
  left join public.monthly_lives m on m.cnpj = r.cnpj and m.competency = month
  left join public.referral_month_lives l on l.referral_id = r.id and l.competency = month;

  begin
    target := public.import_lives(batch, rows);

    select jsonb_build_object(
      'closed', public.is_closed_competency(month),
      'rows_imported', b.rows_imported,
      'rows_skipped', b.rows_skipped,
      'rows_ignored', b.rows_ignored,
      'issues', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'line_number', i.line_number,
            'outcome', i.outcome,
            'reason', i.reason,
            'raw_line', left(i.raw_line, 300)
          )
          order by i.line_number
        )
        from public.import_rows i
        where i.batch_id = target
      ), '[]'::jsonb),
      -- Indicações que o envio toca ou que o diretor precisa ver: as que estão no arquivo, as que
      -- tinham vidas no mês, as que rendem (ativa ou inadimplente) e as que mudam de situação.
      'referrals', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'cnpj', r.cnpj,
            'company_name', r.company_name,
            'partner_name', p.name,
            'status_before', before->(r.id::text)->>'status',
            'status_after', r.status,
            'lives_before', coalesce((before->(r.id::text)->>'lives')::integer, 0),
            'lives_after', coalesce(m.lives, 0),
            'in_file', coalesce(m.batch_id = target, false),
            -- Conta no mês = aparece no cálculo (fora: perdida, cancelada, fora do prazo).
            'counts_before', coalesce((before->(r.id::text)->>'counts')::boolean, false),
            'counts_after', l.referral_id is not null,
            'value_per_life', l.value_per_life,
            'amount_before', coalesce((before->(r.id::text)->>'amount')::numeric, 0),
            'amount_after', coalesce(l.amount, 0)
          )
          order by p.name, r.company_name
        )
        from public.referrals r
        join public.partners p on p.id = r.partner_id
        left join public.monthly_lives m on m.cnpj = r.cnpj and m.competency = month
        left join public.referral_month_lives l on l.referral_id = r.id and l.competency = month
        where m.batch_id = target
          or coalesce((before->(r.id::text)->>'lives')::integer, 0) > 0
          or r.status in ('active', 'delinquent')
          or r.status::text is distinct from before->(r.id::text)->>'status'
      ), '[]'::jsonb)
    )
    into outcome
    from public.import_batches b
    where b.id = target;

    -- Desfaz tudo o que import_lives gravou neste bloco; o resultado já está em "outcome".
    raise exception using errcode = 'PV001', message = 'PREVIEW_ROLLBACK';
  exception
    when sqlstate 'PV001' then
      null;
  end;

  return outcome;
end;
$$;

revoke all on function public.preview_import(jsonb, jsonb) from public, anon;
grant execute on function public.preview_import(jsonb, jsonb) to authenticated;
