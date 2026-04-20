import os
import sys
import unittest

sys.path.append(os.path.dirname(__file__))

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


def payload_valido():
    return {
        "id_registro": "sessao-abc",
        "timestamp_inicial": 1760000000000,
        "timestamp_final": 1760000005000,
        "paginas": {
            "/": [
                {
                    "eventos": [
                        {"tipo": "page_view", "timestamp": 1760000000500,
                         "dados": {"page_id": "/", "path": "/"}},
                        {"tipo": "click", "timestamp": 1760000001000,
                         "dados": {"x": 1, "y": 2, "elemento_id": "btn"}},
                        {"tipo": "web_vital", "timestamp": 1760000002000,
                         "dados": {"nome": "LCP", "valor": 1800, "rating": "good"}},
                    ],
                    "visualizacoes": 1,
                    "segundos": 5,
                    "timestamp_inicial": 1760000000000,
                    "timestamp_final": 1760000005000,
                }
            ]
        },
    }


class ServicoIngestaoFluxoFelizTest(unittest.TestCase):
    def test_ingestao_feliz_retorna_resumo_success(self):
        capturador = InfluxDBCapturador()
        servico = ServicoIngestao(influxdb_service=capturador)

        resumo = servico.ingerir(
            session_id='sessao-socket-1',
            data=payload_valido(),
            user_agent='ua-teste',
            ip_address='127.0.0.1',
        )

        self.assertIsInstance(resumo, ResumoIngestao)
        self.assertEqual(resumo.status, 'success')
        self.assertEqual(resumo.id_registro, 'sessao-abc')
        self.assertEqual(resumo.tipo_envio, 'temporal')
        self.assertEqual(resumo.resumo['total_visualizacoes'], 1)
        self.assertEqual(resumo.resumo['total_cliques'], 1)
        self.assertEqual(resumo.resumo['paginas_visitadas'], {'/': 1})

    def test_ingestao_feliz_grava_metrica_temporal_e_web_vital(self):
        capturador = InfluxDBCapturador()
        servico = ServicoIngestao(influxdb_service=capturador)

        servico.ingerir(session_id='s1', data=payload_valido())

        self.assertEqual(len(capturador.metricas), 1)
        self.assertEqual(capturador.metricas[0].cliques, 1)

        self.assertEqual(len(capturador.web_vitals), 1)
        self.assertEqual(capturador.web_vitals[0].nome, 'LCP')

    def test_resumo_to_dict_formata_sucesso(self):
        resumo = ResumoIngestao(
            status='success',
            id_registro='r1',
            tipo_envio='temporal',
            resumo={'total_visualizacoes': 2},
        )
        self.assertEqual(resumo.to_dict(), {
            'status': 'success',
            'id_registro': 'r1',
            'tipo_envio': 'temporal',
            'resumo': {'total_visualizacoes': 2},
        })


class ServicoIngestaoFluxoInvalidoTest(unittest.TestCase):
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

    def test_resumo_to_dict_formata_erro(self):
        resumo = ResumoIngestao(
            status='error',
            code='INVALID_ANALYTICS_PAYLOAD',
            message='x',
            erros=['id_registro', 'paginas'],
        )
        payload = resumo.to_dict()
        self.assertEqual(payload['status'], 'error')
        self.assertEqual(payload['code'], 'INVALID_ANALYTICS_PAYLOAD')
        self.assertEqual(payload['fields'], ['id_registro', 'paginas'])


class ServicoIngestaoResilienciaTest(unittest.TestCase):
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
