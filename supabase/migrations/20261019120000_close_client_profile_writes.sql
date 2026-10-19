-- Con gli account anonimi chiunque può avere una sessione, quindi i telefoni non scrivono più direttamente il
-- profilo (lo fa solo il server, che controlla ogni azione). Resta la lettura del proprio profilo.
drop policy if exists "profilo: creazione propria" on public.profiles;
drop policy if exists "profilo: modifica propria" on public.profiles;
