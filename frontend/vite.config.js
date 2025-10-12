import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Criar equivalentes para __dirname e __filename em módulos ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Variáveis adicionais do arquivo .env personalizado
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
      // SEGURANÇA: Não exponha todo o process.env, apenas as variáveis específicas
      // que você deseja tornar disponíveis no cliente
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env.VITE_API_URL': JSON.stringify(safeEnv.VITE_API_URL),
      'process.env.VITE_WEBSOCKET_URL': JSON.stringify(safeEnv.VITE_WEBSOCKET_URL),
      'process.env.VITE_DEBUG': JSON.stringify(safeEnv.VITE_DEBUG),

      // Para compatibilidade com código que usa import.meta.env
      'import.meta.env.VITE_API_URL': JSON.stringify(safeEnv.VITE_API_URL),
      'import.meta.env.VITE_WEBSOCKET_URL': JSON.stringify(safeEnv.VITE_WEBSOCKET_URL),
      'import.meta.env.VITE_DEBUG': JSON.stringify(safeEnv.VITE_DEBUG)
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
    }
  };
});