const config = {
  development: {
    API_BASE_URL: 'http://localhost:5000',
    WEBSOCKET_URL: 'http://localhost:5000',
    WEBSOCKET_PATH: '/socket.io',
    ENVIRONMENT: 'development'
  },
  production: {
    // ✅ CORRIGIR PARA SEU DOMÍNIO REAL
    API_BASE_URL: 'https://dsplayground.com.br/api',
    WEBSOCKET_URL: 'https://dsplayground.com.br',
    WEBSOCKET_PATH: '/api/socket.io', // ✅ Caminho correto para produção
    ENVIRONMENT: 'production'
  }
};

// Detectar ambiente automaticamente
const environment = import.meta.env.MODE || 'development';
export default config[environment];