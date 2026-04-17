import os
from pathlib import Path

from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parent / ".env")


def obter_bool(nome_variavel: str, padrao: str = "false") -> bool:
    return os.environ.get(nome_variavel, padrao).strip().lower() == "true"


def obter_lista(nome_variavel: str, padrao: str = "") -> list[str]:
    valor = os.environ.get(nome_variavel, padrao)
    return [item.strip() for item in valor.split(",") if item.strip()]


def exigir_variavel(nome_variavel: str) -> str:
    valor = os.environ.get(nome_variavel)
    if not valor:
        raise RuntimeError(f"Variavel de ambiente obrigatoria ausente: {nome_variavel}")
    return valor


class Config:
    """Configuracao base carregada exclusivamente por variaveis de ambiente."""

    SECRET_KEY = exigir_variavel("SECRET_KEY")
    DEBUG = False
    TESTING = False

    TEMPORAL_REALTIME_INTERVAL = int(os.environ.get("TEMPORAL_REALTIME_INTERVAL", "5000"))
    TEMPORAL_REGULAR_INTERVAL = int(os.environ.get("TEMPORAL_REGULAR_INTERVAL", "15000"))
    TEMPORAL_CACHE_SIZE = int(os.environ.get("TEMPORAL_CACHE_SIZE", "1000"))
    TEMPORAL_CLEANUP_INTERVAL = int(os.environ.get("TEMPORAL_CLEANUP_INTERVAL", "300"))

    INFLUXDB_ENABLED = obter_bool("INFLUXDB_ENABLED")
    INFLUXDB_URL = os.environ.get("INFLUXDB_URL", "")
    INFLUXDB_TOKEN = os.environ.get("INFLUXDB_TOKEN", "")
    INFLUXDB_ORG = os.environ.get("INFLUXDB_ORG", "")
    INFLUXDB_BUCKET = os.environ.get("INFLUXDB_BUCKET", "")

    if INFLUXDB_ENABLED:
        INFLUXDB_URL = exigir_variavel("INFLUXDB_URL")
        INFLUXDB_TOKEN = exigir_variavel("INFLUXDB_TOKEN")
        INFLUXDB_ORG = exigir_variavel("INFLUXDB_ORG")
        INFLUXDB_BUCKET = exigir_variavel("INFLUXDB_BUCKET")

    CORS_ORIGINS = obter_lista("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")
    HOST = os.environ.get("HOST", "127.0.0.1")
    PORT = int(os.environ.get("PORT", "5000"))


class DevelopmentConfig(Config):
    """Configuracao local de desenvolvimento."""

    DEBUG = True


class ProductionConfig(Config):
    """Configuracao reservada para uso futuro em ambiente separado."""

    DEBUG = False


class TestingConfig(Config):
    """Configuracao para testes."""

    TESTING = True
    DEBUG = True
    TEMPORAL_REALTIME_INTERVAL = 1000
    TEMPORAL_REGULAR_INTERVAL = 3000


config = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
    "default": DevelopmentConfig,
}
