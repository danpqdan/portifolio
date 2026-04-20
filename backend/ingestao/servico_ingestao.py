"""Servico de ingestao: recebe payload cru do handler e cuida de validacao,
transformacao em metricas e delegacao ao InfluxDB. Isola o handler Socket.IO
da regra de ingestao, o que permite testar o fluxo sem subir socket real.
"""
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from dto.Dados import HeatmapDados
from influxdb_service import (
    create_custom_events_from_heatmap,
    create_temporal_metric_from_heatmap,
    create_web_vitals_from_heatmap,
)
from ingestao.logs import emitir_log
from ingestao.validador import validar_payload

logger = logging.getLogger('analytics.ingestao')


@dataclass
class ResumoIngestao:
    status: str  # 'success' | 'error'
    id_registro: Optional[str] = None
    tipo_envio: Optional[str] = None
    resumo: Optional[Dict[str, Any]] = None
    code: Optional[str] = None
    message: Optional[str] = None
    erros: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        if self.status == 'success':
            payload: Dict[str, Any] = {
                'status': 'success',
                'id_registro': self.id_registro,
                'tipo_envio': self.tipo_envio,
                'resumo': self.resumo or {},
            }
            return payload

        return {
            'status': 'error',
            'code': self.code or 'INVALID_ANALYTICS_PAYLOAD',
            'message': self.message or 'Payload de analytics invalido',
            'fields': self.erros,
        }


class ServicoIngestao:
    """Encapsula validacao + transformacao + persistencia.

    O handler Socket.IO so precisa chamar `ingerir(...)` e devolver o ack.
    """

    def __init__(self, influxdb_service=None):
        self.influxdb_service = influxdb_service

    def ingerir(
        self,
        session_id: str,
        data: dict,
        user_agent: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> ResumoIngestao:
        id_registro = data.get('id_registro') if isinstance(data, dict) else None
        app_id = data.get('app_id') if isinstance(data, dict) else None

        emitir_log(logger, logging.INFO, 'recebido',
                   session_id=session_id, id_registro=id_registro, app_id=app_id)

        if self.influxdb_service:
            try:
                fila = self.influxdb_service.fila_pendente()
                if fila > 50:
                    emitir_log(logger, logging.WARNING, 'backpressure',
                               session_id=session_id, id_registro=id_registro,
                               fila_pendente=fila)
            except Exception:
                pass

        valido, erros = validar_payload(data)
        if not valido:
            emitir_log(logger, logging.WARNING, 'rejeitado',
                       session_id=session_id, id_registro=id_registro, app_id=app_id,
                       erros=';'.join(erros))
            return ResumoIngestao(
                status='error',
                code='INVALID_ANALYTICS_PAYLOAD',
                message='Payload de analytics invalido',
                erros=erros,
            )

        heatmap_dados = HeatmapDados.from_dict(data)
        emitir_log(logger, logging.INFO, 'validado',
                   session_id=session_id, id_registro=heatmap_dados.id_registro, app_id=app_id)

        self._persistir_com_resiliencia(session_id, data, user_agent, ip_address, app_id=app_id)

        return ResumoIngestao(
            status='success',
            id_registro=heatmap_dados.id_registro,
            tipo_envio='temporal',
            resumo={
                'total_visualizacoes': heatmap_dados.get_total_visualizacoes(),
                'total_cliques': heatmap_dados.get_total_cliques(),
                'tempo_total_segundos': heatmap_dados.get_total_tempo_segundos(),
                'duracao_sessao_segundos': heatmap_dados.get_duracao_sessao_segundos(),
                'paginas_visitadas': {
                    page_id: len(paginas)
                    for page_id, paginas in heatmap_dados.paginas.items()
                },
            },
        )

    def _persistir_com_resiliencia(
        self,
        session_id: str,
        data: dict,
        user_agent: Optional[str],
        ip_address: Optional[str],
        app_id: Optional[str] = None,
    ) -> None:
        """Persistencia em InfluxDB nao deve derrubar a ingestao.

        Erros de InfluxDB sao logados e engolidos. O payload ja foi aceito e validado;
        a ausencia de persistencia e tratada como degradacao, nao como falha do cliente.
        """
        if not self.influxdb_service:
            return

        id_registro = data.get('id_registro')

        try:
            metricas = create_temporal_metric_from_heatmap(
                session_id=session_id,
                heatmap_data=data,
                user_agent=user_agent,
                ip_address=ip_address,
            )
            for metrica in metricas:
                self.influxdb_service.write_temporal_metrics_async(metrica)
                emitir_log(logger, logging.INFO, 'persistido_temporal',
                           session_id=session_id, id_registro=id_registro, app_id=app_id,
                           page_type=metrica.page_type)

            vitals = create_web_vitals_from_heatmap(
                session_id=session_id,
                heatmap_data=data,
                user_agent=user_agent,
                ip_address=ip_address,
            )
            for vital in vitals:
                self.influxdb_service.write_web_vital_async(vital)
                emitir_log(logger, logging.INFO, 'persistido_webvital',
                           session_id=session_id, id_registro=id_registro, app_id=app_id,
                           nome=vital.nome, valor=vital.valor)

            customizados = create_custom_events_from_heatmap(
                session_id=session_id,
                heatmap_data=data,
                user_agent=user_agent,
                ip_address=ip_address,
            )
            for custom in customizados:
                self.influxdb_service.write_custom_event_async(custom)
                emitir_log(logger, logging.INFO, 'persistido_customevent',
                           session_id=session_id, id_registro=id_registro, app_id=app_id,
                           nome=custom.nome)
        except Exception as erro:
            emitir_log(logger, logging.ERROR, 'erro_persistencia',
                       session_id=session_id, id_registro=id_registro, app_id=app_id,
                       motivo=str(erro))
