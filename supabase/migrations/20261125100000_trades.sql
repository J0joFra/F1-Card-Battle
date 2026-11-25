-- Scambi di carte tra amici (regole in src/game/trade.ts).
-- Come le altre tabelle del gioco: RLS attiva e nessuna regola, le gestisce solo la Edge Function "game".

-- proposte: from_user cede `give` e riceve `want` da to_user; si cancellano con l'account di uno dei due
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  give text not null,
  want text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists trades_from_pending on public.trades (from_user) where status = 'pending';
create index if not exists trades_to_pending on public.trades (to_user) where status = 'pending';
alter table public.trades enable row level security;

-- Conclude uno scambio in un'unica transazione: salva i due profili solo se nessuno li ha cambiati nel
-- frattempo (version) e segna la proposta come accettata solo se era ancora in attesa.
-- Se una delle tre condizioni non regge non cambia nulla e restituisce false (il server ricontrolla e riprova).
create or replace function public.trade_complete(
  p_trade uuid,
  a uuid, a_progress jsonb, a_version integer,
  b uuid, b_progress jsonb, b_version integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.trades set status = 'accepted', resolved_at = now() where id = p_trade and status = 'pending';
  if not found then return false; end if;
  update public.profiles set progress = a_progress, version = a_version + 1 where id = a and version = a_version;
  if not found then raise exception 'trade_conflict'; end if;
  update public.profiles set progress = b_progress, version = b_version + 1 where id = b and version = b_version;
  if not found then raise exception 'trade_conflict'; end if;
  return true;
exception
  when raise_exception then
    if sqlerrm = 'trade_conflict' then return false; end if;
    raise;
end;
$$;
revoke execute on function public.trade_complete(uuid, uuid, jsonb, integer, uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.trade_complete(uuid, uuid, jsonb, integer, uuid, jsonb, integer) to service_role;
