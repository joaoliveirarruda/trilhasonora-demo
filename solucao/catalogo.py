"""Implementação de referência da classe Catalogo da TrilhaFlix.

Usada pela demo pública. Casa 100% com as regras canônicas listadas
no ENUNCIADO.md do projeto principal.
"""
import collections
import json


class Catalogo:
    def __init__(self, caminho_json):
        with open(caminho_json, encoding="utf-8") as arquivo:
            self._dados = json.load(arquivo)

        self._por_id = {c["id"]: c for c in self._dados["conteudos"]}

        self._por_genero = {}
        for c in self._dados["conteudos"]:
            for g in self._achatar_generos(c["generos"]):
                self._por_genero.setdefault(g, []).append(c["id"])
        for ids in self._por_genero.values():
            ids.sort()

        self._usuario_por_id = {u["id"]: u for u in self._dados["usuarios"]}
        # Index lowercased -> case-insensitive lookup em O(1). O nome
        # "display" continua intacto em u["nome"].
        self._usuario_por_nome = {u["nome"].lower(): u for u in self._dados["usuarios"]}

        self._fila = collections.deque()

    # --- Métodos prescritos pelo ENUNCIADO ---

    def buscar_usuario_por_nome(self, nome):
        u = self._usuario_por_nome.get(nome.lower())
        return u["id"] if u else None

    def listar_usuarios(self):
        return sorted(u["nome"] for u in self._dados["usuarios"])

    def playlist_de(self, usuario_id):
        u = self._usuario_por_id.get(usuario_id)
        return list(u["playlist"]) if u else None

    def conteudo_na_posicao(self, usuario_id, pos):
        u = self._usuario_por_id.get(usuario_id)
        if u is None:
            return None
        if 0 <= pos < len(u["playlist"]):
            return u["playlist"][pos]
        return None

    def intersecao_playlists(self, usuario_ids):
        conjuntos = []
        for uid in usuario_ids:
            u = self._usuario_por_id.get(uid)
            if u is None:
                return []
            conjuntos.append(set(u["playlist"]))
        return sorted(set.intersection(*conjuntos))

    def rating_de(self, conteudo_id):
        c = self._por_id.get(conteudo_id)
        if c is None or "rating" not in c:
            return None
        return float(c["rating"])

    def duracao_total_de(self, conteudo_id):
        c = self._por_id.get(conteudo_id)
        if c is None:
            return None
        if c["tipo"] == "musica":
            return c["duracao_seg"]
        total = 0
        for f in c["faixas"]:
            if f["duracao_seg"] is not None:
                total += f["duracao_seg"]
        return total

    def generos_de(self, conteudo_id):
        c = self._por_id.get(conteudo_id)
        if c is None:
            return None
        return sorted(self._achatar_generos(c["generos"]))

    def plataformas_de(self, conteudo_id):
        c = self._por_id.get(conteudo_id)
        if c is None:
            return None
        return sorted(c["plataformas"])

    def data_adicionado_de(self, conteudo_id):
        c = self._por_id.get(conteudo_id)
        if c is None:
            return None
        d = c["data_adicionado"]
        if "/" in d:
            dia, mes, ano = d.split("/")
            return f"{ano}-{mes}-{dia}"
        return d

    def execucoes_de(self, conteudo_id):
        c = self._por_id.get(conteudo_id)
        if c is None:
            return None
        ex = c["engajamento"]["execucoes"]
        if isinstance(ex, str):
            return int(ex.replace(",", ""))
        return ex

    def conteudos_do_genero(self, genero):
        return list(self._por_genero.get(genero, []))

    # --- Fila de reprodução (estado mutável) ---

    def enfileirar(self, conteudo_id):
        if conteudo_id not in self._por_id:
            return False
        self._fila.append(conteudo_id)
        return True

    def proximo(self):
        return self._fila.popleft() if self._fila else None

    def fila_atual(self):
        return list(self._fila)

    # --- Helpers de exibição usados pela CLI ---

    def descricao_curta(self, conteudo_id):
        """Ex.: 'Cruel Summer — Taylor Swift (música)'."""
        c = self._por_id.get(conteudo_id)
        if c is None:
            return None
        rotulo = "música" if c["tipo"] == "musica" else "álbum"
        return f"{c['titulo']} — {c['artista']} ({rotulo})"

    def nome_do_usuario(self, usuario_id):
        u = self._usuario_por_id.get(usuario_id)
        return u["nome"] if u else None

    def tipo_de(self, conteudo_id):
        c = self._por_id.get(conteudo_id)
        return c["tipo"] if c else None

    # --- Privado ---

    @staticmethod
    def _achatar_generos(g):
        if isinstance(g, str):
            return [g]
        saida, pilha = [], [g]
        while pilha:
            x = pilha.pop()
            if isinstance(x, list):
                pilha.extend(x)
            else:
                saida.append(x)
        return saida
