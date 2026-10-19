-- Account senza Google: ogni telefono ha un account anonimo di Supabase con un profilo di gioco
-- (nickname, avatar, pilota preferito) e un codice di recupero per riaverlo su un altro telefono.
alter table public.profiles
  add column if not exists nickname text,
  add column if not exists nickname_key text generated always as (lower(nickname)) stored,
  add column if not exists avatar jsonb,
  add column if not exists favorite_driver text,
  add column if not exists recovery_hash text,
  add column if not exists legacy_slot integer,
  add column if not exists moved_to uuid;

comment on column public.profiles.recovery_hash is 'Impronta SHA-256 del codice di recupero (il codice non viene salvato).';
comment on column public.profiles.legacy_slot is 'Profili del vecchio accesso con Google: ripresi in quest''ordine dai primi account nuovi.';
comment on column public.profiles.moved_to is 'Profilo passato a un altro account (resta come copia, non si usa più).';

-- nickname unico senza distinguere maiuscole/minuscole (solo tra i profili in uso)
create unique index if not exists profiles_nickname_key on public.profiles (nickname_key) where moved_to is null and nickname_key is not null;
create unique index if not exists profiles_recovery_hash on public.profiles (recovery_hash) where recovery_hash is not null;

-- i profili creati finora (accesso con Google) diventano "da riprendere", nell'ordine in cui sono stati creati
update public.profiles p
set legacy_slot = r.n
from (select id, row_number() over (order by created_at) as n from public.profiles) r
where p.id = r.id and p.legacy_slot is null and p.moved_to is null;

-- Sposta tutto un profilo (carte, progressi, amici) su un altro account, in un colpo solo.
-- I campi null tengono i valori del profilo vecchio. Il profilo vecchio resta come copia, segnato come spostato.
create or replace function public.transfer_profile(
  from_id uuid,
  to_id uuid,
  new_nickname text,
  new_avatar jsonb,
  new_favorite text,
  new_recovery_hash text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  src public.profiles%rowtype;
begin
  select * into src from public.profiles where id = from_id and moved_to is null for update;
  if not found then
    return false;
  end if;
  -- prima si libera il nickname e il codice del profilo vecchio, poi si crea quello nuovo
  update public.profiles
    set moved_to = to_id, nickname = null, recovery_hash = null, legacy_slot = null
    where id = from_id;
  insert into public.profiles (id, progress, version, display_name, nickname, avatar, favorite_driver, recovery_hash, last_seen)
  values (
    to_id,
    src.progress,
    1,
    coalesce(new_nickname, src.nickname),
    coalesce(new_nickname, src.nickname),
    coalesce(new_avatar, src.avatar),
    coalesce(new_favorite, src.favorite_driver),
    new_recovery_hash,
    now()
  );
  -- gli amici passano al nuovo account (che è appena nato, quindi non ha amici suoi)
  update public.friends set user_id = to_id where user_id = from_id;
  update public.friends set friend_id = to_id where friend_id = from_id;
  return true;
end;
$$;

-- solo il server (Edge Function "game", chiave di servizio) può usarla
revoke execute on function public.transfer_profile(uuid, uuid, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.transfer_profile(uuid, uuid, text, jsonb, text, text) to service_role;
