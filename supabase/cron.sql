-- Avisos diários às 8h (Brasília = 11h UTC). O segredo fica na tabela config_privada, criado no próprio banco.
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.config_privada (chave text primary key, valor text not null);
alter table public.config_privada enable row level security; -- sem políticas: só o servidor lê
revoke all on public.config_privada from anon, authenticated;
insert into public.config_privada (chave, valor) values ('cron_secret', encode(extensions.gen_random_bytes(24), 'hex')) on conflict (chave) do nothing;

-- chave pública do push, lida pelo site (o par é criado pela função notificar na primeira execução)
create or replace function public.chave_push() returns text
language sql stable security definer set search_path = public as $$
  select valor from config_privada where chave = 'vapid_public' and public.eh_autorizado();
$$;
revoke execute on function public.chave_push() from anon, public;
grant execute on function public.chave_push() to authenticated;

-- Troque <PROJETO> pelo id do projeto Supabase.
create or replace function public.chamar_avisos() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://<PROJETO>.supabase.co/functions/v1/notificar',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select valor from config_privada where chave = 'cron_secret')),
    body := '{}'::jsonb
  );
end $$;
revoke execute on function public.chamar_avisos() from anon, authenticated, public;
select cron.schedule('avisos-cq', '0 11 * * *', $$ select public.chamar_avisos(); $$);
