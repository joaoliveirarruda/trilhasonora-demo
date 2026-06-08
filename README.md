# Trilha Sonora — demo

**URL pública:** <https://joaoliveirarruda.github.io/trilhaflix-demo/>

Demo navegável do mini-projeto de Python Básico do Trilha — um catálogo
fictício de streaming musical com 60 conteúdos e 33 playlists. A página
roda 100% no browser via [Pyodide](https://pyodide.org) e
[xterm.js](https://xtermjs.org).

## Como funciona

- A classe `Catalogo` (em `solucao/catalogo.py`) é a implementação de
  referência das 12 operações prescritas no `ENUNCIADO.md` do projeto.
- O loop de menu interativo é implementado em `app.js` (JavaScript), que
  chama os métodos da `Catalogo` via Pyodide.
- O catálogo carregado é o `catalogo_dev.json` (60 conteúdos). No projeto
  real os alunos trabalham também com `catalogo_final.json` (20 000).

## Rodar local

```bash
git clone <este-repo>
cd trilhaflix-demo
python3 -m http.server 8765
open http://localhost:8765
```

`file://` não funciona (CORS + fetch); precisa de um HTTP server.

## Atualizar o catálogo

```bash
cp ../trilhaflix_fundacao/catalogo_dev.json .
```

Ou regenerando com seed específica:

```bash
python3 ../trilhaflix_fundacao/gerador.py --conteudos 60 --saida catalogo_dev.json --seed 2026
```

## Atualizar a implementação de referência

Se `gerar_consultas.py` no projeto principal mudar (regras canônicas novas,
etc.), atualize `solucao/catalogo.py` em paralelo. O smoke test do
`README_EQUIPE.md` do projeto principal é a fonte da verdade.

## Deploy

GitHub Pages servindo o branch `main` na raiz. Push pra `main` = atualiza
a demo.
