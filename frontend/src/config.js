/**
 * Configurações centralizadas da aplicação
 * Acessa variáveis de ambiente através do import.meta.env
 */

// Ambiente
export const IS_DEV = import.meta.env.MODE !== 'production';
export const IS_PROD = import.meta.env.MODE === 'production';
export const NODE_ENV = import.meta.env.MODE;

// URLs
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// WebSocket configurações
const WEBSOCKET_BASE_URL = import.meta.env.VITE_WEBSOCKET_URL || (IS_DEV ? 'http://localhost:5000' : 'https://dsplayground.com.br');
export const WEBSOCKET_URL = WEBSOCKET_BASE_URL;
export const WEBSOCKET_PATH = IS_DEV ? '/socket.io' : '/api/socket.io';

// Flags
export const DEBUG_ENABLED = import.meta.env.VITE_DEBUG === 'true' || IS_DEV;

export default {
    IS_DEV,
    IS_PROD,
    NODE_ENV,
    API_URL,
    WEBSOCKET_URL,
    WEBSOCKET_PATH,
    DEBUG_ENABLED,
};