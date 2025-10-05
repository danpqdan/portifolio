import os

class Config:
    """Configuração base"""
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    DEBUG = False
    TESTING = False

class DevelopmentConfig(Config):
    """Configuração para desenvolvimento"""
    DEBUG = True
    CORS_ORIGINS = ["http://localhost:5173", "http://localhost:3000"]

class ProductionConfig(Config):
    """Configuração para produção"""
    DEBUG = False
    # Adicione aqui as origens permitidas em produção
    CORS_ORIGINS = ["https://seudominio.com"]

class TestingConfig(Config):
    """Configuração para testes"""
    TESTING = True
    DEBUG = True

# Dicionário de configurações
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}