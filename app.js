const statusEl = document.getElementById("status");
const statusLabelEl = statusEl.querySelector(".status__label");
const termEl = document.getElementById("terminal");

const term = new Terminal({
  fontSize: 14,
  fontFamily: 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, monospace',
  theme: {
    background: "#0B1230",     // navy do Trilha
    foreground: "#FAF6EE",     // cream do Trilha
    cursor: "#00C463",         // verde Trilha
    cursorAccent: "#0B1230",
    selectionBackground: "rgba(0, 196, 99, 0.30)",
    brightBlack: "#5b6489",
  },
  cursorBlink: true,
  convertEol: true,
  scrollback: 2000,
});
const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open(termEl);
fitAddon.fit();
window.addEventListener("resize", () => fitAddon.fit());

// Mouse wheel sobre o container do terminal scrolla o buffer do xterm
termEl.addEventListener("wheel", (e) => {
  if (e.deltaY === 0) return;
  const linhas = Math.sign(e.deltaY) * 3;
  term.scrollLines(linhas);
  e.preventDefault();
}, { passive: false });

function setStatus(text, kind = "loading") {
  statusLabelEl.textContent = text;
  statusEl.className = `status status--${kind}`;
}

async function fetchText(url) {
  // cache-bust pra evitar que o browser sirva catalogo.py/json antigos
  const sep = url.includes("?") ? "&" : "?";
  const r = await fetch(`${url}${sep}v=${Date.now()}`);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return await r.text();
}

async function bootstrap() {
  setStatus("Carregando Python no browser… (~10MB na primeira visita)");
  const pyodide = await loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
  });

  setStatus("Carregando catálogo…");
  const catalogoPy = await fetchText("solucao/catalogo.py");
  const catalogoJson = await fetchText("catalogo_dev.json");
  pyodide.FS.writeFile("/catalogo.py", catalogoPy);
  pyodide.FS.writeFile("/catalogo_dev.json", catalogoJson);
  pyodide.runPython(`
import sys
sys.path.insert(0, "/")
from catalogo import Catalogo
catalogo = Catalogo("/catalogo_dev.json")
`);

  setStatus("Pronto", "ready");
  return pyodide;
}

// --- Leitor de linha do xterm ---

let resolveLine = null;
let lineBuffer = "";

term.onData((data) => {
  if (resolveLine === null) return;       // ignora teclas fora do prompt
  for (const ch of data) {
    const code = ch.charCodeAt(0);
    if (code === 13) {                    // Enter
      term.write("\r\n");
      const line = lineBuffer;
      lineBuffer = "";
      const r = resolveLine;
      resolveLine = null;
      r(line);
      return;
    }
    if (code === 127 || code === 8) {     // backspace / DEL
      if (lineBuffer.length > 0) {
        lineBuffer = lineBuffer.slice(0, -1);
        term.write("\b \b");
      }
      continue;
    }
    if (code < 32) continue;              // ignora outros controles
    lineBuffer += ch;
    term.write(ch);
  }
});

function lerLinha(prompt) {
  term.write(prompt);
  return new Promise((resolve) => { resolveLine = resolve; });
}

// --- Chamadas à Catalogo (via Pyodide) ---

function py(pyodide) {
  const cat = pyodide.globals.get("catalogo");
  const toJS = (v) => v && typeof v.toJs === "function" ? v.toJs() : v;
  const call = (m, ...args) => toJS(cat[m](...args));
  return {
    buscar_usuario_por_nome: (nome) => call("buscar_usuario_por_nome", nome),
    listar_usuarios: () => call("listar_usuarios"),
    playlist_de: (uid) => call("playlist_de", uid),
    conteudo_na_posicao: (uid, pos) => call("conteudo_na_posicao", uid, pos),
    intersecao_playlists: (uids) => call("intersecao_playlists", pyodide.toPy(uids)),
    rating_de: (id) => call("rating_de", id),
    duracao_total_de: (id) => call("duracao_total_de", id),
    generos_de: (id) => call("generos_de", id),
    plataformas_de: (id) => call("plataformas_de", id),
    data_adicionado_de: (id) => call("data_adicionado_de", id),
    execucoes_de: (id) => call("execucoes_de", id),
    conteudos_do_genero: (g) => call("conteudos_do_genero", g),
    enfileirar: (id) => call("enfileirar", id),
    proximo: () => call("proximo"),
    fila_atual: () => call("fila_atual"),
    descricao_curta: (id) => call("descricao_curta", id),
    nome_do_usuario: (uid) => call("nome_do_usuario", uid),
    tipo_de: (id) => call("tipo_de", id),
  };
}

// --- Formatadores ---

function fmtDuracao(seg) {
  if (seg == null) return "—";
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}m${s.toString().padStart(2, "0")}s`;
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

function fmtNumero(n) {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR");
}

// --- ANSI helpers (paleta Trilha) ---
const ANSI = {
  reset:  "\x1b[0m",
  green:  "\x1b[38;2;0;196;99m",       // primary
  greenB: "\x1b[1;38;2;0;196;99m",
  cream:  "\x1b[38;2;250;246;238m",
  muted:  "\x1b[38;2;194;201;220m",
  dim:    "\x1b[38;2;130;138;165m",
  red:    "\x1b[38;2;255;100;110m",
};

// --- Handlers de cada opção do menu ---

async function lerUsuarioPorNome(api, prompt = "Nome do usuário: ") {
  const nome = (await lerLinha(prompt)).trim();
  if (!nome) { term.writeln(`${ANSI.red}Nome vazio.${ANSI.reset}`); return null; }
  const uid = api.buscar_usuario_por_nome(nome);
  if (uid === null) {
    term.writeln(`${ANSI.red}Usuário "${nome}" não encontrado.${ANSI.reset}`);
    return null;
  }
  return { nome, uid };
}

async function opVerPlaylist(api) {
  const u = await lerUsuarioPorNome(api);
  if (!u) return;
  const playlist = api.playlist_de(u.uid);
  term.writeln(`Playlist de ${ANSI.green}${u.nome}${ANSI.reset} (${playlist.length} itens):`);
  for (let i = 0; i < playlist.length; i++) {
    term.writeln(`  ${(i + 1).toString().padStart(2)}. ${api.descricao_curta(playlist[i])}`);
  }
}

async function opConteudoNaPosicao(api) {
  const u = await lerUsuarioPorNome(api);
  if (!u) return;
  const tamanho = api.playlist_de(u.uid).length;
  term.writeln(`Playlist de ${ANSI.green}${u.nome}${ANSI.reset} tem ${ANSI.green}${tamanho}${ANSI.reset} itens (posições 0 a ${tamanho - 1}).`);
  const posStr = (await lerLinha("Posição (começando em 0): ")).trim();
  const pos = parseInt(posStr, 10);
  if (Number.isNaN(pos)) { term.writeln("Posição inválida."); return; }
  const cid = api.conteudo_na_posicao(u.uid, pos);
  if (cid === null) term.writeln("Posição fora do range da playlist.");
  else              term.writeln(`Posição ${pos} de ${ANSI.green}${u.nome}${ANSI.reset}: ${api.descricao_curta(cid)}`);
}

async function opIntersecao(api) {
  const raw = await lerLinha("Nomes dos usuários separados por vírgula (ex.: Nicholas, Uchoa): ");
  const nomes = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (nomes.length < 2) { term.writeln("Informe pelo menos 2 usuários."); return; }
  const uids = [];
  for (const nome of nomes) {
    const uid = api.buscar_usuario_por_nome(nome);
    if (uid === null) {
      term.writeln(`${ANSI.red}Usuário "${nome}" não encontrado.${ANSI.reset}`);
      return;
    }
    uids.push(uid);
  }
  const ids = api.intersecao_playlists(uids);
  if (ids.length === 0) {
    term.writeln("Sem interseção.");
    return;
  }
  term.writeln(`Interseção (${ANSI.green}${ids.length}${ANSI.reset} conteúdos):`);
  for (const cid of ids) term.writeln(`  - ${api.descricao_curta(cid)} (${cid})`);
}

async function opDadosDoConteudo(api) {
  const cid = (await lerLinha("ID do conteúdo (ex.: t000000): ")).trim();
  const desc = api.descricao_curta(cid);
  if (desc === null) { term.writeln("Conteúdo inexistente."); return; }
  const tipo = api.tipo_de(cid);
  term.writeln(`${ANSI.greenB}${desc}${ANSI.reset}`);
  term.writeln(`  ${ANSI.muted}rating:     ${ANSI.reset}${api.rating_de(cid) ?? "—"}`);
  term.writeln(`  ${ANSI.muted}duração:    ${ANSI.reset}${fmtDuracao(api.duracao_total_de(cid))}`);
  term.writeln(`  ${ANSI.muted}gêneros:    ${ANSI.reset}${(api.generos_de(cid) || []).join(", ")}`);
  term.writeln(`  ${ANSI.muted}plataformas:${ANSI.reset} ${(api.plataformas_de(cid) || []).join(", ")}`);
  term.writeln(`  ${ANSI.muted}adicionado: ${ANSI.reset}${api.data_adicionado_de(cid)}`);
  if (tipo === "musica") {
    term.writeln(`  ${ANSI.muted}execuções:  ${ANSI.reset}${fmtNumero(api.execucoes_de(cid))}`);
  }
}

async function opListarUsuarios(api) {
  const nomes = api.listar_usuarios();
  term.writeln(`${ANSI.green}${nomes.length}${ANSI.reset} usuários (ordem alfabética):`);
  const cols = 3;
  const maxLen = Math.max(...nomes.map((n) => n.length));
  const cell = (s) => s.padEnd(maxLen + 2);
  for (let i = 0; i < nomes.length; i += cols) {
    const row = nomes.slice(i, i + cols).map(cell).join("");
    term.writeln(`  ${row.trimEnd()}`);
  }
}

async function opConteudosDoGenero(api) {
  const g = (await lerLinha("Gênero (ex.: Pop): ")).trim();
  const ids = api.conteudos_do_genero(g);
  if (ids.length === 0) { term.writeln("Nenhum conteúdo nesse gênero."); return; }
  term.writeln(`${ANSI.green}${ids.length}${ANSI.reset} conteúdos em "${g}":`);
  const max = Math.min(ids.length, 20);
  for (let i = 0; i < max; i++) term.writeln(`  - ${api.descricao_curta(ids[i])} (${ids[i]})`);
  if (ids.length > max) term.writeln(`  … e mais ${ids.length - max}.`);
}

async function opEnfileirar(api) {
  const cid = (await lerLinha("ID do conteúdo pra enfileirar (ex.: t000000): ")).trim();
  const ok = api.enfileirar(cid);
  if (!ok) {
    term.writeln(`${ANSI.red}Conteúdo "${cid}" não existe — nada foi enfileirado.${ANSI.reset}`);
    return;
  }
  const tamanho = api.fila_atual().length;
  term.writeln(`Enfileirado: ${ANSI.green}${api.descricao_curta(cid)}${ANSI.reset} (fila com ${tamanho} ${tamanho === 1 ? "item" : "itens"}).`);
}

async function opProximo(api) {
  const cid = api.proximo();
  if (cid === null) {
    term.writeln("Fila vazia — nada pra tocar.");
    return;
  }
  const restantes = api.fila_atual().length;
  term.writeln(`Tocando: ${ANSI.greenB}${api.descricao_curta(cid)}${ANSI.reset}`);
  term.writeln(`${ANSI.dim}Restam ${restantes} ${restantes === 1 ? "item" : "itens"} na fila.${ANSI.reset}`);
}

async function opFilaAtual(api) {
  const ids = api.fila_atual();
  if (ids.length === 0) { term.writeln("Fila vazia."); return; }
  term.writeln(`Fila atual (${ANSI.green}${ids.length}${ANSI.reset} ${ids.length === 1 ? "item" : "itens"}, próximo primeiro):`);
  for (let i = 0; i < ids.length; i++) {
    term.writeln(`  ${(i + 1).toString().padStart(2)}. ${api.descricao_curta(ids[i])}`);
  }
}

const MENU = [
  "1. Listar todos os usuários",
  "2. Ver playlist completa de um usuário",
  "3. Conteúdo na posição N da playlist",
  "4. Interseção de playlists (N usuários)",
  "5. Dados de um conteúdo (rating, duração, gêneros, plataformas, data, execuções)",
  "6. Conteúdos de um gênero",
  "7. Enfileirar conteúdo na fila de reprodução",
  "8. Tocar próximo da fila",
  "9. Ver fila atual",
];

async function loopMenu(api) {
  while (true) {
    term.writeln("");
    term.writeln(`${ANSI.greenB}Trilha Sonora${ANSI.reset}`);
    term.writeln(`${ANSI.dim}─────────────${ANSI.reset}`);
    for (const linha of MENU) term.writeln(linha);
    const escolha = (await lerLinha(`${ANSI.greenB}> ${ANSI.reset}`)).trim();
    try {
      if      (escolha === "1") await opListarUsuarios(api);
      else if (escolha === "2") await opVerPlaylist(api);
      else if (escolha === "3") await opConteudoNaPosicao(api);
      else if (escolha === "4") await opIntersecao(api);
      else if (escolha === "5") await opDadosDoConteudo(api);
      else if (escolha === "6") await opConteudosDoGenero(api);
      else if (escolha === "7") await opEnfileirar(api);
      else if (escolha === "8") await opProximo(api);
      else if (escolha === "9") await opFilaAtual(api);
      else                       term.writeln("Opção inválida.");
    } catch (err) {
      term.writeln(`${ANSI.red}Erro: ${err.message}${ANSI.reset}`);
      console.error(err);
    }
  }
}

// --- Entry point ---

bootstrap().then((pyodide) => {
  term.writeln(`${ANSI.muted}Trilha Sonora — demo · catálogo carregado com 60 itens${ANSI.reset}`);
  term.writeln("");
  const api = py(pyodide);
  loopMenu(api).catch((err) => {
    term.writeln(`${ANSI.red}Loop encerrou com erro: ${err.message}${ANSI.reset}`);
    console.error(err);
  });
}).catch((err) => {
  setStatus("Erro: " + err.message, "error");
  term.writeln(`${ANSI.red}Erro no carregamento: ${err.message}${ANSI.reset}`);
  console.error(err);
});
