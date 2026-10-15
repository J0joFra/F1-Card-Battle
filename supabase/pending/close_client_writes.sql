-- DA APPLICARE quando tutti usano l'app con il server (dopo il merge su main e l'aggiornamento dell'APK).
-- Toglie ai telefoni la possibilità di scrivere direttamente il profilo: resta solo la lettura.
drop policy if exists "profilo: creazione propria" on public.profiles;
drop policy if exists "profilo: modifica propria" on public.profiles;
