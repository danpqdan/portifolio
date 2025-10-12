"""
Serviço InfluxDB para coleta de dados temporais em tempo real
"""
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
import asyncio
from concurrent.futures import ThreadPoolExecutor

try:
    from influxdb_client import InfluxDBClient, Point
    from influxdb_client.client.write_api import SYNCHRONOUS
    INFLUXDB_AVAILABLE = True
except ImportError:
    INFLUXDB_AVAILABLE = False
    logging.warning("InfluxDB client não instalado. Execute: pip install influxdb-client")

@dataclass
class TemporalMetric:
    """Estrutura para métricas temporais"""
    session_id: str
    page_type: str
    permanencia_segundos: float
    visualizacoes: int
    cliques: int = 0
    scrolls: int = 0
    mouse_moves: int = 0
    toques: int = 0
    timestamp: Optional[datetime] = None
    user_agent: Optional[str] = None
    ip_address: Optional[str] = None

class InfluxDBService:
    """Serviço para integração com InfluxDB"""
    
    def __init__(self, url: str, token: str, org: str, bucket: str, enabled: bool = True):
        self.url = url
        self.token = token
        self.org = org
        self.bucket = bucket
        self.enabled = enabled and INFLUXDB_AVAILABLE
        
        self.client = None
        self.write_api = None
        self.executor = ThreadPoolExecutor(max_workers=2)
        
        if self.enabled:
            self._initialize_client()
        else:
            logging.warning("InfluxDB desabilitado ou cliente não disponível")
    
    def _initialize_client(self):
        """Inicializa cliente InfluxDB"""
        try:
            self.client = InfluxDBClient(
                url=self.url,
                token=self.token,
                org=self.org,
                timeout=5000  # 5 segundos de timeout
            )
            self.write_api = self.client.write_api(write_options=SYNCHRONOUS)
            
            # Testar conexão
            health = self.client.health()
            if health.status == "pass":
                logging.info(f"✅ InfluxDB conectado: {self.url}")
            else:
                logging.error(f"❌ InfluxDB health check falhou: {health.message}")
                self.enabled = False
                
        except Exception as e:
            logging.error(f"❌ Erro ao conectar InfluxDB: {str(e)}")
            self.enabled = False
    
    def write_temporal_metrics(self, metrics: TemporalMetric) -> bool:
        """Escreve métricas temporais no InfluxDB"""
        if not self.enabled:
            return False
        
        try:
            # Criar point para page_analytics
            point = (
                Point("page_analytics")
                .tag("session_id", metrics.session_id)
                .tag("page_type", metrics.page_type)
                .tag("user_agent", metrics.user_agent or "unknown")
                .tag("ip_address", metrics.ip_address or "unknown")
                .field("permanencia_segundos", float(metrics.permanencia_segundos))
                .field("visualizacoes", int(metrics.visualizacoes))
                .field("cliques", int(metrics.cliques))
                .field("scrolls", int(metrics.scrolls))
                .field("mouse_moves", int(metrics.mouse_moves))
                .field("toques", int(metrics.toques))
                .time(metrics.timestamp or datetime.now(timezone.utc))
            )
            
            self.write_api.write(bucket=self.bucket, record=point)
            return True
            
        except Exception as e:
            logging.error(f"❌ Erro ao escrever métricas no InfluxDB: {str(e)}")
            return False
    
    def write_temporal_metrics_async(self, metrics: TemporalMetric):
        """Escreve métricas temporais de forma assíncrona"""
        if not self.enabled:
            return
        
        def _write():
            return self.write_temporal_metrics(metrics)
        
        # Executar em thread separada para não bloquear
        self.executor.submit(_write)
    
    def write_navigation_event(self, session_id: str, from_page: str, to_page: str, 
                             navigation_time: float, user_agent: str = None, 
                             ip_address: str = None) -> bool:
        """Registra evento de navegação entre páginas"""
        if not self.enabled:
            return False
        
        try:
            point = (
                Point("realtime_navigation")
                .tag("session_id", session_id)
                .tag("from_page", from_page)
                .tag("to_page", to_page)
                .tag("user_agent", user_agent or "unknown")
                .tag("ip_address", ip_address or "unknown")
                .field("navigation_time", float(navigation_time))
                .time(datetime.now(timezone.utc))
            )
            
            self.write_api.write(bucket=self.bucket, record=point)
            return True
            
        except Exception as e:
            logging.error(f"❌ Erro ao escrever navegação no InfluxDB: {str(e)}")
            return False
    
    def write_session_summary(self, session_id: str, total_duration: float, 
                            pages_visited: int, total_clicks: int,
                            device_type: str = "unknown", 
                            user_agent: str = None, ip_address: str = None) -> bool:
        """Registra resumo da sessão"""
        if not self.enabled:
            return False
        
        try:
            point = (
                Point("session_analytics")
                .tag("session_id", session_id)
                .tag("device_type", device_type)
                .tag("user_agent", user_agent or "unknown")
                .tag("ip_address", ip_address or "unknown")
                .field("total_duration", float(total_duration))
                .field("pages_visited", int(pages_visited))
                .field("total_clicks", int(total_clicks))
                .field("bounce_rate", 1.0 if pages_visited == 1 else 0.0)
                .time(datetime.now(timezone.utc))
            )
            
            self.write_api.write(bucket=self.bucket, record=point)
            return True
            
        except Exception as e:
            logging.error(f"❌ Erro ao escrever sessão no InfluxDB: {str(e)}")
            return False
    
    def query_realtime_metrics(self, time_range: str = "-5m") -> List[Dict[str, Any]]:
        """Consulta métricas em tempo real com fallback"""
        if not self.enabled:
            return []
        
        try:
            # Primeiro tentar consulta com agregação
            query_aggregated = f'''
            from(bucket: "{self.bucket}")
              |> range(start: {time_range})
              |> filter(fn: (r) => r._measurement == "page_analytics")
              |> filter(fn: (r) => r._field == "permanencia_segundos")
              |> group(columns: ["page_type"])
              |> aggregateWindow(every: 30s, fn: mean, createEmpty: false)
              |> sort(columns: ["_time"], desc: true)
            '''
            
            query_api = self.client.query_api()
            result = query_api.query(query=query_aggregated)
            
            metrics = []
            for table in result:
                for record in table.records:
                    try:
                        metric = {
                            'time': record.get_time(),
                            'page_type': record.values.get('page_type', 'unknown'),
                            'value': round(record.get_value(), 2) if record.get_value() else 0,
                            'measurement': record.get_measurement(),
                            'type': 'aggregated_30s'
                        }
                        metrics.append(metric)
                    except (KeyError, AttributeError):
                        continue
            
            # Se não houver dados agregados, usar consulta simples
            if not metrics:
                query_simple = f'''
                from(bucket: "{self.bucket}")
                  |> range(start: {time_range})
                  |> filter(fn: (r) => r._measurement == "page_analytics")
                  |> filter(fn: (r) => r._field == "permanencia_segundos")
                  |> sort(columns: ["_time"], desc: true)
                  |> limit(n: 20)
                '''
                
                result = query_api.query(query=query_simple)
                
                for table in result:
                    for record in table.records:
                        try:
                            metric = {
                                'time': record.get_time(),
                                'page_type': record.values.get('page_type', 'unknown'),
                                'value': round(record.get_value(), 2) if record.get_value() else 0,
                                'measurement': record.get_measurement(),
                                'session_id': record.values.get('session_id', 'unknown'),
                                'type': 'raw_data'
                            }
                            metrics.append(metric)
                        except (KeyError, AttributeError):
                            continue
            
            return metrics
            
        except Exception as e:
            logging.error(f"❌ Erro ao consultar InfluxDB: {str(e)}")
            return []
    
    def get_page_analytics_summary(self, time_range: str = "-1h") -> Dict[str, Any]:
        """Retorna resumo de analytics por página"""
        if not self.enabled:
            return {}
        
        try:
            query = f'''
            from(bucket: "{self.bucket}")
              |> range(start: {time_range})
              |> filter(fn: (r) => r["_measurement"] == "page_analytics")
              |> group(columns: ["page_type", "_field"])
              |> mean()
            '''
            
            query_api = self.client.query_api()
            result = query_api.query(query=query)
            
            summary = {}
            for table in result:
                for record in table.records:
                    page_type = record.values.get('page_type')
                    field = record.values.get('_field')
                    value = record.get_value()
                    
                    if page_type not in summary:
                        summary[page_type] = {}
                    summary[page_type][field] = value
            
            return summary
            
        except Exception as e:
            logging.error(f"❌ Erro ao consultar resumo: {str(e)}")
            return {}
    
    def close(self):
        """Fecha conexão com InfluxDB"""
        if self.client:
            self.client.close()
        if self.executor:
            self.executor.shutdown(wait=True)
    
    def is_healthy(self) -> bool:
        """Verifica se o InfluxDB está saudável"""
        if not self.enabled or not self.client:
            return False
        
        try:
            health = self.client.health()
            return health.status == "pass"
        except:
            return False

# Singleton global
_influxdb_service = None

def get_influxdb_service() -> InfluxDBService:
    """Retorna instância singleton do serviço InfluxDB"""
    global _influxdb_service
    if _influxdb_service is None:
        from config import config
        import os
        
        config_name = os.environ.get('FLASK_ENV', 'development')
        app_config = config.get(config_name, config['default'])()
        
        _influxdb_service = InfluxDBService(
            url=app_config.INFLUXDB_URL,
            token=app_config.INFLUXDB_TOKEN,
            org=app_config.INFLUXDB_ORG,
            bucket=app_config.INFLUXDB_BUCKET,
            enabled=app_config.INFLUXDB_ENABLED
        )
    
    return _influxdb_service

def create_temporal_metric_from_heatmap(session_id: str, heatmap_data: dict, 
                                      user_agent: str = None, ip_address: str = None) -> List[TemporalMetric]:
    """Converte dados do heatmap para métricas temporais"""
    metrics = []
    
    # Processar cada página nos dados
    for page_type in ['home', 'about', 'projects']:
        if page_type in heatmap_data and heatmap_data[page_type]:
            page_data = heatmap_data[page_type]
            
            # Se for lista, pegar o último elemento (dados mais recentes)
            if isinstance(page_data, list) and page_data:
                page_info = page_data[-1]  # Dados mais recentes
            elif isinstance(page_data, dict):
                page_info = page_data
            else:
                continue
            
            metric = TemporalMetric(
                session_id=session_id,
                page_type=page_type,
                permanencia_segundos=float(page_info.get('segundos', 0)),
                visualizacoes=int(page_info.get('visualizacoes', 0)),
                cliques=len(page_info.get('cliques', [])),
                scrolls=len(page_info.get('scrolls', [])),
                mouse_moves=len(page_info.get('mouseMoves', [])),
                toques=len(page_info.get('toques', [])),
                timestamp=datetime.now(timezone.utc),
                user_agent=user_agent,
                ip_address=ip_address
            )
            
            metrics.append(metric)
    
    return metrics