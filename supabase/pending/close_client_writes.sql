-- DA APPLICARE SUBITO (serve la conferma del proprietario del progetto): con gli account anonimi chiunque può
-- avere una sessione, quindi i telefoni non devono più poter scrivere direttamente il profilo (lo fa solo il server,
-- che controlla ogni azione; l'app non lo fa più da tempo). Resta la lettura del proprio profilo.
drop policy if exists "profilo: creazione propria" on public.profiles;
drop policy if exists "profilo: modifica propria" on public.profiles;
