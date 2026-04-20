"""Testes dos endpoints REST de consulta (Frente B) e LGPD (Frente C)."""
import os
import sys
import unittest
from unittest.mock import MagicMock

sys.path.append(os.path.dirname(__file__))

import app as app_module


class _CapturadorInfluxDB:
    def __init__(self, metricas=None, vitals=None, customs=None, healthy=True):
        self._metricas = metricas or []
        self._vitals = vitals or []
        self._customs = customs or []
        self._healthy = healthy

    def query_metricas_agregadas(self, **kwargs):
        return list(self._metricas)

    def query_web_vitals(self, **kwargs):
        return list(self._vitals)

    def query_custom_events(self, **kwargs):
        return list(self._customs)

    def consultar_por_session_id(self, session_id, inicio="-30d"):
        return {
            "page_analytics": [{"session_id": session_id, "field": "cliques", "value": 5}],
            "web_vitals": [],
            "custom_events": [],
        }

    def apagar_por_session_id(self, session_id, inicio="1970-01-01T00:00:00Z"):
        return True

    def is_healthy(self):
        return self._healthy


class ApiConsultaTest(unittest.TestCase):
    def setUp(self):
        self.client = app_module.app.test_client()
        self._influx_original = app_module.influxdb_service

    def tearDown(self):
        app_module.influxdb_service = self._influx_original

    def test_metricas_retorna_pontos_agregados(self):
        app_module.influxdb_service = _CapturadorInfluxDB(metricas=[
            {"page_type": "/", "totais": {"cliques": 12, "visualizacoes": 3}},
        ])
        resposta = self.client.get('/analytics/metricas?app_id=portfolio&page_type=/&limit=50')
        self.assertEqual(resposta.status_code, 200)
        corpo = resposta.get_json()
        self.assertEqual(corpo['status'], 'success')
        self.assertEqual(corpo['filtros']['app_id'], 'portfolio')
        self.assertEqual(corpo['filtros']['limit'], 50)
        self.assertEqual(len(corpo['pontos']), 1)
        self.assertEqual(corpo['pontos'][0]['totais']['cliques'], 12)

    def test_metricas_503_sem_influxdb(self):
        app_module.influxdb_service = None
        resposta = self.client.get('/analytics/metricas')
        self.assertEqual(resposta.status_code, 503)

    def test_metricas_limita_limit_no_maximo(self):
        app_module.influxdb_service = _CapturadorInfluxDB()
        resposta = self.client.get('/analytics/metricas?limit=999999')
        self.assertEqual(resposta.get_json()['filtros']['limit'], 1000)

    def test_metricas_default_limit_100(self):
        app_module.influxdb_service = _CapturadorInfluxDB()
        resposta = self.client.get('/analytics/metricas')
        self.assertEqual(resposta.get_json()['filtros']['limit'], 100)

    def test_web_vitals_aceita_filtro_por_nome(self):
        app_module.influxdb_service = _CapturadorInfluxDB(vitals=[
            {"nome": "LCP", "page_type": "/", "rating": "good", "valor": 1800},
        ])
        resposta = self.client.get('/analytics/web-vitals?nome=LCP')
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(resposta.get_json()['filtros']['nome'], 'LCP')

    def test_custom_events_retorna_ocorrencias(self):
        app_module.influxdb_service = _CapturadorInfluxDB(customs=[
            {"nome": "checkout_iniciado", "page_type": "/", "ocorrencias": 4},
        ])
        resposta = self.client.get('/analytics/custom-events?nome=checkout_iniciado')
        self.assertEqual(resposta.status_code, 200)
        corpo = resposta.get_json()
        self.assertEqual(corpo['pontos'][0]['ocorrencias'], 4)


class AdminLgpdTest(unittest.TestCase):
    TOKEN = 'token-admin-teste'

    def setUp(self):
        self.client = app_module.app.test_client()
        self._influx_original = app_module.influxdb_service
        self._env_original = os.environ.get('ADMIN_API_TOKEN')
        os.environ['ADMIN_API_TOKEN'] = self.TOKEN
        app_module.influxdb_service = _CapturadorInfluxDB()

    def tearDown(self):
        app_module.influxdb_service = self._influx_original
        if self._env_original is None:
            os.environ.pop('ADMIN_API_TOKEN', None)
        else:
            os.environ['ADMIN_API_TOKEN'] = self._env_original

    def _auth(self):
        return {'Authorization': f'Bearer {self.TOKEN}'}

    def test_consultar_sessao_retorna_dados(self):
        resposta = self.client.get('/admin/analytics/sessao/sid-xyz', headers=self._auth())
        self.assertEqual(resposta.status_code, 200)
        corpo = resposta.get_json()
        self.assertEqual(corpo['session_id'], 'sid-xyz')
        self.assertIn('page_analytics', corpo['dados'])

    def test_consultar_sem_token_retorna_401(self):
        resposta = self.client.get('/admin/analytics/sessao/sid-xyz')
        self.assertEqual(resposta.status_code, 401)
        self.assertEqual(resposta.get_json()['code'], 'UNAUTHORIZED')

    def test_consultar_com_token_errado_retorna_401(self):
        resposta = self.client.get('/admin/analytics/sessao/sid-xyz',
                                   headers={'Authorization': 'Bearer errado'})
        self.assertEqual(resposta.status_code, 401)

    def test_apagar_sessao_retorna_success(self):
        resposta = self.client.delete('/admin/analytics/sessao/sid-del', headers=self._auth())
        self.assertEqual(resposta.status_code, 200)
        corpo = resposta.get_json()
        self.assertTrue(corpo['apagado'])

    def test_apagar_sem_token_retorna_401(self):
        resposta = self.client.delete('/admin/analytics/sessao/sid-del')
        self.assertEqual(resposta.status_code, 401)


if __name__ == '__main__':
    unittest.main()
