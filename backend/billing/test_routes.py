"""TDD para billing.routes — GET /billing/planos.

Testa:
  1. Status 200
  2. Retorna os 4 planos na ordem correta com as chaves certas
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from flask import Flask

from billing.routes import billing_routes_bp


def _criar_app() -> Flask:
    app = Flask(__name__)
    app.register_blueprint(billing_routes_bp)
    app.testing = True
    return app


class ListarPlanosTests(unittest.TestCase):
    def setUp(self):
        self.client = _criar_app().test_client()

    # 1. Status 200
    def test_retorna_status_200(self):
        r = self.client.get("/billing/planos")
        self.assertEqual(r.status_code, 200)

    # 2. Retorna os 4 planos na ordem correta com as chaves certas
    def test_retorna_quatro_planos_na_ordem_com_chaves_corretas(self):
        r = self.client.get("/billing/planos")
        body = r.get_json()

        self.assertIn("planos", body)
        planos = body["planos"]
        self.assertEqual(len(planos), 4)

        # Ordem canonica
        self.assertEqual([p["id"] for p in planos], ["free", "pequeno", "medio", "grande"])

        # Chaves obrigatorias em todos os planos
        chaves_esperadas = {"id", "nome", "eventos_por_dia", "eventos_por_minuto",
                            "retencao_dias", "preco_mensal"}
        for p in planos:
            self.assertEqual(set(p.keys()), chaves_esperadas, msg=f"plano {p['id']} faltando chaves")

        # Valores spot-check
        free = planos[0]
        self.assertEqual(free["id"], "free")
        self.assertEqual(free["nome"], "Free")
        self.assertEqual(free["eventos_por_dia"], 10_000)
        self.assertEqual(free["eventos_por_minuto"], 600)
        self.assertEqual(free["retencao_dias"], 7)
        self.assertIsNone(free["preco_mensal"])

        grande = planos[3]
        self.assertEqual(grande["id"], "grande")
        self.assertEqual(grande["eventos_por_dia"], 10_000_000)
        self.assertEqual(grande["retencao_dias"], 365)


if __name__ == "__main__":
    unittest.main()
