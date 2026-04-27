"""Cache TTL de `site_id -> bucket_name` para roteamento de ingest.

Evita 1 query Postgres por evento. TTL default 5 minutos; chamadas a
`invalidar(site_id)` apos provisionamento manual liberam a entrada
obsoleta sem esperar o TTL. Thread-safe (Socket.IO eventlet usa greenlets,
mas escritas sao atomicas em CPython e o lock cobre a logica composta).
"""
from __future__ import annotations

import threading
import time
from typing import Optional, Protocol


class _RepoLike(Protocol):
    def obter_site(self, site_id: str): ...


class SitesCache:
    """Cache TTL para resolver bucket_name a partir do site_id."""

    def __init__(self, repo: _RepoLike, *, ttl_seconds: int = 300):
        self._repo = repo
        self._ttl = ttl_seconds
        self._lock = threading.RLock()
        # entry = (timestamp_monotonic, bucket_name | None)
        self._cache: dict[str, tuple[float, Optional[str]]] = {}

    def obter_bucket(self, site_id: Optional[str]) -> Optional[str]:
        """Retorna bucket_name do site (ou None se site nao tem bucket atribuido)."""
        if not site_id:
            return None
        now = time.monotonic()
        with self._lock:
            entry = self._cache.get(site_id)
            if entry is not None and (now - entry[0]) < self._ttl:
                return entry[1]
        # miss: consulta repo fora do lock pra nao prender outras greenlets.
        site = self._repo.obter_site(site_id)
        bucket = site.bucket_name if site else None
        with self._lock:
            self._cache[site_id] = (time.monotonic(), bucket)
        return bucket

    def invalidar(self, site_id: str) -> None:
        with self._lock:
            self._cache.pop(site_id, None)

    def limpar(self) -> None:
        with self._lock:
            self._cache.clear()
