const config = {
  development: {
    API_BASE_URL: 'http://localhost:5000',
    WEBSOCKET_URL: 'http://localhost:5000',
    WEBSOCKET_PATH: '/socket.io',
    ENVIRONMENT: 'development',
    DEBUG_ENABLED: true,
    IS_DEV: true,
    NODE_ENV: 'development'
  },
  production: {
    API_BASE_URL: 'https://dsplayground.com.br/api',
    WEBSOCKET_URL: 'https://dsplayground.com.br',
    WEBSOCKET_PATH: '/api/socket.io',
    ENVIRONMENT: 'production',
    DEBUG_ENABLED: false,
    IS_DEV: false,
    NODE_ENV: 'production'
  }
};

// Detectar ambiente automaticamente
const environment = import.meta.env.MODE || 'development';
const currentConfig = config[environment];

// ✅ EXPORTAR TODAS AS VARIÁVEIS NECESSÁRIAS
export const API_BASE_URL = currentConfig.API_BASE_URL;
export const WEBSOCKET_URL = currentConfig.WEBSOCKET_URL;
export const WEBSOCKET_PATH = currentConfig.WEBSOCKET_PATH;
export const ENVIRONMENT = currentConfig.ENVIRONMENT;
export const DEBUG_ENABLED = currentConfig.DEBUG_ENABLED;
export const IS_DEV = currentConfig.IS_DEV;
export const NODE_ENV = currentConfig.NODE_ENV;

// Export default para compatibilidade
export default currentConfig;