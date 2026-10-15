// Impacchetta la logica di gioco nella Edge Function di Supabase: supabase/functions/game/index.js
import { build } from 'esbuild';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
await build({
  entryPoints: [path.join(root, 'server/edge.ts')],
  outfile: path.join(root, 'supabase/functions/game/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  external: ['npm:*'],
  banner: { js: '// File generato da scripts/build-edge.mjs: non modificare a mano (sorgenti in server/ e src/).' },
  plugins: [
    {
      name: 'server-aliases',
      setup(b) {
        b.onResolve({ filter: /data\/cards\.json$/ }, () => ({ path: path.join(root, 'server/cards-remote.ts') }));
        b.onResolve({ filter: /lib\/i18n$/ }, () => ({ path: path.join(root, 'server/i18n-stub.ts') }));
      },
    },
  ],
});
console.log('ok → supabase/functions/game/index.js');
