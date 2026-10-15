-- Sfide tra amici (con codice). Le gestisce solo la Edge Function "game":
-- RLS attiva e nessuna regola, quindi i telefoni non possono leggere né scrivere (le card future restano segrete).
create table if not exists public.pvp_matches (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished', 'cancelled')),
  host uuid not null references auth.users (id) on delete cascade,
  guest uuid references auth.users (id) on delete cascade,
  data jsonb not null,
  rev integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- un codice è unico tra le sfide in attesa
create unique index if not exists pvp_matches_waiting_code on public.pvp_matches (code) where status = 'waiting';
create index if not exists pvp_matches_host on public.pvp_matches (host);
create index if not exists pvp_matches_guest on public.pvp_matches (guest);

alter table public.pvp_matches enable row level security;
