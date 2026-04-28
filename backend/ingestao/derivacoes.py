"""Derivacoes server-side de tags (sec 20 do dashboard-cliente.md).

Por que server-side e nao no SDK:
  - Confianca: cliente nao pode falsificar device_type ou pais.
  - Cardinalidade controlada: bucket finito (mobile/tablet/desktop/bot/unknown
    em vez de string livre).
  - Deduplicacao: dominios canonicos (`acme.com` vez de `https://acme.com:443/path`).

Funcoes puras — nao tem efeito colateral, fazem parse simples. Sem deps novas.

`pais` vem do header CF-IPCountry (Cloudflare injeta em prod). Em dev,
sem CF na frente, devolvemos 'unknown' — nao tentamos GeoIP local pra
nao puxar dependencia (MaxMind ~70MB).
"""
from __future__ import annotations

import re
from typing import Optional
from urllib.parse import urlparse


# --------------------- device_type ---------------------

# Padroes ordenados por especificidade — primeiro match vence.
_PADRAO_BOT = re.compile(
    r"\b(?:bot|crawler|spider|slurp|googlebot|bingbot|yandexbot|baiduspider|"
    r"duckduckbot|facebot|facebookexternalhit|twitterbot|linkedinbot|whatsapp|"
    r"telegrambot|applebot|pingdom|uptimerobot|monitor|headlesschrome|phantomjs|"
    r"selenium|chromedriver|playwright|cypress|axios|python-requests|curl/|"
    r"wget/|java/|go-http-client|httpie)\b",
    re.IGNORECASE,
)

# Tablets vem ANTES de mobile — ipad/android-tablet sao os maiores casos
# que tem 'mobile' tambem no UA. Ordem importa.
_PADRAO_TABLET = re.compile(
    r"\b(?:ipad|tablet|kindle|silk|nook|playbook|"
    r"sm-t\d+|gt-p\d+)\b",  # samsung tablets
    re.IGNORECASE,
)

_PADRAO_MOBILE = re.compile(
    r"\b(?:mobile|iphone|ipod|android|blackberry|opera mini|opera mobi|"
    r"webos|symbian|windows phone)\b",
    re.IGNORECASE,
)


def detectar_device_type(user_agent: Optional[str]) -> str:
    """mobile | tablet | desktop | bot | unknown."""
    if not user_agent:
        return "unknown"
    ua = user_agent.strip()
    if not ua:
        return "unknown"
    if _PADRAO_BOT.search(ua):
        return "bot"
    # tablet antes de mobile (alguns UA tem ambos)
    if _PADRAO_TABLET.search(ua):
        return "tablet"
    if _PADRAO_MOBILE.search(ua):
        return "mobile"
    # User-Agent presente sem nenhum sinal de mobile/bot -> desktop.
    return "desktop"


# --------------------- referrer_dominio ---------------------

def extrair_referrer_dominio(referer: Optional[str]) -> str:
    """`https://google.com/search?q=x` -> `google.com`. Vazio/invalido -> 'direto'.

    Convencao: 'direto' significa visita sem referer (digitou URL, bookmark,
    abriu nova aba). Util pra dashboard de aquisicao.
    """
    if not referer:
        return "direto"
    referer = referer.strip()
    if not referer:
        return "direto"
    try:
        parsed = urlparse(referer)
    except Exception:
        return "invalido"
    host = (parsed.hostname or "").lower()
    if not host:
        return "invalido"
    # Strip de "www." pra unificar `www.google.com` e `google.com`.
    if host.startswith("www."):
        host = host[4:]
    return host or "direto"


# --------------------- pais ---------------------

# Whitelist defensiva — Cloudflare retorna codigos ISO 3166-1 alpha-2 (2 letras
# maiusculas). Tambem usa 'XX' para "desconhecido" e 'T1' para Tor. Aceitamos
# qualquer string de 2 letras por simplicidade — o tracker de cardinalidade
# segura volume excessivo.
_RE_PAIS = re.compile(r"^[A-Z]{2}$|^XX$|^T1$")


def extrair_pais(cf_ipcountry: Optional[str]) -> str:
    """Codigo de pais ISO-2 do header CF-IPCountry. 'unknown' fora de prod."""
    if not cf_ipcountry:
        return "unknown"
    valor = cf_ipcountry.strip().upper()
    if not valor or not _RE_PAIS.match(valor):
        return "unknown"
    return valor
