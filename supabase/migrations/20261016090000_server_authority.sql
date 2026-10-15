-- Il server diventa l'unico a modificare la progressione: ogni modifica passa dalla Edge Function "game".
-- version: 0 = profilo salvato dalla vecchia app, >= 1 = gestito dal server (controllo di modifiche concorrenti).
-- La chiusura della scrittura diretta dai telefoni è in supabase/pending/ (si applica quando tutti hanno l'app nuova).

alter table public.profiles add column if not exists version integer not null default 0;

-- Partite giocate contro la CPU (e in futuro tra amici), gestite solo dal server.
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  state jsonb not null,
  round integer not null default 0,
  daily boolean not null default false,
  date text not null,
  finished boolean not null default false,
  created_at timestamptz not null default now()
);

create index matches_user_id_idx on public.matches (user_id);

comment on table public.matches is 'Partite di F1 Card Battle, scritte solo dalla Edge Function game.';

-- RLS attiva senza regole: nessun accesso dai telefoni (la funzione usa la chiave di servizio)
alter table public.matches enable row level security;
