import os

class Config:
    """Configuração base"""
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    DEBUG = False
    TESTING = False
    
    # Configurações para coleta temporal
    TEMPORAL_REALTIME_INTERVAL = int(os.environ.get('TEMPORAL_REALTIME_INTERVAL', '5000'))  # 5s
    TEMPORAL_REGULAR_INTERVAL = int(os.environ.get('TEMPORAL_REGULAR_INTERVAL', '15000'))  # 15s
    TEMPORAL_CACHE_SIZE = int(os.environ.get('TEMPORAL_CACHE_SIZE', '1000'))
    TEMPORAL_CLEANUP_INTERVAL = int(os.environ.get('TEMPORAL_CLEANUP_INTERVAL', '300'))  # 5min

    # ✅ CONFIGURAÇÕES INFLUXDB CORRIGIDAS
    INFLUXDB_URL = os.environ.get('INFLUXDB_URL_LOCAL', 'http://127.0.0.1:8086')  # ✅ Localhost
    INFLUXDB_TOKEN = os.environ.get('INFLUXDB_TOKEN', '***REMOVED***')
    INFLUXDB_ORG = os.environ.get('INFLUXDB_ORG', 'zen')
    INFLUXDB_BUCKET = os.environ.get('INFLUXDB_BUCKET', 'portifolio')
    INFLUXDB_ENABLED = os.environ.get('INFLUXDB_ENABLED', 'true').lower() == 'true'

class DevelopmentConfig(Config):
    """Configuração para desenvolvimento"""
    DEBUG = True
    CORS_ORIGINS = ["http://localhost:5173", "http://localhost:3000"]
    
    # Configurações temporais para desenvolvimento (intervalos menores para teste)
    TEMPORAL_REALTIME_INTERVAL = 3000  # 3s para desenvolvimento
    TEMPORAL_REGULAR_INTERVAL = 10000  # 10s para desenvolvimento

class ProductionConfig(Config):
    """Configuração para produção"""
    DEBUG = False
    # ✅ CORS CORRIGIDO PARA PRODUÇÃO
    CORS_ORIGINS = [
        "https://dsplayground.com.br", 
        "https://www.dsplayground.com.br",
        "http://dsplayground.com.br"  # Para testes
    ]
    
    # Configurações temporais para produção (intervalos padrão)
    TEMPORAL_REALTIME_INTERVAL = 5000  # 5s
    TEMPORAL_REGULAR_INTERVAL = 15000  # 15s

class TestingConfig(Config):
    """Configuração para testes"""
    TESTING = True
    DEBUG = True
    
    # Configurações temporais para testes (intervalos muito menores)
    TEMPORAL_REALTIME_INTERVAL = 1000  # 1s para testes
    TEMPORAL_REGULAR_INTERVAL = 3000   # 3s para testes

# Dicionário de configurações
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}