import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // proxy all /influx requests to the InfluxDB server during dev to avoid CORS
      '/influx': {
        target: 'http://dsplayground.com.br:8086',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/influx/, ''),
        // ensure Authorization header is present in proxied requests when VITE_INFLUX_TOKEN is set
        configure: (proxy) => {
          try {
            proxy.on('proxyReq', (proxyReq) => {
              // prefer VITE_INFLUX_TOKEN from environment, fallback to the apiv3 token created earlier
              const token = globalThis?.process?.env?.VITE_INFLUX_TOKEN || 'answThmmRah9sMPB8rM_8_L7svg_kpVQwOjuBqh9HFJQEHbjU36GTfdWXzMBGeA1yCcoVx-N5ZpSESfrgvv_JA==';
              if (token) {
                proxyReq.setHeader('Authorization', `Bearer ${token}`);
                // small masked log to help debug (prints first/last 4 chars)
                console.log('[vite proxy] injected Authorization Bearer ' + token.slice(0,4) + '...' + token.slice(-4));
              }
            });
          } catch {
            // ignore — this hook only runs in dev
          }
        }
      },
    },
  },
})
