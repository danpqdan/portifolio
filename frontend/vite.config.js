import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ler versão do package.json
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));
const version = pkg.version || '0.0.0';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  let customEnv = {};

  const safeEnv = {
    NODE_ENV: mode,
    VITE_API_URL: customEnv.VITE_API_URL || env.VITE_API_URL || 'http://localhost:5000',
    VITE_WEBSOCKET_URL: customEnv.VITE_WEBSOCKET_URL || env.VITE_WEBSOCKET_URL || 'http://localhost:5000',
    VITE_DEBUG: customEnv.VITE_DEBUG || env.VITE_DEBUG || 'false'
  };

  return {
    plugins: [react()],
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env.VITE_API_URL': JSON.stringify(safeEnv.VITE_API_URL),
      'process.env.VITE_WEBSOCKET_URL': JSON.stringify(safeEnv.VITE_WEBSOCKET_URL),
      'process.env.VITE_DEBUG': JSON.stringify(safeEnv.VITE_DEBUG),
      'import.meta.env.VITE_API_URL': JSON.stringify(safeEnv.VITE_API_URL),
      'import.meta.env.VITE_WEBSOCKET_URL': JSON.stringify(safeEnv.VITE_WEBSOCKET_URL),
      'import.meta.env.VITE_DEBUG': JSON.stringify(safeEnv.VITE_DEBUG),
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(version) // expõe a versão
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, './src')
      }
    },
    server: {
      port: 3000,
      strictPort: false,
      host: true,
    },
    build: {
      outDir: `dist_v${version}`, // define o dist com a versão
      sourcemap: true
    }
  };
});
