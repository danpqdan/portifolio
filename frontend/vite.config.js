import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  
  // ✅ Configurações para produção
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: mode === 'development',
    minify: mode === 'production' ? 'esbuild' : false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          socket: ['socket.io-client']
        }
      }
    }
  },

  // ✅ Configurações do servidor de desenvolvimento
  server: {
    port: 5173,
    host: true,
    proxy: mode === 'development' ? {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        ws: true, // ✅ Habilitar WebSocket proxy
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        ws: true, // ✅ WebSocket específico
      }
    } : undefined
  },

  // ✅ Definir variáveis de ambiente
  define: {
    __DEV__: mode === 'development',
    __PROD__: mode === 'production'
  }
}))