-- Controle de CQ · Medicina Nuclear — estrutura do banco (Supabase / Postgres)
-- Rode este arquivo uma vez no SQL Editor do Supabase e depois o seed.sql.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Pessoas que podem usar o sistema. Só esses e-mails conseguem criar conta.
create table if not exists public.autorizados (
  email text primary key check (email = lower(email)),
  nome text,
  admin boolean not null default false,
  criado_em timestamptz not null default now()
);

create table if not exists public.equipamentos (
  id text primary key,
  nome text not null,
  tipo text,
  modelo text,
  icone text,
  ordem int not null default 0,
  aviso_meses smallint not null default 0 -- meses de antecedência para avisar (ex.: calibração)
);

create table if not exists public.testes (
  id text primary key,
  equipamento_id text not null references public.equipamentos(id),
  nome text not null,
  per_n int not null check (per_n > 0),
  per_u text not null check (per_u in ('d','w','m')),
  anexo text,
  tol text,
  nota text,
  ativo boolean not null default true,
  ordem int not null default 0,
  aviso_meses smallint not null default 0 -- meses de antecedência para avisar (ex.: calibração)
);

create table if not exists public.registros (
  id uuid primary key default gen_random_uuid(),
  teste_id text not null references public.testes(id),
  data date not null,
  tipo text not null default 'execucao' check (tipo in ('execucao','relatorio','concluido','justificativa')),
  ref_id uuid references public.registros(id), -- execução a que a etapa (relatório/concluído) pertence
  resultado text check (resultado in ('conforme','nao_conforme')),
  observacao text,
  justificativa text,
  atrasado boolean not null default false,
  usuario_id uuid references auth.users(id),
  usuario_nome text,
  created_at timestamptz not null default now(),
  constraint justificativa_quando_atrasado check (not atrasado or length(coalesce(justificativa,'')) >= 10),
  constraint etapa_tem_execucao check (tipo not in ('relatorio','concluido') or ref_id is not null),
  constraint justificativa_tem_texto check (tipo <> 'justificativa' or length(coalesce(justificativa,'')) >= 10)
);
create index if not exists registros_teste_data on public.registros (teste_id, data desc);
-- cada etapa só pode ser marcada uma vez por execução
create unique index if not exists registros_etapa_unica on public.registros (ref_id, tipo) where ref_id is not null;

create table if not exists public.push_subs (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_agent text,
  criado_em timestamptz not null default now()
);

create table if not exists public.avisos_enviados (
  chave text primary key,
  enviado_em timestamptz not null default now()
);

-- ---------- funções auxiliares ----------
create or replace function public.eh_autorizado() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from autorizados where email = lower(auth.jwt() ->> 'email'));
$$;
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from autorizados where email = lower(auth.jwt() ->> 'email') and admin);
$$;

-- Bloqueia a criação de conta para e-mails não autorizados.
create or replace function public.bloquear_nao_autorizados() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from autorizados where email = lower(new.email)) then
    raise exception 'E-mail não autorizado';
  end if;
  return new;
end $$;
drop trigger if exists antes_criar_usuario on auth.users;
create trigger antes_criar_usuario before insert on auth.users
  for each row execute function public.bloquear_nao_autorizados();

-- Grava sempre o usuário logado no registro (não dá para registrar em nome de outra pessoa).
create or replace function public.carimbar_registro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.usuario_id := auth.uid();
  new.usuario_nome := coalesce((select nome from autorizados where email = lower(auth.jwt() ->> 'email')), auth.jwt() ->> 'email');
  new.created_at := now();
  return new;
end $$;
drop trigger if exists carimbo on public.registros;
create trigger carimbo before insert on public.registros
  for each row when (auth.uid() is not null) execute function public.carimbar_registro();

-- ---------- segurança por linha ----------
alter table public.autorizados enable row level security;
alter table public.equipamentos enable row level security;
alter table public.testes enable row level security;
alter table public.registros enable row level security;
alter table public.push_subs enable row level security;
alter table public.avisos_enviados enable row level security;

drop policy if exists "ler autorizados" on public.autorizados;
create policy "ler autorizados" on public.autorizados for select to authenticated using (public.eh_autorizado());
drop policy if exists "admin gerencia autorizados" on public.autorizados;
create policy "admin gerencia autorizados" on public.autorizados for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists "ler equipamentos" on public.equipamentos;
create policy "ler equipamentos" on public.equipamentos for select to authenticated using (public.eh_autorizado());
drop policy if exists "admin equipamentos" on public.equipamentos;
create policy "admin equipamentos" on public.equipamentos for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists "ler testes" on public.testes;
create policy "ler testes" on public.testes for select to authenticated using (public.eh_autorizado());
drop policy if exists "admin testes" on public.testes;
create policy "admin testes" on public.testes for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- Registros: todos da equipe leem e incluem; ninguém edita nem apaga pelo site (trilha de auditoria).
drop policy if exists "ler registros" on public.registros;
create policy "ler registros" on public.registros for select to authenticated using (public.eh_autorizado());
drop policy if exists "incluir registros" on public.registros;
create policy "incluir registros" on public.registros for insert to authenticated with check (public.eh_autorizado());

drop policy if exists "minhas inscricoes push" on public.push_subs;
create policy "minhas inscricoes push" on public.push_subs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.eh_autorizado());

-- Atualização em tempo real da lista de registros
do $$ begin
  alter publication supabase_realtime add table public.registros;
exception when others then null; end $$;
