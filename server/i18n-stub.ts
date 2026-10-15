// Sul server i testi non servono: i messaggi d'errore sono codici, tradotti dall'app.
export type TKey = string;
export const getLang = () => 'it';
export const translate = (key: string) => key;
