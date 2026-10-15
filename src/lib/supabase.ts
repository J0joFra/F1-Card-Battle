import { createClient } from '@supabase/supabase-js';

// URL e chiave "publishable" sono pubblici per definizione (finiscono comunque nel codice del sito):
// la sicurezza dei dati è garantita dalle regole RLS sul database. Si possono sovrascrivere con
// VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (es. per un progetto di test).
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://fheiutmpkglkpymkrrqt.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_lELROiiNMHriJdR4YFKdVw_HhdO1Jus';

export const supabase = createClient(url, key, {
  auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true },
});
