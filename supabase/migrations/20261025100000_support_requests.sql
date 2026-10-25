-- Richieste di aiuto per il codice di accesso dimenticato: il giocatore risponde ad alcune domande e lascia
-- un'email; l'amministratore le confronta con l'account e, se approva, gli manda il nuovo codice.
-- Una sola richiesta in attesa per dispositivo. La riga si cancella (con l'email) appena è gestita.
-- Solo il server (service role) la legge e la scrive: RLS attiva e nessuna policy.
create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  device uuid not null unique references auth.users (id) on delete cascade,
  username text not null,
  email text not null,
  answers jsonb not null default '{}'::jsonb
);

alter table public.support_requests enable row level security;
