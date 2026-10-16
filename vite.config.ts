import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Il foglio di stile del gioco non blocca il primo disegno: così l'animazione di apertura
// (che ha il suo stile dentro index.html) si vede subito, anche con la rete lenta.
// Quando il CSS è arrivato lo segnala, e la busta si toglie solo con gioco e stile pronti.
const asyncCss = (): Plugin => ({
  name: 'async-css',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler: (html) =>
      html.replace(
        /<link rel="stylesheet"( crossorigin)? href="([^"]+)">/g,
        (_m, cors = '', href) =>
          `<link rel="preload" as="style"${cors} href="${href}" onload="this.onload=null;this.rel='stylesheet';window.__cssReady&&window.__cssReady()">` +
          `<noscript><link rel="stylesheet" href="${href}"></noscript>`,
      ),
  },
});

// base relativo: funziona su GitHub Pages e dentro un'app Capacitor
export default defineConfig({
  base: './',
  plugins: [react(), asyncCss()],
});
