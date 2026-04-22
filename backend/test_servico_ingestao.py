import os
import sys
import time
import unittest
import uuid

sys.path.append(os.path.dirname(__file__))

from ingestao.idempotencia import resetar_tudo as resetar_idempotencia
from ingestao.servico_ingestao import ServicoIngestao, ResumoIngestao


class InfluxDBCapturador:
    def __init__(self, lancar_erro=False):
        self.metricas = []
        self.web_vitals = []
        self.lancar_erro = lancar_erro

    def write_temporal_metrics_async(self, metrica):
        if self.lancar_erro:
            raise RuntimeError('simulando falha InfluxDB')
        self.metricas.append(metrica)

    def write_web_vital_async(self, metrica):
        self.web_vitals.append(metrica)


def payload_valido(id_registro: str | None = None):
    """Gera payload com timestamps dentro da janela de plausibilidade e id unico por padrao."""
    agora_ms = int(time.time() * 1000)
    return {
        "id_registro": id_registro or f"sessao-{uuid.uuid4()}",
        "timestamp_inicial": agora_ms - 5000,
        "timestamp_final": agora_ms,
        "paginas": {
            "/": [
                {
                    "eventos": [
                        {"tipo": "page_view", "timestamp": agora_ms - 4500,
                         "dados": {"page_id": "/", "path": "/"}},
                        {"tipo": "click", "timestamp": agora_ms - 4000,
                         "dados": {"x": 1, "y": 2, "elemento_id": "btn"}},
                        {"tipo": "web_vital", "timestamp": agora_ms - 3000,
                         "dados": {"nome": "LCP", "valor": 1800, "rating": "good"}},
                    ],
                    "visualizacoes": 1,
                    "segundos": 5,
                    "timestamp_inicial": agora_ms - 5000,
                    "timestamp_final": agora_ms,
                }
            ]
        },
    }


class ServicoIngestaoFluxoFelizTest(unittest.TestCase):
    def setUp(self):
        resetar_idempotencia()

    def test_ingestao_feliz_retorna_resumo_success(self):
        capturador = InfluxDBCapturador()
        servico = ServicoIngestao(influxdb_service=capturador)

        payload = payload_valido("sessao-abc-1")
        resumo = servico.ingerir(
            session_id='sessao-socket-1',
            data=payload,
            user_agent='ua-teste',
            ip_address='127.0.0.1',
        )

        self.assertIsInstance(resumo, ResumoIngestao)
        self.assertEqual(resumo.status, 'success')
        self.assertEqual(resumo.id_registro, 'sessao-abc-1')
        self.assertEqual(resumo.tipo_envio, 'temporal')
        self.assertEqual(resumo.resumo['total_visualizacoes'], 1)
        self.assertEqual(resumo.resumo['total_cliques'], 1)
        self.assertEqual(resumo.resumo['paginas_visitadas'], {'/': 1})
        # Schema 1.1: ack carrega server_seq, server_time_ms e backpressure_hint
        self.assertIsNotNone(resumo.server_seq)
        self.assertIsNotNone(resumo.server_time_ms)
        self.assertEqual(resumo.backpressure_hint, 'ok')

    def test_ingestao_feliz_grava_metrica_temporal_e_web_vital(self):
        capturador = InfluxDBCapturador()
        servico = ServicoIngestao(influxdb_service=capturador)

        servico.ingerir(session_id='s1', data=payload_valido())

        self.assertEqual(len(capturador.metricas), 1)
        self.assertEqual(capturador.metricas[0].cliques, 1)

        self.assertEqual(len(capturador.web_vitals), 1)
        self.assertEqual(capturador.web_vitals[0].nome, 'LCP')

    def test_resumo_to_dict_schema_1_1_sucesso(self):
        resumo = ResumoIngestao(
            status='success',
            id_registro='r1',
            tipo_envio='temporal',
            resumo={'total_visualizacoes': 2},
            server_seq=42,
            server_time_ms=1714750000000,
            backpressure_hint='ok',
        )
        self.assertEqual(resumo.to_dict(), {
            'schema_version': '1.1',
            'status': 'success',
            'id_registro': 'r1',
            'tipo_envio': 'temporal',
            'resumo': {'total_visualizacoes': 2},
            'server_seq': 42,
            'server_time': 1714750000000,
            'backpressure_hint': 'ok',
            'duplicado': False,
        })

    def test_idempotencia_mesma_id_registro(self):
        """Enviar o mesmo id_registro 2x grava 1 vez; segundo ack tem duplicado=True."""
        capturador = InfluxDBCapturador()
        servico = ServicoIngestao(influxdb_service=capturador)
        payload = payload_valido("sessao-dup")

        r1 = servico.ingerir(session_id='s1', data=payload, site_id='site-A')
        r2 = servico.ingerir(session_id='s1', data=payload, site_id='site-A')

        self.assertEqual(r1.status, 'success')
        self.assertEqual(r2.status, 'success')
        self.assertFalse(r1.duplicado)
        self.assertTrue(r2.duplicado)
        # So uma gravacao no influxdb
        self.assertEqual(len(capturador.metricas), 1)
        # server_seq do hit deve ser o mesmo do primeiro
        self.assertEqual(r1.server_seq, r2.server_seq)


class ServicoIngestaoFluxoInvalidoTest(unittest.TestCase):
    def setUp(self):
        resetar_idempotencia()

    def test_payload_invalido_retorna_erro_sem_gravar(self):
        capturador = InfluxDBCapturador()
        servico = ServicoIngestao(influxdb_service=capturador)

        resumo = servico.ingerir(session_id='s1', data={'id_registro': '', 'paginas': 'errado'})

        self.assertEqual(resumo.status, 'error')
        self.assertEqual(resumo.code, 'INVALID_ANALYTICS_PAYLOAD')
        self.assertIn('id_registro', resumo.erros)
        self.assertIn('paginas', resumo.erros)
        self.assertEqual(capturador.metricas, [])
        self.assertEqual(capturador.web_vitals, [])
        self.assertFalse(resumo.retriable)

    def test_timestamp_muito_antigo_rejeita(self):
        servico = ServicoIngestao(influxdb_service=InfluxDBCapturador())
        payload = payload_valido("sessao-old")
        payload['timestamp_inicial'] = int(time.time() * 1000) - 48 * 60 * 60 * 1000
        resumo = servico.ingerir(session_id='s1', data=payload)
        self.assertEqual(resumo.status, 'error')
        self.assertEqual(resumo.code, 'INVALID_TIMESTAMP')

    def test_resumo_to_dict_schema_1_1_erro(self):
        resumo = ResumoIngestao(
            status='error',
            code='INVALID_ANALYTICS_PAYLOAD',
            message='x',
            erros=['id_registro', 'paginas'],
            retriable=False,
            server_seq=1,
            server_time_ms=1714750000000,
        )
        payload = resumo.to_dict()
        self.assertEqual(payload['schema_version'], '1.1')
        self.assertEqual(payload['status'], 'error')
        self.assertEqual(payload['code'], 'INVALID_ANALYTICS_PAYLOAD')
        self.assertEqual(payload['fields'], ['id_registro', 'paginas'])
        self.assertEqual(payload['retriable'], False)


class ServicoIngestaoResilienciaTest(unittest.TestCase):
    def setUp(self):
        resetar_idempotencia()

    def test_erro_de_influxdb_nao_derruba_ingestao(self):
        capturador = InfluxDBCapturador(lancar_erro=True)
        servico = ServicoIngestao(influxdb_service=capturador)

        resumo = servico.ingerir(session_id='s1', data=payload_valido())

        # ingestao ainda responde com success — persistencia e resiliente
        self.assertEqual(resumo.status, 'success')

    def test_sem_influxdb_funciona(self):
        servico = ServicoIngestao(influxdb_service=None)
        resumo = servico.ingerir(session_id='s1', data=payload_valido())
        self.assertEqual(resumo.status, 'success')


if __name__ == '__main__':
    unittest.main()
