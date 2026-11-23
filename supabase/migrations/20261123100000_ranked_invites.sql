-- Gara classificata (campionati dal Karting alla F1) e inviti agli amici.
-- Come le altre tabelle del gioco: RLS attiva e nessuna regola, le gestisce solo la Edge Function "game".

-- le gare classificate usano la tabella delle sfide (partita secca, senza codice da condividere)
alter table public.pvp_matches add column if not exists ranked boolean not null default false;
create index if not exists pvp_matches_ranked_live on public.pvp_matches (created_at) where ranked and status = 'playing';

-- coda: chi cerca un avversario, con i suoi punti campionato e il mazzo con cui gioca
create table if not exists public.ranked_queue (
  user_id uuid primary key references auth.users (id) on delete cascade,
  points integer not null,
  name text,
  deck jsonb not null,
  date text not null,
  joined_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
create index if not exists ranked_queue_points on public.ranked_queue (points);
alter table public.ranked_queue enable row level security;

-- Prende dalla coda l'avversario più vicino ai punti di `me` (tra lo e hi, controllato dopo `fresh`) e toglie
-- dalla coda entrambi. Bloccando prima la riga di `me`, due giocatori che si cercano nello stesso istante
-- non possono creare due partite: uno dei due trova l'altro al controllo successivo.
create or replace function public.ranked_claim(me uuid, lo integer, hi integer, fresh timestamptz, target integer)
returns setof public.ranked_queue
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.ranked_queue%rowtype;
begin
  perform 1 from public.ranked_queue where user_id = me for update skip locked;
  if not found then
    return;
  end if;
  select * into r from public.ranked_queue
    where user_id <> me and points between lo and hi and seen_at >= fresh
    order by abs(points - target), joined_at
    limit 1
    for update skip locked;
  if not found then
    return;
  end if;
  delete from public.ranked_queue where user_id in (r.user_id, me);
  return next r;
end;
$$;
revoke execute on function public.ranked_claim(uuid, integer, integer, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.ranked_claim(uuid, integer, integer, timestamptz, integer) to service_role;

-- inviti: il codice personale di ogni account e chi l'ha invitato (si segna una volta sola)
alter table public.profiles
  add column if not exists invite_code text,
  add column if not exists invited_by uuid;
create unique index if not exists profiles_invite_code on public.profiles (invite_code) where invite_code is not null;
