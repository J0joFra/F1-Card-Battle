-- Rientro con Play Giochi: l'id del giocatore Play Giochi collegato all'account (uno per account, e viceversa).
alter table public.profiles add column if not exists play_games_id text;
create unique index if not exists profiles_play_games_key on public.profiles (play_games_id) where moved_to is null and play_games_id is not null;
