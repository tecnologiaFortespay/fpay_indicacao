-- 16/11/2026 — decisão 27: o diretor escolhe, por empresa, qual vigência do parceiro vale para ela.
-- Apontamento do time: empresa nova que paga no começo de outubro às vezes deve seguir a vigência
-- de setembro. A regra do parceiro é escolhida pelo mês de referência da indicação (o mais antigo
-- entre o da indicação e o do primeiro pagamento, decisões 23 e 24); para os casos pontuais, o
-- diretor passa a fixar esse mês na tela do envio da planilha ou na ficha da indicação.
-- (a) referrals.rule_month guarda o mês da vigência escolhida; nulo = escolha automática.
-- (b) O cálculo é o de 20261114000018, trocando só o mês de referência quando há escolha.
-- (c) Indicação que já teve vidas num mês fechado não muda de regra por aqui (o fechamento guardou
--     os valores): para mudar daqui em diante, usa-se a vigência própria da indicação.
-- Nenhuma tabela nova.

alter table public.referrals
  add column rule_month date check (rule_month is null or extract(day from rule_month) = 1);

comment on column public.referrals.rule_month is
  'Mês da vigência do parceiro escolhida pelo diretor para esta indicação; nulo = automática (o mais antigo entre o mês da indicação e o do primeiro pagamento).';

create or replace view public.referral_month_lives
with (security_invoker = true)
as
select
  r.id as referral_id,
  r.partner_id,
  r.cnpj,
  m.competency,
  m.lives,
  coalesce(own.value_per_life, rule.value_per_life) as value_per_life,
  coalesce(own.term_months, rule.term_months) as term_months,
  (m.lives * coalesce(own.value_per_life, rule.value_per_life, 0))::numeric(12, 2) as amount
from public.referrals r
join public.monthly_lives m on m.cnpj = r.cnpj
-- Mês de referência: o escolhido pelo diretor; sem escolha, o da indicação ou, se a empresa já
-- pagava antes, o do primeiro pagamento.
cross join lateral (
  select coalesce(
    r.rule_month,
    least(
      date_trunc('month', r.created_at at time zone 'America/Fortaleza')::date,
      r.first_cashin
    )
  ) as month
) referred
-- Vigência própria da indicação em vigor no mês (manda sobre a do parceiro).
left join lateral (
  select pr.value_per_life, pr.term_months
  from public.partner_rules pr
  where pr.referral_id = r.id and pr.valid_from <= m.competency
  order by pr.valid_from desc
  limit 1
) own on true
-- Regra do parceiro: entre as que já valem no mês, a mais recente que já existia no mês de
-- referência; se nenhuma existia ainda, a primeira que passou a valer (decisões 23, 24 e 27).
left join lateral (
  select pr.value_per_life, pr.term_months
  from public.partner_rules pr
  where pr.partner_id = r.partner_id and pr.referral_id is null and pr.valid_from <= m.competency
  order by
    (pr.valid_from <= referred.month) desc,
    case when pr.valid_from <= referred.month then pr.valid_from end desc,
    pr.valid_from asc
  limit 1
) rule on true
where (
    r.status not in ('lost', 'cancelled')
    or (
      r.status = 'cancelled'
      and m.competency < date_trunc('month', r.status_changed_at at time zone 'America/Fortaleza')::date
    )
  )
  and (
    coalesce(own.term_months, rule.term_months) is null
    or r.activated_competency is null
    or m.competency < (r.activated_competency + make_interval(months => coalesce(own.term_months, rule.term_months)))::date
  );

-- Indicações que já tiveram vidas num mês fechado, com o último desses meses. Para elas a escolha
-- da vigência fica travada (item c): a tela usa a lista para não oferecer a troca, e a função
-- abaixo confere de novo. Lida sob a RLS de quem pede.
create function public.referral_rule_locks() returns table (referral_id uuid, locked date)
language sql stable
set search_path = ''
as $$
  select r.id, max(c.competency)
  from public.referrals r
  join public.monthly_lives m on m.cnpj = r.cnpj and m.lives > 0
  join public.closings c on c.competency = m.competency and c.status = 'closed'
  group by r.id;
$$;

-- Fixa (ou, sem month, devolve à escolha automática) a vigência do parceiro que vale para a
-- indicação. O mês precisa ser o de uma vigência cadastrada do parceiro.
create function public.set_referral_rule_month(target uuid, month date default null) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  referral public.referrals;
  locked date;
begin
  if not public.is_director() then
    raise insufficient_privilege;
  end if;
  select * into referral from public.referrals r where r.id = target for update;
  if not found then
    raise no_data_found;
  end if;
  if month is not null and not exists (
    select 1 from public.partner_rules pr
    where pr.partner_id = referral.partner_id and pr.referral_id is null and pr.valid_from = month
  ) then
    raise exception using errcode = 'P0001', message = 'RULE_FIELDS', detail = 'Escolha uma das vigências cadastradas do parceiro.';
  end if;
  select l.locked into locked from public.referral_rule_locks() l where l.referral_id = target;
  if locked is not null then
    raise exception using errcode = 'P0001', message = 'RULE_CHOICE_LOCKED', detail = to_char(locked, 'MM/YYYY');
  end if;
  update public.referrals r set rule_month = month where r.id = target;
end;
$$;

revoke all on function
  public.referral_rule_locks(),
  public.set_referral_rule_month(uuid, date)
from public, anon;
grant execute on function
  public.referral_rule_locks(),
  public.set_referral_rule_month(uuid, date)
to authenticated;
