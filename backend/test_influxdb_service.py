"""Tests pra construcao de Points InfluxDB via InfluxDBService.

Schema 1.2 (SDK v0.4): user_bucket / group_bucket viram TAG (cardinalidade
controlada, 256 bins) e user_id / group_id viram FIELD (cardinalidade zero,
exibicao). Decisao D1 opcao C — ver memoria.

Stratery: stub do write_api captura o Point antes de ir pra rede.
Inspecionamos `_tags` / `_fields` (atributos publicos da lib influxdb-client).
"""
from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timezone

sys.path.append(os.path.dirname(__file__))

from influxdb_service import (
    CustomEventMetric,
    InfluxDBService,
    TemporalMetric,
    WebVitalMetric,
)


class StubWriteApi:
    """Captura `write(bucket, record)` para inspecao em teste."""

    def __init__(self):
        self.chamadas = []

    def write(self, bucket, record):
        self.chamadas.append((bucket, record))


def _servico_stub() -> InfluxDBService:
    """Cria InfluxDBService sem conectar — flip enabled + write_api stub."""
    s = InfluxDBService(url="http://test", token="t", org="o",
                        bucket="default", enabled=False)
    s.enabled = True
    s.write_api = StubWriteApi()
    return s


def _metric_temporal(**overrides) -> TemporalMetric:
    base = dict(
        session_id="s1",
        page_type="/",
        permanencia_segundos=5.0,
        visualizacoes=1,
        timestamp=datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc),
        app_id="acme",
        ambiente="production",
    )
    base.update(overrides)
    return TemporalMetric(**base)


def _metric_web_vital(**overrides) -> WebVitalMetric:
    base = dict(
        session_id="s1",
        page_type="/",
        nome="LCP",
        valor=1800.0,
        timestamp=datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc),
        app_id="acme",
        ambiente="production",
    )
    base.update(overrides)
    return WebVitalMetric(**base)


def _metric_custom(**overrides) -> CustomEventMetric:
    base = dict(
        session_id="s1",
        page_type="/",
        nome="botao",
        propriedades={},
        timestamp=datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc),
        app_id="acme",
        ambiente="production",
    )
    base.update(overrides)
    return CustomEventMetric(**base)


# =============================================================
# TemporalMetric -> Point page_analytics
# =============================================================

class TemporalMetricPointTests(unittest.TestCase):

    def test_user_bucket_vai_pra_tag(self):
        s = _servico_stub()
        m = _metric_temporal(user_id="u-42", user_bucket="b042")
        ok = s.write_temporal_metrics(m)
        self.assertTrue(ok)
        _, point = s.write_api.chamadas[0]
        self.assertEqual(point._tags.get("user_bucket"), "b042")

    def test_user_id_vai_pra_field_nao_tag(self):
        # Anti-cardinality-explosion: user_id NAO pode ser tag em InfluxDB OSS.
        s = _servico_stub()
        m = _metric_temporal(user_id="u-42", user_bucket="b042")
        s.write_temporal_metrics(m)
        _, point = s.write_api.chamadas[0]
        self.assertNotIn("user_id", point._tags)
        self.assertEqual(point._fields.get("user_id"), "u-42")

    def test_group_bucket_e_id_simetricos_a_user(self):
        s = _servico_stub()
        m = _metric_temporal(group_id="acme-corp", group_bucket="b201")
        s.write_temporal_metrics(m)
        _, point = s.write_api.chamadas[0]
        self.assertEqual(point._tags.get("group_bucket"), "b201")
        self.assertEqual(point._fields.get("group_id"), "acme-corp")
        self.assertNotIn("group_id", point._tags)

    def test_sem_identidade_nao_adiciona_tag_nem_field(self):
        # Crucial: ausencia de user_id nao pode virar tag "None" ou field "".
        # Garante forward-compat com Pontos antigos (queries Flux com r.user_bucket
        # filtram com `exists` semantica).
        s = _servico_stub()
        m = _metric_temporal()  # sem user_id/group_id
        s.write_temporal_metrics(m)
        _, point = s.write_api.chamadas[0]
        self.assertNotIn("user_bucket", point._tags)
        self.assertNotIn("group_bucket", point._tags)
        self.assertNotIn("user_id", point._fields)
        self.assertNotIn("group_id", point._fields)


# =============================================================
# WebVitalMetric -> Point web_vitals
# =============================================================

class WebVitalPointTests(unittest.TestCase):

    def test_user_bucket_vai_pra_tag(self):
        s = _servico_stub()
        m = _metric_web_vital(user_id="u-perf", user_bucket="b100")
        s.write_web_vital(m)
        _, point = s.write_api.chamadas[0]
        self.assertEqual(point._tags.get("user_bucket"), "b100")
        self.assertEqual(point._fields.get("user_id"), "u-perf")
        self.assertNotIn("user_id", point._tags)

    def test_sem_identidade_omite(self):
        s = _servico_stub()
        s.write_web_vital(_metric_web_vital())
        _, point = s.write_api.chamadas[0]
        self.assertNotIn("user_bucket", point._tags)
        self.assertNotIn("user_id", point._fields)


# =============================================================
# CustomEventMetric -> Point custom_events
# =============================================================

class CustomEventPointTests(unittest.TestCase):

    def test_user_bucket_e_group_simetricos(self):
        s = _servico_stub()
        m = _metric_custom(
            user_id="u-buy", user_bucket="b007",
            group_id="org-z", group_bucket="b212",
        )
        s.write_custom_event(m)
        _, point = s.write_api.chamadas[0]
        self.assertEqual(point._tags.get("user_bucket"), "b007")
        self.assertEqual(point._tags.get("group_bucket"), "b212")
        self.assertEqual(point._fields.get("user_id"), "u-buy")
        self.assertEqual(point._fields.get("group_id"), "org-z")

    def test_propriedades_continuam_funcionando(self):
        # Regression: nao quebrar fluxo existente de propriedades por evento.
        s = _servico_stub()
        m = _metric_custom(propriedades={"button": "comprar"})
        s.write_custom_event(m)
        _, point = s.write_api.chamadas[0]
        self.assertEqual(point._fields.get("prop_button"), "comprar")


if __name__ == "__main__":
    unittest.main()
