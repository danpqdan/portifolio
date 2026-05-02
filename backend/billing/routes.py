"""Blueprint Flask com rotas publicas do billing.

Endpoints:
  GET /billing/planos  — lista os 4 planos disponiveis com quotas e preco (null por ora).
  Publico (sem auth) — consumido pelo frontend para renderizar comparacao de planos.
"""

from __future__ import annotations

from flask import Blueprint, jsonify

from .plano_service import PLANO_DEFAULTS

billing_routes_bp = Blueprint("billing_routes", __name__, url_prefix="/billing")

# Ordem canonica de exibicao dos planos
_ORDEM_PLANOS = ("free", "pequeno", "medio", "grande")

# Mapa de IDs para nomes de exibicao
_NOMES = {
    "free":    "Free",
    "pequeno": "Pequeno",
    "medio":   "Médio",
    "grande":  "Grande",
}


@billing_routes_bp.route("/planos", methods=["GET"])
def listar_planos():
    """Lista os planos disponíveis com suas quotas.

    GET /billing/planos
    Publico — sem autenticacao.

    Retorna:
        {
          "planos": [
            {
              "id": "free",
              "nome": "Free",
              "eventos_por_dia": 10000,
              "eventos_por_minuto": 600,
              "retencao_dias": 7,
              "preco_mensal": null
            },
            ...
          ]
        }
    """
    planos = []
    for plano_id in _ORDEM_PLANOS:
        defaults = PLANO_DEFAULTS[plano_id]
        planos.append({
            "id": plano_id,
            "nome": _NOMES[plano_id],
            "eventos_por_dia": defaults["eventos_por_dia"],
            "eventos_por_minuto": defaults["eventos_por_minuto"],
            "retencao_dias": defaults["retencao_dias"],
            "preco_mensal": None,
        })
    return jsonify({"planos": planos}), 200
