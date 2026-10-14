import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativo: funziona su GitHub Pages e dentro un'app Capacitor
export default defineConfig({
  base: './',
  plugins: [react()],
});
