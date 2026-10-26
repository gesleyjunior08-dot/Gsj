-- Painel comercial da GSJ
-- Rode este arquivo UMA vez no Supabase: SQL Editor -> New query -> colar tudo -> Run.
-- Cria a tabela de vendas/oportunidades usada pela página painel.html.

create table if not exists public.gsj_vendas (
  id            bigint generated always as identity primary key,
  data          date not null default current_date,      -- data do orçamento/contato
  cliente       text not null,
  tipo_movel    text,                                    -- cozinha, closet, quarto, painel...
  valor         numeric(12,2) not null default 0,        -- valor orçado/contratado (R$)
  custo         numeric(12,2),                           -- material + mão de obra + frete (R$), pra margem
  origem        text not null default 'Indicação',       -- Arquiteto, Instagram, Indicação, Cliente antigo, Outro
  arquiteto     text,                                    -- nome do arquiteto/designer parceiro, se houver
  status        text not null default 'Em aberto'
                check (status in ('Em aberto', 'Fechado', 'Perdido')),
  data_fechamento date,                                  -- quando fechou (conta no faturamento desse mês)
  orcamento_id  bigint,                                  -- id em gsj_orcamentos, quando veio de um orçamento salvo
  obs           text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists gsj_vendas_data_idx   on public.gsj_vendas (data desc);
create index if not exists gsj_vendas_status_idx on public.gsj_vendas (status);

-- mantém updated_at em dia
create or replace function public.gsj_vendas_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists gsj_vendas_touch on public.gsj_vendas;
create trigger gsj_vendas_touch before update on public.gsj_vendas
  for each row execute function public.gsj_vendas_touch();

-- Segurança: só contas APROVADAS da equipe veem e mexem nos dados
-- (mesma regra do resto do app; clientes da Área do cliente não têm acesso).
alter table public.gsj_vendas enable row level security;

drop policy if exists "equipe aprovada le vendas"    on public.gsj_vendas;
drop policy if exists "equipe aprovada grava vendas" on public.gsj_vendas;
drop policy if exists "equipe aprovada edita vendas" on public.gsj_vendas;
drop policy if exists "equipe aprovada apaga vendas" on public.gsj_vendas;

create policy "equipe aprovada le vendas" on public.gsj_vendas for select to authenticated
  using (exists (select 1 from public.gsj_profiles p where p.id = (select auth.uid()) and p.approved));
create policy "equipe aprovada grava vendas" on public.gsj_vendas for insert to authenticated
  with check (exists (select 1 from public.gsj_profiles p where p.id = (select auth.uid()) and p.approved));
create policy "equipe aprovada edita vendas" on public.gsj_vendas for update to authenticated
  using (exists (select 1 from public.gsj_profiles p where p.id = (select auth.uid()) and p.approved))
  with check (exists (select 1 from public.gsj_profiles p where p.id = (select auth.uid()) and p.approved));
create policy "equipe aprovada apaga vendas" on public.gsj_vendas for delete to authenticated
  using (exists (select 1 from public.gsj_profiles p where p.id = (select auth.uid()) and p.approved));
