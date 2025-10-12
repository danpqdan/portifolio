import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  console.log('🔧 Vite mode:', mode); // Debug
  
  return {
    plugins: [react()],
    
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

    server: {
      port: 5173,
      host: true,
      proxy: mode === 'development' ? {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
          secure: false,
          ws: true,
        },
        '/socket.io': {
          target: 'http://localhost:5000',
          changeOrigin: true,
          secure: false,
          ws: true,
        }
      } : undefined
    },

    // ✅ FORÇAR MODO DE PRODUÇÃO
    define: {
      'import.meta.env.MODE': JSON.stringify(mode),
      'import.meta.env.PROD': mode === 'production',
      'import.meta.env.DEV': mode === 'development'
    }
  }
})