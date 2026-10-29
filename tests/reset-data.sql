-- Zera os DADOS do Supabase local (o esquema fica). Usado pelos testes de ponta a ponta.
-- Nunca rodar contra o projeto real.
truncate table
  public.ai_reviews,
  public.closing_items,
  public.closings,
  public.monthly_lives,
  public.import_rows,
  public.import_batches,
  public.referrals,
  public.companies,
  public.partner_rules,
  public.invitations,
  public.profiles,
  public.partners
restart identity cascade;
delete from auth.users;
