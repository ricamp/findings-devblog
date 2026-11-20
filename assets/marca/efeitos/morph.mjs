// Efeito "morph": troca de um texto para outro, célula a célula. O uso típico é o hover de
// um link do site (findings/devblog → findings/models): o que é igual nos dois fica parado,
// o resto vira em instantes próprios, cada célula com dois quadros de glifo de passagem.
//
// `de` e `para`: string (uma linha; "\n" quebra) ou vetor de linhas. A linha j dos dois
// começa na mesma coluna, dada por `alinhar` sobre a mais larga das duas (esquerda: coluna
// 0; centro: a mais larga fica no meio; mais larga que a grade começa na coluna 0 e corta na
// borda). Assim um prefixo comum (findings/) fica parado mesmo centrado. O bloco fica
// centrado na vertical. O mais curto completa com espaço, então uma célula "muda" também
// quando um lado é vazio.
//
// Tempo em quadros lógicos q = t·FPS_LOGICO. Com N = duracao·FPS_LOGICO, a célula i vira no
// quadro F_i = 3 + τ_i·(N − 3), τ_i em 0..1: antes de F_i − 2 mostra `de`, de F_i − 2 a F_i
// um glifo de passagem (tinta-3), depois `para`. O quadro 0 é sempre `de` e o quadro N
// sempre `para`. τ_i sai da posição (rank) da célula numa chave que depende da `ordem`:
//   acaso     hash2 da célula
//   esquerda  a coluna, com tremor de até `tremor` colunas
//   centro    a distância ao centro das células que mudam (linha conta 2: aspecto), com
//             o mesmo tremor
// Por rank, as viradas ficam espalhadas por igual na duração: no link, de 6 células que
// mudam, nunca há mais que um punhado em passagem no mesmo quadro.
//
// `parado` mostra `para`. `laco` recomeça depois de duracao + pausa; com `vaivem`, os
// ciclos ímpares fazem o caminho de volta (para → de), como sair do hover.

import { registrar, por, hash2 } from '../motor/nucleo.mjs';
import { FPS_LOGICO } from '../motor/nucleo.mjs';
import { tempo } from './_comum.mjs';

// Os glifos de passagem (o carvão de marca, sem a barra).
export const PASSAGEM = '\\|_-<>#*+:=';

const SAL_ORDEM = 0x2f6b1d93;
const SAL_TREMOR = 0x6ad04c17;
const SAL_GLIFO = 0x4b81e3a5;

function linhasDe(v) {
  if (Array.isArray(v)) return v.map((l) => [...String(l ?? '')]);
  if (v === null || v === undefined) return [];
  const s = String(v);
  return s === '' ? [] : s.split('\n').map((l) => [...l]);
}

// Coluna inicial de uma linha de n células.
function inicio(n, cols, alinhar) {
  if (alinhar !== 'centro' || n >= cols) return 0;
  return Math.floor((cols - n) / 2);
}

// Desenho de um texto na grade: vetor de cols·linhas caracteres (espaço onde não há nada).
// larguras[j]: a largura que alinha a linha j (a mais larga dos dois textos).
function assentar(texto, larguras, cols, linhas, y0, alinhar) {
  const out = new Array(cols * linhas).fill(' ');
  texto.forEach((l, j) => {
    const y = y0 + j;
    if (y < 0 || y >= linhas) return;
    const x0 = inicio(larguras[j], cols, alinhar);
    for (let k = 0; k < l.length && x0 + k < cols; k++) out[y * cols + x0 + k] = l[k];
  });
  return out;
}

// Instante de virada (em quadros) de cada célula que muda: Map índice → F.
function viradas(a, b, cols, q, s, N) {
  const mudam = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) mudam.push(i);
  if (!mudam.length) return new Map();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const i of mudam) {
    const x = i % cols, y = (i - x) / cols;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const xc = (x0 + x1) / 2, yc = (y0 + y1) / 2;
  const chave = (i) => {
    const x = i % cols, y = (i - x) / cols;
    const tremor = q.tremor * hash2(x, y, s ^ SAL_TREMOR);
    if (q.ordem === 'esquerda') return x + tremor;
    if (q.ordem === 'centro') return Math.abs(x - xc) + 2 * Math.abs(y - yc) + tremor;
    return hash2(x, y, s ^ SAL_ORDEM);
  };
  const ordenadas = mudam.map((i) => [chave(i), i]).sort((m, n) => m[0] - n[0] || m[1] - n[1]);
  const n = ordenadas.length;
  const F = new Map();
  ordenadas.forEach(([, i], r) => F.set(i, 3 + (n > 1 ? r / (n - 1) : 0.5) * (N - 3)));
  return F;
}

registrar('morph', {
  // de, para: os dois estados (string ou vetor de linhas); alinhar: esquerda ou centro.
  // duracao (s), laco, pausa (s): o contrato dos efeitos com começo e fim; vaivem: no laço,
  //   os ciclos ímpares voltam de para a de.
  // ordem: acaso, esquerda ou centro; tremor: folga da ordem, em colunas.
  // tom: o do texto (tinta: é o nome); a passagem vai sempre em tinta-3.
  padrao: {
    velocidade: 1, de: 'findings/devblog', para: 'findings/models', alinhar: 'esquerda',
    duracao: 0.6, laco: false, pausa: 1.2, vaivem: false,
    ordem: 'acaso', tremor: 2.5, tom: 'tinta',
  },
  predefinicoes: {
    hover: { ordem: 'acaso' },
    corte: { ordem: 'esquerda', duracao: 0.9 },
    foco: { ordem: 'centro' },
  },
  desenhar(grade, ctx) {
    const { params: q } = ctx;
    const s = ctx.semente ?? 0;
    const { cols, linhas } = grade;
    let de = linhasDe(q.de), para = linhasDe(q.para);
    const N = Math.max(3, q.duracao * FPS_LOGICO);

    // quadro dentro do ciclo
    let quadro = N;
    if (!ctx.parado) {
      let t = tempo(ctx);
      if (q.laco) {
        const ciclo = Math.max(1e-6, q.duracao + q.pausa);
        const k = Math.floor(t / ciclo);
        t -= k * ciclo;
        if (q.vaivem && k % 2 === 1) [de, para] = [para, de];
      }
      quadro = t * FPS_LOGICO;
    }

    const H = Math.max(de.length, para.length);
    const y0 = H >= linhas ? 0 : Math.floor((linhas - H) / 2);
    const larguras = Array.from({ length: H }, (_, j) => Math.max(de[j]?.length ?? 0, para[j]?.length ?? 0));
    const a = assentar(de, larguras, cols, linhas, y0, q.alinhar);
    const b = assentar(para, larguras, cols, linhas, y0, q.alinhar);
    const F = quadro >= N ? null : viradas(a, b, cols, q, s, N);
    const passo = Math.floor(quadro);

    for (let i = 0; i < a.length; i++) {
      const x = i % cols, y = (i - x) / cols;
      const f = F ? F.get(i) : undefined;
      if (f === undefined || quadro >= f) { if (b[i] !== ' ') por(grade, x, y, b[i], q.tom); continue; }
      if (quadro < f - 2) { if (a[i] !== ' ') por(grade, x, y, a[i], q.tom); continue; }
      // passagem: um glifo por quadro, que não repete o de antes nem o de depois
      let k = Math.floor(hash2(i, passo, s ^ SAL_GLIFO) * PASSAGEM.length);
      while (PASSAGEM[k] === a[i] || PASSAGEM[k] === b[i]) k = (k + 1) % PASSAGEM.length;
      por(grade, x, y, PASSAGEM[k], 'tinta-3');
    }
  },
});
