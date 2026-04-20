import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Build de biblioteca do SDK de analytics. Entry unico em `src/sdk/index.ts`.
 * Saida em `dist/sdk/` com ESM + CJS + declaracoes `.d.ts`.
 *
 * Externals: `react`, `react-dom`, `socket.io-client`, `uuid`, `web-vitals` — nao sao
 * empacotados; o consumidor resolve no proprio bundler. O SDK nao depende de
 * componentes ou estilos do portfolio.
 */
export default defineConfig({
  plugins: [
    dts({
      outDir: 'dist/sdk',
      insertTypesEntry: true,
      tsconfigPath: resolve(__dirname, 'tsconfig.sdk.json'),
    }),
  ],
  build: {
    outDir: resolve(__dirname, 'dist/sdk'),
    emptyOutDir: true,
    minify: 'esbuild',
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, 'src/sdk/index.ts'),
      name: 'AnalyticsSDK',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'socket.io-client', 'uuid', 'web-vitals'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'socket.io-client': 'socketio',
          uuid: 'uuid',
          'web-vitals': 'webVitals',
        },
      },
    },
  },
});
