-- Accesso da più dispositivi: username (il nickname minuscolo, con _ al posto degli spazi) e codice di recupero
-- (la password, uguale per sempre). Ogni dispositivo ha il suo utente anonimo; con l'accesso viene collegato
-- all'account di gioco, che resta dov'è (le carte non si spostano).
alter table public.profiles
  add column if not exists username text generated always as (lower(regexp_replace(btrim(nickname), '\s+', '_', 'g'))) stored;
create unique index if not exists profiles_username_key on public.profiles (username) where moved_to is null and username is not null;

create table if not exists public.account_links (
  user_id uuid primary key references auth.users (id) on delete cascade, -- il dispositivo
  account_id uuid not null references auth.users (id) on delete cascade, -- l'account di gioco
  created_at timestamptz not null default now()
);
create index if not exists account_links_account on public.account_links (account_id);
-- solo la funzione del server (service role) legge e scrive i collegamenti
alter table public.account_links enable row level security;
