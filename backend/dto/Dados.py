from dataclasses import dataclass
from typing import Dict, List, Optional, Union
from datetime import datetime


@dataclass
class Clique:
    """Dados de um clique do usuário"""
    x: int
    y: int
    timestamp: int  # em ms
    elemento: Optional[str] = None  # id, class ou tag


@dataclass
class Toque:
    """Dados de um toque (mobile) do usuário"""
    x: int
    y: int
    timestamp: int  # em milissegundos
    elemento: Optional[str] = None  # id, class ou tag


@dataclass
class ScrollData:
    """Dados de scroll da página"""
    timestamp: int  # em milissegundos
    scrollTop: int
    scrollPercent: int


@dataclass
class PaginaDados:
    """Estrutura de dados para cada página específica"""
    cliques: List[Clique]
    toques: List[Toque]
    scrolls: List[ScrollData]
    mouseMoves: List[Clique]  # Reutiliza a estrutura de Clique para mouseMoves
    hover: Dict[str, int]  # elemento_id: tempo em segundos
    elementosExposicao: Dict[str, int]  # elemento_id: tempo visível em segundos
    visualizacoes: int
    segundos: int
    timestamp_inicial: Optional[int] = None
    timestamp_final: Optional[int] = None


@dataclass
class HeatmapDados:
    """Estrutura principal que organiza dados por página"""
    id_registro: str
    timestamp_inicial: Optional[int] = None  # timestamp da primeira página vista
    timestamp_final: Optional[int] = None    # timestamp de quando o rastreamento parou
    home: List[PaginaDados] = None
    about: List[PaginaDados] = None
    projects: List[PaginaDados] = None

    def __post_init__(self):
        """Inicializa listas vazias se não foram fornecidas"""
        if self.home is None:
            self.home = []
        if self.about is None:
            self.about = []
        if self.projects is None:
            self.projects = []

    @classmethod
    def from_dict(cls, data: dict) -> 'HeatmapDados':
        """Cria uma instância a partir de um dicionário (JSON)"""
        # Converter dados das páginas
        home_dados = []
        if 'home' in data and data['home']:
            for pagina_data in data['home']:
                home_dados.append(cls._convert_pagina_dados(pagina_data))

        about_dados = []
        if 'about' in data and data['about']:
            for pagina_data in data['about']:
                about_dados.append(cls._convert_pagina_dados(pagina_data))

        projects_dados = []
        if 'projects' in data and data['projects']:
            for pagina_data in data['projects']:
                projects_dados.append(cls._convert_pagina_dados(pagina_data))

        return cls(
            id_registro=data.get('id_registro', ''),
            timestamp_inicial=data.get('timestamp_inicial'),
            timestamp_final=data.get('timestamp_final'),
            home=home_dados,
            about=about_dados,
            projects=projects_dados
        )

    @staticmethod
    def _convert_pagina_dados(data: dict) -> PaginaDados:
        """Converte dicionário para PaginaDados"""
        # Converter cliques
        cliques = []
        if 'cliques' in data:
            for clique_data in data['cliques']:
                cliques.append(Clique(
                    x=clique_data.get('x', 0),
                    y=clique_data.get('y', 0),
                    timestamp=clique_data.get('timestamp', 0),
                    elemento=clique_data.get('elemento')
                ))

        # Converter toques
        toques = []
        if 'toques' in data:
            for toque_data in data['toques']:
                toques.append(Toque(
                    x=toque_data.get('x', 0),
                    y=toque_data.get('y', 0),
                    timestamp=toque_data.get('timestamp', 0),
                    elemento=toque_data.get('elemento')
                ))

        # Converter scrolls
        scrolls = []
        if 'scrolls' in data:
            for scroll_data in data['scrolls']:
                scrolls.append(ScrollData(
                    timestamp=scroll_data.get('timestamp', 0),
                    scrollTop=scroll_data.get('scrollTop', 0),
                    scrollPercent=scroll_data.get('scrollPercent', 0)
                ))

        # Converter mouseMoves
        mouse_moves = []
        if 'mouseMoves' in data:
            for move_data in data['mouseMoves']:
                mouse_moves.append(Clique(
                    x=move_data.get('x', 0),
                    y=move_data.get('y', 0),
                    timestamp=move_data.get('timestamp', 0),
                    elemento=move_data.get('elemento')
                ))

        return PaginaDados(
            cliques=cliques,
            toques=toques,
            scrolls=scrolls,
            mouseMoves=mouse_moves,
            hover=data.get('hover', {}),
            elementosExposicao=data.get('elementosExposicao', {}),
            visualizacoes=data.get('visualizacoes', 0),
            segundos=data.get('segundos', 0),
            timestamp_inicial=data.get('timestamp_inicial'),
            timestamp_final=data.get('timestamp_final')
        )

    def to_dict(self) -> dict:
        """Converte a instância para um dicionário (para JSON)"""
        return {
            'id_registro': self.id_registro,
            'timestamp_inicial': self.timestamp_inicial,
            'timestamp_final': self.timestamp_final,
            'home': [self._pagina_dados_to_dict(pagina) for pagina in self.home],
            'about': [self._pagina_dados_to_dict(pagina) for pagina in self.about],
            'projects': [self._pagina_dados_to_dict(pagina) for pagina in self.projects]
        }

    @staticmethod
    def _pagina_dados_to_dict(pagina: PaginaDados) -> dict:
        """Converte PaginaDados para dicionário"""
        return {
            'cliques': [
                {
                    'x': clique.x,
                    'y': clique.y,
                    'timestamp': clique.timestamp,
                    'elemento': clique.elemento
                } for clique in pagina.cliques
            ],
            'toques': [
                {
                    'x': toque.x,
                    'y': toque.y,
                    'timestamp': toque.timestamp,
                    'elemento': toque.elemento
                } for toque in pagina.toques
            ],
            'scrolls': [
                {
                    'timestamp': scroll.timestamp,
                    'scrollTop': scroll.scrollTop,
                    'scrollPercent': scroll.scrollPercent
                } for scroll in pagina.scrolls
            ],
            'mouseMoves': [
                {
                    'x': move.x,
                    'y': move.y,
                    'timestamp': move.timestamp,
                    'elemento': move.elemento
                } for move in pagina.mouseMoves
            ],
            'hover': pagina.hover,
            'elementosExposicao': pagina.elementosExposicao,
            'visualizacoes': pagina.visualizacoes,
            'segundos': pagina.segundos,
            'timestamp_inicial': pagina.timestamp_inicial,
            'timestamp_final': pagina.timestamp_final
        }

    def get_total_visualizacoes(self) -> int:
        """Retorna o total de visualizações em todas as páginas"""
        total = 0
        for pagina in self.home + self.about + self.projects:
            total += pagina.visualizacoes
        return total

    def get_total_cliques(self) -> int:
        """Retorna o total de cliques em todas as páginas"""
        total = 0
        for pagina in self.home + self.about + self.projects:
            total += len(pagina.cliques)
        return total

    def get_total_tempo_segundos(self) -> int:
        """Retorna o tempo total gasto em todas as páginas"""
        total = 0
        for pagina in self.home + self.about + self.projects:
            total += pagina.segundos
        return total

    def get_duracao_sessao_ms(self) -> Optional[int]:
        """Retorna a duração total da sessão em milissegundos"""
        if self.timestamp_inicial and self.timestamp_final:
            return self.timestamp_final - self.timestamp_inicial
        return None

    def get_duracao_sessao_segundos(self) -> Optional[float]:
        """Retorna a duração total da sessão em segundos"""
        duracao_ms = self.get_duracao_sessao_ms()
        if duracao_ms:
            return duracao_ms / 1000
        return None
