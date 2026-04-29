"""Camada de servico de sessao e magic-link para o dashboard do cliente.

Encapsula a politica de negocio em cima de `ClientesUsersRepo`:
  - geracao de token plaintext 32B + armazenamento so do hash sha256
  - validacao de cookie (expirou? revogado? existe?)
  - rate-limit de emissao de magic-link (por user e por IP)
  - hashing de senha via werkzeug.security (pbkdf2:sha256)

Nao toca Flask. Recebe ClientesUsersRepo + instanciar com parametros de TTL
e limites de rate-limit, permite customizar em testes.

Referencia: ark/docs/dashboard-cliente.md (secoes 7, 8, 9).
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from werkzeug.security import check_password_hash, generate_password_hash

from .clientes_users_repo import (
    ClienteUser,
    ClientesUsersRepo,
    MagicLink,
    Sessao,
    hash_token,
    normalizar_email,
)


TOKEN_BYTES = 32  # 256-bit — secrets.token_urlsafe(32) -> ~43 chars


@dataclass(frozen=True)
class SessaoCriada:
    cookie_plaintext: str
    sessao: Sessao


@dataclass(frozen=True)
class MagicLinkCriado:
    token_plaintext: str
    magic_link: MagicLink


class RateLimitExcedido(Exception):
    """Cliente pediu magic-links demais num curto intervalo."""


class SessaoService:
    def __init__(
        self,
        repo: ClientesUsersRepo,
        *,
        sessao_ttl_segundos: int = 7 * 24 * 3600,        # 7 dias
        magic_link_ttl_segundos: int = 15 * 60,          # 15 min
        max_magic_links_por_user: int = 3,
        max_magic_links_por_ip: int = 10,
        janela_rate_limit_segundos: int = 15 * 60,       # 15 min
    ):
        self._repo = repo
        self._sessao_ttl = sessao_ttl_segundos
        self._magic_ttl = magic_link_ttl_segundos
        self._max_magic_user = max_magic_links_por_user
        self._max_magic_ip = max_magic_links_por_ip
        self._janela = janela_rate_limit_segundos

    # ---------- users ----------

    def criar_user(self, site_id: str, email: str, *, papel: str = "viewer",
                   senha: Optional[str] = None) -> ClienteUser:
        senha_hash = generate_password_hash(senha) if senha else None
        return self._repo.criar_user(site_id, email, papel=papel, senha_hash=senha_hash)

    def autenticar_por_senha(self, email: str, senha: str) -> Optional[ClienteUser]:
        user = self._repo.obter_user_por_email(email)
        if user is None or not user.ativo or user.senha_hash is None:
            return None
        if not check_password_hash(user.senha_hash, senha):
            return None
        self._repo.registrar_login(user.id)
        return user

    # ---------- sessoes ----------

    def criar_sessao(self, user_id: str, *, ip: Optional[str] = None,
                     user_agent: Optional[str] = None) -> SessaoCriada:
        cookie_plaintext = secrets.token_urlsafe(TOKEN_BYTES)
        token_hash_ = hash_token(cookie_plaintext)
        expira_em = datetime.now(timezone.utc) + timedelta(seconds=self._sessao_ttl)
        sessao = self._repo.criar_sessao(
            user_id, token_hash_, expira_em=expira_em, ip=ip, user_agent=user_agent,
        )
        return SessaoCriada(cookie_plaintext=cookie_plaintext, sessao=sessao)

    def validar_cookie(self, cookie_plaintext: str) -> Optional[ClienteUser]:
        """Valida cookie e retorna o user correspondente; None se invalido/expirado/revogado/user inativo."""
        if not cookie_plaintext:
            return None
        sessao = self._repo.obter_sessao_por_hash(hash_token(cookie_plaintext))
        if sessao is None:
            return None
        if sessao.revogada_em is not None:
            return None
        agora = datetime.now(timezone.utc)
        expira = sessao.expira_em
        if expira.tzinfo is None:
            expira = expira.replace(tzinfo=timezone.utc)
        if expira <= agora:
            return None
        user = self._repo.obter_user(sessao.user_id)
        if user is None or not user.ativo:
            return None
        return user

    def revogar_sessao(self, cookie_plaintext: str) -> None:
        self._repo.revogar_sessao(hash_token(cookie_plaintext))

    # ---------- magic-links ----------

    def solicitar_magic_link(
        self, email: str, *, ip: Optional[str] = None,
    ) -> Optional[MagicLinkCriado]:
        """Gera magic-link se o email existir e rate-limit permitir.

        Retorna `None` se o email nao existe (para nao vazar existencia — o
        endpoint sempre responde 200). Se rate-limit estourar, levanta
        `RateLimitExcedido` — o endpoint deve traduzir em 200 ok mas nao
        enviar email (ou retornar 429 dependendo da politica).
        """
        user = self._repo.obter_user_por_email(email)
        if user is None or not user.ativo:
            return None

        # rate-limit por user
        qtd_user = self._repo.contar_magic_links_recentes(user.id, self._janela)
        if qtd_user >= self._max_magic_user:
            raise RateLimitExcedido(f"max_por_user={self._max_magic_user}")

        # rate-limit por IP (apenas se IP conhecido)
        if ip:
            qtd_ip = self._repo.contar_magic_links_por_ip(ip, self._janela)
            if qtd_ip >= self._max_magic_ip:
                raise RateLimitExcedido(f"max_por_ip={self._max_magic_ip}")

        token_plaintext = secrets.token_urlsafe(TOKEN_BYTES)
        token_hash_ = hash_token(token_plaintext)
        expira_em = datetime.now(timezone.utc) + timedelta(seconds=self._magic_ttl)
        magic = self._repo.criar_magic_link(user.id, token_hash_, expira_em=expira_em, ip=ip)
        return MagicLinkCriado(token_plaintext=token_plaintext, magic_link=magic)

    def consumir_magic_link(
        self, token_plaintext: str, *, ip: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Optional[SessaoCriada]:
        """Consome magic-link e cria sessao. `None` se token invalido/expirado/ja consumido."""
        if not token_plaintext:
            return None
        token_hash_ = hash_token(token_plaintext)
        magic = self._repo.obter_magic_link_por_hash(token_hash_)
        if magic is None or magic.consumido_em is not None:
            return None

        expira = magic.expira_em
        if expira.tzinfo is None:
            expira = expira.replace(tzinfo=timezone.utc)
        if expira <= datetime.now(timezone.utc):
            return None

        # atomico: so prossegue se consumir realmente marcou o link
        if not self._repo.consumir_magic_link(token_hash_):
            return None

        self._repo.registrar_login(magic.user_id)
        return self.criar_sessao(magic.user_id, ip=ip, user_agent=user_agent)


# Exposto para teste / utilidades administrativas
__all__ = [
    "SessaoService",
    "SessaoCriada",
    "MagicLinkCriado",
    "RateLimitExcedido",
    "TOKEN_BYTES",
]
