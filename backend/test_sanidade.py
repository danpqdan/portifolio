"""Testes minimos de sanidade: health endpoints por camada,
comportamento com InfluxDB desabilitado e resiliencia a erro de Influx.
"""
import os
import sys
import unittest
from unittest.mock import MagicMock

sys.path.append(os.path.dirname(__file__))

import app as app_module


class SanidadeHealthAppTest(unittest.TestCase):
    def setUp(self):
        self.client = app_module.app.test_client()

    def test_health_app_responde_healthy(self):
        resposta = self.client.get('/health/app')
        self.assertEqual(resposta.status_code, 200)
        dados = resposta.get_json()
        self.assertEqual(dados['status'], 'healthy')
        self.assertIn('detalhe', dados)

    def test_health_socketio_responde_healthy(self):
        resposta = self.client.get('/health/socketio')
        self.assertEqual(resposta.status_code, 200)
        dados = resposta.get_json()
        self.assertEqual(dados['status'], 'healthy')


class SanidadeHealthInfluxDBTest(unittest.TestCase):
    def setUp(self):
        self.client = app_module.app.test_client()
        self.influxdb_original = app_module.influxdb_service

    def tearDown(self):
        app_module.influxdb_service = self.influxdb_original

    def test_health_influxdb_ausente_retorna_unavailable(self):
        app_module.influxdb_service = None
        resposta = self.client.get('/health/influxdb')
        self.assertEqual(resposta.status_code, 503)
        dados = resposta.get_json()
        self.assertEqual(dados['status'], 'unavailable')

    def test_health_influxdb_saudavel(self):
        fake = MagicMock()
        fake.is_healthy.return_value = True
        app_module.influxdb_service = fake
        resposta = self.client.get('/health/influxdb')
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(resposta.get_json()['status'], 'healthy')

    def test_health_influxdb_degradado(self):
        fake = MagicMock()
        fake.is_healthy.return_value = False
        app_module.influxdb_service = fake
        resposta = self.client.get('/health/influxdb')
        self.assertEqual(resposta.status_code, 503)
        self.assertEqual(resposta.get_json()['status'], 'degraded')


class SanidadeIngestaoResilienteTest(unittest.TestCase):
    def test_servico_sem_influxdb_nao_derruba_ingestao(self):
        from ingestao.servico_ingestao import ServicoIngestao

        servico = ServicoIngestao(influxdb_service=None)
        resumo = servico.ingerir(
            session_id='s1',
            data={
                'id_registro': 'r1',
                'timestamp_inicial': 1,
                'timestamp_final': 2,
                'paginas': {},
            },
        )
        self.assertEqual(resumo.status, 'success')

    def test_servico_com_influxdb_falho_nao_derruba_ingestao(self):
        from ingestao.servico_ingestao import ServicoIngestao

        fake = MagicMock()
        fake.write_temporal_metrics_async.side_effect = RuntimeError('influx caiu')
        servico = ServicoIngestao(influxdb_service=fake)

        resumo = servico.ingerir(
            session_id='s1',
            data={
                'id_registro': 'r1',
                'timestamp_inicial': 1,
                'timestamp_final': 2,
                'paginas': {'/': [{'eventos': [], 'visualizacoes': 1, 'segundos': 3,
                                    'timestamp_inicial': 1, 'timestamp_final': 2}]},
            },
        )
        self.assertEqual(resumo.status, 'success')


if __name__ == '__main__':
    unittest.main()
