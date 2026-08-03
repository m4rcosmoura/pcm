create table if not exists public.meta (
  id text primary key,
  value text,
  mode text,
  updated_at text
);

create table if not exists public.listas (
  id text primary key,
  lists jsonb not null,
  updated_at text
);

create table if not exists public.ordens (
  id_os bigint primary key,
  status text not null default 'ABERTA',
  data_abertura text,
  data_inicio text,
  data_fim text,
  prioridade text,
  local text,
  equipamento text,
  tipo_manutencao text,
  executores jsonb not null default '[]'::jsonb,
  solicitante text,
  observacao_abertura text,
  causa_raiz text,
  componente text,
  observacao_fechamento text,
  o_que_feito text,
  o_que_falta text,
  os_origem bigint,
  pendente boolean not null default false
);

create or replace function public.next_os_number()
returns bigint
language plpgsql
security definer
as $$
declare
  v_next bigint;
begin
  insert into public.meta (id, value, updated_at, mode)
  values ('os_counter', '1', to_char(now(), 'DD/MM/YYYY HH24:MI'), 'online')
  on conflict (id) do nothing;

  update public.meta
     set value = ((coalesce(value, '0'))::bigint + 1)::text,
         updated_at = to_char(now(), 'DD/MM/YYYY HH24:MI')
   where id = 'os_counter'
   returning (value::bigint - 1) into v_next;

  return v_next;
end;
$$;

create or replace function public.sync_os_counter()
returns bigint
language plpgsql
security definer
as $$
declare
  v_next bigint;
begin
  select coalesce(max(id_os), 0) + 1 into v_next from public.ordens;

  insert into public.meta (id, value, updated_at, mode)
  values ('os_counter', v_next::text, to_char(now(), 'DD/MM/YYYY HH24:MI'), 'online')
  on conflict (id)
  do update set value = excluded.value,
                updated_at = excluded.updated_at,
                mode = excluded.mode;

  return v_next;
end;
$$;

alter table public.meta enable row level security;
alter table public.listas enable row level security;
alter table public.ordens enable row level security;

drop policy if exists "meta_public_all" on public.meta;
create policy "meta_public_all" on public.meta
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "listas_public_all" on public.listas;
create policy "listas_public_all" on public.listas
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "ordens_public_all" on public.ordens;
create policy "ordens_public_all" on public.ordens
for all
to anon, authenticated
using (true)
with check (true);

grant execute on function public.next_os_number() to anon, authenticated;
grant execute on function public.sync_os_counter() to anon, authenticated;
