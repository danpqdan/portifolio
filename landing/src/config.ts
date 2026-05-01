export const SITE_NAME = 'DS Playground Analytics';
export const SITE_URL = import.meta.env.PUBLIC_SITE_URL || 'https://dsplayground.com.br';
export const API_URL = import.meta.env.PUBLIC_API_URL || 'https://api.dsplayground.com.br';
// Dashboard logado em subdominio dedicado. Cookie cliente_session viaja por
// causa do COOKIE_DOMAIN no backend (=dsplayground.com.br). Em dev local pode
// apontar pra localhost.
export const DASHBOARD_URL = import.meta.env.PUBLIC_DASHBOARD_URL || 'https://app.dsplayground.com.br/cliente/metricas';
export const PUBLISHABLE_KEY = import.meta.env.PUBLIC_PUBLISHABLE_KEY || '';
export const DEBUG = import.meta.env.PUBLIC_DEBUG === 'true';
