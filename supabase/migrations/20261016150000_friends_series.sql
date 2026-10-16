-- Amici, presenza online e inviti diretti; la sfida tra amici diventa al meglio di 3.
alter table public.profiles add column if not exists last_seen timestamptz;

create table if not exists public.friends (
  user_id uuid not null references auth.users (id) on delete cascade,
  friend_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);
create index if not exists friends_friend on public.friends (friend_id);
-- gestiti solo dalla Edge Function "game"
alter table public.friends enable row level security;

alter table public.pvp_matches add column if not exists invitee uuid references auth.users (id) on delete cascade;
create index if not exists pvp_matches_invitee on public.pvp_matches (invitee) where status = 'waiting';

-- le sfide del vecchio formato (partita singola) non sono più compatibili
update public.pvp_matches set status = 'cancelled' where status in ('waiting', 'playing');
