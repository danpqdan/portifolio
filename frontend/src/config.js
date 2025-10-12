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
    WEBSOCKET_PATH: '/api/socket.io',  // ✅ ESTE É O CORRETO
    ENVIRONMENT: 'production',
    DEBUG_ENABLED: true,  // ✅ ATIVAR DEBUG TEMPORARIAMENTE
    IS_DEV: false,
    NODE_ENV: 'production'
  }
};

// ✅ FORÇAR PRODUÇÃO TEMPORARIAMENTE PARA DEBUG
const environment = 'production'; // import.meta.env.MODE || 'development';
const currentConfig = config[environment];

// ✅ LOG PARA DEBUG NO BUILD
console.log('🔧 Config Debug:', {
  environment,
  mode: import.meta.env.MODE,
  websocket_path: currentConfig.WEBSOCKET_PATH,
  websocket_url: currentConfig.WEBSOCKET_URL
});

// Exportar todas as variáveis necessárias
export const API_BASE_URL = currentConfig.API_BASE_URL;
export const WEBSOCKET_URL = currentConfig.WEBSOCKET_URL;
export const WEBSOCKET_PATH = currentConfig.WEBSOCKET_PATH;
export const ENVIRONMENT = currentConfig.ENVIRONMENT;
export const DEBUG_ENABLED = currentConfig.DEBUG_ENABLED;
export const IS_DEV = currentConfig.IS_DEV;
export const NODE_ENV = currentConfig.NODE_ENV;

export default currentConfig;