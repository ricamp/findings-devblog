// Núcleo do motor ASCII do Findings.
// Cada efeito é uma função pura de (quadro, semente, parâmetros, entrada) que escreve numa
// grade de células {caractere, tom}. O mesmo código roda no navegador e no Node: aqui não
// entra DOM, nem módulo do Node, nem acaso ou relógio do sistema.

// Os quatro primeiros são cor de texto. Os dois últimos são células com chapa: um fundo
// cheio na cor de base (tinta ou achado) e o caractere na cor do papel; chapas de células
// vizinhas se emendam (o reforço "chapa" das letras de dados). Os índices dos quatro
// primeiros não mudam.
export const TONS = ['tinta', 'tinta-2', 'tinta-3', 'achado', 'chapa', 'chapa-achado'];

// Tom de chapa → cor da chapa (o caractere vai na cor do papel).
export const CHAPAS = { chapa: 'tinta', 'chapa-achado': 'achado' };
export const FPS_LOGICO = 12;

const INDICE_TOM = new Map(TONS.map((nome, i) => [nome, i]));

// ---------------------------------------------------------------- grade

export function criarGrade(cols, linhas) {
  const n = cols * linhas;
  return { cols, linhas, car: new Array(n).fill(' '), tom: new Uint8Array(n) };
}

// Grava um caractere na célula (x, y). Fora da grade ou coordenada não inteira: ignora.
export function por(grade, x, y, caractere, tom = 'tinta') {
  const t = INDICE_TOM.get(tom);
  if (t === undefined) throw new Error(`tom desconhecido: ${tom}`);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return;
  if (x < 0 || y < 0 || x >= grade.cols || y >= grade.linhas) return;
  const c = String(caractere);
  const primeiro = c.length ? String.fromCodePoint(c.codePointAt(0)) : ' ';
  const i = y * grade.cols + x;
  grade.car[i] = primeiro;
  grade.tom[i] = t;
}

// ---------------------------------------------------------------- acaso por semente

// Mistura final do murmur3 (fmix32): espalha bem entradas inteiras pequenas.
function misturar(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// Valor em [0,1) determinístico para (x, y, semente). x e y são truncados com Math.floor.
export function hash2(x, y, semente = 0) {
  let h = misturar((semente | 0) ^ 0x9e3779b9);
  h = misturar(h ^ Math.imul(Math.floor(x) | 0, 0xcc9e2d51));
  h = misturar(h ^ Math.imul(Math.floor(y) | 0, 0x1b873593));
  return h / 4294967296;
}

// Ruído de valor com interpolação suave (smoothstep), mesmo aspecto do ruido do devblog,
// mas alimentado por hash2 com semente.
export function ruido(x, y, semente = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, semente), b = hash2(xi + 1, yi, semente);
  const c = hash2(xi, yi + 1, semente), d = hash2(xi + 1, yi + 1, semente);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

// Semente inteira de 32 bits (sem sinal) a partir de um texto: FNV-1a sobre UTF-16.
export function sementeDe(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------- registro de efeitos

const EFEITOS = new Map();

// Nome repetido substitui o anterior.
export function registrar(nome, ef) {
  EFEITOS.set(nome, ef);
}

export function efeito(nome) {
  const ef = EFEITOS.get(nome);
  if (!ef) throw new Error(`efeito desconhecido: ${nome}`);
  return ef;
}

const ENTRADA_PADRAO = { ponteiro: null, rolagem: 0, tema: 'claro', dados: {} };

export function renderizar(nome, {
  cols, linhas, quadro = 0, semente = 0, params = {}, predefinicao, entrada = {}, parado = false,
} = {}) {
  const ef = efeito(nome);
  let pre = {};
  if (predefinicao !== undefined) {
    pre = ef.predefinicoes?.[predefinicao];
    if (!pre) throw new Error(`predefinição desconhecida em ${nome}: ${predefinicao}`);
  }
  const grade = criarGrade(cols, linhas);
  const ctx = {
    quadro,
    semente,
    params: { ...ef.padrao, ...pre, ...params },
    entrada: { ...ENTRADA_PADRAO, dados: {}, ...entrada },
    parado,
  };
  ef.desenhar(grade, ctx);
  return grade;
}

// ---------------------------------------------------------------- saída

// Toda linha tem exatamente cols caracteres; linhas unidas por \n, sem \n no fim.
export function gradeParaTexto(grade) {
  const linhas = [];
  for (let y = 0; y < grade.linhas; y++) {
    linhas.push(grade.car.slice(y * grade.cols, (y + 1) * grade.cols).join(''));
  }
  return linhas.join('\n');
}

function escapar(c) {
  return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c;
}

// Células vizinhas do mesmo tom viram um só <span class="t-…">; tom tinta vai sem span.
// Tons de chapa saem como qualquer outro (t-chapa, t-chapa-achado): o fundo vem do CSS.
// Spans não atravessam quebra de linha.
export function gradeParaHTML(grade) {
  const linhas = [];
  for (let y = 0; y < grade.linhas; y++) {
    let saida = '';
    let x = 0;
    while (x < grade.cols) {
      const t = grade.tom[y * grade.cols + x];
      let trecho = '';
      while (x < grade.cols && grade.tom[y * grade.cols + x] === t) {
        trecho += escapar(grade.car[y * grade.cols + x]);
        x++;
      }
      saida += t === 0 ? trecho : `<span class="t-${TONS[t]}">${trecho}</span>`;
    }
    linhas.push(saida);
  }
  return linhas.join('\n');
}
