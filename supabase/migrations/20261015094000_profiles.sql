-- Profilo di gioco: una riga per utente con tutta la progressione (collezione, mazzo, crediti…).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  progress jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Progressione di gioco di ogni utente (F1 Card Battle).';

-- Sicurezza: ognuno legge e modifica solo il proprio profilo.
alter table public.profiles enable row level security;

create policy "profilo: lettura propria" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy "profilo: creazione propria" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

create policy "profilo: modifica propria" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- updated_at aggiornato automaticamente
create function public.set_updated_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
